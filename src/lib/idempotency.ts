/**
 * Client side of the creation idempotency contract (Céluma 1.4, issue #8; ADR 0014).
 *
 * The three creation routes REQUIRE an `Idempotency-Key` header. One key per
 * LOGICAL submission: a retry (timeout, network error, 5xx, lost response)
 * reuses the key, so a response lost AFTER the server committed is replayed
 * instead of creating a second record.
 *
 * Céluma 1.5 (#67, ADR 0014 Amendment 1): a registration form is one logical
 * submission until it succeeds, corrections included; the key lifecycle lives in
 * `registration_submission.ts`. (Before 1.5 a changed payload took a new key,
 * which let a correction made after a lost response create a second order.)
 */

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function newIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    // Fallback for very old runtimes: not cryptographic, still unique enough for a per-submission key.
    return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
