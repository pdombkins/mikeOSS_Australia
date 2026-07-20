"use client";

import { useCallback, useEffect, useState } from "react";
import {
    getNotifications,
    markNotificationsRead,
    type AppNotification,
} from "@/app/lib/mikeApi";

const POLL_MS = 60_000;

export function useNotifications(enabled: boolean) {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const data = await getNotifications();
            setNotifications(data.notifications);
            setUnreadCount(data.unreadCount);
        } catch {
            /* transient — keep last state */
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        void refresh();
        const timer = setInterval(() => void refresh(), POLL_MS);
        return () => clearInterval(timer);
    }, [enabled, refresh]);

    const markRead = useCallback(
        async (ids?: string[]) => {
            try {
                await markNotificationsRead(ids);
            } finally {
                void refresh();
            }
        },
        [refresh],
    );

    return { notifications, unreadCount, refresh, markRead };
}
