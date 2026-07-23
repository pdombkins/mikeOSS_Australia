"use client";

/**
 * Landing page for Supabase password-recovery links. The Supabase client
 * parses the recovery token out of the URL hash on load (detectSessionInUrl,
 * on by default) and fires a PASSWORD_RECOVERY auth event once it has
 * established a temporary recovery session — we wait for that, then let the
 * user set a real password via supabase.auth.updateUser.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { SiteLogo } from "@/app/components/site-logo";

const authGlassCardClassName =
    "rounded-2xl border border-white/70 bg-white/72 p-8 shadow-[0_4px_14px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-8px_18px_rgba(255,255,255,0.12)] backdrop-blur-2xl";
const authInputClassName =
    "rounded-lg border border-transparent bg-gray-100 px-3 shadow-none focus-visible:border-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300/45";

export default function ResetPasswordPage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [expired, setExpired] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") {
                setReady(true);
            }
        });

        // Fallback in case the event fired before this listener attached
        // (can happen on a fast page load).
        const timeout = window.setTimeout(async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                setReady(true);
            } else {
                setExpired(true);
            }
        }, 2500);

        return () => {
            subscription.unsubscribe();
            window.clearTimeout(timeout);
        };
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setSuccess(true);
            window.setTimeout(() => router.replace("/assistant"), 1500);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to update password.",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-dvh bg-gray-50/80 flex items-start justify-center px-6 pt-32 md:pt-40 pb-10 relative">
            <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                <SiteLogo size="lg" asLink />
            </div>
            <div className="w-full max-w-md">
                <div className={authGlassCardClassName}>
                    <h2 className="text-left text-2xl font-medium font-serif text-gray-950 mb-6">
                        Set a new password
                    </h2>

                    {expired && !ready ? (
                        <p className="text-sm text-gray-600">
                            This password reset link is invalid or has
                            expired. Request a new one from the{" "}
                            <a href="/login" className="underline">
                                login page
                            </a>
                            .
                        </p>
                    ) : success ? (
                        <p className="text-sm text-gray-600">
                            Password updated — redirecting you in…
                        </p>
                    ) : !ready ? (
                        <p className="text-sm text-gray-500">
                            Verifying your link…
                        </p>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium text-gray-700 mb-2"
                                >
                                    New password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    placeholder="At least 8 characters"
                                    required
                                    className={`w-full ${authInputClassName}`}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="confirmPassword"
                                    className="block text-sm font-medium text-gray-700 mb-2"
                                >
                                    Confirm new password
                                </label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) =>
                                        setConfirmPassword(e.target.value)
                                    }
                                    placeholder="Re-enter your password"
                                    required
                                    className={`w-full ${authInputClassName}`}
                                />
                            </div>

                            {error && (
                                <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full mt-5 bg-black hover:bg-gray-900 text-white"
                            >
                                {loading ? "Saving..." : "Set new password"}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
