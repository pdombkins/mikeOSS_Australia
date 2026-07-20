/**
 * C018 — Regulatory feed scanner. Fetches curated official RSS/Atom feeds,
 * filters items against each active watch's topics with the low-tier model,
 * stores matches as regulatory_events, and sends a deduped daily digest
 * notification per watch owner. Runs 6-hourly (timer in index.ts) and on
 * demand via POST /regwatch/scan.
 */

import { createServerSupabase } from "../supabase";
import { completeText } from "../llm";
import { getUserModelSettings } from "../userSettings";
import { notify } from "../notifications";
import { devLog } from "../chat/types";
import { REG_SOURCES, getRegSource } from "./sources";

type Db = ReturnType<typeof createServerSupabase>;

type FeedItem = { title: string; url: string; summary: string; published: string | null };

let scanning = false;

/** Minimal RSS/Atom parsing — titles, links, dates. No external deps. */
function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ??
    xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ??
    [];
  for (const block of blocks.slice(0, 40)) {
    const pick = (tag: string) => {
      const m = block.match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
      );
      return m
        ? m[1]
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .trim()
        : "";
    };
    const title = pick("title");
    let url = pick("link");
    if (!url) {
      const href = block.match(/<link[^>]*href="([^"]+)"/i);
      url = href ? href[1] : "";
    }
    const summary = pick("description") || pick("summary") || "";
    const published = pick("pubDate") || pick("updated") || pick("published") || null;
    if (title && url) {
      items.push({ title, url, summary: summary.slice(0, 600), published });
    }
  }
  return items;
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "MikeOSS-Australia-regwatch/1.0 (research & educational; RSS reader)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text());
  } catch (err) {
    devLog(`[regwatch] feed fetch failed ${url}:`, err);
    return [];
  }
}

async function filterRelevant(
  db: Db,
  ownerId: string,
  topics: string[],
  items: FeedItem[],
): Promise<{ item: FeedItem; relevance: string }[]> {
  if (items.length === 0) return [];
  if (topics.length === 0) {
    return items.map((item) => ({ item, relevance: "All items (no topic filter)" }));
  }
  try {
    const { title_model, api_keys } = await getUserModelSettings(ownerId, db);
    const raw = await completeText({
      model: title_model,
      systemPrompt: `You filter regulatory news for an Australian lawyer. Given watch topics and a numbered list of items, return ONLY a JSON array of the relevant ones (no fences): [{"index": <n>, "why": "<≤15 words on why it matches>"}]. Be selective; return [] if nothing matches.`,
      user: `TOPICS: ${topics.join(", ")}\n\nITEMS:\n${items
        .map((it, i) => `${i}. ${it.title} — ${it.summary.slice(0, 200)}`)
        .join("\n")}`,
      maxTokens: 1500,
      apiKeys: api_keys,
    });
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { index?: number; why?: string }[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => typeof p.index === "number" && items[p.index])
      .map((p) => ({
        item: items[p.index as number],
        relevance: typeof p.why === "string" ? p.why : "",
      }));
  } catch (err) {
    devLog("[regwatch] LLM filter failed, keyword fallback:", err);
    const lowered = topics.map((t) => t.toLowerCase());
    return items
      .filter((it) =>
        lowered.some(
          (t) =>
            it.title.toLowerCase().includes(t) ||
            it.summary.toLowerCase().includes(t),
        ),
      )
      .map((item) => ({ item, relevance: "Keyword match" }));
  }
}

export async function runRegwatchScan(): Promise<{ newEvents: number }> {
  if (scanning) return { newEvents: 0 };
  scanning = true;
  try {
    const db = createServerSupabase();
    const { data: watches } = await db
      .from("regulatory_watches")
      .select("id, owner_id, name, topics, jurisdictions, sources")
      .eq("active", true);
    if (!watches?.length) return { newEvents: 0 };

    // Fetch each unique feed once.
    const sourceIds = [
      ...new Set(
        watches.flatMap((w) =>
          Array.isArray(w.sources) && w.sources.length > 0
            ? (w.sources as string[])
            : REG_SOURCES.map((s) => s.id),
        ),
      ),
    ];
    const feedItems = new Map<string, FeedItem[]>();
    for (const id of sourceIds) {
      const src = getRegSource(id);
      if (src) feedItems.set(id, await fetchFeed(src.url));
    }

    let total = 0;
    for (const watch of watches) {
      const watchSources =
        Array.isArray(watch.sources) && watch.sources.length > 0
          ? (watch.sources as string[])
          : REG_SOURCES.map((s) => s.id);
      const candidates: { sourceId: string; item: FeedItem }[] = [];
      for (const sid of watchSources) {
        for (const item of feedItems.get(sid) ?? []) {
          candidates.push({ sourceId: sid, item });
        }
      }
      if (candidates.length === 0) continue;

      // Skip items already recorded for this watch.
      const { data: existing } = await db
        .from("regulatory_events")
        .select("url")
        .eq("watch_id", watch.id);
      const seen = new Set((existing ?? []).map((e) => e.url as string));
      const fresh = candidates.filter((c) => !seen.has(c.item.url));
      if (fresh.length === 0) continue;

      const relevant = await filterRelevant(
        db,
        watch.owner_id as string,
        (watch.topics as string[]) ?? [],
        fresh.map((f) => f.item),
      );
      if (relevant.length === 0) continue;

      const bySourceUrl = new Map(fresh.map((f) => [f.item.url, f.sourceId]));
      const rows = relevant.map(({ item, relevance }) => ({
        watch_id: watch.id,
        source: bySourceUrl.get(item.url) ?? "unknown",
        title: item.title.slice(0, 500),
        url: item.url,
        summary: item.summary || null,
        relevance: relevance || null,
        published_at: item.published ? new Date(item.published).toISOString() : null,
        status: "new",
      }));
      const { error } = await db
        .from("regulatory_events")
        .upsert(rows, { onConflict: "watch_id,url", ignoreDuplicates: true });
      if (error) {
        devLog("[regwatch] insert failed:", error.message);
        continue;
      }
      total += rows.length;
      await notify({
        userId: watch.owner_id as string,
        kind: "regwatch",
        title: `Regulatory watch "${watch.name}": ${rows.length} new item${rows.length === 1 ? "" : "s"}`,
        body: rows
          .slice(0, 3)
          .map((r) => r.title)
          .join(" · "),
        link: "/regwatch",
      });
    }
    return { newEvents: total };
  } finally {
    scanning = false;
  }
}
