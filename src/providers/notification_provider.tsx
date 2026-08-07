/**
 * Céluma 1.3, Phase 3, Block C — the single owner of Notification Center state.
 *
 * There is exactly one of these, mounted in main.tsx above <Routes>. The bell,
 * the popover and the history page all *consume* it; none of them starts its
 * own interval. This is the structural rule from the Block A UX proposal §14 and
 * the master spec's "polling overload" risk, and notification_provider.test.tsx
 * is what keeps it true.
 *
 * Why above <Routes> and not inside SidebarCeluma: every page renders its own
 * <SidebarCeluma>, so it unmounts and remounts on each navigation. State living
 * there would restart the poll — and lose the unread count — on every page
 * change.
 *
 * What is polled: **only** GET /notifications/unread-count, a single indexed
 * COUNT(*). The list endpoint is fetched on demand (surface opened, manual
 * refresh, after a mark-all) and never on the interval.
 *
 * The context, the consumer hook and the interval constants live in
 * notification_context.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
    getUnreadNotificationCount,
    isNotificationApiError,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "../services/notification_service";
import { isUnread, type NotificationListItem, type NotificationReadAllFilters } from "../models/notification";
import { getStoredToken } from "../lib/auth_session";
import {
    NotificationContext,
    POLL_INTERVAL_MS,
    RECENT_NOTIFICATION_LIMIT,
    type NotificationState,
} from "./notification_context";

function isSessionExpired(err: unknown): boolean {
    return err instanceof Error && err.message === "Session expired";
}

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error("Ocurrió un error inesperado.");
}

export function NotificationProvider({ children }: { children: ReactNode }) {
    /**
     * Authentication gate: the presence of a stored session token.
     *
     * Deliberately **not** `useUserProfile()`. That hook fetches `/auth/me`
     * exactly once, in a `[]`-dependency effect. This provider sits above
     * <Routes> and therefore never remounts, so a user who logs in from within
     * the app would be stuck with the "unauthenticated" answer this provider's
     * hook instance resolved to on the login screen — the badge would read zero
     * for the whole session until a hard reload. (Found in Block C local
     * validation, not in review.)
     *
     * Token presence is also a *stricter* gate than the one the brief asks for:
     * it is resolved synchronously, so there is no window in which an
     * unauthenticated request could fire at all. A token that turns out to be
     * invalid answers 401, which apiFetch already turns into the central
     * session-expiry redirect.
     *
     * `location.key` is what re-evaluates it: login stores the token and then
     * navigates, and logout clears it and navigates to /login, so every
     * transition in and out of an authenticated session is a route change.
     */
    const location = useLocation();
    const [tokenPresent, setTokenPresent] = useState(() => Boolean(getStoredToken()));

    useEffect(() => {
        setTokenPresent(Boolean(getStoredToken()));
    }, [location.key, location.pathname]);

    // Cross-tab logout: `storage` fires in the *other* tabs when one clears the
    // token, and those tabs may never navigate.
    useEffect(() => {
        const onStorage = () => setTokenPresent(Boolean(getStoredToken()));
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const authenticated = tokenPresent;

    const [unreadCount, setUnreadCount] = useState(0);
    const [recentItems, setRecentItems] = useState<NotificationListItem[]>([]);
    const [countLoading, setCountLoading] = useState(false);
    const [listLoading, setListLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [countStale, setCountStale] = useState(false);

    /** False after unmount — every async continuation checks it before setState. */
    const mountedRef = useRef(true);
    /** Guards overlapping requests: one count fetch, one list fetch, at a time. */
    const countInFlightRef = useRef(false);
    const listInFlightRef = useRef(false);
    /**
     * A synchronous mirror of `recentItems`.
     *
     * markRead needs to know whether a row was unread *before* it queues any
     * state update. Deriving that inside a `setRecentItems` updater does not
     * work: React runs each hook's update queue in hook-declaration order during
     * the re-render, so the `unreadCount` queue (declared first) would read the
     * flag before the `recentItems` queue had set it, and the badge would never
     * decrement.
     */
    const recentItemsRef = useRef<NotificationListItem[]>([]);

    useEffect(() => {
        recentItemsRef.current = recentItems;
    }, [recentItems]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const refreshUnreadCount = useCallback(async () => {
        if (countInFlightRef.current) return;
        countInFlightRef.current = true;
        setCountLoading(true);
        try {
            const { unread_count } = await getUnreadNotificationCount();
            if (!mountedRef.current) return;
            setUnreadCount(Math.max(0, unread_count));
            setCountStale(false);
        } catch (err) {
            if (!mountedRef.current) return;
            // Keep the last known count: replacing it with zero would tell the
            // user their inbox emptied when in fact the network hiccupped.
            // No toast either — a poll failing every 30s must not spam the app.
            if (!isSessionExpired(err)) setCountStale(true);
        } finally {
            countInFlightRef.current = false;
            if (mountedRef.current) setCountLoading(false);
        }
    }, []);

    const refreshRecentItems = useCallback(async () => {
        if (listInFlightRef.current) return;
        listInFlightRef.current = true;
        setListLoading(true);
        try {
            const { items } = await listNotifications({ limit: RECENT_NOTIFICATION_LIMIT });
            if (!mountedRef.current) return;
            setRecentItems(items);
            setError(null);
        } catch (err) {
            if (!mountedRef.current) return;
            if (!isSessionExpired(err)) setError(toError(err));
        } finally {
            listInFlightRef.current = false;
            if (mountedRef.current) setListLoading(false);
        }
    }, []);

    /**
     * Optimistic mark-read: decrement immediately (never below zero), flip the
     * local row, then reconcile with the server. On failure the previous state
     * is restored, the error is surfaced and the count is re-fetched; the caller
     * decides whether to navigate anyway.
     *
     * Rethrows so the calling surface can show its own message.
     *
     * `wasUnread` may be passed by a surface holding rows this provider has not
     * loaded (the history page); omitted, it is derived from `recentItems`.
     */
    const markRead = useCallback(
        async (recipientId: string, wasUnreadHint?: boolean) => {
            const wasUnread =
                wasUnreadHint ??
                recentItemsRef.current.some(
                    (item) => item.recipient_id === recipientId && isUnread(item),
                );

            setRecentItems((prev) =>
                prev.map((item) =>
                    item.recipient_id === recipientId
                        ? { ...item, status: "READ", read_at: item.read_at ?? new Date().toISOString() }
                        : item,
                ),
            );
            if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));

            try {
                await markNotificationRead(recipientId);
                if (mountedRef.current) setError(null);
            } catch (err) {
                if (isSessionExpired(err)) throw err;

                if (mountedRef.current) {
                    // A 404 means the row is genuinely gone server-side, so the
                    // optimistic state was right about the outcome even though
                    // the call failed. Anything else is rolled back.
                    const gone = isNotificationApiError(err) && err.status === 404;
                    if (!gone && wasUnread) {
                        setRecentItems((prev) =>
                            prev.map((item) =>
                                item.recipient_id === recipientId
                                    ? { ...item, status: "UNREAD", read_at: null }
                                    : item,
                            ),
                        );
                        setUnreadCount((prev) => prev + 1);
                    }
                    setError(toError(err));
                }
                // Re-sync from the server either way.
                void refreshUnreadCount();
                throw err;
            }
        },
        [refreshUnreadCount],
    );

    /**
     * Mark-all, honouring whatever filters the caller passes. The count is
     * reconciled from the endpoint afterwards rather than derived locally — the
     * filtered set can include rows this provider never loaded.
     */
    const markAllRead = useCallback(
        async (filters: NotificationReadAllFilters = {}) => {
            try {
                const { updated_count } = await markAllNotificationsRead(filters);
                if (mountedRef.current) {
                    setRecentItems((prev) =>
                        prev.map((item) =>
                            isUnread(item)
                                ? { ...item, status: "READ", read_at: new Date().toISOString() }
                                : item,
                        ),
                    );
                    setError(null);
                }
                await refreshUnreadCount();
                return updated_count;
            } catch (err) {
                if (isSessionExpired(err)) throw err;
                if (mountedRef.current) setError(toError(err));
                void refreshUnreadCount();
                throw err;
            }
        },
        [refreshUnreadCount],
    );

    /**
     * The one polling loop.
     *
     * Starts only once a session token exists, so a page load never fires an
     * unauthenticated request. Pauses whenever the document is hidden and
     * refreshes immediately on becoming visible again. Tears down the interval
     * and the listener on unmount, and on logout: authStatus leaving
     * "authenticated" re-runs this effect, whose cleanup clears both.
     */
    useEffect(() => {
        if (!authenticated) {
            // Logged out: drop any state from the previous session so a
            // re-login never briefly shows the old badge.
            setUnreadCount(0);
            setRecentItems([]);
            setCountStale(false);
            setError(null);
            return;
        }

        let intervalId: ReturnType<typeof setInterval> | null = null;

        const isVisible = () =>
            typeof document === "undefined" || document.visibilityState === "visible";

        const tick = () => {
            if (!isVisible()) return;
            void refreshUnreadCount();
        };

        const startInterval = () => {
            if (intervalId !== null) return;
            intervalId = setInterval(tick, POLL_INTERVAL_MS);
        };

        const stopInterval = () => {
            if (intervalId === null) return;
            clearInterval(intervalId);
            intervalId = null;
        };

        const handleVisibilityChange = () => {
            if (isVisible()) {
                // Immediate catch-up, then resume the cadence.
                void refreshUnreadCount();
                startInterval();
            } else {
                stopInterval();
            }
        };

        if (isVisible()) {
            void refreshUnreadCount();
            startInterval();
        }

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            stopInterval();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [authenticated, refreshUnreadCount]);

    const value = useMemo<NotificationState>(
        () => ({
            unreadCount,
            recentItems,
            countLoading,
            listLoading,
            error,
            countStale,
            refreshUnreadCount,
            refreshRecentItems,
            markRead,
            markAllRead,
        }),
        [
            unreadCount,
            recentItems,
            countLoading,
            listLoading,
            error,
            countStale,
            refreshUnreadCount,
            refreshRecentItems,
            markRead,
            markAllRead,
        ],
    );

    return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
