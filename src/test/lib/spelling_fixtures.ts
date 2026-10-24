/**
 * Test-only access to the vendored es-MX dictionary and an in-process worker
 * running the real message handler, so client/session tests exercise the real
 * engine without a browser Worker. Synthetic text only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSpellEngine, type SpellEngine } from "../../lib/spelling/engine";
import {
    createSpellingWorkerHandler,
    type DictionarySource,
    type SpellingRequest,
    type SpellingResponse,
} from "../../lib/spelling/worker_protocol";
import type { SpellingWorkerLike } from "../../lib/spelling/client";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DICTIONARY_DIR = path.resolve(here, "../../lib/spelling/dictionaries/es-MX");

let cachedSource: DictionarySource | null = null;
let cachedEngine: SpellEngine | null = null;

export function readDictionary(): DictionarySource {
    if (!cachedSource) {
        cachedSource = {
            aff: readFileSync(path.join(DICTIONARY_DIR, "es-MX.aff"), "utf8"),
            dic: readFileSync(path.join(DICTIONARY_DIR, "es-MX.dic"), "utf8"),
        };
    }
    return cachedSource;
}

/** One real engine per test file (building it takes ~1 s). */
export function realEngine(): SpellEngine {
    if (!cachedEngine) cachedEngine = createSpellEngine(readDictionary().aff, readDictionary().dic);
    return cachedEngine;
}

export interface InProcessWorker extends SpellingWorkerLike {
    /** Every request the client posted, in order. */
    readonly sent: SpellingRequest[];
    terminated: boolean;
}

/**
 * A Worker look-alike that runs the real handler asynchronously (like
 * postMessage would). `engine` defaults to the shared real engine.
 */
export function inProcessWorker(options: {
    loadDictionary?: () => Promise<DictionarySource>;
    createEngine?: (source: DictionarySource) => SpellEngine;
} = {}): InProcessWorker {
    const sent: SpellingRequest[] = [];
    const worker: InProcessWorker = {
        sent,
        terminated: false,
        onmessage: null,
        onerror: null,
        postMessage(message) {
            sent.push(message);
            setTimeout(() => {
                if (!worker.terminated) handle(message);
            }, 0);
        },
        terminate() {
            worker.terminated = true;
        },
    };
    const handle = createSpellingWorkerHandler({
        loadDictionary: options.loadDictionary ?? (async () => readDictionary()),
        createEngine: options.createEngine ?? (() => realEngine()),
        post: (message: SpellingResponse) => {
            setTimeout(() => {
                if (!worker.terminated) worker.onmessage?.({ data: message } as MessageEvent<SpellingResponse>);
            }, 0);
        },
    });
    return worker;
}
