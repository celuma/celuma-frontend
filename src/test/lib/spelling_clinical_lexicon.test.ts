/**
 * Céluma 1.4 (#29 follow-up): the clinical lexicon source, its generated
 * Hunspell supplement and their provenance record. The upstream dictionary is
 * checked by spelling_dictionary.test.ts and must stay byte-identical.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lexiconStats, parseLexicon, renderDic } from "../../../scripts/clinical_lexicon.mjs";
import { LEXICON_DIR, readDictionary, realEngine } from "./spelling_fixtures";

const read = (file: string) => readFileSync(path.join(LEXICON_DIR, file), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const source = read("clinical-es.lexicon");
const sections = parseLexicon(source);

describe("clinical lexicon source", () => {
    it("generates exactly the committed clinical-es.dic (never hand-edited)", () => {
        expect(renderDic(sections)).toBe(read("clinical-es.dic"));
    });

    it("matches the checksums recorded in PROVENANCE.md", () => {
        const provenance = read("PROVENANCE.md");
        expect(provenance).toContain(sha256(source));
        expect(provenance).toContain(sha256(read("clinical-es.dic")));
    });

    it("is a bounded, reviewable list of lexical items only", () => {
        const entries = sections.flatMap((s) => s.entries);
        expect(entries.length).toBeGreaterThan(500);
        expect(entries.length).toBeLessThan(5000);
        for (const { lemma, flags } of entries) {
            expect(lemma, lemma).toMatch(/^\p{L}+$/u);
            expect(lemma).toBe(lemma.normalize("NFC"));
            expect(flags).toMatch(/^[GS]*$/);
        }
        expect(new Set(entries.map((e) => e.lemma)).size).toBe(entries.length);
        expect(sections.every((s) => s.cls === "R" || s.cls === "T")).toBe(true);
        expect(lexiconStats(sections).reduce((n, s) => n + s.entries, 0)).toBe(entries.length);
    });

    it("keeps the owner's reviewed words in their own class-R section", () => {
        const owner = sections.find((s) => s.cls === "R")!;
        expect(owner.entries.map((e) => e.lemma).sort()).toEqual(["histológico", "inmunohistoquímico", "negatividad"]);
    });

    it("rejects malformed sources instead of guessing", () => {
        expect(() => parseLexicon("palabra")).toThrow(/before the first section/);
        expect(() => parseLexicon("## a | X | d\npalabra")).toThrow(/section must be/);
        expect(() => parseLexicon("## a | T | d\nHER2")).toThrow(/not a lexical entry/);
        expect(() => parseLexicon("## a | T | d\npalabra/Q")).toThrow(/unsupported flag/);
        expect(() => parseLexicon("## a | T | d\npalabra\npalabra/S")).toThrow(/duplicate/);
        expect(() => parseLexicon("## a | T | d\nhistológico")).toThrow(/NFC/);
    });

    it("contains no patient-style data: digits, e-mail, long strings", () => {
        expect(source).not.toMatch(/\d{3,}|@|https?:/);
    });
});

describe("how the supplement is applied", () => {
    it("loads against the unmodified upstream affix file (same flags: gender and number follow upstream rules)", () => {
        const engine = realEngine();
        for (const w of ["histológico", "histológica", "histológicos", "histológicas", "cérvix", "cérvices", "negatividad", "negatividades"]) {
            expect(engine.isCorrect(w), w).toBe(true);
        }
        expect(readDictionary().extra).toHaveLength(1);
    });
});
