import { describe, expect, it } from "vitest";
import { newIdempotencyKey } from "../../lib/idempotency";

// The key LIFECYCLE (one key per registration form until success, Céluma 1.5 #67) is
// tested in registration_submission.test.ts.
describe("idempotency keys", () => {
    it("generates distinct, header-safe keys", () => {
        const a = newIdempotencyKey();
        expect(a).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
        expect(newIdempotencyKey()).not.toBe(a);
    });
});
