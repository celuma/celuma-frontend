/**
 * Céluma 1.3, Phase 3, Block C — the Notification Center context, its consumer
 * hook, and the polling constants.
 *
 * Split out of notification_provider.tsx so the provider file exports nothing
 * but a component (the eslint react-refresh rule), and so a consumer can import
 * the hook without pulling in the provider's effects.
 */
import { createContext, useContext } from "react";
import type { NotificationListItem, NotificationReadAllFilters } from "../models/notification";

/**
 * Poll interval, in milliseconds.
 *
 * 30 s by default. Configurable through a non-secret Vite variable
 * (`VITE_NOTIFICATION_POLL_INTERVAL_MS`) so a local session can slow it down
 * without a code change, and clamped to a 15 s floor: the API's global limiter
 * allows 100 requests / 60 s per client IP, and nothing about an unread count
 * justifies going faster. One tab at 30 s spends 2 of those 100 requests.
 */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;
export const MIN_POLL_INTERVAL_MS = 15_000;

export function resolvePollIntervalMs(raw: string | undefined): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POLL_INTERVAL_MS;
    return Math.max(MIN_POLL_INTERVAL_MS, Math.round(parsed));
}

export const POLL_INTERVAL_MS = resolvePollIntervalMs(
    import.meta.env.VITE_NOTIFICATION_POLL_INTERVAL_MS as string | undefined,
);

/** How many items the compact surface (the bell popover/drawer) shows. */
export const RECENT_NOTIFICATION_LIMIT = 10;

export interface NotificationState {
    unreadCount: number;
    recentItems: NotificationListItem[];
    countLoading: boolean;
    listLoading: boolean;
    /** Last recent-items / mark-action failure. Count-poll failures do not set it. */
    error: Error | null;
    /** True once a count poll has failed and no later one has succeeded. */
    countStale: boolean;

    refreshUnreadCount(): Promise<void>;
    refreshRecentItems(): Promise<void>;
    /**
     * Marks one inbox row read, decrementing the badge optimistically.
     *
     * `wasUnread` tells the provider whether this row was counted in the badge.
     * Omit it and the provider derives it from its own `recentItems` — correct
     * for the popover, but **the history page must pass it explicitly**: that
     * page holds a filtered, paginated list the provider has never loaded, and a
     * derived answer there would be a silent `false` that leaves the badge
     * stuck.
     */
    markRead(recipientId: string, wasUnread?: boolean): Promise<void>;
    markAllRead(filters?: NotificationReadAllFilters): Promise<number>;
}

/**
 * What a consumer sees with no provider above it: zero count, empty list, no-op
 * actions, no network.
 *
 * A throwing useContext would make this feature a cross-cutting dependency for
 * the ~25 existing page tests that render SidebarCeluma standalone — pages that
 * have nothing to do with notifications. An inert default keeps the blast radius
 * at zero, and notification_provider.test.tsx separately proves that a real
 * provider does supply real state.
 */
export const INERT_NOTIFICATION_STATE: NotificationState = {
    unreadCount: 0,
    recentItems: [],
    countLoading: false,
    listLoading: false,
    error: null,
    countStale: false,
    refreshUnreadCount: async () => {},
    refreshRecentItems: async () => {},
    markRead: async () => {},
    markAllRead: async () => 0,
};

export const NotificationContext = createContext<NotificationState>(INERT_NOTIFICATION_STATE);

/** Read the Notification Center state. Safe outside a provider (inert). */
export function useNotifications(): NotificationState {
    return useContext(NotificationContext);
}
