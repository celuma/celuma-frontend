/**
 * Céluma 1.3, Phase 3, Block D — the Profile preferences section's state.
 *
 * **One-shot, not a poller.** This hook fetches once when the section mounts
 * and again only when the user asks. It starts no interval, registers no
 * `visibilitychange` listener, and never touches the unread count.
 * `NotificationProvider` remains the application's single polling owner and
 * its single source of inbox state; nothing here reads or writes it.
 *
 * **Explicit save, not save-per-switch.** Toggling a switch changes local
 * state only; a `PUT` happens when the user presses Guardar. Three reasons,
 * in order of weight:
 *
 *   1. A user reviewing every switch would otherwise fire one write per
 *      toggle — a burst that grows with the number of notification types,
 *      against a 100-request/60s budget shared with the rest of the app.
 *   2. The backend applies a batch atomically, so an explicit save is one
 *      all-or-nothing decision rather than a sequence that can half-apply.
 *   3. A user can change their mind before committing — which is what
 *      `reset()` is for, and what a per-switch write would make impossible.
 *
 * After a successful save, local state is **replaced** by the server's
 * effective list rather than merged with the optimistic guess. That is what
 * makes the screen agree with the server about the things a client cannot
 * predict: a value that matched the default and therefore stored no row, and
 * a type whose policy bounds it regardless of what was sent.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationType } from "../models/notification";
import type {
    NotificationPreferenceItem,
    NotificationPreferenceUpdateItem,
} from "../models/notification_preference";
import {
    getNotificationPreferences,
    updateNotificationPreferences,
} from "../services/notification_preference_service";
import { getStoredToken } from "../lib/auth_session";

export interface NotificationPreferencesState {
    /** Every type, in the backend's order, with the user's local edits applied. */
    preferences: NotificationPreferenceItem[];
    loading: boolean;
    saving: boolean;
    /** True when local edits differ from the last list the backend returned. */
    dirty: boolean;
    error: Error | null;

    setEmailEnabled(type: NotificationType, enabled: boolean): void;
    save(): Promise<void>;
    reload(): Promise<void>;
    /** Restores the last **backend-loaded** values — not the global defaults. */
    reset(): void;
}

function isSessionExpired(err: unknown): boolean {
    return err instanceof Error && err.message === "Session expired";
}

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error("Ocurrió un error inesperado.");
}

/** Only `email_enabled` can differ: nothing else in a row is user-editable. */
function diff(
    server: NotificationPreferenceItem[],
    local: NotificationPreferenceItem[],
): NotificationPreferenceUpdateItem[] {
    const byType = new Map(server.map((item) => [item.notification_type, item]));
    return local
        .filter((item) => byType.get(item.notification_type)?.email_enabled !== item.email_enabled)
        .map((item) => ({
            notification_type: item.notification_type,
            email_enabled: item.email_enabled,
        }));
}

export function useNotificationPreferences(): NotificationPreferencesState {
    /**
     * Two copies of the same list: what the backend last returned, and what
     * the user is currently looking at. `dirty` and the save payload are both
     * derived from the pair, so neither can drift out of sync with a
     * separately-maintained flag.
     */
    const [serverPreferences, setServerPreferences] = useState<NotificationPreferenceItem[]>([]);
    const [preferences, setPreferences] = useState<NotificationPreferenceItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    /** False after unmount — every async continuation checks it before setState. */
    const mountedRef = useRef(true);
    /** Guards a second load while one is in flight (StrictMode double-invokes effects). */
    const loadInFlightRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const load = useCallback(async () => {
        // No token means no session: the Profile page redirects to /login on
        // its own, and firing an unauthenticated request here would only add
        // a 401 the user never sees the consequence of.
        if (!getStoredToken()) return;
        if (loadInFlightRef.current) return;

        loadInFlightRef.current = true;
        setLoading(true);
        try {
            const { preferences: loaded } = await getNotificationPreferences();
            if (!mountedRef.current) return;
            setServerPreferences(loaded);
            setPreferences(loaded);
            setError(null);
        } catch (err) {
            if (!mountedRef.current) return;
            // apiFetch already redirected; a toast on top of it is noise.
            if (!isSessionExpired(err)) setError(toError(err));
        } finally {
            loadInFlightRef.current = false;
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // Once, on mount. `load` has no dependencies, so this cannot re-run and
    // become an accidental poll.
    useEffect(() => {
        void load();
    }, [load]);

    const setEmailEnabled = useCallback((type: NotificationType, enabled: boolean) => {
        setPreferences((previous) =>
            previous.map((item) =>
                item.notification_type === type
                    ? {
                          ...item,
                          // A type the backend says cannot use email is never
                          // changed locally either, so the client can never
                          // build a request the API would reject.
                          email_enabled: item.email_supported ? enabled : item.email_enabled,
                      }
                    : item,
            ),
        );
    }, []);

    const save = useCallback(async () => {
        const changes = diff(serverPreferences, preferences);
        if (changes.length === 0) return;

        setSaving(true);
        try {
            const { preferences: effective } = await updateNotificationPreferences({
                preferences: changes,
            });
            if (!mountedRef.current) return;
            // Replace, do not merge: the server knows which rows it deleted
            // for matching the default and which values policy bounded.
            setServerPreferences(effective);
            setPreferences(effective);
            setError(null);
        } catch (err) {
            if (isSessionExpired(err)) throw err;
            if (mountedRef.current) setError(toError(err));
            // Local edits are deliberately **kept**. The save is atomic
            // server-side, so nothing was applied — discarding the user's
            // work would lose it for no reason, and leave the screen showing
            // values they did not choose.
            throw err;
        } finally {
            if (mountedRef.current) setSaving(false);
        }
    }, [preferences, serverPreferences]);

    const reset = useCallback(() => {
        setPreferences(serverPreferences);
        setError(null);
    }, [serverPreferences]);

    return {
        preferences,
        loading,
        saving,
        dirty: diff(serverPreferences, preferences).length > 0,
        error,
        setEmailEnabled,
        save,
        reload: load,
        reset,
    };
}
