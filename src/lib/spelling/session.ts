import { abortError, type SpellingClient } from "./client";
import { findCheckableWords, ignoreKey, lookupKey } from "./tokenize";

/**
 * Céluma 1.4 (#29) — one report-editor spelling session.
 *
 * Holds everything that is specific to the report being edited: the bounded
 * lookup/suggestion caches and the words the author chose to ignore. It lives
 * only in memory and is disposed when the report changes or the editor
 * unmounts, so no word, verdict or ignore decision outlives it or reaches
 * another report. Nothing here is logged, persisted or sent anywhere except
 * the dictionary lookup keys handed to the local worker.
 */
export interface SpellingMark {
    /** UTF-16 offsets in the field text the check ran on. */
    start: number;
    end: number;
    /** The word as written. */
    word: string;
    /** Its dictionary lookup key. */
    key: string;
}

export interface FieldCheckResult {
    marks: SpellingMark[];
    /** True when part of the text was not checked (size limits); never "error-free". */
    partial: boolean;
}

/** Text beyond this many UTF-16 units of one field is not checked (reported as partial). */
export const MAX_FIELD_CHECK_CHARS = 100_000;
/** At most this many indications are drawn per field (reported as partial beyond it). */
export const MAX_MARKS_PER_FIELD = 300;
export const LOOKUP_CACHE_LIMIT = 10_000;
export const SUGGESTION_CACHE_LIMIT = 200;

class BoundedCache<V> {
    private readonly map = new Map<string, V>();
    private readonly limit: number;
    constructor(limit: number) {
        this.limit = limit;
    }
    get(key: string): V | undefined {
        const value = this.map.get(key);
        if (value !== undefined) {
            this.map.delete(key);
            this.map.set(key, value);
        }
        return value;
    }
    set(key: string, value: V): void {
        this.map.delete(key);
        this.map.set(key, value);
        if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as string);
    }
    get size(): number {
        return this.map.size;
    }
    clear(): void {
        this.map.clear();
    }
}

function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (v) => {
                signal.removeEventListener("abort", onAbort);
                resolve(v);
            },
            (e) => {
                signal.removeEventListener("abort", onAbort);
                reject(e);
            },
        );
    });
}

function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
    const controller = new AbortController();
    for (const s of signals) {
        if (!s) continue;
        if (s.aborted) {
            controller.abort();
            break;
        }
        s.addEventListener("abort", () => controller.abort(), { once: true });
    }
    return controller.signal;
}

export class SpellingSession {
    private readonly lookups = new BoundedCache<boolean>(LOOKUP_CACHE_LIMIT);
    private readonly suggestions = new BoundedCache<string[]>(SUGGESTION_CACHE_LIMIT);
    private readonly inflight = new Map<string, Promise<Map<string, boolean>>>();
    private readonly ignored = new Set<string>();
    private readonly listeners = new Set<() => void>();
    private readonly lifetime = new AbortController();
    /** Aborted by `cancelPending()` (read-only transition) and replaced by a fresh one. */
    private requests = new AbortController();
    private ignoreVersion = 0;

    private readonly client: SpellingClient;

    constructor(client: SpellingClient) {
        this.client = client;
    }

    get disposed(): boolean {
        return this.lifetime.signal.aborted;
    }

    /** Changes whenever the ignore list changes. */
    get ignoreRevision(): number {
        return this.ignoreVersion;
    }

    get cachedLookups(): number {
        return this.lookups.size;
    }

    get ignoredCount(): number {
        return this.ignored.size;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    isIgnored(word: string): boolean {
        return this.ignored.has(ignoreKey(word));
    }

    /** Ignore every occurrence of `word` (any case) for the rest of this session. Never edits text. */
    ignore(word: string): void {
        if (this.disposed) return;
        const key = ignoreKey(word);
        if (this.ignored.has(key)) return;
        this.ignored.add(key);
        this.ignoreVersion += 1;
        this.listeners.forEach((l) => l());
    }

    /** Finds the dictionary-unknown, non-ignored words of one field's text. */
    async checkText(text: string, signal?: AbortSignal): Promise<FieldCheckResult> {
        if (this.disposed) throw abortError();
        const truncated = text.length > MAX_FIELD_CHECK_CHARS;
        let words = findCheckableWords(truncated ? text.slice(0, MAX_FIELD_CHECK_CHARS) : text);
        // A word touching the cut may itself be cut: leave it unchecked rather than misjudge it.
        if (truncated && words.length && words[words.length - 1].end >= MAX_FIELD_CHECK_CHARS) words = words.slice(0, -1);
        const candidates = words.filter((w) => !this.ignored.has(ignoreKey(w.word)));
        const verdicts = await untilAborted(this.lookup([...new Set(candidates.map((w) => w.key))]), signal);
        if (this.disposed) throw abortError();
        const marks = candidates.filter((w) => verdicts.get(w.key) === false && !this.ignored.has(ignoreKey(w.word)));
        return {
            marks: marks.slice(0, MAX_MARKS_PER_FIELD).map(({ start, end, word, key }) => ({ start, end, word, key })),
            partial: truncated || marks.length > MAX_MARKS_PER_FIELD,
        };
    }

    /** Suggestions for one word, computed on demand in the worker and cached for this session. */
    async suggest(word: string, signal?: AbortSignal): Promise<string[]> {
        if (this.disposed) throw abortError();
        const key = lookupKey(word);
        const cached = this.suggestions.get(key);
        if (cached) return cached;
        const result = await this.client.suggest(key, anySignal([signal, this.requests.signal]));
        if (this.disposed) throw abortError();
        this.suggestions.set(key, result);
        return result;
    }

    /**
     * Cancels every lookup and suggestion still running in the worker (e.g. the
     * report just became read-only) while keeping the session's ignore list.
     */
    cancelPending(): void {
        this.requests.abort();
        this.requests = new AbortController();
        this.inflight.clear();
    }

    /** Ends the session: aborts its worker requests and forgets every cached word and ignore decision. */
    dispose(): void {
        if (this.disposed) return;
        this.lifetime.abort();
        this.requests.abort();
        this.lookups.clear();
        this.suggestions.clear();
        this.inflight.clear();
        this.ignored.clear();
        this.listeners.clear();
    }

    private async lookup(keys: string[]): Promise<Map<string, boolean>> {
        const verdicts = new Map<string, boolean>();
        const waits = new Set<Promise<Map<string, boolean>>>();
        const missing: string[] = [];
        for (const key of keys) {
            const known = this.lookups.get(key);
            if (known !== undefined) verdicts.set(key, known);
            else if (this.inflight.has(key)) waits.add(this.inflight.get(key)!);
            else missing.push(key);
        }
        if (missing.length) {
            const batch = this.client.check(missing, this.requests.signal).then((correct) => {
                const result = new Map<string, boolean>();
                missing.forEach((key, i) => {
                    result.set(key, correct[i]);
                    if (!this.disposed) this.lookups.set(key, correct[i]);
                });
                return result;
            });
            const settled = batch.finally(() => missing.forEach((key) => this.inflight.get(key) === settled && this.inflight.delete(key)));
            missing.forEach((key) => this.inflight.set(key, settled));
            waits.add(settled);
        }
        for (const batch of await Promise.all(waits)) {
            for (const key of keys) if (batch.has(key)) verdicts.set(key, batch.get(key)!);
        }
        return verdicts;
    }
}
