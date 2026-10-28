/**
 * Céluma 1.4 (#29 follow-up): `useSettledValue` coalesces typing-rate changes
 * for derived work (the live report preview) without ever hiding the latest
 * value from the code that needs it.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_IDLE_MS, PREVIEW_MAX_WAIT_MS, previewDelays, useSettledValue } from "../../components/report/use_settled_value";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const render = (initial: { v: string; key?: unknown }, idle = 100, max = 500) =>
    renderHook(({ v, key }) => useSettledValue(v, idle, max, key), { initialProps: initial });

describe("useSettledValue", () => {
    it("starts settled on the first value", () => {
        const { result } = render({ v: "a" });
        expect(result.current).toMatchObject({ settled: "a", stale: false });
    });

    it("follows a change only after the idle period, and reports staleness meanwhile", () => {
        const { result, rerender } = render({ v: "a" });
        rerender({ v: "ab" });
        expect(result.current).toMatchObject({ settled: "a", stale: true });
        act(() => void vi.advanceTimersByTime(99));
        expect(result.current.settled).toBe("a");
        act(() => void vi.advanceTimersByTime(1));
        expect(result.current).toMatchObject({ settled: "ab", stale: false });
    });

    it("restarts the idle period on every keystroke", () => {
        const { result, rerender } = render({ v: "a" });
        for (const v of ["ab", "abc", "abcd"]) {
            rerender({ v });
            act(() => void vi.advanceTimersByTime(60));
        }
        expect(result.current.settled).toBe("a");
        act(() => void vi.advanceTimersByTime(40));
        expect(result.current.settled).toBe("abcd");
    });

    it("never lags more than the maximum wait during continuous typing", () => {
        const type = (hook: ReturnType<typeof render>) => {
            for (let i = 1; i <= 9; i += 1) {
                hook.rerender({ v: String(i) });
                act(() => void vi.advanceTimersByTime(60));
            }
        };
        // 540 ms of typing with 60 ms gaps: the idle timer (100 ms) never fires.
        const unbounded = render({ v: "0" }, 100, 10_000);
        type(unbounded);
        expect(unbounded.result.current.settled).toBe("0");
        // With a 500 ms maximum the preview catches up mid-burst.
        const bounded = render({ v: "0" }, 100, 500);
        type(bounded);
        expect(bounded.result.current.settled).toBe("9");
    });

    it("settles at once when the reset key changes (another report was loaded)", () => {
        const { result, rerender } = render({ v: "a", key: 1 });
        rerender({ v: "b", key: 2 });
        expect(result.current).toMatchObject({ settled: "b", stale: false });
    });

    it("flush applies the latest value synchronously and cancels pending timers", () => {
        const { result, rerender } = render({ v: "a" });
        rerender({ v: "typed just now" });
        let flushed = "";
        act(() => {
            flushed = result.current.flush();
        });
        expect(flushed).toBe("typed just now");
        expect(result.current).toMatchObject({ settled: "typed just now", stale: false });
        act(() => void vi.advanceTimersByTime(1000));
        expect(result.current.settled).toBe("typed just now");
    });

    it("clears its timers on unmount", () => {
        const { rerender, unmount } = render({ v: "a" });
        rerender({ v: "b" });
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("previewDelays", () => {
    it("keeps the base delays for a typical report and stretches them, boundedly, for very long text", () => {
        expect(previewDelays(0)).toEqual({ idleMs: PREVIEW_IDLE_MS, maxWaitMs: PREVIEW_MAX_WAIT_MS });
        expect(previewDelays(5_000)).toEqual({ idleMs: PREVIEW_IDLE_MS, maxWaitMs: PREVIEW_MAX_WAIT_MS });
        const long = previewDelays(83_000);
        expect(long.idleMs).toBeGreaterThan(PREVIEW_IDLE_MS);
        expect(long.idleMs).toBeLessThanOrEqual(500);
        expect(long.maxWaitMs).toBeGreaterThan(9_000);
        expect(previewDelays(10_000_000).maxWaitMs).toBeLessThanOrEqual(10_000);
    });
});
