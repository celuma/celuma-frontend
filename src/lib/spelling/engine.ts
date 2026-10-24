import nspell from "nspell";

/**
 * Céluma 1.4 (#29) — the application-controlled spelling engine: `nspell`
 * (Hunspell-compatible, MIT) over the vendored, unmodified es-MX dictionary in
 * `dictionaries/es-MX`. It runs inside the spelling worker; nothing here
 * performs I/O, logging or network access.
 */
export interface SpellEngine {
    /** Whether `word` (already a lookup key, see `tokenize.lookupKey`) is in the dictionary. */
    isCorrect(word: string): boolean;
    /** Up to `limit` dictionary suggestions for `word`, never including `word` itself. */
    suggest(word: string, limit?: number): string[];
}

export const MAX_SUGGESTIONS = 5;
/** Suggestion generation is expensive for long tokens; longer words get none. */
export const MAX_SUGGEST_WORD_LENGTH = 40;

export class DictionaryFormatError extends Error {
    constructor(detail: string) {
        super(`Invalid spelling dictionary: ${detail}`);
        this.name = "DictionaryFormatError";
    }
}

/**
 * Rejects anything that is not the expected UTF-8 Hunspell pair — notably the
 * SPA's `index.html`, which a static host may return with HTTP 200 for a
 * missing asset path.
 */
export function validateDictionary(aff: string, dic: string): void {
    const looksLikeHtml = (s: string) => /^\s*</.test(s);
    if (looksLikeHtml(aff) || !/^SET UTF-8\s*$/m.test(aff)) throw new DictionaryFormatError("affix file");
    if (looksLikeHtml(dic) || !/^\d+\s*$/m.test(dic.slice(0, 32))) throw new DictionaryFormatError("word list");
}

export function createSpellEngine(aff: string, dic: string): SpellEngine {
    validateDictionary(aff, dic);
    const spell = nspell(aff, dic);
    return {
        isCorrect: (word) => spell.correct(word),
        suggest: (word, limit = MAX_SUGGESTIONS) => {
            if (word.length > MAX_SUGGEST_WORD_LENGTH) return [];
            const seen = new Set<string>();
            const out: string[] = [];
            for (const s of spell.suggest(word)) {
                if (s === word || seen.has(s) || /[\r\n]/.test(s)) continue;
                seen.add(s);
                out.push(s);
                if (out.length >= limit) break;
            }
            return out;
        },
    };
}
