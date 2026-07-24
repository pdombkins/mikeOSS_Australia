"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderOpen, Upload, Trash2, Check } from "lucide-react";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import {
    adminGetDocumentLibrary,
    adminSetDocumentLinks,
    uploadStandaloneDocument,
    deleteDocument,
    MikeApiError,
    type AdminDocLibraryEntry,
    type AdminDocLibraryProject,
} from "@/app/lib/mikeApi";

export default function AdminDocumentsPage() {
    const router = useRouter();
    const { profile, loading: profileLoading } = useUserProfile();

    const [documents, setDocuments] = useState<AdminDocLibraryEntry[]>([]);
    const [projects, setProjects] = useState<AdminDocLibraryProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    // Cell in-flight state, keyed `${docId}:${projectId}`.
    const [savingCell, setSavingCell] = useState<Set<string>>(new Set());
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] =
        useState<AdminDocLibraryEntry | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!profileLoading && profile && !profile.isAdmin) {
            router.push("/assistant");
        }
    }, [profile, profileLoading, router]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await adminGetDocumentLibrary();
            setDocuments(data.documents);
            setProjects(data.projects);
        } catch (err) {
            setError(
                err instanceof MikeApiError
                    ? err.message
                    : "Could not load documents.",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (profile?.isAdmin) void load();
    }, [profile?.isAdmin, load]);

    const isLinked = (doc: AdminDocLibraryEntry, projectId: string) =>
        doc.linked_project_ids.includes(projectId);

    async function toggleLink(doc: AdminDocLibraryEntry, projectId: string) {
        const cellKey = `${doc.id}:${projectId}`;
        if (savingCell.has(cellKey)) return;
        const nextIds = isLinked(doc, projectId)
            ? doc.linked_project_ids.filter((id) => id !== projectId)
            : [...doc.linked_project_ids, projectId];

        // Optimistic update.
        setDocuments((prev) =>
            prev.map((d) =>
                d.id === doc.id ? { ...d, linked_project_ids: nextIds } : d,
            ),
        );
        setSavingCell((prev) => new Set(prev).add(cellKey));
        try {
            const res = await adminSetDocumentLinks(doc.id, nextIds);
            setDocuments((prev) =>
                prev.map((d) =>
                    d.id === doc.id
                        ? { ...d, linked_project_ids: res.project_ids }
                        : d,
                ),
            );
        } catch {
            // Revert on failure.
            setDocuments((prev) =>
                prev.map((d) =>
                    d.id === doc.id
                        ? { ...d, linked_project_ids: doc.linked_project_ids }
                        : d,
                ),
            );
        } finally {
            setSavingCell((prev) => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
            });
        }
    }

    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) e.target.value = "";
        if (!file) return;
        setUploading(true);
        setError(null);
        try {
            await uploadStandaloneDocument(file);
            await load();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Upload failed.",
            );
        } finally {
            setUploading(false);
        }
    }

    async function handleDelete(doc: AdminDocLibraryEntry) {
        setDeletingId(doc.id);
        setConfirmDelete(null);
        try {
            await deleteDocument(doc.id);
            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        } catch (err) {
            setError(
                err instanceof MikeApiError ? err.message : "Delete failed.",
            );
        } finally {
            setDeletingId(null);
        }
    }

    if (profileLoading || (!profile?.isAdmin && loading)) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
            </div>
        );
    }
    if (!profile?.isAdmin) return null;

    return (
        <div className="h-full overflow-auto bg-gray-50/80">
            <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
                {/* Header */}
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
                        <FolderOpen className="h-5 w-5 text-gray-700" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold text-gray-900">
                            Documents
                        </h1>
                        <p className="text-sm text-gray-500">
                            Share your Library documents to any projects. A tick
                            links a live reference — updating or removing the
                            document here updates every linked project.
                        </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700">
                        {uploading ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        ) : (
                            <Upload className="h-4 w-4" />
                        )}
                        Upload document
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            disabled={uploading}
                            onChange={handleUpload}
                        />
                    </label>
                </div>

                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
                    </div>
                ) : documents.length === 0 ? (
                    <div className="rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-gray-200">
                        <FileText className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                        <p className="text-sm text-gray-500">
                            No Library documents yet. Upload one to start sharing
                            it to projects.
                        </p>
                    </div>
                ) : projects.length === 0 ? (
                    <div className="rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-gray-200">
                        <p className="text-sm text-gray-500">
                            No projects to share to yet.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                        <table className="min-w-full border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 border-b border-gray-100 bg-white px-4 py-3 text-left font-medium text-gray-500">
                                        Document
                                    </th>
                                    {projects.map((p) => (
                                        <th
                                            key={p.id}
                                            className="border-b border-gray-100 bg-white px-3 py-3 text-center font-medium text-gray-500"
                                        >
                                            <span
                                                className="mx-auto block w-32 whitespace-normal break-words leading-tight"
                                                title={p.name}
                                            >
                                                {p.name}
                                            </span>
                                        </th>
                                    ))}
                                    <th className="border-b border-gray-100 bg-white px-3 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => (
                                    <tr key={doc.id} className="group">
                                        <td className="sticky left-0 z-10 border-b border-gray-50 bg-white px-4 py-3 group-hover:bg-gray-50/60">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                                                <span
                                                    className="max-w-[260px] truncate text-gray-800"
                                                    title={doc.filename}
                                                >
                                                    {doc.filename}
                                                </span>
                                            </div>
                                        </td>
                                        {projects.map((p) => {
                                            const linked = isLinked(doc, p.id);
                                            const cellKey = `${doc.id}:${p.id}`;
                                            const busy = savingCell.has(cellKey);
                                            return (
                                                <td
                                                    key={p.id}
                                                    className="border-b border-gray-50 px-3 py-3 text-center group-hover:bg-gray-50/60"
                                                >
                                                    <button
                                                        onClick={() =>
                                                            toggleLink(doc, p.id)
                                                        }
                                                        disabled={busy}
                                                        aria-label={`${linked ? "Unlink" : "Link"} ${doc.filename} ${linked ? "from" : "to"} ${p.name}`}
                                                        className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                                                            linked
                                                                ? "border-gray-900 bg-gray-900 text-white"
                                                                : "border-gray-300 bg-white hover:border-gray-500"
                                                        } ${busy ? "opacity-50" : ""}`}
                                                    >
                                                        {linked && (
                                                            <Check className="h-3.5 w-3.5" />
                                                        )}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                        <td className="border-b border-gray-50 px-3 py-3 text-right group-hover:bg-gray-50/60">
                                            {confirmDelete?.id === doc.id ? (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <button
                                                        onClick={() =>
                                                            handleDelete(doc)
                                                        }
                                                        disabled={
                                                            deletingId === doc.id
                                                        }
                                                        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                                    >
                                                        {deletingId === doc.id
                                                            ? "Deleting…"
                                                            : "Delete"}
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            setConfirmDelete(null)
                                                        }
                                                        className="rounded px-1.5 py-1 text-xs text-gray-400 hover:text-gray-600"
                                                    >
                                                        Cancel
                                                    </button>
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() =>
                                                        setConfirmDelete(doc)
                                                    }
                                                    disabled={!!deletingId}
                                                    title="Delete document"
                                                    className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className="mt-4 text-xs text-gray-400">
                    Linked documents appear in each project&apos;s document list
                    (read-only) and are available to that project&apos;s
                    assistant and agents. Deleting a document here removes it
                    everywhere it is linked.
                </p>
            </div>
        </div>
    );
}
