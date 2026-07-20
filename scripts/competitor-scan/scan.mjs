#!/usr/bin/env node
/**
 * Mike (Australia) — Competitor Feature Scanner
 *
 * Tracks product/feature announcements from three legal-AI competitors:
 *   - Harvey        (harvey.ai)
 *   - Legora        (legora.com)
 *   - CoCounsel     (Thomson Reuters)
 *
 * Runs in parallel with the GitHub fork scan from `Start Mike.command`.
 *
 * Two-tier design (see CLAUDE.md → Competitor Scan):
 *   1. This node script (unattended, on every launch): fetches each vendor's
 *      curated blog / release-note pages, extracts candidate post links, and
 *      diffs them against the register. Genuinely new posts are appended as
 *      status:"new" entries flagged "Needs triage" so you see them immediately.
 *   2. A weekly Cloud (Claude) refresh: re-researches all three vendors with
 *      full web search, turns raw posts into properly grouped, summarised
 *      feature entries, and marks anything new. Higher fidelity than raw HTML.
 *
 * The FIRST run seeds the register from SEED_FEATURES (the curated baseline of
 * features to-date). Every run regenerates reports/latest.html + latest.md,
 * grouped by capability with vendor tags; new items are badged and filterable.
 *
 * Usage:  node scan.mjs [--open-if-new] [--open] [--reset]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const DIR = dirname(fileURLToPath(import.meta.url));
const REGISTER = join(DIR, "register.json");
const REPORTS = join(DIR, "reports");

const args = process.argv.slice(2);
const OPEN_IF_NEW = args.includes("--open-if-new");
const OPEN_ALWAYS = args.includes("--open");
if (args.includes("--reset") && existsSync(REGISTER)) rmSync(REGISTER);

// ── Capability groups (report order) ──────────────────────────────────────────
const CATEGORIES = [
  "Agents & workflows",
  "Drafting",
  "Research & citations",
  "Document review & extraction",
  "Knowledge & playbooks",
  "Voice & multimodal",
  "Mobile & integrations",
  "Analytics & admin",
  "Platform & models",
  "Enablement & other",
  "Needs triage (new post detected)",
];

// ── Vendor sources the node scanner polls for NET-NEW posts ────────────────────
// Each source lists an index URL and a regex that matches individual post links.
const SOURCES = [
  {
    vendor: "Harvey",
    url: "https://www.harvey.ai/blog",
    linkRe: /href="(\/blog\/[a-z0-9-]+)"[^>]*>([^<]{6,140})</gi,
    base: "https://www.harvey.ai",
  },
  {
    vendor: "Harvey",
    url: "https://help.harvey.ai/release-notes",
    linkRe: /href="(\/release-notes\/[a-z0-9-]+)"[^>]*>([^<]{6,140})</gi,
    base: "https://help.harvey.ai",
  },
  {
    vendor: "Legora",
    url: "https://legora.com/blog",
    linkRe: /href="(\/blog\/[a-z0-9-]+)"[^>]*>([^<]{6,140})</gi,
    base: "https://legora.com",
  },
  {
    vendor: "CoCounsel",
    url: "https://www.thomsonreuters.com/en-us/posts/innovation/",
    linkRe: /href="(\/en-us\/posts\/innovation\/cocounsel[a-z0-9-]+\/?)"[^>]*>([^<]{6,140})</gi,
    base: "https://www.thomsonreuters.com",
  },
];

// ── Curated baseline (features to-date) — seeded on first run ──────────────────
// id assigned at seed time (C001…). date = YYYY-MM (announcement month).
const SEED_FEATURES = [
  // Harvey ------------------------------------------------------------------
  { vendor: "Harvey", category: "Agents & workflows", date: "2026-07",
    title: "Custom workflows that generate & edit PowerPoint and Excel",
    description: "Turn recurring deliverables (pitch decks, diligence trackers) into repeatable custom workflows that produce and edit PPT/XLSX.",
    mikeAngle: "Mike already has Excel/PPT support (F005) + workflows — parity/inspiration for output-generating workflows.",
    url: "https://www.harvey.ai/blog/the-brief-july-2026" },
  { vendor: "Harvey", category: "Knowledge & playbooks", date: "2026-07",
    title: "Conversational Playbook-building agent",
    description: "Build and refine Playbooks conversationally with an agent in Assistant instead of manually rebuilding content.",
    mikeAngle: "Directly relevant — Mike just added a Playbooks UI; a conversational builder is a natural next step.",
    url: "https://www.harvey.ai/blog/the-brief-july-2026" },
  { vendor: "Harvey", category: "Document review & extraction", date: "2026-05",
    title: "Contract Intelligence (contract review product)",
    description: "Dedicated contract review offering for reviewing and analysing agreements at scale.",
    url: "https://www.law.com/legaltechnews/2026/05/21/harvey-announces-contract-review-product-adoption-analytics-features/" },
  { vendor: "Harvey", category: "Analytics & admin", date: "2026-05",
    title: "Command Center (adoption analytics + peer benchmarking)",
    description: "Adoption-management tool using anonymised, aggregated data from 1,500+ deployments to benchmark usage against peers.",
    mikeAngle: "Mike has query_costs; an admin analytics/benchmarking view could build on that.",
    url: "https://www.law.com/legaltechnews/2026/05/21/harvey-announces-contract-review-product-adoption-analytics-features/" },
  { vendor: "Harvey", category: "Voice & multimodal", date: "2026-06",
    title: "Audio transcription in Assistant & Vault",
    description: "Upload recordings (M4A/MP3/WAV/WebM/FLAC/OGG, up to 2h) → editable Word transcripts with speaker labels, timestamps, language detection.",
    url: "https://www.harvey.ai/blog/the-brief-june-2026" },
  { vendor: "Harvey", category: "Voice & multimodal", date: "2026-07",
    title: "Prompt dictation in Word & Outlook add-ins",
    description: "Speak prompts hands-free in the Word/Outlook add-ins, matching Assistant transcription quality.",
    url: "https://www.harvey.ai/blog/the-brief-july-2026" },
  { vendor: "Harvey", category: "Mobile & integrations", date: "2026-07",
    title: "Microsoft 365 Copilot + Cowork integration",
    description: "Ask legal questions, surface Vault content in M365 Copilot, and run multi-step workflows inside Microsoft Cowork.",
    url: "https://www.harvey.ai/blog/the-brief-july-2026" },
  { vendor: "Harvey", category: "Mobile & integrations", date: "2026-06",
    title: "Vault sharing on iOS",
    description: "Share vaults and grant teammates access to collaborate across matters from iPhone/iPad.",
    url: "https://www.harvey.ai/blog/the-brief-june-2026" },
  { vendor: "Harvey", category: "Mobile & integrations", date: "2026-06",
    title: "Improve (Magic Prompt) on Android",
    description: "Guided prompting experience brought to the Harvey Android app.",
    url: "https://www.harvey.ai/blog/the-brief-june-2026" },
  { vendor: "Harvey", category: "Platform & models", date: "2026-06",
    title: "Language localization (French CA/FR, more coming)",
    description: "Set interface and output languages for menus, system messages, and AI responses.",
    url: "https://www.harvey.ai/blog/the-brief-june-2026" },
  { vendor: "Harvey", category: "Platform & models", date: "2026-06",
    title: "Claude Sonnet 5 in the Model Selector",
    description: "Claude Sonnet 5 selectable across Assistant, Vault, and Workflow Builder.",
    mikeAngle: "Mike is multi-provider (Claude/Gemini) — model-selector parity is straightforward.",
    url: "https://www.harvey.ai/blog/the-brief-june-2026" },
  { vendor: "Harvey", category: "Enablement & other", date: "2026-07",
    title: "Harvey Academy (training)",
    description: "On-demand training, expert workflows, and step-by-step guidance for legal teams.",
    url: "https://www.harvey.ai/blog/the-brief-july-2026" },

  // Legora ------------------------------------------------------------------
  { vendor: "Legora", category: "Agents & workflows", date: "2026-05",
    title: "Legora aOS — agentic operating system",
    description: "Orchestrates specialist sub-agents (intake, research, drafting, review) in parallel; handles tool routing, control flow, memory, model selection, guardrails.",
    mikeAngle: "The 'agentic OS' framing is where the market is heading; Mike's toolDispatcher is a foundation to build multi-agent orchestration on.",
    url: "https://legora.com/product/aos" },
  { vendor: "Legora", category: "Agents & workflows", date: "2025-06",
    title: "Workflows orchestration layer",
    description: "String search, extract, draft and review into automated multi-step sequences via natural-language instructions.",
    url: "https://legora.com/blog" },
  { vendor: "Legora", category: "Document review & extraction", date: "2026-01",
    title: "Tabular Review (spreadsheet-style extraction)",
    description: "Drag folders of contracts in; each doc becomes a row, custom prompts become columns; extracts clauses, dates, risk flags.",
    mikeAngle: "Mike has Tabular Review (F005 lineage) — compare depth of extraction/risk-flagging.",
    url: "https://gc.ai/blog/legora-legal-ai-review" },
  { vendor: "Legora", category: "Research & citations", date: "2026-01",
    title: "Research Assistant with inline citations across web + licensed DBs + DMS",
    description: "Natural-language questions searched across open web, licensed legal databases, and the firm's DMS simultaneously; paragraph answers with inline citations.",
    mikeAngle: "Mirrors Mike's Jade + KB direction; structured citations are a shared priority.",
    url: "https://gc.ai/blog/legora-legal-ai-review" },
  { vendor: "Legora", category: "Knowledge & playbooks", date: "2026-01",
    title: "Firm-wide search + structured citations",
    description: "Search across document management systems and knowledge bases with best-in-class structured citations.",
    url: "https://gc.ai/blog/legora-legal-ai-review" },
  { vendor: "Legora", category: "Research & citations", date: "2026-03",
    title: "Regulatory monitoring (via Graceview acquisition)",
    description: "Regulatory-change monitoring capability added through the Graceview acquisition.",
    url: "https://www.law.com/legaltechnews/2026/05/07/legora-launches-agentic-ai-legal-operating-system-legora-aos/" },
  { vendor: "Legora", category: "Analytics & admin", date: "2026-05",
    title: "Ethical walls, cross-matter isolation & full audit trails",
    description: "Prevents client info bleeding across matters/users/time; complete visibility into every tool call, file access, and agent action.",
    mikeAngle: "Relevant to Mike's RLS + query_costs — audit trails and matter isolation for regulated use.",
    url: "https://legora.com/product/aos" },

  // CoCounsel (Thomson Reuters) --------------------------------------------
  { vendor: "CoCounsel", category: "Agents & workflows", date: "2026-06",
    title: "Next-gen CoCounsel Legal — agentic workspaces (early access)",
    description: "Move from prompt-driven to fully agentic infrastructure with Workspaces; plan → research → reason → draft with less human supervision. GA targeted Aug 2026 (US), then CA/UK/AU.",
    url: "https://www.thomsonreuters.com/en-us/posts/innovation/the-next-generation-of-cocounsel-legal-is-here-and-early-access-starts-now/" },
  { vendor: "CoCounsel", category: "Drafting", date: "2026-06",
    title: "Brief Builder AI agent",
    description: "Agent that assembles legal briefs end-to-end within the next-gen workspace.",
    url: "https://www.lawnext.com/2026/06/thomson-reuters-opens-early-access-to-the-next-generation-of-cocounsel-legal-saying-beta-users-fing-loved-the-product.html" },
  { vendor: "CoCounsel", category: "Drafting", date: "2026-06",
    title: "Drafting agent from precedent / Practical Law Standard Documents (US)",
    description: "Upload source material + key details → analyses a trusted precedent/Standard Document and produces a tailored multi-page first draft with the template's structure and style.",
    mikeAngle: "Precedent-driven drafting pairs naturally with Mike's Library + Playbooks.",
    url: "https://legal.thomsonreuters.com/blog/behind-the-build-of-the-next-generation-of-cocounsel-legal/" },
  { vendor: "CoCounsel", category: "Research & citations", date: "2026-06",
    title: "Deep Research across Westlaw & Practical Law",
    description: "Deep, multi-step legal research grounded in Westlaw and Practical Law authority.",
    url: "https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/" },
  { vendor: "CoCounsel", category: "Research & citations", date: "2026-06",
    title: "Deep Research Verify (citation-support checking)",
    description: "Automatically checks whether cited authority supports the assertions made; validates Westlaw/Practical Law sources, highlights supporting passages, flags misattributions/mischaracterisations.",
    mikeAngle: "Very close to Mike's citation-verification gate — a strong model for extending Jade/AGLC verification to assertion-level checking.",
    url: "https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/" },
  { vendor: "CoCounsel", category: "Document review & extraction", date: "2026-06",
    title: "Tabular Analysis (one question across many documents)",
    description: "Run the same question across many documents and read results as a grid — the diligence/discovery workhorse.",
    url: "https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/" },
  { vendor: "CoCounsel", category: "Knowledge & playbooks", date: "2026-06",
    title: "My Clauses — personal preferred-provision library (US)",
    description: "Transactional lawyers build a personal, searchable library of preferred contract provisions.",
    mikeAngle: "Overlaps Mike's Library/Playbooks — a 'preferred clauses' store is a concrete near-term feature.",
    url: "https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-june-2026-releases/" },
  { vendor: "CoCounsel", category: "Knowledge & playbooks", date: "2026-06",
    title: "Organizational intelligence",
    description: "Surfaces and reuses an organisation's own precedents and knowledge within the agentic workflow.",
    url: "https://www.lawnext.com/2026/06/thomson-reuters-opens-early-access-to-the-next-generation-of-cocounsel-legal-saying-beta-users-fing-loved-the-product.html" },
  { vendor: "CoCounsel", category: "Platform & models", date: "2026-01",
    title: "Expansion to the UK (AU planned)",
    description: "CoCounsel Legal expanded to the UK with agentic AI; Australia among planned rollouts.",
    mikeAngle: "AU rollout is direct competitive context for Mike (Australia).",
    url: "https://www.thomsonreuters.com/en/press-releases/2026/january/thomson-reuters-expands-cocounsel-legal-to-uk-continuing-its-transformation-of-legal-work-with-agentic-ai-innovation" },
  { vendor: "CoCounsel", category: "Platform & models", date: "2026-06",
    title: "Thomson Reuters building its own LLM",
    description: "TR is developing a proprietary large language model to underpin CoCounsel.",
    url: "https://www.lawnext.com/2026/06/thomson-reuters-ceo-steve-hasker-on-the-next-generation-of-cocounsel-the-future-of-professionals-report-and-why-tr-is-building-its-own-llm.html" },
];

// ── Register ──────────────────────────────────────────────────────────────────
const emptyRegister = {
  version: 1,
  vendors: ["Harvey", "Legora", "CoCounsel"],
  lastScan: null,
  scanCount: 0,
  nextId: 1,
  seenUrls: {},        // post url -> true (net-new detection)
  primedSources: {},   // source index url -> true (first successful fetch = silent baseline)
  features: [],        // { id, vendor, category, title, description, mikeAngle?, date, url, status, firstSeenScan, triage? }
};
let reg = emptyRegister;
if (existsSync(REGISTER)) {
  try { reg = JSON.parse(readFileSync(REGISTER, "utf8")); } catch { reg = emptyRegister; }
}
const firstRun = reg.scanCount === 0;

function nextId() {
  return "C" + String(reg.nextId++).padStart(3, "0");
}

const newlyAdded = [];

// Seed baseline on first run.
if (firstRun) {
  for (const f of SEED_FEATURES) {
    const id = nextId();
    reg.features.push({ id, ...f, status: "new", firstSeenScan: 1 });
    if (f.url) reg.seenUrls[f.url] = true;
  }
}

// ── Fetch sources for net-new posts (best-effort; tolerant of failures) ────────
const scanNotes = [];

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; mike-competitor-scan/1)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function titleCaseFromSlug(slug) {
  return slug.replace(/[-/]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

async function pollSources() {
  for (const src of SOURCES) {
    const html = await fetchText(src.url);
    if (html == null) { scanNotes.push(`Could not fetch ${src.vendor} source (${src.url}).`); continue; }
    // First successful fetch of a source establishes a silent baseline — record
    // every current post as "seen" without flagging, so we don't surface the
    // whole back-catalogue as "new". Genuinely new posts flag on later runs.
    const priming = !reg.primedSources[src.url];
    const seen = new Set();
    let m;
    src.linkRe.lastIndex = 0;
    while ((m = src.linkRe.exec(html)) !== null) {
      const path = m[1];
      const full = path.startsWith("http") ? path : src.base + path;
      if (seen.has(full)) continue;
      seen.add(full);
      if (reg.seenUrls[full]) continue;              // already known
      reg.seenUrls[full] = true;
      if (priming) continue;                          // baseline: record, don't flag
      const title = (m[2] || "").trim() || titleCaseFromSlug(path.split("/").pop() || path);
      const feat = {
        id: nextId(),
        vendor: src.vendor,
        category: "Needs triage (new post detected)",
        date: new Date().toISOString().slice(0, 7),
        title,
        description: `New post detected on ${src.vendor}. The weekly Claude refresh will summarise and re-categorise it.`,
        url: full,
        status: "new",
        triage: true,
        firstSeenScan: reg.scanCount + 1,
      };
      reg.features.push(feat);
      newlyAdded.push(feat);
    }
    reg.primedSources[src.url] = true;
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const VENDOR_COLORS = { Harvey: "#6d28d9", Legora: "#0f766e", CoCounsel: "#b45309" };

function writeReports() {
  mkdirSync(REPORTS, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const feats = reg.features.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const newCount = feats.filter((f) => f.status === "new").length;

  const byCat = {};
  for (const f of feats) (byCat[f.category] ||= []).push(f);
  const cats = CATEGORIES.filter((c) => byCat[c]);

  // Markdown
  let md = `# Competitor Feature Scan — ${date}\n\n`;
  md += firstRun
    ? `**First scan** — full baseline of features to-date across Harvey, Legora, and CoCounsel.\n\n`
    : `Vendors: Harvey · Legora · CoCounsel · Total features: ${feats.length} · New since last scan: **${newCount}**\n\n`;
  for (const n of scanNotes) md += `> ⚠️ ${n}\n\n`;
  for (const cat of cats) {
    md += `## ${cat}\n\n`;
    for (const f of byCat[cat]) {
      md += `- **${f.id}** [${f.vendor}] ${esc(f.title)}${f.status === "new" ? " _(new)_" : ""} — ${f.date} — [source](${f.url})\n`;
      if (f.description) md += `  - ${esc(f.description)}\n`;
      if (f.mikeAngle) md += `  - _Mike angle:_ ${esc(f.mikeAngle)}\n`;
    }
    md += `\n`;
  }
  md += `\n---\nTo build features into Mike (Australia), tell Claude e.g.: *"Design and build C005 and C023 from the competitor scan."*\n`;
  writeFileSync(join(REPORTS, "latest.md"), md);

  // HTML
  const rows = cats.map((cat) => `
    <h2>${esc(cat)} <span class="count">${byCat[cat].length}</span></h2>
    ${byCat[cat].map((f) => `
    <label class="item" data-vendor="${f.vendor}" data-new="${f.status === "new" ? 1 : 0}">
      <input type="checkbox" value="${f.id}">
      <span class="fid">${f.id}</span>
      <span class="body">
        <span class="titleline">
          <span class="vtag" style="background:${VENDOR_COLORS[f.vendor] || "#555"}">${esc(f.vendor)}</span>
          <span class="title">${esc(f.title)}</span>
          ${f.status === "new" ? '<span class="newbadge">NEW</span>' : ""}
        </span>
        ${f.description ? `<span class="desc">${esc(f.description)}</span>` : ""}
        ${f.mikeAngle ? `<span class="angle">Mike angle: ${esc(f.mikeAngle)}</span>` : ""}
        <span class="meta">${f.date} · <a href="${f.url}" target="_blank" rel="noopener">source ↗</a></span>
      </span>
    </label>`).join("")}`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Competitor Feature Scan — ${date}</title>
<style>
  body{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:920px;margin:36px auto;padding:0 20px;color:#1a1a2e}
  h1{font-size:22px;margin-bottom:4px} h2{font-size:15px;margin:26px 0 8px;border-bottom:1px solid #e3e3ee;padding-bottom:4px;text-transform:uppercase;letter-spacing:.04em;color:#3b3b60}
  .count{background:#eef;border-radius:10px;padding:1px 8px;font-size:12px;color:#446}
  .summary{background:#f6f7fb;border:1px solid #e3e5ee;border-radius:10px;padding:12px 16px;font-size:14px}
  .controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 4px}
  .controls button{border:1px solid #d5d5e2;background:#fff;border-radius:20px;padding:5px 12px;font-size:13px;cursor:pointer}
  .controls button.active{background:#1a1a2e;color:#fff;border-color:#1a1a2e}
  .note{background:#fff7e6;border:1px solid #f0dcae;border-radius:8px;padding:8px 12px;margin-top:8px;font-size:13px}
  .item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #e8e8ef;border-radius:10px;margin:7px 0;cursor:pointer}
  .item:hover{background:#fafaff}
  .fid{font-family:ui-monospace,monospace;font-weight:700;color:#3b3bb3;font-size:12.5px;margin-top:2px}
  .body{display:flex;flex-direction:column;gap:3px;min-width:0}
  .titleline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .vtag{color:#fff;border-radius:5px;padding:1px 7px;font-size:11px;font-weight:600}
  .title{font-weight:600}
  .newbadge{background:#e11d48;color:#fff;border-radius:5px;padding:0 6px;font-size:10px;font-weight:700;letter-spacing:.05em}
  .desc{font-size:13.5px;color:#444}
  .angle{font-size:12.5px;color:#25636b;background:#ecfdf5;border-left:3px solid #10b981;padding:2px 8px;border-radius:0 4px 4px 0}
  .meta{font-size:12px;color:#888}
  .meta a{color:#3b6bb3}
  #bar{position:sticky;bottom:12px;background:#1a1a2e;color:#fff;border-radius:10px;padding:12px 16px;display:none;align-items:center;gap:12px;box-shadow:0 4px 14px rgba(0,0,0,.25);margin-top:16px}
  #bar button{background:#4c6ef5;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:14px;cursor:pointer}
  #bar code{background:#333356;padding:3px 8px;border-radius:5px;font-size:12.5px}
</style></head><body>
<h1>Competitor Feature Scan <small style="color:#888;font-weight:400">${date}</small></h1>
<div class="summary">
  ${firstRun ? "<b>First scan</b> — full baseline of features to-date." : `<b>${feats.length}</b> features tracked · <b>${newCount}</b> flagged new since the last scan.`}
  Tracking <b>Harvey</b>, <b>Legora</b>, and <b>CoCounsel</b>. Tick features, then <b>Copy request</b> and paste to Claude to design &amp; build them into Mike (Australia).
</div>
${scanNotes.map((n) => `<div class="note">⚠️ ${esc(n)}</div>`).join("")}
<div class="controls">
  <span style="font-size:13px;color:#666">Filter:</span>
  <button data-f="all" class="active" onclick="setFilter('all',this)">All</button>
  <button data-f="new" onclick="setFilter('new',this)">New only</button>
  <button data-f="Harvey" onclick="setFilter('Harvey',this)">Harvey</button>
  <button data-f="Legora" onclick="setFilter('Legora',this)">Legora</button>
  <button data-f="CoCounsel" onclick="setFilter('CoCounsel',this)">CoCounsel</button>
</div>
${rows}
<div id="bar"><span id="sel"></span><code id="cmd"></code><button onclick="copyCmd()">Copy request</button></div>
<script>
function setFilter(f,btn){
  document.querySelectorAll('.controls button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.item').forEach(it=>{
    let show=true;
    if(f==='new') show = it.dataset.new==='1';
    else if(f!=='all') show = it.dataset.vendor===f;
    it.style.display = show ? 'flex' : 'none';
  });
  document.querySelectorAll('h2').forEach(h=>{
    let n=h.nextElementSibling, any=false;
    while(n && n.classList && n.classList.contains('item')){ if(n.style.display!=='none') any=true; n=n.nextElementSibling; }
    h.style.display = any ? '' : 'none';
  });
}
function refresh(){
  const ids=[...document.querySelectorAll('input:checked')].map(c=>c.value);
  const bar=document.getElementById('bar');
  bar.style.display=ids.length?'flex':'none';
  document.getElementById('sel').textContent=ids.length+' selected:';
  document.getElementById('cmd').textContent='Design and build '+ids.join(', ')+' from the competitor scan into Mike (Australia).';
}
document.addEventListener('change',refresh);
function copyCmd(){navigator.clipboard.writeText(document.getElementById('cmd').textContent).then(()=>{
  const b=document.querySelector('#bar button');b.textContent='Copied ✓';setTimeout(()=>b.textContent='Copy request',1500);});}
</script>
</body></html>`;
  writeFileSync(join(REPORTS, "latest.html"), html);
  copyFileSync(join(REPORTS, "latest.html"), join(REPORTS, `scan-${date}.html`));
}

async function main() {
  console.log(`Competitor scan (${firstRun ? "first run — seeding baseline" : "incremental"})...`);

  // Age prior features: "new" only ever means "new since the last scan".
  const currentScan = reg.scanCount + 1;
  if (!firstRun) {
    for (const f of reg.features) {
      if ((f.firstSeenScan ?? 0) < currentScan && f.status === "new") f.status = "seen";
    }
  }

  await pollSources();

  reg.scanCount++;
  reg.lastScan = new Date().toISOString();
  writeFileSync(REGISTER, JSON.stringify(reg, null, 2));
  writeReports();

  const newTotal = firstRun ? SEED_FEATURES.length : newlyAdded.length;
  console.log(`NEW_ITEMS=${newTotal}`);
  if (OPEN_ALWAYS || (OPEN_IF_NEW && newTotal > 0)) {
    execFile("open", [join(REPORTS, "latest.html")], () => {});
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
