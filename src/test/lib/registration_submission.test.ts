/**
 * Céluma 1.5 (#67) — retrying a registration without retyping, on the 1.4 idempotency contract.
 *
 * A tiny in-memory model of the server's receipts (ADR 0014: one receipt per key, written with
 * the work; same key + same payload = replay; same key + other payload = 409) drives the helper,
 * so these tests check the whole client protocol: refusals, lost requests, lost RESPONSES
 * (saved on the server, never seen by the browser), and corrections made in between.
 */
import { describe, expect, it } from "vitest";
import { createRegistrationSubmission, type HttpAnswer, type Send } from "../../lib/registration_submission";

type Payload = { samples: Array<{ sample_type_id: string }>; notes?: string };

function fakeServer() {
    const receipts = new Map<string, { fingerprint: string; orderId: string }>();
    const created: string[] = [];
    const keys: string[] = [];
    /** Queue of scripted network behaviours for the next calls. */
    const script: Array<"ok" | "drop-request" | "drop-response" | "500-after-commit"> = [];
    let inactiveType: string | null = null;

    const answer = (status: number, body: unknown, headers: Record<string, string> = {}): HttpAnswer =>
        ({ status, body, headers: new Headers(headers) });

    const send: Send = async (payload, headers) => {
        const key = headers["Idempotency-Key"];
        keys.push(key);
        const mode = script.shift() ?? "ok";
        if (mode === "drop-request") throw new TypeError("Failed to fetch");
        const p = payload as Payload;
        const fingerprint = JSON.stringify(p);
        const receipt = receipts.get(key);
        let result: HttpAnswer;
        if (receipt && receipt.fingerprint !== fingerprint) {
            result = answer(409, { detail: { code: "idempotency_key_reused", message: "reused" } });
        } else if (receipt) {
            result = answer(200, { order: { id: receipt.orderId } }, { "Idempotent-Replayed": "true" });
        } else if (inactiveType && p.samples.some((s) => s.sample_type_id === inactiveType)) {
            const rows = p.samples.flatMap((s, i) => (s.sample_type_id === inactiveType ? [`samples.${i}.sample_type_id`] : []));
            result = answer(400, { detail: { code: "sample_type_inactive", message: "inactive", fields: rows } });
        } else {
            const orderId = `order-${created.length + 1}`;
            created.push(orderId);
            receipts.set(key, { fingerprint, orderId });
            result = answer(200, { order: { id: orderId } });
        }
        if (mode === "drop-response") throw new TypeError("network error");
        if (mode === "500-after-commit") return answer(500, "Internal Server Error");
        return result;
    };
    return {
        send, created, keys, script,
        deactivate(type: string) { inactiveType = type; },
        activateAll() { inactiveType = null; },
    };
}

const order = (types: string[], notes?: string): Payload => ({ samples: types.map((t) => ({ sample_type_id: t })), ...(notes ? { notes } : {}) });

describe("registration submission", () => {
    it("a refused registration keeps its key for the corrected payload, which then succeeds once", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        server.deactivate("OFF");
        const refused = await sub.submit(order(["BIO", "OFF", "CIT"]), server.send, "attempt-1");
        expect(refused).toMatchObject({ kind: "refused", status: 400 });
        expect(server.created).toEqual([]);
        const corrected = await sub.submit(order(["BIO", "BIO", "CIT"]), server.send, "attempt-2");
        expect(corrected).toMatchObject({ kind: "created", replayed: false, recovered: null, meta: "attempt-2" });
        expect(new Set(server.keys).size).toBe(1);
        expect(server.created).toEqual(["order-1"]);
    });

    it("a request that never arrived is retried with the same key and creates the order once", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        server.script.push("drop-request");
        expect(await sub.submit(order(["BIO", "CIT"]), server.send, "a")).toEqual({ kind: "unknown", status: null });
        expect(sub.outcomeUnknown).toBe(true);
        const retried = await sub.submit(order(["BIO", "CIT"]), server.send, "a");
        expect(retried).toMatchObject({ kind: "created", replayed: false });
        expect(server.created).toEqual(["order-1"]);
        expect(sub.outcomeUnknown).toBe(false);
    });

    it("a lost response after a successful registration is answered by the original order, never a second one", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        server.script.push("drop-response");
        expect(await sub.submit(order(["BIO", "CIT", "BIO"]), server.send, "shown-then")).toMatchObject({ kind: "unknown" });
        expect(server.created).toEqual(["order-1"]); // saved, but the browser never knew
        const retried = await sub.submit(order(["BIO", "CIT", "BIO"]), server.send, "shown-now");
        expect(retried).toMatchObject({ kind: "created", replayed: true, recovered: null, result: { order: { id: "order-1" } } });
        // The confirmation compares the saved codes with what the form showed for the saved attempt.
        expect(retried.kind === "created" && retried.meta).toBe("shown-then");
        expect(server.created).toEqual(["order-1"]);
    });

    it("a 5xx after the server committed is treated as unknown and resolved by the retry", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        server.script.push("500-after-commit");
        expect(await sub.submit(order(["BIO"]), server.send, "a")).toEqual({ kind: "unknown", status: 500 });
        expect(await sub.submit(order(["BIO"]), server.send, "a")).toMatchObject({ kind: "created", replayed: true });
        expect(server.created).toEqual(["order-1"]);
    });

    it("a correction after a lost response is refused by the server and the saved order is recovered", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        server.script.push("drop-response");
        await sub.submit(order(["BIO", "CIT"], "Fragmento"), server.send, "original");
        const corrected = await sub.submit(order(["BIO", "BIO"], "Fragmento corregido"), server.send, "corrected");
        expect(corrected).toMatchObject({ kind: "created", replayed: true, recovered: "original", meta: "original", result: { order: { id: "order-1" } } });
        expect(server.created).toEqual(["order-1"]);
        expect(new Set(server.keys).size).toBe(1);
    });

    it("a correction after a request that never arrived simply registers the corrected order", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        server.script.push("drop-request");
        await sub.submit(order(["BIO", "CIT"]), server.send, "original");
        const corrected = await sub.submit(order(["BIO", "BIO"]), server.send, "corrected");
        expect(corrected).toMatchObject({ kind: "created", replayed: false, recovered: null, meta: "corrected" });
        expect(server.created).toEqual(["order-1"]);
    });

    it("finds the saved attempt among several unanswered ones", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        server.script.push("drop-request", "drop-response");
        await sub.submit(order(["A"]), server.send, "first");   // never arrived
        await sub.submit(order(["B"]), server.send, "second");  // saved, response lost
        const third = await sub.submit(order(["C"]), server.send, "third");
        expect(third).toMatchObject({ kind: "created", recovered: "second", result: { order: { id: "order-1" } } });
        expect(server.created).toEqual(["order-1"]);
    });

    it("a success ends the submission: the next registration gets a new key", async () => {
        const server = fakeServer();
        const sub = createRegistrationSubmission<{ order: { id: string } }, string>();
        await sub.submit(order(["BIO"]), server.send, "a");
        await sub.submit(order(["BIO"]), server.send, "b");
        expect(new Set(server.keys).size).toBe(2);
        expect(server.created).toEqual(["order-1", "order-2"]);
    });

    it("a removed earlier record (410) retires the key", async () => {
        const sub = createRegistrationSubmission<unknown, string>();
        const keys: string[] = [];
        const send: Send = async (_p, headers) => {
            keys.push(headers["Idempotency-Key"]);
            return { status: keys.length === 1 ? 410 : 200, headers: new Headers(), body: {} };
        };
        expect(await sub.submit(order(["BIO"]), send, "a")).toEqual({ kind: "gone" });
        await sub.submit(order(["BIO"]), send, "a");
        expect(keys[0]).not.toBe(keys[1]);
    });

    it("refuses a second submit while one is in flight", async () => {
        const sub = createRegistrationSubmission<unknown, string>();
        let release: () => void = () => undefined;
        const send: Send = () => new Promise((resolve) => {
            release = () => resolve({ status: 200, headers: new Headers(), body: {} });
        });
        const first = sub.submit(order(["BIO"]), send, "a");
        await expect(sub.submit(order(["BIO"]), send, "a")).rejects.toThrow();
        release();
        await first;
    });
});
