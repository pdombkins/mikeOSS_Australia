"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Users,
    Mail,
    Trash2,
    UserPlus,
    Clock,
    CheckCircle2,
    XCircle,
    ShieldCheck,
} from "lucide-react";
import { useUserProfile } from "@/contexts/UserProfileContext";
import {
    adminListUsers,
    adminRemoveUser,
    adminInviteUser,
    adminListInvitations,
    adminRevokeInvitation,
    type AdminUser,
    type AdminInvitation,
    MikeApiError,
} from "@/app/lib/mikeApi";

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function StatusBadge({ confirmed }: { confirmed: boolean }) {
    return confirmed ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            <CheckCircle2 className="h-3 w-3" />
            Active
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <Clock className="h-3 w-3" />
            Pending
        </span>
    );
}

export default function AdminPage() {
    const router = useRouter();
    const { profile, loading: profileLoading } = useUserProfile();

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviting, setInviting] = useState(false);
    const [inviteStatus, setInviteStatus] = useState<{
        type: "success" | "error";
        message: string;
    } | null>(null);

    const [removingId, setRemovingId] = useState<string | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<AdminUser | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    // Redirect if not admin
    useEffect(() => {
        if (!profileLoading && profile && !profile.isAdmin) {
            router.push("/assistant");
        }
    }, [profile, profileLoading, router]);

    const loadData = useCallback(async () => {
        setLoadingData(true);
        try {
            const [usersData, invitationsData] = await Promise.all([
                adminListUsers(),
                adminListInvitations(),
            ]);
            setUsers(usersData);
            setInvitations(invitationsData);
        } catch {
            // swallow — errors shown inline
        } finally {
            setLoadingData(false);
        }
    }, []);

    useEffect(() => {
        if (profile?.isAdmin) {
            loadData();
        }
    }, [profile?.isAdmin, loadData]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = inviteEmail.trim().toLowerCase();
        if (!email) return;

        setInviting(true);
        setInviteStatus(null);
        try {
            await adminInviteUser(email);
            setInviteStatus({
                type: "success",
                message: `Invitation sent to ${email}.`,
            });
            setInviteEmail("");
            // Refresh invitations list
            const updated = await adminListInvitations();
            setInvitations(updated);
        } catch (err) {
            const msg =
                err instanceof MikeApiError
                    ? err.message
                    : "Failed to send invitation. Please try again.";
            setInviteStatus({ type: "error", message: msg });
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveUser = async (user: AdminUser) => {
        setRemovingId(user.id);
        setConfirmRemove(null);
        try {
            await adminRemoveUser(user.id);
            setUsers((prev) => prev.filter((u) => u.id !== user.id));
        } catch (err) {
            const msg =
                err instanceof MikeApiError ? err.message : "Failed to remove user.";
            alert(msg);
        } finally {
            setRemovingId(null);
        }
    };

    const handleRevokeInvitation = async (id: string) => {
        setRevokingId(id);
        try {
            await adminRevokeInvitation(id);
            setInvitations((prev) => prev.filter((i) => i.id !== id));
        } catch {
            // swallow
        } finally {
            setRevokingId(null);
        }
    };

    if (profileLoading || (!profile?.isAdmin && loadingData)) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
            </div>
        );
    }

    if (!profile?.isAdmin) return null;

    return (
        <div className="h-full overflow-y-auto bg-gray-50/80">
            <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
                {/* Header */}
                <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
                        <ShieldCheck className="h-5 w-5 text-gray-700" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">
                            Collaboration Portal
                        </h1>
                        <p className="text-sm text-gray-500">
                            Manage who has access to this Mike OSS instance
                        </p>
                    </div>
                </div>

                {/* Invite section */}
                <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                    <div className="mb-4 flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-gray-500" />
                        <h2 className="text-sm font-semibold text-gray-900">
                            Invite someone
                        </h2>
                    </div>
                    <form onSubmit={handleInvite} className="flex gap-3">
                        <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="colleague@example.com"
                            disabled={inviting}
                            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
                        />
                        <button
                            type="submit"
                            disabled={inviting || !inviteEmail.trim()}
                            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {inviting ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            ) : (
                                <Mail className="h-4 w-4" />
                            )}
                            Send invitation
                        </button>
                    </form>
                    {inviteStatus && (
                        <div
                            className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                                inviteStatus.type === "success"
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-700"
                            }`}
                        >
                            {inviteStatus.type === "success" ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                            ) : (
                                <XCircle className="h-4 w-4 shrink-0" />
                            )}
                            {inviteStatus.message}
                        </div>
                    )}
                </div>

                {/* Pending invitations */}
                {invitations.length > 0 && (
                    <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                        <div className="mb-4 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <h2 className="text-sm font-semibold text-gray-900">
                                Pending invitations
                            </h2>
                            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                {invitations.length}
                            </span>
                        </div>
                        <ul className="divide-y divide-gray-100">
                            {invitations.map((inv) => (
                                <li
                                    key={inv.id}
                                    className="flex items-center justify-between gap-4 py-3"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">
                                            {inv.email}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            Invited {formatDate(inv.created_at)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleRevokeInvitation(inv.id)}
                                        disabled={revokingId === inv.id}
                                        className="text-xs text-gray-400 transition-colors hover:text-red-600 disabled:opacity-50"
                                        title="Revoke invitation"
                                    >
                                        {revokingId === inv.id ? "Revoking…" : "Revoke"}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Users list */}
                <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                    <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
                        <Users className="h-4 w-4 text-gray-500" />
                        <h2 className="text-sm font-semibold text-gray-900">Users</h2>
                        {!loadingData && (
                            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                                {users.length}
                            </span>
                        )}
                    </div>

                    {loadingData ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
                        </div>
                    ) : users.length === 0 ? (
                        <p className="py-12 text-center text-sm text-gray-400">
                            No users yet
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {users.map((user) => (
                                <li
                                    key={user.id}
                                    className="flex items-center gap-4 px-6 py-4"
                                >
                                    {/* Avatar */}
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600 select-none">
                                        {(user.displayName ?? user.email)
                                            .charAt(0)
                                            .toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-medium text-gray-900">
                                                {user.displayName ?? user.email}
                                            </p>
                                            {user.isAdmin && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                                                    <ShieldCheck className="h-3 w-3" />
                                                    Admin
                                                </span>
                                            )}
                                            <StatusBadge confirmed={!!user.confirmedAt} />
                                        </div>
                                        {user.displayName && (
                                            <p className="truncate text-xs text-gray-400">
                                                {user.email}
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-400">
                                            Joined {formatDate(user.createdAt)}
                                            {user.lastSignIn &&
                                                ` · Last active ${formatDate(user.lastSignIn)}`}
                                        </p>
                                    </div>

                                    {/* Remove */}
                                    {!user.isAdmin && (
                                        <>
                                            {confirmRemove?.id === user.id ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500">
                                                        Remove this user?
                                                    </span>
                                                    <button
                                                        onClick={() => handleRemoveUser(user)}
                                                        disabled={removingId === user.id}
                                                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                                                    >
                                                        {removingId === user.id
                                                            ? "Removing…"
                                                            : "Yes, remove"}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmRemove(null)}
                                                        className="rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmRemove(user)}
                                                    disabled={!!removingId}
                                                    className="shrink-0 rounded-lg p-2 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                                    title="Remove user"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <p className="mt-4 text-center text-xs text-gray-400">
                    To restrict sign-ups to invited users only, disable{" "}
                    <strong>Enable email signups</strong> in your Supabase Auth settings.
                </p>
            </div>
        </div>
    );
}
