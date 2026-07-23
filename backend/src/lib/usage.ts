/**
 * C077 — consumption metering (Legora consumption-pricing analogue).
 *
 * Mike records every LLM/embedding call in query_costs (AUD). This module
 * aggregates that spend per user and per project, and implements SOFT
 * monthly budgets: a notification at 80%, a banner at 100% — never a block.
 * Teaching goal: students see what their research costs.
 */

import { createServerSupabase } from "./supabase";
import { notify } from "./notifications";

type Db = ReturnType<typeof createServerSupabase>;

type CostRow = {
    user_id: string;
    project_id: string | null;
    model: string;
    source: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_aud: number | null;
    created_at: string;
};

export type UsageSummary = {
    months: {
        month: string; // YYYY-MM
        cost_aud: number;
        by_source: Record<string, number>;
        by_model: Record<string, number>;
        calls: number;
    }[];
    total_aud: number;
};

function monthOf(iso: string): string {
    return iso.slice(0, 7);
}

export async function getUserUsage(
    db: Db,
    userId: string,
    months = 6,
): Promise<UsageSummary> {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (months - 1));

    const { data } = await db
        .from("query_costs")
        .select(
            "user_id, project_id, model, source, input_tokens, output_tokens, cost_aud, created_at",
        )
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .limit(50_000);

    const byMonth = new Map<
        string,
        {
            cost_aud: number;
            by_source: Record<string, number>;
            by_model: Record<string, number>;
            calls: number;
        }
    >();
    let total = 0;
    for (const r of (data ?? []) as CostRow[]) {
        const m = monthOf(r.created_at);
        const aud = Number(r.cost_aud ?? 0);
        total += aud;
        const agg = byMonth.get(m) ?? {
            cost_aud: 0,
            by_source: {},
            by_model: {},
            calls: 0,
        };
        agg.cost_aud += aud;
        agg.calls += 1;
        const src = r.source ?? "other";
        agg.by_source[src] = (agg.by_source[src] ?? 0) + aud;
        agg.by_model[r.model] = (agg.by_model[r.model] ?? 0) + aud;
        byMonth.set(m, agg);
    }
    return {
        months: [...byMonth.entries()]
            .map(([month, v]) => ({ month, ...v }))
            .sort((a, b) => a.month.localeCompare(b.month)),
        total_aud: total,
    };
}

export type BudgetStatus = {
    monthly_budget_aud: number | null;
    month: string;
    spent_aud: number;
    /** 0..n — spent/budget; null when no budget set. */
    ratio: number | null;
};

export async function getUserBudgetStatus(
    db: Db,
    userId: string,
): Promise<BudgetStatus> {
    const now = new Date();
    const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const month = monthStart.toISOString().slice(0, 7);

    const [{ data: profile }, { data: costs }] = await Promise.all([
        db
            .from("user_profiles")
            .select("monthly_budget_aud")
            .eq("user_id", userId)
            .maybeSingle(),
        db
            .from("query_costs")
            .select("cost_aud")
            .eq("user_id", userId)
            .gte("created_at", monthStart.toISOString())
            .limit(50_000),
    ]);

    const budget =
        profile?.monthly_budget_aud != null
            ? Number(profile.monthly_budget_aud)
            : null;
    const spent = (costs ?? []).reduce(
        (n, r) => n + Number((r as { cost_aud: number | null }).cost_aud ?? 0),
        0,
    );
    return {
        monthly_budget_aud: budget,
        month,
        spent_aud: spent,
        ratio: budget && budget > 0 ? spent / budget : null,
    };
}

export async function getProjectUsage(
    db: Db,
    projectId: string,
): Promise<{ total_aud: number; this_month_aud: number; calls: number }> {
    const now = new Date();
    const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    const { data } = await db
        .from("query_costs")
        .select("cost_aud, created_at")
        .eq("project_id", projectId)
        .limit(50_000);
    let total = 0;
    let thisMonth = 0;
    for (const r of (data ?? []) as { cost_aud: number | null; created_at: string }[]) {
        const aud = Number(r.cost_aud ?? 0);
        total += aud;
        if (r.created_at >= monthStart) thisMonth += aud;
    }
    return { total_aud: total, this_month_aud: thisMonth, calls: (data ?? []).length };
}

/**
 * Daily soft-budget sweep (wired in index.ts alongside the regwatch timer).
 * Sends at most ONE 80%-crossing notification per user per month — deduped
 * against the notifications table by title. Never blocks anything.
 */
export async function checkBudgetsAndNotify(): Promise<void> {
    const db = createServerSupabase();
    const { data: profiles } = await db
        .from("user_profiles")
        .select("user_id, monthly_budget_aud")
        .not("monthly_budget_aud", "is", null);

    for (const p of (profiles ?? []) as {
        user_id: string;
        monthly_budget_aud: number;
    }[]) {
        if (!p.monthly_budget_aud || p.monthly_budget_aud <= 0) continue;
        try {
            const status = await getUserBudgetStatus(db, p.user_id);
            if (status.ratio == null || status.ratio < 0.8) continue;
            const pct = Math.round(status.ratio * 100);
            const title = `Usage at ${pct >= 100 ? "100%+" : "80%+"} of your ${status.month} budget`;
            // Dedupe: one notification per threshold per month.
            const { data: existing } = await db
                .from("notifications")
                .select("id")
                .eq("user_id", p.user_id)
                .eq("title", title)
                .limit(1);
            if (existing && existing.length > 0) continue;
            await notify({
                userId: p.user_id,
                kind: "system",
                title,
                body: `You have spent A$${status.spent_aud.toFixed(2)} of your A$${p.monthly_budget_aud.toFixed(2)} soft budget this month (${pct}%). This is informational only — nothing is blocked. See Account → Usage.`,
                link: "/account/usage",
            });
        } catch (err) {
            console.error("[usage] budget check failed:", err);
        }
    }
}
