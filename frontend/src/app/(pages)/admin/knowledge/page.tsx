"use client";

/**
 * C036 — Workspace knowledge management: all playbooks, KB documents and
 * clauses across users, with owner + counts.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2 } from "lucide-react";
import { adminGetKnowledge, type AdminKnowledge } from "@/app/lib/mikeApi";

export default function AdminKnowledgePage() {
    const [data, setData] = useState<AdminKnowledge | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        adminGetKnowledge()
            .then(setData)
            .catch((e) =>
                setError(e instanceof Error ? e.message : "Failed to load"),
            );
    }, []);

    return (
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                    <BookOpen className="h-5 w-5" /> Workspace knowledge
                </h1>
                <Link
                    href="/admin"
                    className="text-sm text-gray-500 hover:text-gray-800"
                >
                    ← Admin
                </Link>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!data && !error && (
                <div className="flex justify-center p-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
            )}
            {data && (
                <div className="space-y-8">
                    <section>
                        <h2 className="mb-2 text-sm font-semibold text-gray-900">
                            Playbooks ({data.playbooks.length})
                        </h2>
                        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 text-left text-gray-400">
                                        <th className="px-3 py-2 font-medium">Name</th>
                                        <th className="px-3 py-2 font-medium">Type</th>
                                        <th className="px-3 py-2 font-medium">Owner</th>
                                        <th className="px-3 py-2 font-medium">Rules</th>
                                        <th className="px-3 py-2 font-medium">Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.playbooks.map((p) => (
                                        <tr key={p.id} className="border-b border-gray-50 text-gray-700">
                                            <td className="px-3 py-1.5">{p.name}</td>
                                            <td className="px-3 py-1.5">{p.agreement_type ?? ""}</td>
                                            <td className="px-3 py-1.5">{p.owner_email}</td>
                                            <td className="px-3 py-1.5">{p.rule_count}</td>
                                            <td className="px-3 py-1.5 text-gray-400">{new Date(p.updated_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                    <section>
                        <h2 className="mb-2 text-sm font-semibold text-gray-900">
                            Knowledge base documents ({data.kb_documents.length})
                        </h2>
                        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 text-left text-gray-400">
                                        <th className="px-3 py-2 font-medium">Title</th>
                                        <th className="px-3 py-2 font-medium">Type</th>
                                        <th className="px-3 py-2 font-medium">Owner</th>
                                        <th className="px-3 py-2 font-medium">Chunks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.kb_documents.map((d) => (
                                        <tr key={d.id} className="border-b border-gray-50 text-gray-700">
                                            <td className="px-3 py-1.5">{d.title}</td>
                                            <td className="px-3 py-1.5">{d.doc_type}</td>
                                            <td className="px-3 py-1.5">{d.owner_email}</td>
                                            <td className="px-3 py-1.5">{d.chunk_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                    <section>
                        <h2 className="mb-2 text-sm font-semibold text-gray-900">
                            Clauses ({data.clauses.length})
                        </h2>
                        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 text-left text-gray-400">
                                        <th className="px-3 py-2 font-medium">Title</th>
                                        <th className="px-3 py-2 font-medium">Type</th>
                                        <th className="px-3 py-2 font-medium">Owner</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.clauses.map((c) => (
                                        <tr key={c.id} className="border-b border-gray-50 text-gray-700">
                                            <td className="px-3 py-1.5">{c.title}</td>
                                            <td className="px-3 py-1.5">{c.agreement_type ?? ""}</td>
                                            <td className="px-3 py-1.5">{c.owner_email}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
