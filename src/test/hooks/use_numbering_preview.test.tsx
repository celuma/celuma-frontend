/**
 * Céluma 1.5 (#64): the numbering preview hook never lets a stale answer replace the answer for the current
 * inputs, keeps the last good preview (marked stale) when a request fails, and retries on demand.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useNumberingPreview } from "../../hooks/use_numbering_preview";
import type { NumberingPreviewRequest } from "../../models/numbering";

const answer = (code: string) => ({
    entity_kind: "order", valid: true, errors: [], format: "f", sequence_min_width: 2, scheme: "monthly", timezone: "UTC",
    period_year: 2026, period_month: 11, base_code: "CU", examples: [], estimate: { sequence: 1, code, reserved: false, skipped_occupied: 0 }, notice: "n",
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("useNumberingPreview", () => {
    it("a slow answer for older inputs never replaces the answer for the current ones", async () => {
        const pending: Record<string, (r: Response) => void> = {};
        vi.stubGlobal("fetch", vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
            pending[JSON.parse(String(init?.body)).format] = resolve;
        })));
        const { result, rerender } = renderHook(({ req }: { req: NumberingPreviewRequest }) => useNumberingPreview(req), {
            initialProps: { req: { entity_kind: "order", format: "OLD" } as NumberingPreviewRequest },
        });
        await waitFor(() => expect(pending.OLD).toBeDefined(), { timeout: 2000 });
        rerender({ req: { entity_kind: "order", format: "NEW" } });
        await waitFor(() => expect(pending.NEW).toBeDefined(), { timeout: 2000 });
        await act(async () => { pending.NEW(new Response(JSON.stringify(answer("NEW1")), { status: 200 })); });
        await waitFor(() => expect(result.current.preview?.estimate?.code).toBe("NEW1"));
        await act(async () => { pending.OLD(new Response(JSON.stringify(answer("OLD1")), { status: 200 })); });
        expect(result.current.preview?.estimate?.code).toBe("NEW1");
        expect(result.current.stale).toBe(false);
    });

    it("a failure keeps the last good preview as stale and a retry recovers", async () => {
        let fail = false;
        vi.stubGlobal("fetch", vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
            if (fail) return new Response("{\"detail\":\"caído\"}", { status: 500 });
            return new Response(JSON.stringify(answer(JSON.parse(String(init?.body)).format)), { status: 200 });
        }));
        const { result, rerender } = renderHook(({ req }: { req: NumberingPreviewRequest | null }) => useNumberingPreview(req), {
            initialProps: { req: { entity_kind: "order", format: "A" } as NumberingPreviewRequest | null },
        });
        await waitFor(() => expect(result.current.preview?.estimate?.code).toBe("A"), { timeout: 2000 });
        fail = true;
        rerender({ req: { entity_kind: "order", format: "B" } });
        await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 2000 });
        expect(result.current.preview?.estimate?.code).toBe("A");
        expect(result.current.stale).toBe(true);
        fail = false;
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.preview?.estimate?.code).toBe("B"), { timeout: 2000 });
        expect(result.current.error).toBeNull();
        rerender({ req: null });
        expect(result.current.preview).toBeNull();
    });
});
