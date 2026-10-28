/**
 * Céluma 1.4 (#29): worker protocol, client lifecycle and the per-report
 * session, run against the real handler, engine and es-MX dictionary through
 * an in-process worker. Synthetic text only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpellingClient, SpellingUnavailableError, type SpellingEngineStatus } from "../../lib/spelling/client";
import { MAX_FIELD_CHECK_CHARS, SpellingSession } from "../../lib/spelling/session";
import { createSpellingWorkerHandler, type SpellingResponse } from "../../lib/spelling/worker_protocol";
import { inProcessWorker, readDictionary, realEngine } from "./spelling_fixtures";

afterEach(() => {
    vi.useRealTimers();
});

describe("worker handler", () => {
    it("answers lookups and suggestions with the real engine", async () => {
        const posted: SpellingResponse[] = [];
        const handle = createSpellingWorkerHandler({
            loadDictionary: async () => readDictionary(),
            createEngine: () => realEngine(),
            post: (m) => posted.push(m),
        });
        handle({ type: "init" });
        handle({ type: "check", id: 1, words: ["paciente", "pacietne"] });
        handle({ type: "suggest", id: 2, word: "pacietne" });
        await vi.waitFor(() => expect(posted).toHaveLength(3));
        expect(posted[0]).toEqual({ type: "ready" });
        expect(posted[1]).toEqual({ type: "checked", id: 1, correct: [true, false] });
        expect(posted[2]).toMatchObject({ type: "suggested", id: 2 });
        expect((posted[2] as { suggestions: string[] }).suggestions).toContain("paciente");
    });

    it("stops a cancelled check at the next chunk and serves later requests", async () => {
        const posted: SpellingResponse[] = [];
        let release: (() => void) | null = null;
        const handle = createSpellingWorkerHandler({
            loadDictionary: async () => readDictionary(),
            createEngine: () => realEngine(),
            post: (m) => posted.push(m),
            // The first yield parks until the test has sent the cancel.
            yieldToEvents: () => new Promise<void>((resolve) => { release = resolve; }),
        });
        handle({ type: "check", id: 7, words: Array.from({ length: 2500 }, () => "paciente") });
        handle({ type: "check", id: 8, words: ["biopsia"] });
        // The first 1000 words are done and the handler is parked at the chunk boundary.
        await vi.waitFor(() => expect(release).not.toBeNull());
        handle({ type: "cancel", id: 7 });
        release!();
        await vi.waitFor(() => expect(posted.filter((m) => m.type !== "ready")).toHaveLength(2));
        expect(posted).toContainEqual({ type: "cancelled", id: 7 });
        expect(posted).toContainEqual({ type: "checked", id: 8, correct: [true] });
    });

    it("reports a missing dictionary or engine failure instead of answering", async () => {
        const posted: SpellingResponse[] = [];
        const handle = createSpellingWorkerHandler({
            loadDictionary: async () => { throw new Error("404"); },
            post: (m) => posted.push(m),
        });
        handle({ type: "check", id: 1, words: ["paciente"] });
        await vi.waitFor(() => expect(posted).toHaveLength(2));
        expect(posted).toEqual([{ type: "failed", reason: "dictionary" }, { type: "error", id: 1 }]);

        const posted2: SpellingResponse[] = [];
        const html = "<!doctype html><html></html>";
        const handle2 = createSpellingWorkerHandler({ loadDictionary: async () => ({ aff: html, dic: html }), post: (m) => posted2.push(m) });
        handle2({ type: "init" });
        await vi.waitFor(() => expect(posted2).toEqual([{ type: "failed", reason: "engine" }]));
    });
});

describe("spelling client", () => {
    it("starts the worker lazily, on the first lookup", async () => {
        const created: ReturnType<typeof inProcessWorker>[] = [];
        const client = createSpellingClient(() => {
            const w = inProcessWorker();
            created.push(w);
            return w;
        });
        expect(created).toHaveLength(0);
        expect(client.getStatus()).toBe("idle");
        await expect(client.check(["paciente", "pacietne"])).resolves.toEqual([true, false]);
        expect(created).toHaveLength(1);
        expect(client.getStatus()).toBe("ready");
        // Only lookup keys cross the boundary: no field text, offsets or report data.
        expect(created[0].sent).toEqual([{ type: "init" }, { type: "check", id: 1, words: ["paciente", "pacietne"] }]);
        await client.suggest("pacietne");
        expect(created).toHaveLength(1);
    });

    it("rejects an aborted request and tells the worker to cancel it", async () => {
        const worker = inProcessWorker();
        const client = createSpellingClient(() => worker);
        const controller = new AbortController();
        const pending = client.check(["paciente"], controller.signal);
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(worker.sent).toContainEqual({ type: "cancel", id: 1 });
    });

    it("becomes unavailable on a worker failure, rejects pending work and recovers on retry", async () => {
        const statuses: SpellingEngineStatus[] = [];
        let broken = true;
        const client = createSpellingClient(() =>
            broken
                ? inProcessWorker({ loadDictionary: async () => { throw new Error("missing asset"); } })
                : inProcessWorker(),
        );
        client.subscribe((s) => statuses.push(s));
        await expect(client.check(["paciente"])).rejects.toBeInstanceOf(SpellingUnavailableError);
        expect(client.getStatus()).toBe("unavailable");
        // No silent fallback: later lookups fail fast until an explicit retry.
        await expect(client.suggest("pacietne")).rejects.toBeInstanceOf(SpellingUnavailableError);
        broken = false;
        client.retry();
        await expect(client.check(["paciente"])).resolves.toEqual([true]);
        expect(statuses).toEqual(["loading", "unavailable", "idle", "loading", "ready"]);
    });

    it("gives up when the worker never becomes ready", async () => {
        vi.useFakeTimers();
        const client = createSpellingClient(
            () => ({ postMessage: () => {}, terminate: () => {}, onmessage: null, onerror: null }),
            { initTimeoutMs: 1000 },
        );
        const pending = client.check(["paciente"]);
        vi.advanceTimersByTime(1001);
        await expect(pending).rejects.toBeInstanceOf(SpellingUnavailableError);
        expect(client.getStatus()).toBe("unavailable");
    });

    it("stops an unused worker after the idle delay and starts a new one on demand", async () => {
        vi.useFakeTimers();
        const created: ReturnType<typeof inProcessWorker>[] = [];
        const client = createSpellingClient(() => {
            const w = inProcessWorker();
            created.push(w);
            return w;
        }, { idleShutdownMs: 1000 });
        const releaseA = client.acquire();
        const pending = client.check(["paciente"]);
        await vi.runAllTimersAsync();
        await expect(pending).resolves.toEqual([true]);
        const releaseB = client.acquire();
        releaseA();
        vi.advanceTimersByTime(5000);
        expect(created[0].terminated).toBe(false); // still held by B
        releaseB();
        releaseB(); // releasing twice is harmless
        vi.advanceTimersByTime(999);
        expect(created[0].terminated).toBe(false);
        const releaseC = client.acquire(); // re-entry within the window cancels the shutdown
        vi.advanceTimersByTime(5000);
        expect(created[0].terminated).toBe(false);
        releaseC();
        vi.advanceTimersByTime(1000);
        expect(created[0].terminated).toBe(true);
        expect(client.getStatus()).toBe("idle");
        const again = client.check(["biopsia"]);
        await vi.runAllTimersAsync();
        await expect(again).resolves.toEqual([true]);
        expect(created).toHaveLength(2);
    });

    it("fails visibly when a worker that was ready answers a request with an error (review R2)", async () => {
        const statuses: SpellingEngineStatus[] = [];
        let worker: { postMessage: (m: { type: string; id?: number }) => void; terminate: () => void; onmessage: ((e: MessageEvent) => void) | null; onerror: ((e: Event) => void) | null; terminated: boolean } | null = null;
        const client = createSpellingClient(() => {
            // Synthetic worker: ready on init, then an engine error for the first lookup.
            worker = {
                terminated: false,
                onmessage: null,
                onerror: null,
                postMessage(message) {
                    setTimeout(() => {
                        if (message.type === "init") worker!.onmessage?.({ data: { type: "ready" } } as MessageEvent);
                        if (message.type === "check") worker!.onmessage?.({ data: { type: "error", id: message.id } } as MessageEvent);
                    }, 0);
                },
                terminate() {
                    worker!.terminated = true;
                },
            };
            return worker as never;
        });
        client.subscribe((s) => statuses.push(s));
        await expect(client.check(["paciente"])).rejects.toBeInstanceOf(SpellingUnavailableError);
        expect(statuses).toEqual(["loading", "ready", "unavailable"]);
        expect(client.getStatus()).toBe("unavailable");
        expect(worker!.terminated).toBe(true);
    });

    it("stops using an engine that throws after start-up, rejects pending work and recovers on retry", async () => {
        let broken = false;
        const flaky = () => {
            const real = realEngine();
            return {
                isCorrect: (w: string) => {
                    if (broken) throw new Error("synthetic engine failure");
                    return real.isCorrect(w);
                },
                suggest: real.suggest,
            };
        };
        const created: ReturnType<typeof inProcessWorker>[] = [];
        const client = createSpellingClient(() => {
            const w = inProcessWorker({ createEngine: flaky });
            created.push(w);
            return w;
        });
        await expect(client.check(["paciente"])).resolves.toEqual([true]);
        expect(client.getStatus()).toBe("ready");
        broken = true;
        const failing = client.check(["biopsia"]);
        const queued = client.suggest("pacietne");
        await expect(failing).rejects.toBeInstanceOf(SpellingUnavailableError);
        await expect(queued).rejects.toBeInstanceOf(SpellingUnavailableError);
        expect(client.getStatus()).toBe("unavailable");
        expect(created[0].terminated).toBe(true);
        broken = false;
        client.retry();
        await expect(client.check(["biopsia"])).resolves.toEqual([true]);
        expect(client.getStatus()).toBe("ready");
        expect(created).toHaveLength(2);
    });

    it("treats a browser without Worker support as unavailable", async () => {
        const client = createSpellingClient(() => { throw new ReferenceError("Worker is not defined"); });
        await expect(client.check(["paciente"])).rejects.toBeInstanceOf(SpellingUnavailableError);
        expect(client.getStatus()).toBe("unavailable");
    });
});

describe("spelling session", () => {
    const newSession = () => {
        const worker = inProcessWorker();
        const client = createSpellingClient(() => worker);
        return { worker, client, session: new SpellingSession(client) };
    };

    it("returns marks at original offsets and caches lookups", async () => {
        const { worker, session } = newSession();
        const text = "Muestra de pacietne con pacietne y CU011026.";
        const { marks, partial } = await session.checkText(text);
        expect(partial).toBe(false);
        expect(marks.map((m) => [m.start, m.end, m.word])).toEqual([
            [11, 19, "pacietne"],
            [24, 32, "pacietne"],
        ]);
        await session.checkText(text);
        const checks = worker.sent.filter((m) => m.type === "check");
        expect(checks).toHaveLength(1); // second run served from the session cache
        expect(checks[0]).toMatchObject({ words: expect.not.arrayContaining(["CU011026"]) });
    });

    it("deduplicates lookups that are already in flight", async () => {
        const { worker, session } = newSession();
        await Promise.all([session.checkText("pacietne biopsia"), session.checkText("biopsia pacietne")]);
        const words = worker.sent.flatMap((m) => (m.type === "check" ? m.words : []));
        expect(words.sort()).toEqual(["biopsia", "pacietne"]);
    });

    it("ignores a word case-insensitively for the session only, without touching text", async () => {
        const { client, session } = newSession();
        const text = "Esplenomegalia: esplenomegalia y pacietne.";
        expect((await session.checkText(text)).marks.map((m) => m.word)).toEqual([
            "Esplenomegalia",
            "esplenomegalia",
            "pacietne",
        ]);
        const before = session.ignoreRevision;
        session.ignore("esplenomegalia");
        expect(session.ignoreRevision).toBe(before + 1);
        expect((await session.checkText(text)).marks.map((m) => m.word)).toEqual(["pacietne"]);
        // A different report gets a different session: nothing carries over.
        const other = new SpellingSession(client);
        expect((await other.checkText(text)).marks).toHaveLength(3);
    });

    it("forgets everything and refuses work after dispose", async () => {
        const { session } = newSession();
        await session.checkText("pacietne");
        session.ignore("esplenomegalia");
        session.dispose();
        expect(session.cachedLookups).toBe(0);
        expect(session.ignoredCount).toBe(0);
        await expect(session.checkText("pacietne")).rejects.toMatchObject({ name: "AbortError" });
        await expect(session.suggest("pacietne")).rejects.toMatchObject({ name: "AbortError" });
    });

    it("lets a caller abandon a check while the shared lookup still fills the cache", async () => {
        const { session } = newSession();
        const controller = new AbortController();
        const pending = session.checkText("pacietne", controller.signal);
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        await vi.waitFor(() => expect(session.cachedLookups).toBe(1));
    });

    it("reports oversize text as partial instead of calling unchecked text correct", async () => {
        const { session } = newSession();
        const filler = "biopsia ".repeat(Math.ceil(MAX_FIELD_CHECK_CHARS / 8));
        const result = await session.checkText(`${filler}pacietne`);
        expect(result.partial).toBe(true);
        expect(result.marks).toEqual([]);
    });

    it("computes suggestions on demand and caches them", async () => {
        const { worker, session } = newSession();
        expect(await session.suggest("pacietne")).toContain("paciente");
        await session.suggest("pacietne");
        expect(worker.sent.filter((m) => m.type === "suggest")).toHaveLength(1);
    });
});
