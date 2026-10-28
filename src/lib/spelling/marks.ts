import type { SpellingMark } from "./session";
import { isWordBoundary } from "./tokenize";

/**
 * Céluma 1.4 (#29) — pure helpers for editor-only spelling marks.
 *
 * Marks are computed for one revision of a field's text. Between a keystroke
 * and the next (debounced) check they are carried over to the new text so
 * underlines do not drift; a mark the edit touched is dropped instead of being
 * guessed, and the next check recomputes it.
 */

const WORD_CHAR = /[\p{L}\p{M}\p{N}'’]/u;

function charBefore(text: string, index: number): string {
    return index > 0 ? Array.from(text.slice(Math.max(0, index - 2), index)).pop() ?? "" : "";
}

function charAt(text: string, index: number): string {
    return Array.from(text.slice(index, index + 2))[0] ?? "";
}

/** Moves `marks` (computed on `oldText`) onto `newText`, dropping any mark the edit touched. */
export function rebaseMarks(marks: readonly SpellingMark[], oldText: string, newText: string): SpellingMark[] {
    if (oldText === newText) return [...marks];
    const max = Math.min(oldText.length, newText.length);
    let prefix = 0;
    while (prefix < max && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix += 1;
    let suffix = 0;
    while (
        suffix < max - prefix &&
        oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
    ) suffix += 1;
    const oldEditEnd = oldText.length - suffix;
    const delta = newText.length - oldText.length;
    const out: SpellingMark[] = [];
    for (const mark of marks) {
        if (mark.end <= prefix) {
            // Untouched unless the edit extended the word (typing right after it).
            if (mark.end === prefix && WORD_CHAR.test(charAt(newText, mark.end))) continue;
            out.push(mark);
        } else if (mark.start >= oldEditEnd) {
            const start = mark.start + delta;
            if (mark.start === oldEditEnd && WORD_CHAR.test(charBefore(newText, start))) continue;
            out.push({ ...mark, start, end: mark.end + delta });
        }
    }
    return out;
}

/** The mark that contains `offset` (inclusive of both ends, so a caret right after a word counts). */
export function markAt(marks: readonly SpellingMark[], offset: number): SpellingMark | null {
    return marks.find((m) => offset >= m.start && offset <= m.end) ?? null;
}

/** Index of the mark to open from a caret: the one under it, else the next one, else the first. */
export function markIndexFromCaret(marks: readonly SpellingMark[], caret: number | null): number {
    if (!marks.length) return -1;
    if (caret == null) return 0;
    const under = marks.findIndex((m) => caret >= m.start && caret <= m.end);
    if (under >= 0) return under;
    const next = marks.findIndex((m) => m.start >= caret);
    return next >= 0 ? next : 0;
}

/** Whether `text` still holds the mark's word, as a whole word, at the mark's offsets. */
export function isMarkCurrent(text: string, mark: SpellingMark): boolean {
    return text.slice(mark.start, mark.end) === mark.word && isWordBoundary(text, mark.start, mark.end);
}

/** Stable identity of a mark within one field revision. */
export function markId(mark: SpellingMark): string {
    return `${mark.start}:${mark.end}:${mark.word}`;
}

/**
 * The smallest edit turning `word` into `replacement`: characters shared at
 * both ends stay untouched, so their inline formatting and the caret logic of
 * the editor are preserved. Offsets are relative to the word.
 */
export function minimalEdit(word: string, replacement: string): { from: number; to: number; insert: string } {
    const max = Math.min(word.length, replacement.length);
    let prefix = 0;
    while (prefix < max && word.charCodeAt(prefix) === replacement.charCodeAt(prefix)) prefix += 1;
    let suffix = 0;
    while (
        suffix < max - prefix &&
        word.charCodeAt(word.length - 1 - suffix) === replacement.charCodeAt(replacement.length - 1 - suffix)
    ) suffix += 1;
    // Never split a surrogate pair or a base letter from its combining mark.
    while (prefix > 0 && /[\uDC00-\uDFFF\p{M}]/u.test(word[prefix] ?? "")) prefix -= 1;
    while (suffix > 0 && /[\uDC00-\uDFFF\p{M}]/u.test(word[word.length - suffix] ?? "")) suffix -= 1;
    return {
        from: prefix,
        to: word.length - suffix,
        insert: replacement.slice(prefix, replacement.length - suffix),
    };
}

/** The field text after replacing the mark's word, for constraint checks before applying. */
export function textWithReplacement(text: string, mark: SpellingMark, replacement: string): string {
    return text.slice(0, mark.start) + replacement + text.slice(mark.end);
}
