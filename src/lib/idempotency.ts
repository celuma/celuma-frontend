/**
 * Client side of the creation idempotency contract (Céluma 1.4, issue #8; ADR 0014).
 *
 * The three creation routes REQUIRE an `Idempotency-Key` header. One key per
 * LOGICAL submission:
 *   - a retry of the same payload (timeout, network error, 5xx, lost response)
 *     reuses the key, so a response lost AFTER the server committed is replayed
 *     instead of creating a second record;
 *   - a changed payload, or a submission that succeeded, gets a new key
 *     (the server answers 409 if a key is reused with a different payload).
 */

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function newIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    // Fallback for very old runtimes: not cryptographic, still unique enough for a per-submission key.
    return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Tracks the key of the submission in progress. `keyFor(payload)` returns the
 * same key while the payload is unchanged and nothing succeeded; `succeeded()`
 * ends the logical submission.
 */
export function createIdempotencySession() {
    let key: string | null = null;
    let lastPayload: string | null = null;
    return {
        keyFor(payload: unknown): string {
            const serialized = JSON.stringify(payload);
            if (key === null || serialized !== lastPayload) {
                key = newIdempotencyKey();
                lastPayload = serialized;
            }
            return key;
        },
        succeeded(): void {
            key = null;
            lastPayload = null;
        },
    };
}
