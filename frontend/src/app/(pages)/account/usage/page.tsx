"use client";

/**
 * C077 — Account → Usage: personal consumption metering + soft budget.
 * Every LLM/embedding call Mike makes is costed in AUD (query_costs);
 * this page shows monthly spend by feature and model, and lets the user
 * set an optional soft monthly budget (warnings only — nothing is blocked).
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
    getUserUsage,
    updateBudget,
    type BudgetStatus,
    type UsageMonth,
} from "@/app/lib/mikeApi";
import { AccountSection } from "../AccountSection";

/** AccountSection wrapper with the heading/description pattern used on this page. */
function Section({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <AccountSection>
            <div className="px-4 py-5">
                <h2 className="mb-1 text-sm font-medium text-gray-700">
                    {title}
                </h2>
                {description && (
                    <p className="mb-3 text-xs text-gray-400">{description}</p>
                )}
                {children}
            </div>
        </AccountSection>
    );
}

const SOURCE_LABELS: Record<string, string> = {
    chat: "Assistant chat",
    project: "Project chat",
    tabular: "Tabular review",
    tabular_ask: "Tabular ask",
    agent_step: "Agent runs",
    kb_embedding: "Knowledge embeddings",
    workflow: "Workflows",
    export: "Exports",
    other: "Other",
};

const aud = (n: number) =>
    `A$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function UsagePage() {
    const [months, setMonths] = useState<UsageMonth[]>([]);
    const [totalAud, setTotalAud] = useState(0);
    const [budget, setBudget] = useState<BudgetStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [budgetDraft, setBudgetDraft] = useState("");
    const [savingBudget, setSavingBudget] = useState(false);
    const [savedBudget, setSavedBudget] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const { usage, budget } = await getUserUsage(6);
            setMonths([...usage.months].reverse());
            setTotalAud(usage.total_aud);
            setBudget(budget);
            setBudgetDraft(
                budget.monthly_budget_aud != null
                    ? String(budget.monthly_budget_aud)
                    : "",
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load usage");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const saveBudget = async () => {
        setSavingBudget(true);
        setError(null);
        try {
            const value = budgetDraft.trim() === "" ? null : Number(budgetDraft);
            if (value !== null && (!Number.isFinite(value) || value < 0)) {
                setError("Budget must be a non-negative number.");
                return;
            }
            await updateBudget(value);
            setSavedBudget(true);
            setTimeout(() => setSavedBudget(false), 2000);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save budget");
        } finally {
            setSavingBudget(false);
        }
    };

    const maxMonth = Math.max(...months.map((m) => m.cost_aud), 0.01);
    const thisMonth = budget?.spent_aud ?? 0;
    const ratio = budget?.ratio;

    return (
        <div className="space-y-6">
            <Section
                title="Usage this month"
                description="Every AI call Mike makes is costed in AUD and recorded — assistant chats, tabular reviews, agent runs, embeddings, and exports."
            >
                {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-baseline gap-3">
                            <span className="text-3xl font-medium text-gray-900">
                                {aud(thisMonth)}
                            </span>
                            {budget?.monthly_budget_aud != null && (
                                <span className="text-sm text-gray-500">
                                    of {aud(budget.monthly_budget_aud)} soft
                                    budget ({Math.round((ratio ?? 0) * 100)}%)
                                </span>
                            )}
                        </div>
                        {ratio != null && (
                            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-gray-100">
                                <div
                                    className={`h-full rounded-full ${
                                        ratio >= 1
                                            ? "bg-red-500"
                                            : ratio >= 0.8
                                              ? "bg-amber-500"
                                              : "bg-emerald-500"
                                    }`}
                                    style={{
                                        width: `${Math.min(ratio * 100, 100)}%`,
                                    }}
                                />
                            </div>
                        )}
                        {ratio != null && ratio >= 1 && (
                            <p className="text-sm text-amber-700">
                                You have passed your soft budget for{" "}
                                {budget?.month}. Nothing is blocked — this is a
                                cost-awareness signal only.
                            </p>
                        )}
                    </div>
                )}
            </Section>

            <Section
                title="Soft monthly budget"
                description="Optional. At 80% you get a notification; at 100% a reminder banner. Mike never blocks requests over budget — this is a teaching aid for cost-aware AI use."
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">A$</span>
                    <input
                        type="number"
                        min={0}
                        step="1"
                        value={budgetDraft}
                        onChange={(e) => setBudgetDraft(e.target.value)}
                        placeholder="No budget"
                        className="w-32 rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-400"
                    />
                    <button
                        onClick={() => void saveBudget()}
                        disabled={savingBudget}
                        className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {savingBudget ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : savedBudget ? (
                            <Check className="h-4 w-4" />
                        ) : null}
                        Save
                    </button>
                    <button
                        onClick={() => {
                            setBudgetDraft("");
                        }}
                        className="text-xs text-gray-500 underline hover:text-gray-700"
                    >
                        clear
                    </button>
                </div>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </Section>

            <Section
                title="Last 6 months"
                description={`Total: ${aud(totalAud)}`}
            >
                {months.length === 0 && !loading ? (
                    <p className="text-sm text-gray-500">No usage recorded yet.</p>
                ) : (
                    <div className="space-y-4">
                        {months.map((m) => (
                            <div key={m.month}>
                                <div className="mb-1 flex items-baseline justify-between">
                                    <span className="text-sm font-medium text-gray-800">
                                        {m.month}
                                    </span>
                                    <span className="text-sm text-gray-600">
                                        {aud(m.cost_aud)} · {m.calls} call
                                        {m.calls === 1 ? "" : "s"}
                                    </span>
                                </div>
                                <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                    <div
                                        className="h-full rounded-full bg-gray-800"
                                        style={{
                                            width: `${Math.max((m.cost_aud / maxMonth) * 100, 1)}%`,
                                        }}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                                    {Object.entries(m.by_source)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([src, cost]) => (
                                            <span key={src}>
                                                {SOURCE_LABELS[src] ?? src}:{" "}
                                                {aud(cost)}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}
