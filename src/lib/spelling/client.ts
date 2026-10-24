import type { SpellingRequest, SpellingResponse } from "./worker_protocol";

/**
 * Céluma 1.4 (#29) — main-thread handle on the spelling worker.
 *
 * The worker is created lazily, on the first lookup, so read-only views and
 * screens without assistance never download the engine or the dictionary.
 * One worker is shared by the whole tab; it is stateless with respect to
 * reports (caches and ignore lists live in each `SpellingSession`).
 *
 * A failure (worker script or dictionary missing, engine error at start-up or
 * on any later request, unreadable message, timeout) moves the client to
 * `unavailable`: the worker is stopped, pending lookups reject and nothing
 * falls back to the browser's or the operating system's checker. `retry()`
 * starts a fresh worker.
 *
 * Editors `acquire()` the client while assistance is enabled; once nobody
 * holds it for `idleShutdownMs`, the worker (≈46 MB of dictionary data) is
 * stopped and a later lookup starts a new one.
 */
export type SpellingEngineStatus = "idle" | "loading" | "ready" | "unavailable";

/** The subset of `Worker` the client needs (lets tests run the real handler in-process). */
export interface SpellingWorkerLike {
    postMessage(message: SpellingRequest): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<SpellingResponse>) => void) | null;
    onerror: ((event: Event) => void) | null;
    onmessageerror?: ((event: Event) => void) | null;
}

export interface SpellingClient {
    getStatus(): SpellingEngineStatus;
    subscribe(listener: (status: SpellingEngineStatus) => void): () => void;
    /** Dictionary verdict for each word (same order). */
    check(words: string[], signal?: AbortSignal): Promise<boolean[]>;
    suggest(word: string, signal?: AbortSignal): Promise<string[]>;
    /** Replace an unavailable worker with a new one. */
    retry(): void;
    /** Stop the worker; later calls start a new one. */
    shutdown(): void;
    /** Marks the client in use; the returned function releases it. */
    acquire(): () => void;
}

export class SpellingUnavailableError extends Error {
    constructor() {
        super("Spelling assistance is unavailable");
        this.name = "SpellingUnavailableError";
    }
}

export function abortError(): DOMException {
    return new DOMException("Aborted", "AbortError");
}

/** Worker start-up budget: fetching ~0.9 MB and building the engine. */
export const INIT_TIMEOUT_MS = 30_000;
/** How long an unused worker is kept, so moving between reports does not rebuild it. */
export const IDLE_SHUTDOWN_MS = 120_000;

type Pending = {
    resolve: (value: never) => void;
    reject: (reason: unknown) => void;
    cleanup: () => void;
};

export function createSpellingClient(
    createWorker: () => SpellingWorkerLike,
    options: { initTimeoutMs?: number; idleShutdownMs?: number } = {},
): SpellingClient {
    const initTimeoutMs = options.initTimeoutMs ?? INIT_TIMEOUT_MS;
    const idleShutdownMs = options.idleShutdownMs ?? IDLE_SHUTDOWN_MS;
    let holders = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let status: SpellingEngineStatus = "idle";
    let worker: SpellingWorkerLike | null = null;
    let initTimer: ReturnType<typeof setTimeout> | null = null;
    let nextId = 1;
    const pending = new Map<number, Pending>();
    const listeners = new Set<(s: SpellingEngineStatus) => void>();

    const setStatus = (next: SpellingEngineStatus) => {
        if (status === next) return;
        status = next;
        listeners.forEach((l) => l(next));
    };

    const rejectAll = (reason: () => unknown) => {
        const entries = [...pending.values()];
        pending.clear();
        entries.forEach((p) => {
            p.cleanup();
            p.reject(reason());
        });
    };

    const stop = () => {
        if (initTimer) clearTimeout(initTimer);
        initTimer = null;
        if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
            worker.terminate();
        }
        worker = null;
    };

    const fail = () => {
        stop();
        setStatus("unavailable");
        rejectAll(() => new SpellingUnavailableError());
    };

    const settle = (id: number, outcome: { value: unknown } | { error: unknown }) => {
        const entry = pending.get(id);
        if (!entry) return; // stale: already aborted or rejected
        pending.delete(id);
        entry.cleanup();
        if ("value" in outcome) entry.resolve(outcome.value as never);
        else entry.reject(outcome.error);
    };

    const onMessage = (event: MessageEvent<SpellingResponse>) => {
        const message = event.data;
        switch (message.type) {
            case "ready":
                if (initTimer) clearTimeout(initTimer);
                initTimer = null;
                setStatus("ready");
                return;
            case "failed":
                fail();
                return;
            case "checked":
                settle(message.id, { value: message.correct });
                return;
            case "suggested":
                settle(message.id, { value: message.suggestions });
                return;
            case "cancelled":
                settle(message.id, { error: abortError() });
                return;
            case "error":
                // The engine failed on a request even though it had started: the checker
                // is no longer trustworthy. Fail visibly (notice + retry) instead of
                // leaving a "ready" client whose lookups quietly stop working.
                fail();
                return;
        }
    };

    const ensureWorker = (): SpellingWorkerLike | null => {
        if (status === "unavailable") return null;
        if (worker) return worker;
        try {
            worker = createWorker();
        } catch {
            fail();
            return null;
        }
        worker.onmessage = onMessage;
        worker.onerror = () => fail();
        worker.onmessageerror = () => fail();
        setStatus("loading");
        initTimer = setTimeout(() => {
            if (status === "loading") fail();
        }, initTimeoutMs);
        worker.postMessage({ type: "init" });
        return worker;
    };

    function shutdown() {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = null;
        stop();
        rejectAll(() => abortError());
        setStatus("idle");
    }

    const request = <T>(build: (id: number) => SpellingRequest, signal?: AbortSignal): Promise<T> => {
        if (signal?.aborted) return Promise.reject(abortError());
        const target = ensureWorker();
        if (!target) return Promise.reject(new SpellingUnavailableError());
        const id = nextId++;
        return new Promise<T>((resolve, reject) => {
            const onAbort = () => {
                if (!pending.has(id)) return;
                pending.delete(id);
                worker?.postMessage({ type: "cancel", id });
                reject(abortError());
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            pending.set(id, {
                resolve: resolve as (value: never) => void,
                reject,
                cleanup: () => signal?.removeEventListener("abort", onAbort),
            });
            target.postMessage(build(id));
        });
    };

    return {
        getStatus: () => status,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        check: (words, signal) =>
            words.length === 0
                ? Promise.resolve([])
                : request<boolean[]>((id) => ({ type: "check", id, words }), signal),
        suggest: (word, signal) => request<string[]>((id) => ({ type: "suggest", id, word }), signal),
        retry: () => {
            if (status !== "unavailable") return;
            setStatus("idle");
            ensureWorker();
        },
        shutdown,
        acquire: () => {
            holders += 1;
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = null;
            let released = false;
            return () => {
                if (released) return;
                released = true;
                holders -= 1;
                if (holders === 0) idleTimer = setTimeout(shutdown, idleShutdownMs);
            };
        },
    };
}

let defaultClient: SpellingClient | null = null;

/** The tab-wide client backed by the bundled module worker. */
export function getSpellingClient(): SpellingClient {
    if (!defaultClient) {
        defaultClient = createSpellingClient(
            () =>
                new Worker(new URL("./spelling.worker.ts", import.meta.url), {
                    type: "module",
                    name: "celuma-spelling",
                }) as unknown as SpellingWorkerLike,
        );
    }
    return defaultClient;
}
