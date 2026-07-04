/**
 * Céluma shared search engine.
 *
 * A single, normalized, typo-tolerant matcher shared by every list view through
 * `CelumaTable`. It solves the three recurring problems of the hand-rolled
 * `.toLowerCase().includes()` filters that used to live in each page:
 *
 *  1. Accents/case: "Muñóz" matches "munoz".
 *  2. Separators/punctuation: "ctm18" matches "CTM-18", "CTM 18", "ctm.18".
 *  3. Typos (conservative): "biosia" matches "Biopsia".
 *
 * Multi-word queries are AND-matched: "juan bio" requires both "juan" and "bio"
 * to appear (in any searched field).
 */

/** Lowercase + strip diacritics (NFD). "Muñóz" → "munoz". */
export function normalizeText(input: string): string {
    return input
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

/** Normalize and drop every non-alphanumeric character. "CTM-18" → "ctm18". */
export function stripSeparators(input: string): string {
    return normalizeText(input).replace(/[^a-z0-9]+/g, "");
}

/** Split a value into normalized alphanumeric words. "Dr. Juan-Pérez" → ["dr","juan","perez"]. */
function toWords(input: string): string[] {
    return normalizeText(input)
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

/**
 * Levenshtein edit distance (iterative, two-row). Short-circuits when the
 * distance is guaranteed to exceed `max` so we never pay for long comparisons.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > max) return max + 1;

    let prev = new Array<number>(b.length + 1);
    let curr = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 0; i < a.length; i++) {
        curr[0] = i + 1;
        let rowMin = curr[0];
        for (let j = 0; j < b.length; j++) {
            const cost = a[i] === b[j] ? 0 : 1;
            curr[j + 1] = Math.min(prev[j + 1] + 1, curr[j] + 1, prev[j] + cost);
            if (curr[j + 1] < rowMin) rowMin = curr[j + 1];
        }
        if (rowMin > max) return max + 1; // whole row already past budget
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

/**
 * Conservative typo budget by term length. Short terms demand an exact
 * (separator/accent-insensitive) match to avoid noisy false positives.
 */
function fuzzyThreshold(len: number): number {
    if (len < 4) return 0;
    if (len <= 6) return 1;
    return 2;
}

/** Recursively collect every string/number/boolean leaf into a flat list. */
function collectStrings(values: unknown[]): string[] {
    const out: string[] = [];
    const visit = (v: unknown): void => {
        if (v == null) return;
        if (typeof v === "string") {
            if (v) out.push(v);
            return;
        }
        if (typeof v === "number" || typeof v === "boolean") {
            out.push(String(v));
            return;
        }
        if (Array.isArray(v)) {
            v.forEach(visit);
            return;
        }
        if (typeof v === "object") {
            Object.values(v as Record<string, unknown>).forEach(visit);
        }
    };
    values.forEach(visit);
    return out;
}

interface Haystack {
    /** All searched text joined and stripped of separators — for substring hits. */
    stripped: string;
    /** Individual normalized words — for conservative typo tolerance. */
    words: string[];
}

/** A single query term matches when it is a (separator-insensitive) substring or a near-word. */
function termMatches(term: string, hay: Haystack, fuzzy: boolean): boolean {
    const needle = stripSeparators(term);
    if (!needle) return true; // punctuation-only term → ignore

    // 1. Separator/accent-insensitive substring ("ctm18" ⊂ "ctm18chospital...").
    if (hay.stripped.includes(needle)) return true;

    // 2. Conservative typo tolerance against individual words.
    if (!fuzzy) return false;
    const threshold = fuzzyThreshold(needle.length);
    if (threshold === 0) return false;

    return hay.words.some((word) => {
        if (Math.abs(word.length - needle.length) > threshold) return false;
        return levenshtein(word, needle, threshold) <= threshold;
    });
}

export interface MatchOptions {
    /** Enable conservative typo tolerance (default true). */
    fuzzy?: boolean;
}

/**
 * Test whether `query` matches the given set of field `values`. Values may be
 * primitives or nested objects/arrays — every string/number leaf is searched.
 *
 * `query` may arrive raw or pre-trimmed/lowercased; it is re-normalized here.
 */
export function matchesQuery(values: unknown[], query: string, opts: MatchOptions = {}): boolean {
    const terms = normalizeText(query.trim())
        .split(/\s+/)
        .filter(Boolean);
    if (!terms.length) return true;

    const strings = collectStrings(values);
    if (!strings.length) return false;

    const fuzzy = opts.fuzzy !== false;
    const blob = strings.join(" ");
    const hay: Haystack = {
        stripped: stripSeparators(blob),
        words: fuzzy ? toWords(blob) : [],
    };

    return terms.every((term) => termMatches(term, hay, fuzzy));
}
