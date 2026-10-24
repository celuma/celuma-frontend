/**
 * Céluma 1.4 (#29 follow-up): lexical quality of the clinical spelling
 * supplement, measured on the synthetic corpus in
 * `fixtures/spelling_clinical_corpus.ts`. It shows BOTH directions the owner
 * asked for — fewer false alarms on legitimate terminology AND typos, accent
 * errors and ordinary upper-case misspellings still reported — and pins the
 * documented limits. A lexical checker is spelling assistance: nothing here
 * says a report is clinically or grammatically right.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import nspell from "nspell";
import { describe, expect, it } from "vitest";
import { accentVariants, editDistance, withinOneEdit } from "../../lib/spelling/engine";
import { findCheckableWords } from "../../lib/spelling/tokenize";
import {
    KNOWN_GAPS,
    KNOWN_UPSTREAM_ACCEPTED_WRONG_FORMS,
    MUST_STAY_WRONG,
    OWNER_EXAMPLES,
    VALID_FORMS,
    VALID_SENTENCES,
    WRONG_FORMS,
} from "../fixtures/spelling_clinical_corpus";
import { DICTIONARY_DIR, readDictionary, realEngine } from "./spelling_fixtures";

const engine = realEngine();
/** The first follow-up candidate: upstream dictionary only, no supplement, no engine rules. */
const upstream = nspell(readDictionary().aff, readFileSync(path.join(DICTIONARY_DIR, "es-MX.dic"), "utf8"));

describe("the owner's verified examples", () => {
    it("are accepted, in singular, plural and gender variants", () => {
        for (const w of OWNER_EXAMPLES) expect(engine.isCorrect(w), w).toBe(true);
        for (const w of ["histológico", "histológica", "histológicas", "inmunohistoquímico", "inmunohistoquímica", "inmunohistoquímicas"]) {
            expect(engine.isCorrect(w), w).toBe(true);
        }
    });

    it("were all rejected by the upstream dictionary alone (the reported defect)", () => {
        expect(OWNER_EXAMPLES.filter((w) => !upstream.correct(w))).toContain("negatividad");
        // `inmunohistoquímicos` and `histológicos` are covered by the supplement; none may be reported now.
        expect(OWNER_EXAMPLES.filter((w) => !engine.isCorrect(w))).toEqual([]);
    });

    it("keep accentless misspellings flagged, with the accented word first", () => {
        expect(engine.isCorrect("histologicos")).toBe(false);
        expect(engine.suggest("histologicos")[0]).toBe("histológicos");
        expect(engine.isCorrect("inmunohistoquimicos")).toBe(false);
        expect(engine.suggest("inmunohistoquimicos")[0]).toBe("inmunohistoquímicos");
        expect(engine.suggest("negatibidad")[0]).toBe("negatividad");
    });

    it("rank `células` first for `celulas` instead of `cellas`, `celular`", () => {
        expect(engine.suggest("celulas").slice(0, 3)).toEqual(["células", "cellas", "celular"]);
        expect(engine.suggest("histologicos")).not.toContain("hidrológicos");
    });
});

describe("valid terminology (false positives)", () => {
    it("is not reported", () => {
        expect(VALID_FORMS.filter((w) => !engine.isCorrect(w))).toEqual([]);
    });

    it("was reported by the upstream dictionary alone for about half the corpus", () => {
        const before = VALID_FORMS.filter((w) => !upstream.correct(w)).length;
        const after = VALID_FORMS.filter((w) => !engine.isCorrect(w)).length;
        expect(before / VALID_FORMS.length).toBeGreaterThan(0.4);
        expect(after).toBe(0);
    });

    it("no invented sentence of valid words produces an indication", () => {
        let before = 0;
        let total = 0;
        for (const sentence of VALID_SENTENCES) {
            const words = findCheckableWords(sentence);
            total += words.length;
            before += words.filter((w) => !upstream.correct(w.key)).length;
            expect(words.filter((w) => !engine.isCorrect(w.key)).map((w) => w.word), sentence).toEqual([]);
        }
        expect(total).toBeGreaterThan(100);
        expect(before).toBeGreaterThan(15);
    });

    it("accentless forms that are genuine words stay accepted (no contextual accent judgement)", () => {
        expect(engine.isCorrect("diagnostico")).toBe(true);
    });
});

describe("misspellings are still detected (false negatives)", () => {
    it.each(WRONG_FORMS.map((c) => [c.wrong, c.expected, c.rank ?? 1] as const))("%s is reported with %s in the first %i", (wrong, expected, rank) => {
        expect(engine.isCorrect(wrong)).toBe(false);
        expect(engine.suggest(wrong).slice(0, rank)).toContain(expected);
    });

    it("keeps rejecting the list of forms no lexicon should accept", () => {
        expect(MUST_STAY_WRONG.filter((w) => engine.isCorrect(w))).toEqual([]);
    });

    it("single-letter deletions and transpositions of valid words are almost never accepted", () => {
        const words = VALID_FORMS.filter((w) => w.length >= 7 && w === w.toLowerCase());
        const mutants = new Set<string>();
        for (const w of words) {
            for (let i = 0; i < w.length; i += 1) {
                mutants.add(w.slice(0, i) + w.slice(i + 1));
                if (i < w.length - 1) mutants.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
            }
        }
        const originals = new Set(VALID_FORMS);
        const probes = [...mutants].filter((m) => !originals.has(m));
        const acceptedBefore = probes.filter((m) => upstream.correct(m));
        const acceptedAfter = probes.filter((m) => engine.isCorrect(m));
        expect(probes.length).toBeGreaterThan(5000);
        // Some mutants are genuine words in their own right (`mitótica`); the engine rules add at most a handful.
        expect(acceptedAfter.length - acceptedBefore.length).toBeLessThanOrEqual(5);
        expect(acceptedAfter.length / probes.length).toBeLessThan(0.01);
    });

    it("documents what the supplement does not know yet and what upstream accepts", () => {
        for (const w of KNOWN_GAPS) expect(engine.isCorrect(w), w).toBe(false);
        for (const w of KNOWN_UPSTREAM_ACCEPTED_WRONG_FORMS) expect(engine.isCorrect(w), w).toBe(true);
    });
});

describe("combining forms", () => {
    it("accept a long correct word behind a listed form, and nothing short or misspelled", () => {
        for (const w of ["intravascular", "endocervical", "inmunosupresión"]) expect(engine.isCorrect(w), w).toBe(true);
        expect(engine.isCorrect("peritonal")).toBe(false); // peri + tonal: short look-alike
        expect(engine.isCorrect("endometro")).toBe(false); // endo + metro
        expect(engine.isCorrect("inmunoreactividad")).toBe(false); // vowel + r is written rr
        expect(engine.isCorrect("intravasculer")).toBe(false); // misspelled remainder
    });
});

describe("upper-case words", () => {
    it("reports ordinary upper-case typos but not reviewed acronyms or identifiers", () => {
        const flagged = (text: string) => findCheckableWords(text).filter((w) => !engine.isCorrect(w.key)).map((w) => w.word);
        expect(flagged("TUMRO CARCINOAM BIOPSAI")).toEqual(["TUMRO", "CARCINOAM", "BIOPSAI"]);
        expect(flagged("PAAF ASCUS HSIL IHQ PAS CU011026 Ki67 HER2/neu")).toEqual([]);
        expect(flagged("TUMOR BIOPSIA HISTOLÓGICOS")).toEqual([]);
    });

    it("treats an unknown 4–5 letter acronym as an acronym unless it is one edit from a word", () => {
        expect(engine.isCorrect("IMSS")).toBe(true);
        expect(engine.isCorrect("XQZW")).toBe(true);
        expect(engine.isCorrect("TUMRO")).toBe(false);
    });
});

describe("suggestion helpers", () => {
    it("accentVariants only moves the written accent", () => {
        expect(accentVariants("celulas")).toContain("células");
        expect(accentVariants("células")).not.toContain("células");
        expect(accentVariants("xyz")).toEqual([]);
    });

    it("withinOneEdit / editDistance", () => {
        expect(withinOneEdit("tumro", "tumor")).toBe(true);
        expect(withinOneEdit("tumro", "tumbo")).toBe(true);
        expect(withinOneEdit("tumro", "turbo")).toBe(false);
        expect(editDistance("celulas", "celular")).toBe(1);
        expect(editDistance("", "abc")).toBe(3);
    });

    it("returns at most the limit, never the word itself, no accent-only duplicates", () => {
        const list = engine.suggest("celulas", 3);
        expect(list).toHaveLength(3);
        expect(new Set(list).size).toBe(3);
        expect(list).not.toContain("celulas");
    });
});
