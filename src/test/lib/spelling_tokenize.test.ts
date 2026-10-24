/**
 * Céluma 1.4 (#29): which tokens are checked and at which UTF-16 offsets.
 * Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { findCheckableWords, ignoreKey, isWordBoundary, lookupKey } from "../../lib/spelling/tokenize";

const words = (text: string) => findCheckableWords(text).map((w) => w.word);

describe("findCheckableWords", () => {
    it("returns original UTF-16 offsets that slice back to the word", () => {
        const text = "Biopsia de piel: pacietne con lesión.";
        for (const w of findCheckableWords(text)) expect(text.slice(w.start, w.end)).toBe(w.word);
        expect(words(text)).toEqual(["Biopsia", "de", "piel", "pacietne", "con", "lesión"]);
    });

    it("keeps offsets exact after astral characters and with combining marks", () => {
        const nfd = "diagno\u0301stico";
        const text = `😀 𝑥 ${nfd} pacietne`;
        const found = findCheckableWords(text);
        const diag = found.find((w) => w.word === nfd)!;
        expect(text.slice(diag.start, diag.end)).toBe(nfd);
        // Lookup key is NFC; the stored word and its offsets stay exactly as written.
        expect(diag.key).toBe("diagnóstico");
        expect(diag.key).not.toBe(diag.word);
        const typo = found.find((w) => w.word === "pacietne")!;
        expect(typo.start).toBe(text.indexOf("pacietne"));
        // The emoji is not a letter and the mathematical italic x is a single letter.
        expect(found.map((w) => w.word)).toEqual([nfd, "pacietne"]);
    });

    it("skips whole identifier, code and numeric tokens instead of checking fragments", () => {
        const text = "Caso CU011026 con Ki67, Ki-67, HER2/neu, pT1a, 2.5 y CD3/CD20 en muestra_01.";
        expect(words(text)).toEqual(["Caso", "con", "en"]);
    });

    it("skips acronyms, units after numbers, single letters, URLs, e-mail and other scripts", () => {
        const text =
            "PAAF e IHQ: mide 3 mm y 2 cm; ver https://ejemplo.mx/caso o soporte@ejemplo.mx; β-catenina y 5 µm.";
        expect(words(text)).toEqual(["mide", "ver"]);
    });

    it("checks longer uppercase words and splits compounds joined by hyphens or slashes", () => {
        expect(words("BIOPSIA teórico-práctico y/o pieza")).toEqual(["BIOPSIA", "teórico", "práctico", "pieza"]);
    });

    it("treats an apostrophe inside a word as part of it and folds the typographic one", () => {
        const [w] = findCheckableWords("O’Higgins");
        expect(w.word).toBe("O’Higgins");
        expect(w.key).toBe("O'Higgins");
    });

    it("ignores implausibly long tokens rather than judging them", () => {
        expect(words(`texto ${"a".repeat(41)} final`)).toEqual(["texto", "final"]);
    });
});

describe("keys and boundaries", () => {
    it("lookup keys keep case; ignore keys are case-insensitive", () => {
        expect(lookupKey("México")).toBe("México");
        expect(ignoreKey("ADENOCARCINOMA")).toBe(ignoreKey("adenocarcinoma"));
    });

    it("detects whether a range is still a whole word", () => {
        const text = "pacietnes pacietne";
        expect(isWordBoundary(text, 0, 8)).toBe(false);
        expect(isWordBoundary(text, 10, 18)).toBe(true);
    });
});
