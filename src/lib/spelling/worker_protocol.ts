import { createSpellEngine, type SpellEngine } from "./engine";

/**
 * Céluma 1.4 (#29) — messages between the report editor and the spelling
 * worker. Requests carry only dictionary lookup keys (words), never a field's
 * full text, offsets, report identifiers or user data. The worker keeps no
 * per-report state: it answers lookups and forgets them.
 */
export type SpellingRequest =
    | { type: "init" }
    | { type: "check"; id: number; words: string[] }
    | { type: "suggest"; id: number; word: string }
    | { type: "cancel"; id: number };

export type SpellingResponse =
    | { type: "ready" }
    | { type: "failed"; reason: "dictionary" | "engine" }
    | { type: "checked"; id: number; correct: boolean[] }
    | { type: "suggested"; id: number; suggestions: string[] }
    | { type: "cancelled"; id: number }
    | { type: "error"; id: number };

export interface DictionarySource {
    aff: string;
    dic: string;
}

/** Words looked up between cooperative yields, so `cancel` messages are seen. */
export const CHECK_CHUNK = 1000;

const yieldToEvents = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The worker's message handler, independent of the Worker global so the real
 * engine and dictionary can be exercised by unit tests. Requests are served in
 * order; a `cancel` for a queued or partially processed check stops it at the
 * next chunk boundary.
 */
export function createSpellingWorkerHandler(deps: {
    loadDictionary: () => Promise<DictionarySource>;
    post: (message: SpellingResponse) => void;
    createEngine?: (source: DictionarySource) => SpellEngine;
    yieldToEvents?: () => Promise<void>;
}): (message: SpellingRequest) => void {
    const makeEngine = deps.createEngine ?? ((s: DictionarySource) => createSpellEngine(s.aff, s.dic));
    const pause = deps.yieldToEvents ?? yieldToEvents;
    let engine: Promise<SpellEngine | null> | null = null;
    const cancelled = new Set<number>();
    let queue: Promise<void> = Promise.resolve();

    const init = () => {
        if (!engine) {
            engine = (async () => {
                let source: DictionarySource;
                try {
                    source = await deps.loadDictionary();
                } catch {
                    deps.post({ type: "failed", reason: "dictionary" });
                    return null;
                }
                try {
                    const created = makeEngine(source);
                    deps.post({ type: "ready" });
                    return created;
                } catch {
                    deps.post({ type: "failed", reason: "engine" });
                    return null;
                }
            })();
        }
        return engine;
    };

    const serve = async (message: Exclude<SpellingRequest, { type: "init" } | { type: "cancel" }>) => {
        const spell = await init();
        if (cancelled.delete(message.id)) {
            deps.post({ type: "cancelled", id: message.id });
            return;
        }
        if (!spell) {
            deps.post({ type: "error", id: message.id });
            return;
        }
        try {
            if (message.type === "suggest") {
                deps.post({ type: "suggested", id: message.id, suggestions: spell.suggest(message.word) });
                return;
            }
            const correct: boolean[] = [];
            for (let i = 0; i < message.words.length; i += CHECK_CHUNK) {
                if (i > 0) {
                    await pause();
                    if (cancelled.delete(message.id)) {
                        deps.post({ type: "cancelled", id: message.id });
                        return;
                    }
                }
                for (const word of message.words.slice(i, i + CHECK_CHUNK)) correct.push(spell.isCorrect(word));
            }
            deps.post({ type: "checked", id: message.id, correct });
        } catch {
            deps.post({ type: "error", id: message.id });
        }
    };

    return (message) => {
        if (message.type === "init") {
            void init();
            return;
        }
        if (message.type === "cancel") {
            // A cancel can race a request that already finished; bound the set.
            if (cancelled.size > 1000) cancelled.clear();
            cancelled.add(message.id);
            return;
        }
        queue = queue.then(() => serve(message));
    };
}
