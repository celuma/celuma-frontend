/**
 * Céluma 1.4 (#29) — which parts of a field's text are checked for spelling.
 *
 * Every offset is a UTF-16 index into the ORIGINAL string (the same unit as
 * `textarea.selectionStart`, DOM text-node offsets and Quill indexes), so a
 * word can be underlined and replaced exactly where it is. Unicode
 * normalization is applied only to the dictionary lookup key; the editor text
 * is never rewritten.
 *
 * Exclusions are deliberate and whole-token: a run that contains a digit
 * (`CU011026`, `Ki67`, `HER2/neu`, `pT1a`, `2.5`) or an underscore is an
 * identifier/code/number and is skipped entirely — its alphabetic fragments are
 * never checked. Runs with letters from another script (`β-catenina`, `µm`),
 * URLs and e-mail addresses are skipped too. Within an ordinary run, hyphens,
 * slashes and dots separate words (`teórico-práctico`, `y/o`), and these
 * segments are skipped: single letters, all-uppercase abbreviations of up to
 * three letters (`IHQ`, `PAS`), short unit-like words right after a number
 * (`3 mm`), and implausibly long tokens. Four- and five-letter ALL-CAPS tokens
 * (`PAAF`, `ASCUS`, but also a typo such as `TUMRO`) are NOT skipped here: the
 * engine accepts them as acronyms unless they are one edit away from a real
 * word. A skipped token is "not checked", never "correct".
 */

export interface CheckableWord {
    /** UTF-16 start offset in the original text (inclusive). */
    start: number;
    /** UTF-16 end offset in the original text (exclusive). */
    end: number;
    /** The word exactly as it appears in the text. */
    word: string;
    /** Dictionary lookup key: NFC-normalized, typographic apostrophe folded. */
    key: string;
}

/** Letters, combining marks and digits joined by in-word connectors. */
const RUN = /[\p{L}\p{M}\p{N}]+(?:['\u2019\-\u2010\u2011_./\u00B7][\p{L}\p{M}\p{N}]+)*/gu;
/** Characters that split a run into separately checked words (apostrophes stay in the word). */
const SEGMENT_SEPARATOR = /[-\u2010\u2011./\u00B7]/u;
const HAS_DIGIT = /\p{N}/u;
const NON_LATIN_LETTER = /(?![\p{Script=Latin}])\p{L}/u;
const URL_LIKE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;
const EMAIL_LIKE = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/gu;
/** A plain number (`3`, `2.5`, `1,5`) — not an identifier ending in digits — then at most one space. */
const NUMBER_BEFORE = /(?:^|[^\p{L}\p{M}\p{N}.,])\p{N}+(?:[.,]\p{N}+)?[\u0020\u00A0]?$/u;
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

/** Words with fewer letters than this are not checked (single letters, initials). */
export const MIN_WORD_LETTERS = 2;
/** All-uppercase words up to this many letters are treated as abbreviations (longer ones go to the engine's acronym rule). */
export const MAX_ACRONYM_LETTERS = 3;
/** Short words right after a number (`3 mm`, `10 cm`) are treated as units. */
export const MAX_UNIT_LETTERS = 3;
/** Longer tokens are treated as unusual input (pasted hashes, run-together text). */
export const MAX_WORD_LETTERS = 40;

/** Dictionary lookup key for a word as written. */
export function lookupKey(word: string): string {
    return word.normalize("NFC").replace(/\u2019/g, "'");
}

/** Key used for the session-scoped "ignore" list: case-insensitive. */
export function ignoreKey(word: string): string {
    return lookupKey(word).toLocaleLowerCase("es-MX");
}

function letterCount(word: string): number {
    let n = 0;
    for (const ch of word.normalize("NFC")) if (/\p{L}/u.test(ch)) n += 1;
    return n;
}

function isAllUppercase(word: string): boolean {
    return word === word.toLocaleUpperCase("es-MX") && word !== word.toLocaleLowerCase("es-MX");
}

function maskedRanges(text: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    for (const re of [URL_LIKE, EMAIL_LIKE]) {
        re.lastIndex = 0;
        for (let m = re.exec(text); m; m = re.exec(text)) ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
}

function overlaps(ranges: Array<[number, number]>, start: number, end: number): boolean {
    return ranges.some(([s, e]) => start < e && end > s);
}

/** Whether `text[start, end)` is a complete word (not part of a longer run of word characters). */
export function isWordBoundary(text: string, start: number, end: number): boolean {
    const before = start > 0 ? text.slice(Math.max(0, start - 2), start) : "";
    const after = text.slice(end, end + 2);
    const lastBefore = before ? Array.from(before).pop() ?? "" : "";
    const firstAfter = after ? Array.from(after)[0] ?? "" : "";
    return !(lastBefore && WORD_CHAR.test(lastBefore)) && !(firstAfter && WORD_CHAR.test(firstAfter));
}

/**
 * Finds the words of `text` that should be looked up in the dictionary.
 * Pure and synchronous; safe to run on every edit of a typical report field.
 */
export function findCheckableWords(text: string): CheckableWord[] {
    const words: CheckableWord[] = [];
    if (!text) return words;
    const masked = maskedRanges(text);
    RUN.lastIndex = 0;
    for (let m = RUN.exec(text); m; m = RUN.exec(text)) {
        const run = m[0];
        const runStart = m.index;
        const runEnd = runStart + run.length;
        if (HAS_DIGIT.test(run) || run.includes("_") || NON_LATIN_LETTER.test(run)) continue;
        if (masked.length && overlaps(masked, runStart, runEnd)) continue;

        let segStart = 0;
        for (let i = 0; i <= run.length; i += 1) {
            if (i < run.length && !SEGMENT_SEPARATOR.test(run[i])) continue;
            const segment = run.slice(segStart, i);
            const start = runStart + segStart;
            segStart = i + 1;
            if (!segment) continue;
            const letters = letterCount(segment);
            if (letters < MIN_WORD_LETTERS || letters > MAX_WORD_LETTERS) continue;
            if (letters <= MAX_ACRONYM_LETTERS && isAllUppercase(segment)) continue;
            if (letters <= MAX_UNIT_LETTERS && NUMBER_BEFORE.test(text.slice(Math.max(0, start - 24), start))) continue;
            words.push({ start, end: start + segment.length, word: segment, key: lookupKey(segment) });
        }
    }
    return words;
}
