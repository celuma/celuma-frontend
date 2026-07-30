import { describe, expect, it } from "vitest";
import { levenshtein, matchesQuery, normalizeText, stripSeparators } from "../../lib/search";

// Regression coverage for Céluma 1.3 Fase 1 (Workstream 2 — UX validation of
// search/filter/sort). This is the shared engine behind every list screen's
// search box (Patients, Orders, Studies, Price List, Requesting Physicians, ...).
// These tests protect current behavior; they do not change it.

describe("normalizeText", () => {
    it("lowercases and strips accents", () => {
        expect(normalizeText("Muñóz")).toBe("munoz");
        expect(normalizeText("Histopatología")).toBe("histopatologia");
        expect(normalizeText("PATOLOGÍA")).toBe("patologia");
    });
});

describe("stripSeparators", () => {
    it("removes punctuation/spaces after normalizing", () => {
        expect(stripSeparators("CTM-18")).toBe("ctm18");
        expect(stripSeparators("CTM 18")).toBe("ctm18");
        expect(stripSeparators("ctm.18")).toBe("ctm18");
    });
});

describe("levenshtein", () => {
    it("is 0 for identical strings", () => {
        expect(levenshtein("biopsia", "biopsia")).toBe(0);
    });

    it("counts single-character edits", () => {
        expect(levenshtein("biosia", "biopsia")).toBe(1);
    });

    it("respects the max short-circuit budget", () => {
        expect(levenshtein("abc", "xyz", 1)).toBeGreaterThan(1);
    });
});

describe("matchesQuery — free text over patient/study/price-list-like records", () => {
    const record = ["Histopatología", "HIST", "Estudio histopatológico"];

    it("matches case-insensitively", () => {
        expect(matchesQuery(record, "HISTOPATOLOGIA")).toBe(true);
        expect(matchesQuery(record, "histopatologia")).toBe(true);
    });

    it("matches without the accent present in the query", () => {
        expect(matchesQuery(record, "histopatologia")).toBe(true);
    });

    it("tolerates leading/trailing/duplicated whitespace", () => {
        expect(matchesQuery(record, "  histopatologia  ")).toBe(true);
        // multi-space splits into two AND-matched terms; both are still substrings, so this matches.
        expect(matchesQuery(record, "histo   patolog")).toBe(true);
    });

    it("matches on a partial value (substring)", () => {
        expect(matchesQuery(record, "histo")).toBe(true);
        expect(matchesQuery(record, "patolog")).toBe(true);
    });

    it("ignores separators/punctuation ('CTM-18' style codes)", () => {
        expect(matchesQuery(["CTM-18"], "ctm18")).toBe(true);
        expect(matchesQuery(["CTM-18"], "ctm 18")).toBe(true);
        expect(matchesQuery(["CTM-18"], "ctm.18")).toBe(true);
    });

    it("AND-matches multi-word queries across the whole record", () => {
        expect(matchesQuery(["Juan Garcia", "PAT-001"], "juan pat")).toBe(true);
        expect(matchesQuery(["Juan Garcia", "PAT-001"], "juan xyz")).toBe(false);
    });

    it("returns true for an empty/blank query (no filter applied)", () => {
        expect(matchesQuery(record, "")).toBe(true);
        expect(matchesQuery(record, "   ")).toBe(true);
    });

    it("returns false when nothing in the record has any text", () => {
        expect(matchesQuery([null, undefined, ""], "algo")).toBe(false);
    });

    it("tolerates a single conservative typo on longer words", () => {
        expect(matchesQuery(["Biopsia"], "biosia")).toBe(true); // 1 edit, len 7 -> threshold 2
    });

    it("does not typo-match short terms (<4 chars) or purely numeric terms", () => {
        expect(matchesQuery(["HIST"], "hst")).toBe(false); // 3-char term, threshold 0
        expect(matchesQuery(["1500"], "1600")).toBe(false); // numeric terms never fuzzy
    });

    it("respects fuzzy:false to require exact (separator-insensitive) matches only", () => {
        expect(matchesQuery(["Biopsia"], "biosia", { fuzzy: false })).toBe(false);
    });

    it("searches nested objects/arrays, not just top-level strings", () => {
        expect(matchesQuery([{ label: "Dr. Roberto Salas", tags: ["cardiología"] }], "cardiologia")).toBe(true);
    });
});
