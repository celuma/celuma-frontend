import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/** Quiet period after the last keystroke before the live report preview is recomposed. */
export const PREVIEW_IDLE_MS = 350;
/** Longest the preview may lag behind continuous typing. */
export const PREVIEW_MAX_WAIT_MS = 1500;

/**
 * Recomposing the preview costs time proportional to the document (measured
 * ≈ 1.2 s for 83 000 characters, ≈ 0.1 s for a typical report), and that cost
 * lands in the middle of typing when the maximum wait expires. Longer documents
 * therefore wait a little longer for a pause and are refreshed less often during
 * a burst; a typical report keeps the base values above.
 */
export function previewDelays(authoredChars: number): { idleMs: number; maxWaitMs: number } {
    const extra = Math.max(0, authoredChars - 5_000);
    return {
        idleMs: PREVIEW_IDLE_MS + Math.min(650, Math.round(extra / 100)),
        maxWaitMs: PREVIEW_MAX_WAIT_MS + Math.min(8_500, Math.round(extra / 8)),
    };
}

/**
 * Céluma 1.4 (#29 follow-up) — keeps expensive derived work off the typing path.
 *
 * `value` is always the latest authored state (the caller keeps using it for
 * inputs, save, submit and validation). `settled` follows it only after
 * `idleMs` without a change, and at the latest `maxWaitMs` after the first
 * unsettled change, so a long burst of typing still refreshes now and then.
 * A change of `resetKey` (e.g. another report or version was loaded) settles at
 * once — only typing is worth coalescing — and `flush()` makes `settled` equal
 * the latest value synchronously, for the actions that read what the derived
 * work produced (local print).
 */
export interface SettledValue<T> {
    settled: T;
    /** True while `settled` still lags behind `value`. */
    stale: boolean;
    /** Applies the latest value now and returns it. */
    flush: () => T;
}

export function useSettledValue<T>(value: T, idleMs: number, maxWaitMs: number, resetKey?: unknown): SettledValue<T> {
    const [settled, setSettled] = useState<T>(value);
    const latest = useRef(value);
    const lastResetKey = useRef(resetKey);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = useCallback(() => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        if (maxTimer.current) clearTimeout(maxTimer.current);
        idleTimer.current = null;
        maxTimer.current = null;
    }, []);

    useEffect(() => {
        latest.current = value;
        const commit = () => {
            clearTimers();
            setSettled(latest.current);
        };
        const reset = !Object.is(lastResetKey.current, resetKey);
        lastResetKey.current = resetKey;
        if (Object.is(value, settled)) {
            clearTimers();
            return;
        }
        if (reset) {
            commit();
            return;
        }
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(commit, idleMs);
        if (!maxTimer.current) maxTimer.current = setTimeout(commit, maxWaitMs);
    }, [value, settled, idleMs, maxWaitMs, resetKey, clearTimers]);

    useEffect(() => clearTimers, [clearTimers]);

    const flush = useCallback(() => {
        clearTimers();
        const next = latest.current;
        flushSync(() => setSettled(next));
        return next;
    }, [clearTimers]);

    return { settled, stale: !Object.is(value, settled), flush };
}
