import nspell from "nspell";

/**
 * Céluma 1.4 (#29) — the application-controlled spelling engine: `nspell`
 * (Hunspell-compatible, MIT) over the vendored, unmodified es-MX dictionary in
 * `dictionaries/es-MX`, plus the generated clinical supplement
 * (`lexicon/clinical-es.dic`, built from the reviewed `clinical-es.lexicon`
 * source against the same affix flags). It runs inside the spelling worker;
 * nothing here performs I/O, logging or network access.
 *
 * Beyond the dictionaries the engine applies three bounded, documented rules
 * (see specs/reports/spelling.md): a closed list of Greek/Latin combining
 * forms (`hiper-`, `inmuno-`, `adeno-`…) accepted only in front of a word that
 * is itself correct; 4–5 letter ALL-CAPS tokens are treated as acronyms unless
 * they sit one edit away from a real word; and accent-only variants of a
 * misspelling lead the suggestions.
 */
export interface SpellEngine {
    /** Whether `word` (already a lookup key, see `tokenize.lookupKey`) is in the dictionary. */
    isCorrect(word: string): boolean;
    /** Up to `limit` dictionary suggestions for `word`, never including `word` itself. */
    suggest(word: string, limit?: number): string[];
}

export const MAX_SUGGESTIONS = 5;
/**
 * Combining forms accepted in front of a correct word (`adeno` + `carcinoma`,
 * `inmuno` + `histoquímico`). Closed on purpose: the remainder must be a word
 * the dictionaries accept (itself possibly built the same way, at most
 * `MAX_PREFIX_DEPTH` times) and long (`MIN_REMAINDER_LETTERS`), so a misspelled
 * remainder is still reported and short look-alikes are not accepted.
 */
export const COMBINING_FORMS: readonly string[] = [
    "adeno", "angio", "bio", "carcino", "cito", "condro", "cisto", "crio", "dermo", "ecto", "endo", "entero",
    "eosino", "eritro", "exo", "fibro", "gastro", "hemato", "hemo", "hepato", "hiper", "hipo", "histo",
    "infra", "inmuno", "intra", "leuco", "linfo", "lipo", "macro", "mamo", "mega", "meso", "meta", "mio",
    "mono", "morfo", "muco", "necro", "nefro", "neo", "neuro", "onco", "osteo", "pan", "peri", "pleo", "poli",
    "pseudo", "rabdo", "retro", "sero", "supra", "ultra", "uro", "vaso",
].sort((a, b) => b.length - a.length);
/**
 * Measured on single-letter mutants of valid words: a shorter remainder let
 * typos through as `prefix` + an unrelated short word (`peritonal` = `peri` +
 * `tonal`, `endometro` = `endo` + `metro`), so only long remainders qualify.
 */
export const MIN_REMAINDER_LETTERS = 7;
export const MAX_PREFIX_DEPTH = 3;
/** ALL-CAPS tokens with up to this many letters are acronyms unless one edit from a word (longer ones are checked normally). */
export const MAX_CAPS_ACRONYM_LETTERS = 5;
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

const ACCENTED: Record<string, string> = { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" };
const UNACCENT: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U" };

const lower = (w: string) => w.toLocaleLowerCase("es-MX");
const letterCount = (w: string) => w.replace(/[^\p{L}]/gu, "").length;
const isAllCaps = (w: string) => w === w.toLocaleUpperCase("es-MX") && w !== lower(w);

/** Lower-case, accent-free form used only to compare candidates. */
const fold = (w: string) => lower(w).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Optimal-string-alignment (Damerau) distance; words here are at most `MAX_SUGGEST_WORD_LENGTH` long. */
export function editDistance(a: string, b: string): number {
    const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
        }
    }
    return rows[a.length][b.length];
}

/** Whether `a` and `b` differ by at most one insertion, deletion, substitution or adjacent transposition. */
export function withinOneEdit(a: string, b: string): boolean {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    if (a.length === b.length) {
        if (a.slice(i + 1) === b.slice(i + 1)) return true;
        return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
    return longer.slice(i + 1) === shorter.slice(i);
}

/** Candidate spellings that differ from `word` only by where its written accent goes (`celulas` → `células`). */
export function accentVariants(word: string): string[] {
    const original = word.normalize("NFC");
    const bare = Array.from(original).map((ch) => UNACCENT[ch] ?? ch);
    const out: string[] = [];
    bare.forEach((ch, i) => {
        const accented = ACCENTED[ch];
        if (!accented) return;
        const candidate = [...bare.slice(0, i), accented, ...bare.slice(i + 1)].join("");
        if (candidate !== original) out.push(candidate);
    });
    return out;
}

/**
 * `extraDics` are generated Hunspell word lists written against the SAME affix
 * file (the clinical supplement); they only add words, never change the base.
 */
export function createSpellEngine(aff: string, dic: string, extraDics: string[] = []): SpellEngine {
    validateDictionary(aff, dic);
    for (const extra of extraDics) validateDictionary(aff, extra);
    const spell = nspell(aff, dic);
    for (const extra of extraDics) spell.dictionary(extra);

    const derivable = (word: string, depth: number): boolean => {
        const w = lower(word);
        for (const form of COMBINING_FORMS) {
            if (!w.startsWith(form)) continue;
            const rest = w.slice(form.length);
            // After a vowel a following `r` is written `rr` (`inmunorreactividad`): the single-r join is a typo.
            if (letterCount(rest) < MIN_REMAINDER_LETTERS || rest.startsWith("r")) continue;
            if (spell.correct(rest) || (depth + 1 < MAX_PREFIX_DEPTH && derivable(rest, depth + 1))) return true;
        }
        return false;
    };

    /** In a dictionary, or built from a combining form and a word in a dictionary. */
    const isWord = (word: string): boolean => spell.correct(word) || derivable(word, 0);

    /**
     * A 4–5 letter ALL-CAPS token nobody knows is an acronym, unless it is one
     * edit away from an ordinary lowercase word (`TUMRO` → `tumor`). Reviewed
     * acronyms (`PAAF`, `ASCUS`) are dictionary entries and never get here.
     */
    const looksLikeCapsTypo = (word: string): boolean => {
        const w = lower(word);
        return spell.suggest(w).some((s) => withinOneEdit(lower(s), w) && spell.correct(lower(s)));
    };

    const isCorrect = (word: string): boolean => {
        if (isWord(word)) return true;
        const letters = letterCount(word);
        if (isAllCaps(word) && letters > 3 && letters <= MAX_CAPS_ACRONYM_LETTERS) return !looksLikeCapsTypo(word);
        return false;
    };

    // Words of the clinical supplement only (cheap: the supplement is small). Built on first use,
    // because only suggestion ranking needs it, never the check path.
    let clinical: ReturnType<typeof nspell> | null | undefined;
    const inClinical = (word: string): boolean => {
        if (clinical === undefined) {
            clinical = null;
            if (extraDics.length) {
                clinical = nspell(aff, extraDics[0]);
                for (const extra of extraDics.slice(1)) clinical.dictionary(extra);
            }
        }
        return clinical ? clinical.correct(word) : false;
    };

    return {
        isCorrect,
        suggest: (word, limit = MAX_SUGGESTIONS) => {
            if (word.length > MAX_SUGGEST_WORD_LENGTH) return [];
            const found: string[] = [];
            const seen = new Set<string>();
            const add = (s: string) => {
                if (s === word || seen.has(s) || /[\r\n]/.test(s)) return;
                seen.add(s);
                found.push(s);
            };
            // Accent-only repairs of the word, and of each dictionary suggestion (`diagnostco` → `diagnóstico`).
            for (const variant of accentVariants(word)) if (isWord(variant)) add(variant);
            for (const s of spell.suggest(word)) {
                add(s);
                for (const variant of accentVariants(s)) if (isWord(variant)) add(variant);
            }
            // Clinical-supplement words within one edit of the input first, then by distance with accents
            // ignored (so `celulas` → `células` leads); ties keep the order found above.
            const key = fold(word);
            const ranked = found
                .map((s, order) => {
                    const distance = editDistance(fold(s), key);
                    return { s, order, distance, tier: distance <= 1 && inClinical(s) ? 0 : 1 };
                })
                .sort((a, b) => a.tier - b.tier || a.distance - b.distance || a.order - b.order);
            return ranked.slice(0, limit).map((r) => r.s);
        },
    };
}
