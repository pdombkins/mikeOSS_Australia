"use client";

/**
 * C019 — Audit trail viewer: every tool call, document access, agent action,
 * share/export and membership change. Filter + CSV export.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ScrollText, Loader2 } from "lucide-react";
import { adminGetAudit, type AdminAuditEvent } from "@/app/lib/mikeApi";

const EVENT_TYPES = [
    "",
    "tool_call",
    "doc_read",
    "doc_download",
    "doc_edit",
    "agent_step",
    "share",
    "export",
    "member_change",
];

export default function AdminAuditPage() {
    const [events, setEvents] = useState<AdminAuditEvent[] | null>(null);
    const [typeFilter, setTypeFilter] = useState("");
    const [toolFilter, setToolFilter] = useState("");

    useEffect(() => {
        setEvents(null);
        adminGetAudit({
            type: typeFilter || undefined,
            tool: toolFilter || undefined,
        })
            .then(({ events }) => setEvents(events))
            .catch(() => setEvents([]));
    }, [typeFilter, toolFilter]);

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                    <ScrollText className="h-5 w-5" /> Audit trail
                </h1>
                <div className="flex items-center gap-2">
                    <a
                        href={`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"}/admin/audit?format=csv`}
                        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        <Download className="h-4 w-4" /> CSV
                    </a>
                    <Link
                        href="/admin"
                        className="text-sm text-gray-500 hover:text-gray-800"
                    >
                        ← Admin
                    </Link>
                </div>
            </div>

            <div className="mb-4 flex gap-2">
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                    {EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t || "All event types"}
                        </option>
                    ))}
                </select>
                <input
                    value={toolFilter}
                    onChange={(e) => setToolFilter(e.target.value)}
                    placeholder="Filter by tool name…"
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-gray-500"
                />
            </div>

            {!events ? (
                <div className="flex justify-center p-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-400">
                                <th className="px-3 py-2 font-medium">Time</th>
                                <th className="px-3 py-2 font-medium">Actor</th>
                                <th className="px-3 py-2 font-medium">Event</th>
                                <th className="px-3 py-2 font-medium">Tool</th>
                                <th className="px-3 py-2 font-medium">
                                    Resource
                                </th>
                                <th className="px-3 py-2 font-medium">
                                    Detail
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((e) => (
                                <tr
                                    key={e.id}
                                    className="border-b border-gray-50 text-gray-700"
                                >
                                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-400">
                                        {new Date(
                                            e.created_at,
                                        ).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {e.actor_email}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {e.event_type}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono">
                                        {e.tool_name ?? ""}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {e.resource_type
                                            ? `${e.resource_type}${e.resource_id ? `:${e.resource_id.slice(0, 8)}` : ""}`
                                            : ""}
                                    </td>
                                    <td className="max-w-xs truncate px-3 py-1.5 text-gray-400">
                                        {e.detail
                                            ? JSON.stringify(e.detail)
                                            : ""}
                                    </td>
                                </tr>
                            ))}
                            {events.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-3 py-6 text-center text-gray-400"
                                    >
                                        No events match.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
