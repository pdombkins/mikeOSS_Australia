"use client";

/**
 * C004 — Command Center: adoption analytics + cohort comparison.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Loader2 } from "lucide-react";
import { adminGetAnalytics, type AdminAnalytics } from "@/app/lib/mikeApi";

function aud(n: number): string {
    return `A$${n.toFixed(2)}`;
}

function Bar({ value, max }: { value: number; max: number }) {
    return (
        <div className="h-2 w-full rounded bg-gray-100">
            <div
                className="h-2 rounded bg-gray-800"
                style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }}
            />
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState<AdminAnalytics | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setData(null);
        adminGetAnalytics(days)
            .then(setData)
            .catch((e) =>
                setError(e instanceof Error ? e.message : "Failed to load"),
            );
    }, [days]);

    return (
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                    <BarChart3 className="h-5 w-5" /> Command Center
                </h1>
                <div className="flex items-center gap-2">
                    <select
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                    <Link
                        href="/admin"
                        className="text-sm text-gray-500 hover:text-gray-800"
                    >
                        ← Admin
                    </Link>
                </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {!data && !error && (
                <div className="flex justify-center p-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
            )}
            {data && (
                <div className="space-y-6">
                    {/* KPI cards */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                            ["Active users (7d)", String(data.activeUsers.d7)],
                            ["Active users (30d)", String(data.activeUsers.d30)],
                            ["LLM spend", aud(data.totalCostAud)],
                            [
                                "LLM calls",
                                String(
                                    data.costByModel.reduce(
                                        (a, m) => a + m.calls,
                                        0,
                                    ),
                                ),
                            ],
                        ].map(([label, value]) => (
                            <div
                                key={label}
                                className="rounded-xl border border-gray-200 bg-white p-4"
                            >
                                <p className="text-xs text-gray-500">{label}</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {value}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <h2 className="mb-3 text-sm font-semibold text-gray-900">
                                Cost by model (AUD)
                            </h2>
                            <div className="space-y-2">
                                {data.costByModel.map((m) => (
                                    <div key={m.model}>
                                        <div className="mb-0.5 flex justify-between text-xs">
                                            <span className="text-gray-700">
                                                {m.model}{" "}
                                                <span className="text-gray-400">
                                                    ({m.calls})
                                                </span>
                                            </span>
                                            <span className="text-gray-500">
                                                {aud(m.costAud)}
                                            </span>
                                        </div>
                                        <Bar
                                            value={m.costAud}
                                            max={data.costByModel[0]?.costAud ?? 0}
                                        />
                                    </div>
                                ))}
                                {data.costByModel.length === 0 && (
                                    <p className="text-xs text-gray-400">
                                        No usage in this window.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <h2 className="mb-3 text-sm font-semibold text-gray-900">
                                Usage by feature
                            </h2>
                            <div className="space-y-2">
                                {data.costBySource.map((s) => (
                                    <div key={s.source}>
                                        <div className="mb-0.5 flex justify-between text-xs">
                                            <span className="text-gray-700">
                                                {s.source}{" "}
                                                <span className="text-gray-400">
                                                    ({s.calls})
                                                </span>
                                            </span>
                                            <span className="text-gray-500">
                                                {aud(s.costAud)}
                                            </span>
                                        </div>
                                        <Bar
                                            value={s.costAud}
                                            max={
                                                data.costBySource[0]?.costAud ??
                                                0
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <h2 className="mb-3 text-sm font-semibold text-gray-900">
                                Top tools
                            </h2>
                            <div className="space-y-1.5">
                                {data.toolUsage.slice(0, 12).map((t) => (
                                    <div
                                        key={t.tool}
                                        className="flex justify-between text-xs"
                                    >
                                        <span className="font-mono text-gray-700">
                                            {t.tool}
                                        </span>
                                        <span className="text-gray-500">
                                            {t.count}
                                        </span>
                                    </div>
                                ))}
                                {data.toolUsage.length === 0 && (
                                    <p className="text-xs text-gray-400">
                                        No tool calls recorded yet.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <h2 className="mb-3 text-sm font-semibold text-gray-900">
                                Cohort comparison
                            </h2>
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-gray-400">
                                        <th className="pb-1 font-medium">
                                            Cohort
                                        </th>
                                        <th className="pb-1 font-medium">
                                            Users
                                        </th>
                                        <th className="pb-1 font-medium">
                                            Calls
                                        </th>
                                        <th className="pb-1 text-right font-medium">
                                            Spend
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.cohorts.map((c) => (
                                        <tr
                                            key={c.cohort}
                                            className="border-t border-gray-100 text-gray-700"
                                        >
                                            <td className="py-1">{c.cohort}</td>
                                            <td className="py-1">{c.users}</td>
                                            <td className="py-1">{c.calls}</td>
                                            <td className="py-1 text-right">
                                                {aud(c.costAud)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-2 text-[11px] text-gray-400">
                                Tag users with a cohort in Admin → Users (e.g.
                                class groups) to compare adoption.
                            </p>
                        </div>
                    </div>

                    {/* Daily spend sparkline as table */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <h2 className="mb-3 text-sm font-semibold text-gray-900">
                            Daily spend (AUD)
                        </h2>
                        <div className="flex h-24 items-end gap-0.5">
                            {data.costByDay.map((d) => {
                                const max = Math.max(
                                    ...data.costByDay.map((x) => x.costAud),
                                    0.0001,
                                );
                                return (
                                    <div
                                        key={d.date}
                                        title={`${d.date}: ${aud(d.costAud)}`}
                                        className="flex-1 rounded-t bg-gray-800"
                                        style={{
                                            height: `${Math.max(3, (d.costAud / max) * 100)}%`,
                                        }}
                                    />
                                );
                            })}
                            {data.costByDay.length === 0 && (
                                <p className="text-xs text-gray-400">
                                    No spend in this window.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
