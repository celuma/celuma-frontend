/**
 * Céluma 1.4 (#29): editor-only marks follow edits without drifting, and a
 * replacement is the smallest edit that keeps surrounding characters (and so
 * their formatting) untouched. Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { isMarkCurrent, markAt, markIndexFromCaret, minimalEdit, rebaseMarks, textWithReplacement } from "../../lib/spelling/marks";
import type { SpellingMark } from "../../lib/spelling/session";

const mark = (text: string, word: string, from = 0): SpellingMark => {
    const start = text.indexOf(word, from);
    return { start, end: start + word.length, word, key: word };
};

describe("rebaseMarks", () => {
    const text = "uno pacietne dos biopisa tres";
    const marks = [mark(text, "pacietne"), mark(text, "biopisa")];

    it("shifts marks after an insertion before them and keeps marks before an edit", () => {
        const next = "XX uno pacietne dos biopisa tres";
        expect(rebaseMarks(marks, text, next).map((m) => next.slice(m.start, m.end))).toEqual(["pacietne", "biopisa"]);
        const tail = `${text} cuatro`;
        expect(rebaseMarks(marks, text, tail)).toEqual(marks);
    });

    it("drops only the mark the edit touched (inside it or extending it)", () => {
        const inside = text.replace("pacietne", "pacitne");
        expect(rebaseMarks(marks, text, inside).map((m) => m.word)).toEqual(["biopisa"]);
        const extended = text.replace("pacietne", "pacietnes");
        expect(rebaseMarks(marks, text, extended).map((m) => m.word)).toEqual(["biopisa"]);
        const prefixed = text.replace("biopisa", "Xbiopisa");
        expect(rebaseMarks(marks, text, prefixed).map((m) => m.word)).toEqual(["pacietne"]);
    });

    it("keeps a mark when a separator is typed right after it", () => {
        const next = text.replace("pacietne ", "pacietne, ");
        const rebased = rebaseMarks(marks, text, next);
        expect(rebased.map((m) => next.slice(m.start, m.end))).toEqual(["pacietne", "biopisa"]);
    });

    it("works across astral characters inserted before a mark", () => {
        const next = `😀${text}`;
        expect(rebaseMarks(marks, text, next).map((m) => next.slice(m.start, m.end))).toEqual(["pacietne", "biopisa"]);
    });
});

describe("mark lookup", () => {
    const text = "aa pacietne bb biopisa";
    const marks = [mark(text, "pacietne"), mark(text, "biopisa")];
    it("finds the mark under or next to the caret", () => {
        expect(markAt(marks, 5)?.word).toBe("pacietne");
        expect(markAt(marks, 11)?.word).toBe("pacietne"); // caret right after the word
        expect(markAt(marks, 1)).toBeNull();
        expect(markIndexFromCaret(marks, 12)).toBe(1);
        expect(markIndexFromCaret(marks, 99)).toBe(0);
        expect(markIndexFromCaret([], 0)).toBe(-1);
    });

    it("revalidates the live word before a replacement", () => {
        expect(isMarkCurrent(text, marks[0])).toBe(true);
        expect(isMarkCurrent(text.replace("pacietne", "pacietnx"), marks[0])).toBe(false);
        expect(isMarkCurrent(text.replace("aa pacietne", "aapacietne "), marks[0])).toBe(false);
    });
});

describe("minimalEdit", () => {
    it("replaces only the differing middle", () => {
        expect(minimalEdit("pacietne", "paciente")).toEqual({ from: 5, to: 7, insert: "nt" });
        expect(minimalEdit("celulas", "células")).toEqual({ from: 1, to: 2, insert: "é" });
        expect(minimalEdit("pacientee", "paciente")).toEqual({ from: 8, to: 9, insert: "" });
    });

    it("never splits a base letter from its combining mark or a surrogate pair", () => {
        const nfd = "diagno\u0301stci";
        const edit = minimalEdit(nfd, "diagnóstico");
        expect(nfd.slice(0, edit.from) + edit.insert + nfd.slice(edit.to)).toBe("diagnóstico");
        expect(edit.from).toBeLessThanOrEqual(5);
        const astral = minimalEdit("a𝑥b", "a𝑦b");
        expect(astral).toEqual({ from: 1, to: 3, insert: "𝑦" });
    });

    it("builds the would-be field text for constraint checks", () => {
        const text = "Nota pacietne";
        expect(textWithReplacement(text, mark(text, "pacietne"), "paciente")).toBe("Nota paciente");
    });
});
