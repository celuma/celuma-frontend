/**
 * Céluma 1.4 (#29): the real es-MX dictionary and engine, unmodified assets,
 * and the dictionary-format guard. Synthetic words only; no clinical
 * accuracy is implied by any expectation here.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DictionaryFormatError, createSpellEngine, validateDictionary } from "../../lib/spelling/engine";
import { lookupKey } from "../../lib/spelling/tokenize";
import { DICTIONARY_DIR, readDictionary, realEngine } from "./spelling_fixtures";

const sha256 = (file: string) => createHash("sha256").update(readFileSync(path.join(DICTIONARY_DIR, file))).digest("hex");

describe("vendored dictionary", () => {
    it("matches the checksums recorded in PROVENANCE.md (unmodified upstream bytes)", () => {
        const provenance = readFileSync(path.join(DICTIONARY_DIR, "PROVENANCE.md"), "utf8");
        for (const file of ["es-MX.aff", "es-MX.dic", "license"]) {
            const row = provenance.split("\n").find((line) => line.startsWith(`| \`${file}\``));
            expect(row, file).toBeDefined();
            expect(row).toContain(sha256(file));
        }
        expect(sha256("es-MX.aff")).toBe("4dc9ddafc140e0fc27a40fe808ff3d77138e12bf3db5748832f03d780aadecfa");
        expect(sha256("es-MX.dic")).toBe("bfb17f2e285505fbe7a2d8c1785906e7ed2cd7f6fd6182afb9d8ac0e7e16d202");
    });

    it("keeps the upstream tri-license notice", () => {
        const notice = readFileSync(path.join(DICTIONARY_DIR, "license"), "utf8");
        expect(notice).toContain("GNU GPL versión 3 o posterior");
        expect(notice).toContain("MPL versión 1.1 o posterior");
    });
});

describe("spell engine (nspell + es-MX)", () => {
    const engine = realEngine();

    it("flags a synthetic typo and suggests the dictionary word", () => {
        expect(engine.isCorrect("pacietne")).toBe(false);
        expect(engine.suggest("pacietne")).toContain("paciente");
    });

    it("accepts common words, accented and capitalized forms", () => {
        for (const w of ["paciente", "biopsia", "diagnóstico", "microscópica", "Biopsia", "BIOPSIA", "México"]) {
            expect(engine.isCorrect(w), w).toBe(true);
        }
    });

    it("needs NFC lookup keys: decomposed accents are only known after normalization", () => {
        const nfd = "diagno\u0301stico".normalize("NFD");
        expect(engine.isCorrect(nfd)).toBe(false);
        expect(engine.isCorrect(lookupKey(nfd))).toBe(true);
    });

    it("documents known limits: vocabulary beyond the supplement may be unknown, accentless forms may be valid", () => {
        // The clinical supplement (spelling_clinical_*.test.ts) covers adenocarcinoma; a term it lacks is still unknown.
        expect(engine.isCorrect("adenocarcinoma")).toBe(true);
        expect(engine.isCorrect("esplenomegalia")).toBe(false);
        expect(engine.suggest("esplenomegalia")).toEqual([]);
        // A dictionary cannot judge accents by context: both are words.
        expect(engine.isCorrect("diagnostico")).toBe(true);
    });

    it("caps suggestions and never suggests the word itself", () => {
        const s = engine.suggest("celulas");
        expect(s.length).toBeLessThanOrEqual(5);
        expect(s).toContain("células");
        expect(s).not.toContain("celulas");
        expect(engine.suggest("a".repeat(41))).toEqual([]);
    });
});

describe("dictionary format guard", () => {
    it("refuses an HTML document served in place of a missing asset", () => {
        const html = "<!doctype html><html><body><div id=\"root\"></div></body></html>";
        expect(() => validateDictionary(html, readDictionary().dic)).toThrow(DictionaryFormatError);
        expect(() => validateDictionary(readDictionary().aff, html)).toThrow(DictionaryFormatError);
        expect(() => createSpellEngine("", "")).toThrow(DictionaryFormatError);
    });
});
