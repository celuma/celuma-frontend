/**
 * State of one order conversation (Céluma 1.5, #88/#96).
 *
 * - Loads the LATEST page and pages backwards on request; a reload therefore always shows
 *   the newest messages (#88).
 * - Every send gets its own `Idempotency-Key`, kept with the pending message: "Reintentar"
 *   re-sends the same payload with the same key, so a send whose response was lost is
 *   stored once (the server replays it). Editing is offered only after a definitive refusal,
 *   when nothing was stored.
 * - Pending messages keep their text and images until they are confirmed or discarded.
 * - Refreshes every 30 s while visible, merging by id (no duplicates, no reordering).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ConversationSendError,
    listConversation,
    sendConversationMessage,
    type ConversationMessage,
    type OutgoingMessage,
} from "../services/conversation_service";
import { newIdempotencyKey } from "../lib/idempotency";
import { getErrorMessage } from "../lib/api_error";

export const CONVERSATION_POLL_MS = 30_000;

export type LoadState = "loading" | "ready" | "error";

export type PendingMessage = {
    localId: string;
    key: string;
    payload: OutgoingMessage;
    createdAt: string;
    status: "sending" | "failed" | "rejected";
    error?: string;
};

function byTime(a: ConversationMessage, b: ConversationMessage): number {
    return a.created_at === b.created_at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.created_at < b.created_at ? -1 : 1;
}

export function mergeMessages(current: ConversationMessage[], incoming: ConversationMessage[]): ConversationMessage[] {
    const byId = new Map(current.map((m) => [m.id, m]));
    for (const m of incoming) byId.set(m.id, m);
    return [...byId.values()].sort(byTime);
}

export function useOrderConversation(orderId: string | undefined, active: boolean, onSent?: () => void) {
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [olderCursor, setOlderCursor] = useState<string | null>(null);
    const [hasOlder, setHasOlder] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [olderError, setOlderError] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingMessage[]>([]);
    const controllers = useRef(new Map<string, AbortController>());
    const loadedOnce = useRef(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        const inFlight = controllers.current;
        return () => {
            mounted.current = false;
            inFlight.forEach((c) => c.abort());
        };
    }, []);

    const refresh = useCallback(async (silent: boolean) => {
        if (!orderId) return;
        if (!silent) setLoadState("loading");
        try {
            const page = await listConversation(orderId);
            if (!mounted.current) return;
            setMessages((prev) => mergeMessages(loadedOnce.current ? prev : [], page.items));
            if (!loadedOnce.current) {
                setHasOlder(page.page_info.has_more);
                setOlderCursor(page.page_info.next_before ?? null);
            }
            loadedOnce.current = true;
            setLoadError(null);
            setLoadState("ready");
        } catch (err) {
            if (!mounted.current) return;
            // A failed background refresh keeps what is on screen; only a failed first load
            // (nothing to show) becomes the error state.
            if (!loadedOnce.current) {
                setLoadError(getErrorMessage(err, "No se pudo cargar la conversación."));
                setLoadState("error");
            }
        }
    }, [orderId]);

    // First load when the tab becomes active; reset when the order changes.
    useEffect(() => {
        loadedOnce.current = false;
        setMessages([]);
        setPending([]);
        setHasOlder(false);
        setOlderCursor(null);
        setLoadState("loading");
    }, [orderId]);

    useEffect(() => {
        if (active && orderId && !loadedOnce.current) void refresh(false);
    }, [active, orderId, refresh]);

    useEffect(() => {
        if (!active || !orderId) return;
        const tick = () => {
            if (document.visibilityState === "visible" && loadedOnce.current) void refresh(true);
        };
        const interval = window.setInterval(tick, CONVERSATION_POLL_MS);
        document.addEventListener("visibilitychange", tick);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [active, orderId, refresh]);

    const loadOlder = useCallback(async () => {
        if (!orderId || !olderCursor || loadingOlder) return;
        setLoadingOlder(true);
        setOlderError(null);
        try {
            const page = await listConversation(orderId, { before: olderCursor });
            if (!mounted.current) return;
            setMessages((prev) => mergeMessages(prev, page.items));
            setHasOlder(page.page_info.has_more);
            setOlderCursor(page.page_info.next_before ?? null);
        } catch (err) {
            if (mounted.current) setOlderError(getErrorMessage(err, "No se pudieron cargar los mensajes anteriores."));
        } finally {
            if (mounted.current) setLoadingOlder(false);
        }
    }, [orderId, olderCursor, loadingOlder]);

    const deliver = useCallback(async (item: PendingMessage) => {
        if (!orderId) return;
        const controller = new AbortController();
        controllers.current.set(item.localId, controller);
        setPending((prev) => prev.map((p) => (p.localId === item.localId ? { ...p, status: "sending", error: undefined } : p)));
        try {
            const { message } = await sendConversationMessage(orderId, item.payload, item.key, controller.signal);
            if (!mounted.current) return;
            setMessages((prev) => mergeMessages(prev, [message]));
            setPending((prev) => prev.filter((p) => p.localId !== item.localId));
            onSent?.();
        } catch (err) {
            if (!mounted.current) return;
            const definitive = err instanceof ConversationSendError && err.definitive;
            const error = getErrorMessage(err, "No se pudo enviar el mensaje.");
            setPending((prev) => prev.map((p) => (
                p.localId === item.localId ? { ...p, status: definitive ? "rejected" : "failed", error } : p
            )));
        } finally {
            controllers.current.delete(item.localId);
        }
    }, [orderId, onSent]);

    const send = useCallback((payload: OutgoingMessage) => {
        const item: PendingMessage = {
            localId: newIdempotencyKey(),
            key: newIdempotencyKey(),
            payload,
            createdAt: new Date().toISOString(),
            status: "sending",
        };
        setPending((prev) => [...prev, item]);
        void deliver(item);
    }, [deliver]);

    /** Same payload, same key: safe after an unknown outcome. */
    const retry = useCallback((localId: string) => {
        const item = pending.find((p) => p.localId === localId);
        if (item && item.status !== "sending") void deliver(item);
    }, [pending, deliver]);

    const cancel = useCallback((localId: string) => {
        controllers.current.get(localId)?.abort();
    }, []);

    /** Removes a pending message and returns its content (to put back in the composer). */
    const discard = useCallback((localId: string): OutgoingMessage | null => {
        const item = pending.find((p) => p.localId === localId);
        controllers.current.get(localId)?.abort();
        setPending((prev) => prev.filter((p) => p.localId !== localId));
        return item ? item.payload : null;
    }, [pending]);

    const sending = useMemo(() => pending.some((p) => p.status === "sending"), [pending]);

    return {
        messages, pending, loadState, loadError, hasOlder, loadingOlder, olderError, sending,
        reload: () => refresh(false), loadOlder, send, retry, cancel, discard,
    };
}
