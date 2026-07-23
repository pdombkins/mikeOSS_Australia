"use client";

/**
 * C077 — soft-budget banner. Shown when the user has set a monthly budget
 * and this month's spend has reached 100% of it. Informational only —
 * Mike never blocks requests over budget. Dismissible per session.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { getUserUsage } from "@/app/lib/mikeApi";

export default function BudgetBanner() {
    const [message, setMessage] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const { budget } = await getUserUsage(1);
                if (cancelled || budget.ratio == null || budget.ratio < 1)
                    return;
                setMessage(
                    `You've reached your soft usage budget for ${budget.month} (A$${budget.spent_aud.toFixed(2)} of A$${budget.monthly_budget_aud?.toFixed(2)}). Nothing is blocked — this is a cost-awareness reminder.`,
                );
            } catch {
                /* banner is best-effort */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (!message || dismissed) return null;
    return (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <span className="flex-1">
                {message}{" "}
                <Link href="/account/usage" className="underline">
                    View usage
                </Link>
            </span>
            <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="text-amber-500 hover:text-amber-700"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
