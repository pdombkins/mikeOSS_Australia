"use client";

/**
 * P3 (C019) — Members & access with roles. Replaces the email-list People
 * modal for projects: each member has a role (editor / reviewer / viewer);
 * no membership = no access (the ethical wall). Owner-only management.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Trash2, User, X } from "lucide-react";
import {
    getProjectMembers,
    removeProjectMember,
    upsertProjectMember,
    type ProjectMember,
    type ProjectMemberRole,
} from "@/app/lib/mikeApi";

const ASSIGNABLE_ROLES: Exclude<ProjectMemberRole, "owner">[] = [
    "editor",
    "reviewer",
    "viewer",
];

const ROLE_HELP: Record<string, string> = {
    owner: "Full control incl. members & deletion",
    editor: "View, run, edit documents, approve agent plans",
    reviewer: "View, download, run — no edits",
    viewer: "View only",
};

interface Props {
    open: boolean;
    onClose: () => void;
    projectId: string;
    projectName: string;
    currentUserEmail?: string | null;
}

export function ProjectMembersModal({
    open,
    onClose,
    projectId,
    projectName,
    currentUserEmail,
}: Props) {
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [myRole, setMyRole] = useState<ProjectMemberRole | null>(null);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<Exclude<ProjectMemberRole, "owner">>(
        "editor",
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getProjectMembers(projectId);
            setMembers(data.members);
            setMyRole(data.role);
        } catch {
            setError("Could not load members");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (!open) return;
        setError(null);
        void refresh();
    }, [open, refresh]);

    if (!open) return null;
    const canManage = myRole === "owner";

    const addMember = async () => {
        const e = email.trim().toLowerCase();
        if (!e || busy) return;
        setBusy(true);
        setError(null);
        try {
            await upsertProjectMember(projectId, e, role);
            setEmail("");
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add member");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/30 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                <div className="mb-1 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-lg font-medium font-serif text-gray-900">
                        <ShieldCheck className="h-5 w-5" /> Members & access
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <p className="mb-4 text-xs text-gray-500">
                    {projectName} — deny-by-default: only listed members can see
                    this matter (ethical wall).
                </p>

                {loading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <ul className="mb-4 space-y-1.5">
                        {members.map((m) => (
                            <li
                                key={m.id}
                                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2"
                            >
                                <User className="h-4 w-4 shrink-0 text-gray-400" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-gray-900">
                                        {m.display_name || m.email || m.user_id}
                                        {m.email &&
                                            currentUserEmail &&
                                            m.email.toLowerCase() ===
                                                currentUserEmail.toLowerCase() && (
                                                <span className="ml-1.5 text-xs text-gray-400">
                                                    (You)
                                                </span>
                                            )}
                                    </p>
                                    <p className="truncate text-[11px] text-gray-400">
                                        {ROLE_HELP[m.role]}
                                    </p>
                                </div>
                                {m.role === "owner" ? (
                                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                                        owner
                                    </span>
                                ) : canManage ? (
                                    <>
                                        <select
                                            value={m.role}
                                            onChange={(e) =>
                                                void upsertProjectMember(
                                                    projectId,
                                                    m.email ?? "",
                                                    e.target
                                                        .value as Exclude<
                                                        ProjectMemberRole,
                                                        "owner"
                                                    >,
                                                ).then(refresh)
                                            }
                                            className="rounded border border-gray-200 px-1.5 py-1 text-xs"
                                        >
                                            {ASSIGNABLE_ROLES.map((r) => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() =>
                                                void removeProjectMember(
                                                    projectId,
                                                    m.user_id,
                                                ).then(refresh)
                                            }
                                            className="text-gray-300 hover:text-red-600"
                                            title="Remove (wall off)"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </>
                                ) : (
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                                        {m.role}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {canManage && (
                    <div className="flex items-center gap-2">
                        <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="member@example.com"
                            className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                        />
                        <select
                            value={role}
                            onChange={(e) =>
                                setRole(
                                    e.target.value as Exclude<
                                        ProjectMemberRole,
                                        "owner"
                                    >,
                                )
                            }
                            className="rounded-md border border-gray-200 px-2 py-2 text-sm"
                        >
                            {ASSIGNABLE_ROLES.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => void addMember()}
                            disabled={!email.trim() || busy}
                            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            {busy ? "Adding…" : "Add"}
                        </button>
                    </div>
                )}
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            </div>
        </div>
    );
}
