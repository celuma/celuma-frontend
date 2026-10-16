import { describe, expect, it } from "vitest";
import {
    MAX_QUERY_LENGTH,
    MAX_TERMS,
    levenshtein,
    matchesQuery,
    normalizeText,
    parseSearchQuery,
    stripSeparators,
    validateSearchQuery,
} from "../../lib/search";
import { compareLabels } from "../../lib/sort";

// Regression coverage for Céluma 1.3 Phase 1 (Workstream 2 — UX validation of
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

describe("Levenshtein", () => {
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

// Céluma 1.4 (#7): identifier vs human-text matching. The same examples are
// asserted against the API's SQL half in celuma-backend
// tests/http/test_list_search_and_pagination.py, so both halves of the
// contract (celuma-engineering/specs/lists/search-and-pagination.md) agree.
describe("matchesQuery — identifiers are literal (Céluma 1.4, #7)", () => {
    it("a full code does not match its neighbours or another prefix", () => {
        for (const neighbour of ["CU276263", "CU276261", "CU276252", "CU276362", "CU276226", "BX276262", "CU999999"]) {
            expect(matchesQuery([neighbour], "CU276262")).toBe(false);
        }
        expect(matchesQuery(["CU276262"], "CU276262")).toBe(true);
    });

    it("a digit run matches the same digits under any prefix", () => {
        for (const code of ["CU276262", "BX276262", "IHQ276262"]) {
            expect(matchesQuery([code], "276262")).toBe(true);
        }
        expect(matchesQuery(["CU276263"], "276262")).toBe(false);
    });

    it("ignores case and separators inside an identifier", () => {
        expect(matchesQuery(["CU-011026"], "cu011026")).toBe(true);
        expect(matchesQuery(["cu011026"], "CU-011026")).toBe(true);
        expect(matchesQuery(["CU-011026"], "Cu.011026")).toBe(true);
        expect(matchesQuery(["CU-1001026"], "CU-011026")).toBe(false);
    });

    it("matches a partial identifier as a literal substring", () => {
        expect(matchesQuery(["CU276262"], "CU2762")).toBe(true);
        expect(matchesQuery(["CU276352"], "CU2762")).toBe(false);
    });

    it("never lets a term span two fields", () => {
        expect(matchesQuery(["CU2762", "62 Calle"], "CU276262")).toBe(false);
        expect(matchesQuery(["CU27626", "2"], "276262")).toBe(false);
    });

    it("never typo-corrects through a word that contains digits", () => {
        expect(matchesQuery(["lote5"], "lotes")).toBe(false);
    });
});

describe("matchesQuery — human text keeps accent and typo tolerance (Céluma 1.4, #7)", () => {
    it("matches names without accents, case or the exact spelling", () => {
        expect(matchesQuery(["Lorena Muñóz"], "munoz")).toBe(true);
        expect(matchesQuery(["Lorena Muñóz"], "MUÑOZ")).toBe(true);
        expect(matchesQuery(["Lorena Muñóz"], "munos")).toBe(true);
        expect(matchesQuery(["Biopsia"], "biosia")).toBe(true);
    });

    it("AND-matches text and identifier terms in different fields", () => {
        expect(matchesQuery(["BX276262", "Juan Pérez"], "perez 276262")).toBe(true);
        expect(matchesQuery(["CU276262", "Lorena Muñóz"], "perez 276262")).toBe(false);
    });
});

describe("parseSearchQuery", () => {
    it("classifies a term by the presence of a digit", () => {
        expect(parseSearchQuery("juan  P-12 cu-011026 Muñóz --")).toEqual([
            { kind: "text", value: "juan" },
            { kind: "identifier", value: "p12" },
            { kind: "identifier", value: "cu011026" },
            { kind: "text", value: "munoz" },
        ]);
    });
});

// Query limits (R1). These boundary cases mirror celuma-backend
// tests/test_list_search.py: the same query is accepted or rejected on both
// sides (the API with a 422), and an accepted query keeps every term.
describe("query limits — one contract with the API", () => {
    const EIGHT_WORDS = "uno dos tres cuatro cinco seis siete ocho";

    it.each([
        [EIGHT_WORDS, 8],
        [`${EIGHT_WORDS} -- ..`, 8], // punctuation-only terms do not count
        ["a".repeat(MAX_QUERY_LENGTH), 1],
        [`  ${"a".repeat(MAX_QUERY_LENGTH)}  `, 1], // surrounding whitespace does not count
        ["e\u0301".repeat(MAX_QUERY_LENGTH), 1], // counted after NFC: 200 "é", not 400 code units
    ])("accepts %j whole", (query, terms) => {
        expect(validateSearchQuery(query)).toBeNull();
        expect(parseSearchQuery(query)).toHaveLength(terms);
    });

    it.each([
        [`${EIGHT_WORDS} CU276262`, "too_many_terms", MAX_TERMS, 9],
        ["a".repeat(MAX_QUERY_LENGTH + 1), "too_long", MAX_QUERY_LENGTH, MAX_QUERY_LENGTH + 1],
        ["e\u0301".repeat(MAX_QUERY_LENGTH + 1), "too_long", MAX_QUERY_LENGTH, MAX_QUERY_LENGTH + 1],
    ])("rejects %j instead of shortening it", (query, reason, limit, actual) => {
        expect(validateSearchQuery(query)).toMatchObject({ reason, limit, actual });
        expect(validateSearchQuery(query)?.message).toMatch(/^Búsqueda no aplicada/);
    });

    it("never drops a term: the reported reproduction does not match", () => {
        // The API used to drop the ninth term and match; it now answers 422,
        // and the matcher applies every term.
        expect(matchesQuery([EIGHT_WORDS], `${EIGHT_WORDS} CU276262`)).toBe(false);
        expect(matchesQuery([EIGHT_WORDS], EIGHT_WORDS)).toBe(true);
    });

    it("keeps typo tolerance for long text terms", () => {
        const word = "abcdefghij".repeat(15); // 150 letters, budget 2
        const typo = `${word.slice(0, 70)}x${word.slice(71)}`;
        expect(matchesQuery([`Dr. ${word}`], typo)).toBe(true);
        // A much longer word is outside the term's budget, never an error.
        expect(matchesQuery(["z".repeat(300)], `y${"z".repeat(199)}`)).toBe(false);
    });
});

// R2: an accent may arrive precomposed (NFC, U+00E9) or decomposed (NFD,
// "e" + U+0301); both must behave as "perez" (backend: TestDecomposedAccents).
describe("precomposed and decomposed accents", () => {
    const NFC = "P\u00e9rez";
    const NFD = "Pe\u0301rez";

    it("normalize, match literally and match with a typo alike", () => {
        expect(normalizeText(NFC)).toBe(normalizeText(NFD));
        for (const value of [NFC, NFD]) {
            for (const query of ["perez", "peres", NFC, NFD]) {
                expect(matchesQuery([`Ana ${value}`], `ana ${query}`)).toBe(true);
            }
        }
    });

    it("sort alike in the client's label ordering", () => {
        expect(compareLabels(NFC, NFD)).toBe(0);
        expect([NFD, "Perfecto", NFC].sort(compareLabels).slice(0, 2).sort()).toEqual([NFC, NFD].sort());
    });
});
