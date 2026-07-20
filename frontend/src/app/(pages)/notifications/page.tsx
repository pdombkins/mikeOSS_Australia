"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useNotifications } from "@/app/hooks/useNotifications";

function timeAgo(iso: string): string {
    const s = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

const KIND_LABELS: Record<string, string> = {
    agent_run: "Agent",
    tabular_review: "Tabular Review",
    regwatch: "Regulatory",
    system: "System",
};

export default function NotificationsPage() {
    const { user } = useAuth();
    const { notifications, unreadCount, markRead, refresh } = useNotifications(
        !!user,
    );

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                    <Bell className="h-5 w-5" />
                    Notifications
                    {unreadCount > 0 && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {unreadCount}
                        </span>
                    )}
                </h1>
                {unreadCount > 0 && (
                    <button
                        onClick={() => void markRead()}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                    >
                        <CheckCheck className="h-4 w-4" /> Mark all read
                    </button>
                )}
            </div>
            {notifications.length === 0 ? (
                <p className="text-sm text-gray-500">
                    Nothing here yet. Agent runs, tabular review completions and
                    regulatory alerts will appear here.
                </p>
            ) : (
                <ul className="space-y-2">
                    {notifications.map((n) => {
                        const inner = (
                            <div
                                className={`rounded-xl border px-4 py-3 transition-colors ${
                                    n.read_at
                                        ? "border-gray-200 bg-white"
                                        : "border-blue-200 bg-blue-50/60"
                                } ${n.link ? "hover:bg-gray-50" : ""}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                        {KIND_LABELS[n.kind] ?? n.kind}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {timeAgo(n.created_at)}
                                    </span>
                                </div>
                                <p className="mt-1 text-sm font-medium text-gray-900">
                                    {n.title}
                                </p>
                                {n.body && (
                                    <p className="mt-0.5 text-sm text-gray-600">
                                        {n.body}
                                    </p>
                                )}
                            </div>
                        );
                        return (
                            <li key={n.id}>
                                {n.link ? (
                                    <Link
                                        href={n.link}
                                        onClick={() => void markRead([n.id])}
                                    >
                                        {inner}
                                    </Link>
                                ) : (
                                    <button
                                        className="w-full text-left"
                                        onClick={() => void markRead([n.id])}
                                    >
                                        {inner}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
