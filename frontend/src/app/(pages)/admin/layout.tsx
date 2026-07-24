"use client";

/**
 * Admin section guard. Every route under /admin is admin-only. This layout
 * is the single client-side gate: while the profile loads it shows a spinner,
 * and any authenticated non-admin is redirected to /assistant before an admin
 * page renders. The backend independently enforces admin access on every
 * /admin and /groups endpoint (requireAdmin → 403), so this is defence in
 * depth, not the only control — but it means non-admins never see an admin
 * page shell, and it covers any future admin page automatically.
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUserProfile } from "@/app/contexts/UserProfileContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const { profile, loading } = useUserProfile();

    useEffect(() => {
        if (!loading && profile && !profile.isAdmin) {
            router.replace("/assistant");
        }
    }, [profile, loading, router]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
            </div>
        );
    }

    // Non-admins (or unresolved profile) never see admin content.
    if (!profile?.isAdmin) return null;

    return <>{children}</>;
}
