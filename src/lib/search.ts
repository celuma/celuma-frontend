/**
 * Céluma shared search engine.
 *
 * A single, normalized matcher shared by every list view through
 * `CelumaTable`, and the client half of the list search contract
 * (`celuma-engineering/specs/lists/search-and-pagination.md`). Server-paginated
 * lists apply the same contract in SQL (`app/services/list_search.py`), so a
 * query means the same thing whether a list is filtered here or on the API.
 *
 *  1. Accents/case: "Muñóz" matches "munoz".
 *  2. Separators/punctuation: "ctm18" matches "CTM-18", "CTM 18", "ctm.18".
 *  3. Identifiers are literal: a term containing a digit ("CU276262",
 *     "276262", "cu-011026") must appear as that exact character sequence
 *     (ignoring case, accents and separators) inside one field. It is never
 *     typo-corrected, so "CU276262" does not match its neighbour "CU276263".
 *  4. Human text tolerates typos (conservatively): a term without digits may
 *     also match a single digit-free word of a field within a small edit
 *     distance, e.g. "biosia" matches "Biopsia".
 *
 * Multi-word queries are AND-matched: "juan bio" requires both "juan" and "bio",
 * each in some field. A term is always matched inside one field value — never
 * across the boundary between two fields.
 *
 * Limits (identical on the API): at most MAX_QUERY_LENGTH characters and
 * MAX_TERMS terms. A longer query is never shortened — dropping a term would
 * widen an AND query — so lists check `validateSearchQuery` first and say the
 * search was not applied; the API answers 422.
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
export function fuzzyThreshold(len: number): number {
    if (len < 4) return 0;
    if (len <= 6) return 1;
    return 2;
}

/**
 * Query limits, identical in celuma-backend `app/services/list_search.py`.
 * Length counts Unicode code points of the NFC-normalized, trimmed query;
 * terms count what remains once punctuation-only terms are dropped. The length
 * limit also bounds typo tolerance (a term never exceeds 200 characters), so
 * there is no separate cap on fuzzy terms.
 */
export const MAX_QUERY_LENGTH = 200;
export const MAX_TERMS = 8;

export interface SearchQueryProblem {
    reason: "too_long" | "too_many_terms";
    limit: number;
    actual: number;
    /** User-facing explanation (Spanish), stating that the search was not applied. */
    message: string;
}

/** Characters counted against MAX_QUERY_LENGTH. */
export function searchQueryLength(query: string): number {
    return [...query.normalize("NFC").trim()].length;
}

/** Why `query` cannot be applied as a whole, or null when it can. */
export function validateSearchQuery(query: string): SearchQueryProblem | null {
    const length = searchQueryLength(query);
    if (length > MAX_QUERY_LENGTH) {
        return {
            reason: "too_long",
            limit: MAX_QUERY_LENGTH,
            actual: length,
            message: `Búsqueda no aplicada: admite hasta ${MAX_QUERY_LENGTH} caracteres y tiene ${length}.`,
        };
    }
    const terms = parseSearchQuery(query).length;
    if (terms > MAX_TERMS) {
        return {
            reason: "too_many_terms",
            limit: MAX_TERMS,
            actual: terms,
            message: `Búsqueda no aplicada: admite hasta ${MAX_TERMS} palabras y tiene ${terms}.`,
        };
    }
    return null;
}

/** How a query term is matched. See the module comment. */
export type SearchTermKind = "identifier" | "text";

export interface SearchTerm {
    kind: SearchTermKind;
    /** The term normalized and stripped of separators ("CU-011026" → "cu011026"). */
    value: string;
}

/**
 * Split a raw query into terms. Whitespace separates terms; separators inside
 * a term are ignored; punctuation-only terms are dropped. A term containing a
 * digit is an identifier, anything else is human text.
 */
export function parseSearchQuery(query: string): SearchTerm[] {
    return normalizeText(query.trim())
        .split(/\s+/)
        .map(stripSeparators)
        .filter(Boolean)
        .map((value) => ({ kind: /[0-9]/.test(value) ? "identifier" : "text", value }));
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

interface SearchField {
    /** The field normalized and stripped of separators — for literal substring hits. */
    stripped: string;
    /** The field's digit-free words — the only candidates for typo tolerance. */
    words: string[];
}

function termMatchesField(term: SearchTerm, field: SearchField, fuzzy: boolean): boolean {
    // 1. Separator/accent-insensitive substring of this one field.
    if (field.stripped.includes(term.value)) return true;

    // 2. Identifiers are literal: never typo-corrected. Text may be, against
    //    whole digit-free words only, so a code's digits never absorb an edit.
    if (!fuzzy || term.kind === "identifier") return false;
    const threshold = fuzzyThreshold(term.value.length);
    if (threshold === 0) return false;

    return field.words.some((word) => {
        if (Math.abs(word.length - term.value.length) > threshold) return false;
        return levenshtein(word, term.value, threshold) <= threshold;
    });
}

export interface MatchOptions {
    /** Enable conservative typo tolerance for text terms (default true). */
    fuzzy?: boolean;
}

/**
 * Test whether `query` matches the given set of field `values`. Values may be
 * primitives or nested objects/arrays — every string/number leaf is a field.
 *
 * `query` may arrive raw or pre-trimmed/lowercased; it is re-normalized here.
 * Every term is applied, whatever the query's size: limits are the caller's
 * to check with `validateSearchQuery` before matching.
 */
export function matchesQuery(values: unknown[], query: string, opts: MatchOptions = {}): boolean {
    const terms = parseSearchQuery(query);
    if (!terms.length) return true;

    const strings = collectStrings(values);
    if (!strings.length) return false;

    const fuzzy = opts.fuzzy !== false;
    const fields: SearchField[] = strings.map((value) => ({
        stripped: stripSeparators(value),
        words: fuzzy ? toWords(value).filter((word) => !/[0-9]/.test(word)) : [],
    }));

    return terms.every((term) => fields.some((field) => termMatchesField(term, field, fuzzy)));
}
