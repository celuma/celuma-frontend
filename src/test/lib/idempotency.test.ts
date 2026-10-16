import { describe, expect, it } from "vitest";
import { createIdempotencySession, newIdempotencyKey } from "../../lib/idempotency";

describe("idempotency key lifecycle", () => {
    it("generates distinct, header-safe keys", () => {
        const a = newIdempotencyKey();
        expect(a).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
        expect(newIdempotencyKey()).not.toBe(a);
    });

    it("keeps the key for an unchanged payload (retry after timeout) and renews it when the payload changes", () => {
        const s = createIdempotencySession();
        const first = s.keyFor({ a: 1 });
        expect(s.keyFor({ a: 1 })).toBe(first);
        expect(s.keyFor({ a: 1 })).toBe(first);
        const second = s.keyFor({ a: 2 });
        expect(second).not.toBe(first);
        expect(s.keyFor({ a: 2 })).toBe(second);
    });

    it("a success ends the logical submission: the next one gets a new key even with the same payload", () => {
        const s = createIdempotencySession();
        const first = s.keyFor({ a: 1 });
        s.succeeded();
        expect(s.keyFor({ a: 1 })).not.toBe(first);
    });
});
