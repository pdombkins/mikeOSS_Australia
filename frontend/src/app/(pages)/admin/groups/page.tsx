"use client";

/**
 * Admin → Student groups. Create a group, paste a whole class list in one go
 * (match-on-signup: unregistered emails activate when that email registers),
 * and see where each group has project access.
 */

import { useCallback, useEffect, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    Loader2,
    Mail,
    Plus,
    Trash2,
    Users,
} from "lucide-react";
import {
    addGroupMembers,
    createGroup,
    deleteGroup,
    getGroup,
    inviteGroup,
    listGroups,
    removeGroupMember,
    type UserGroup,
    type UserGroupGrant,
    type UserGroupMember,
} from "@/app/lib/mikeApi";

export default function AdminGroupsPage() {
    const [groups, setGroups] = useState<UserGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [busy, setBusy] = useState(false);

    // Detail state
    const [openId, setOpenId] = useState<string | null>(null);
    const [members, setMembers] = useState<UserGroupMember[]>([]);
    const [grants, setGrants] = useState<UserGroupGrant[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [emailBlob, setEmailBlob] = useState("");
    const [importResult, setImportResult] = useState<string | null>(null);
    const [inviteResult, setInviteResult] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const data = await listGroups();
            setGroups(data.groups);
        } catch {
            setError("Could not load groups (admin access required).");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const openGroup = useCallback(async (id: string) => {
        setOpenId(id);
        setDetailLoading(true);
        setImportResult(null);
        setInviteResult(null);
        try {
            const data = await getGroup(id);
            setMembers(data.members);
            setGrants(data.grants);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const handleCreate = async () => {
        const name = newName.trim();
        if (!name || busy) return;
        setBusy(true);
        try {
            const { group } = await createGroup(name);
            setNewName("");
            await refresh();
            await openGroup(group.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create group");
        } finally {
            setBusy(false);
        }
    };

    const handleImport = async () => {
        if (!openId || !emailBlob.trim() || busy) return;
        setBusy(true);
        setImportResult(null);
        try {
            const res = await addGroupMembers(openId, emailBlob);
            setEmailBlob("");
            setImportResult(
                `Added ${res.added} member${res.added === 1 ? "" : "s"}` +
                    (res.invalid.length > 0
                        ? ` — skipped ${res.invalid.length} invalid: ${res.invalid.join(", ")}`
                        : ""),
            );
            await openGroup(openId);
            await refresh();
        } catch (e) {
            setImportResult(
                e instanceof Error ? e.message : "Import failed",
            );
        } finally {
            setBusy(false);
        }
    };

    const handleInvite = async () => {
        if (!openId || busy) return;
        setBusy(true);
        setInviteResult(null);
        try {
            const res = await inviteGroup(openId);
            const parts = [`Sent ${res.invited} invite${res.invited === 1 ? "" : "s"}`];
            if (res.skipped_registered > 0)
                parts.push(`${res.skipped_registered} already had accounts`);
            if (res.failed.length > 0)
                parts.push(
                    `${res.failed.length} failed (${res.failed
                        .slice(0, 3)
                        .map((f) => f.email)
                        .join(", ")}${res.failed.length > 3 ? "…" : ""})`,
                );
            setInviteResult(parts.join(" · "));
            await openGroup(openId);
            await refresh();
        } catch (e) {
            setInviteResult(e instanceof Error ? e.message : "Invite failed");
        } finally {
            setBusy(false);
        }
    };

    const openGroupMeta = groups.find((g) => g.id === openId);
    const pendingCount = members.filter((m) => !m.registered).length;

    return (
        <div className="mx-auto max-w-4xl p-6">
            <div className="mb-6 flex items-center gap-3">
                <a href="/admin" className="text-gray-400 hover:text-gray-700">
                    <ArrowLeft className="h-5 w-5" />
                </a>
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                        <Users className="h-5 w-5" /> Student groups
                    </h1>
                    <p className="text-sm text-gray-500">
                        Invite a whole class in one go and manage its project
                        access as a group. Students without an account get
                        access automatically when they register with the same
                        email.
                    </p>
                </div>
            </div>

            {error && (
                <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}

            {openId === null ? (
                <>
                    <div className="mb-4 flex items-center gap-2">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) =>
                                e.key === "Enter" && void handleCreate()
                            }
                            placeholder="New group name — e.g. LAWS8198 2026 T2"
                            className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                        />
                        <button
                            onClick={() => void handleCreate()}
                            disabled={!newName.trim() || busy}
                            className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" /> Create
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center p-10">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        </div>
                    ) : groups.length === 0 ? (
                        <p className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
                            No groups yet — create one above, then paste the
                            class email list.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {groups.map((g) => (
                                <li key={g.id}>
                                    <button
                                        onClick={() => void openGroup(g.id)}
                                        className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
                                    >
                                        <Users className="h-4 w-4 shrink-0 text-gray-400" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-gray-900">
                                                {g.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {g.member_count} member
                                                {g.member_count === 1 ? "" : "s"}{" "}
                                                ({g.registered_count} registered)
                                                {" · "}
                                                {g.project_count} project
                                                {g.project_count === 1 ? "" : "s"}
                                            </p>
                                        </div>
                                        <Trash2
                                            className="h-4 w-4 text-gray-300 hover:text-red-600"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (
                                                    confirm(
                                                        `Delete "${g.name}"? All its project access is revoked immediately.`,
                                                    )
                                                )
                                                    void deleteGroup(g.id).then(
                                                        refresh,
                                                    );
                                            }}
                                        />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            ) : (
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                    <div className="mb-3 flex items-center justify-between">
                        <button
                            onClick={() => {
                                setOpenId(null);
                                void refresh();
                            }}
                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
                        >
                            <ArrowLeft className="h-4 w-4" /> All groups
                        </button>
                        <h2 className="text-sm font-semibold text-gray-900">
                            {openGroupMeta?.name}
                        </h2>
                    </div>

                    <label className="mb-1 block text-xs font-medium text-gray-700">
                        Add members — paste emails (one per line, or separated
                        by commas / semicolons)
                    </label>
                    <textarea
                        value={emailBlob}
                        onChange={(e) => setEmailBlob(e.target.value)}
                        rows={4}
                        placeholder={"z1234567@ad.unsw.edu.au\nz7654321@ad.unsw.edu.au"}
                        className="mb-2 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-gray-400"
                    />
                    <div className="mb-4 flex items-center gap-3">
                        <button
                            onClick={() => void handleImport()}
                            disabled={!emailBlob.trim() || busy}
                            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            {busy ? "Adding…" : "Add to group"}
                        </button>
                        {importResult && (
                            <p className="text-xs text-gray-600">
                                {importResult}
                            </p>
                        )}
                    </div>

                    {detailLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <>
                            {grants.length > 0 && (
                                <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                    Access:{" "}
                                    {grants
                                        .map(
                                            (g) =>
                                                `${g.project_name ?? g.project_id} (${g.role})`,
                                        )
                                        .join(" · ")}
                                    {" — "}manage from the project&apos;s
                                    Members &amp; access modal.
                                </p>
                            )}
                            {members.length > 0 && (
                                <div className="mb-3 flex items-center gap-3">
                                    <button
                                        onClick={() => void handleInvite()}
                                        disabled={busy || pendingCount === 0}
                                        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                                    >
                                        <Mail className="h-4 w-4" />
                                        {pendingCount === 0
                                            ? "All members have accounts"
                                            : `Email invites to ${pendingCount} pending member${pendingCount === 1 ? "" : "s"}`}
                                    </button>
                                    {inviteResult && (
                                        <p className="text-xs text-gray-600">
                                            {inviteResult}
                                        </p>
                                    )}
                                </div>
                            )}
                            <ul className="max-h-80 space-y-1 overflow-y-auto">
                                {members.map((m) => (
                                    <li
                                        key={m.id}
                                        className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5"
                                    >
                                        {m.registered ? (
                                            <CheckCircle2
                                                className="h-3.5 w-3.5 shrink-0 text-green-600"
                                                aria-label="Registered"
                                            />
                                        ) : (
                                            <Clock
                                                className="h-3.5 w-3.5 shrink-0 text-amber-500"
                                                aria-label="Awaiting signup"
                                            />
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                                            {m.email}
                                            {m.display_name && (
                                                <span className="ml-1.5 text-xs text-gray-400">
                                                    {m.display_name}
                                                </span>
                                            )}
                                        </span>
                                        {!m.registered && (
                                            <span className="text-[11px] text-amber-600">
                                                awaiting signup
                                            </span>
                                        )}
                                        <button
                                            onClick={() =>
                                                openId &&
                                                void removeGroupMember(
                                                    openId,
                                                    m.id,
                                                ).then(() => openGroup(openId))
                                            }
                                            className="text-gray-300 hover:text-red-600"
                                            title="Remove from group"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </li>
                                ))}
                                {members.length === 0 && (
                                    <li className="p-4 text-center text-xs text-gray-400">
                                        No members yet — paste the class list
                                        above.
                                    </li>
                                )}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
