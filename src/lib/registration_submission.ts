/**
 * Registering an order (or a sample) without retyping after a failure (Céluma 1.5, #67).
 *
 * Contract: ADR 0014 Amendment 1 and `celuma-engineering/specs/laboratory/order-sample-management.md`
 * ("Correcting and retrying a registration"). It reuses the creation idempotency of Céluma 1.4
 * (`Idempotency-Key`, durable receipts); nothing new is stored on the server.
 *
 * One key per registration FORM, kept across corrections until a success:
 *
 *  - **Refused** (a 4xx other than the ones below): nothing was saved and no receipt exists,
 *    so the corrected payload is sent with the same key. The form keeps every value and marks
 *    the fields the API names.
 *  - **Unknown** (no response: network error, timeout; or 5xx/408/429): the order may or may
 *    not have been saved. The payload is remembered. Retrying the SAME payload with the same
 *    key is answered by the original order if it was saved (a replay), or creates it once.
 *  - A **corrected** payload after an unknown outcome uses the same key too. If the earlier
 *    attempt had been saved, the API answers 409 `idempotency_key_reused`; the helper then
 *    re-sends each remembered payload with that key, newest first, and the one that was saved
 *    replays the existing order (`recovered`). No second order is ever created.
 *  - **Gone** (410): what an earlier attempt created was removed since; the key is retired.
 *  - **Created**: the submission ends; a later registration gets a new key.
 */
import { IDEMPOTENCY_HEADER, newIdempotencyKey } from "./idempotency";

/** What `send` resolves to: an HTTP answer. A request that got no answer must REJECT. */
export interface HttpAnswer {
    status: number;
    headers: Headers;
    body: unknown;
}

export type Send = (payload: unknown, headers: Record<string, string>) => Promise<HttpAnswer>;

export type SubmissionOutcome<T, M> =
    | {
        kind: "created";
        result: T;
        /** The API answered from an earlier attempt's receipt (a retry after a lost response). */
        replayed: boolean;
        /** Set when a CORRECTED payload was refused because an earlier attempt had been saved:
         *  that earlier attempt's metadata (what the form showed then). */
        recovered: M | null;
        /** Metadata of the attempt whose order this is. */
        meta: M;
    }
    | { kind: "refused"; status: number; body: unknown }
    | { kind: "unknown"; status: number | null }
    | { kind: "gone" };

const AMBIGUOUS_STATUSES = new Set([408, 429]);

function detailCode(body: unknown): string | undefined {
    const detail = (body as { detail?: unknown } | null)?.detail;
    return detail && typeof detail === "object" && !Array.isArray(detail)
        ? (detail as { code?: string }).code
        : undefined;
}

export function createRegistrationSubmission<T, M = undefined>() {
    let key: string | null = null;
    /** Payloads whose outcome is unknown, oldest first, with what the form showed for them. */
    let pending: Array<{ serialized: string; payload: unknown; meta: M }> = [];
    let inFlight = false;

    const reset = () => {
        key = null;
        pending = [];
    };

    async function attempt(send: Send, payload: unknown, k: string): Promise<HttpAnswer | null> {
        try {
            return await send(payload, { [IDEMPOTENCY_HEADER]: k });
        } catch {
            return null; // no answer: outcome unknown
        }
    }

    const isAmbiguous = (answer: HttpAnswer | null) =>
        answer === null || answer.status >= 500 || AMBIGUOUS_STATUSES.has(answer.status);

    return {
        /** The key in use (tests and diagnostics). */
        get key(): string | null {
            return key;
        },
        /** Whether an earlier attempt's outcome is still unknown. */
        get outcomeUnknown(): boolean {
            return pending.length > 0;
        },
        async submit(payload: unknown, send: Send, meta: M): Promise<SubmissionOutcome<T, M>> {
            if (inFlight) throw new Error("A registration is already being sent.");
            inFlight = true;
            try {
                key ??= newIdempotencyKey();
                const serialized = JSON.stringify(payload);
                const answer = await attempt(send, payload, key);

                if (isAmbiguous(answer)) {
                    if (!pending.some((p) => p.serialized === serialized)) pending.push({ serialized, payload, meta });
                    return { kind: "unknown", status: answer?.status ?? null };
                }
                const ok = answer as HttpAnswer;
                if (ok.status >= 200 && ok.status < 300) {
                    // A replay of an earlier, unanswered attempt: report what the form showed THEN.
                    const earlier = pending.find((p) => p.serialized === serialized);
                    reset();
                    return {
                        kind: "created", result: ok.body as T, replayed: ok.headers.get("Idempotent-Replayed") === "true",
                        recovered: null, meta: earlier?.meta ?? meta,
                    };
                }
                if (ok.status === 410) {
                    reset();
                    return { kind: "gone" };
                }
                if (ok.status === 409 && detailCode(ok.body) === "idempotency_key_reused") {
                    // An earlier attempt with this key was saved: find which, newest first, and show it.
                    for (const earlier of [...pending].reverse()) {
                        if (earlier.serialized === serialized) continue;
                        const replay = await attempt(send, earlier.payload, key);
                        if (isAmbiguous(replay)) return { kind: "unknown", status: replay?.status ?? null };
                        const r = replay as HttpAnswer;
                        if (r.status >= 200 && r.status < 300) {
                            reset();
                            return { kind: "created", result: r.body as T, replayed: true, recovered: earlier.meta, meta: earlier.meta };
                        }
                        if (r.status === 410) {
                            reset();
                            return { kind: "gone" };
                        }
                    }
                    // Not one of ours (should not happen): retire the key so the next attempt can proceed.
                    reset();
                    return { kind: "refused", status: ok.status, body: ok.body };
                }
                return { kind: "refused", status: ok.status, body: ok.body };
            } finally {
                inFlight = false;
            }
        },
    };
}

/**
 * The real POST: resolves with any HTTP answer, rejects only when there is none
 * (network error, CORS, aborted, or an unreadable body).
 */
export function postForAnswer(url: string, token: string | null): Send {
    return async (payload, headers) => {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                accept: "application/json",
                ...(token ? { Authorization: token } : {}),
                ...headers,
            },
            body: JSON.stringify(payload),
            credentials: "include",
        });
        const text = await res.text();
        let body: unknown = text;
        try {
            body = text ? JSON.parse(text) : undefined;
        } catch {
            // keep the text: error parsing handles both shapes
        }
        return { status: res.status, headers: res.headers ?? new Headers(), body };
    };
}
