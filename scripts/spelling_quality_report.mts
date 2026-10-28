// Céluma 1.4 (#29 follow-up) — reproducible lexical quality report.
//   node --experimental-strip-types --no-warnings scripts/spelling_quality_report.mts [out.json]
// Compares the first follow-up candidate (upstream dictionary alone) with the current engine
// (upstream + clinical supplement + engine rules) on the SYNTHETIC corpus in
// src/test/fixtures/spelling_clinical_corpus.ts. Pure computation: no network, no files besides
// the dictionaries and the optional output path.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSpellEngine } from "../src/lib/spelling/engine.ts";
import { findCheckableWords } from "../src/lib/spelling/tokenize.ts";
import {
    KNOWN_GAPS, KNOWN_UPSTREAM_ACCEPTED_WRONG_FORMS, MUST_STAY_WRONG, OWNER_EXAMPLES, VALID_FORMS, VALID_SENTENCES, WRONG_FORMS,
} from "../src/test/fixtures/spelling_clinical_corpus.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nspell = createRequire(path.join(root, "package.json"))("nspell");
const D = path.join(root, "src/lib/spelling");
const aff = readFileSync(path.join(D, "dictionaries/es-MX/es-MX.aff"), "utf8");
const dic = readFileSync(path.join(D, "dictionaries/es-MX/es-MX.dic"), "utf8");
const clinical = readFileSync(path.join(D, "lexicon/clinical-es.dic"), "utf8");
const upstream = nspell(aff, dic);
const engine = createSpellEngine(aff, dic, [clinical]);

const mutants = new Set<string>();
for (const w of VALID_FORMS.filter((x) => x.length >= 7 && x === x.toLowerCase())) {
    for (let i = 0; i < w.length; i += 1) {
        mutants.add(w.slice(0, i) + w.slice(i + 1));
        if (i < w.length - 1) mutants.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
    }
}
const probes = [...mutants].filter((m) => !VALID_FORMS.includes(m));

let sentenceWords = 0, sentenceBefore = 0, sentenceAfter = 0;
for (const sentence of VALID_SENTENCES) {
    const words = findCheckableWords(sentence);
    sentenceWords += words.length;
    sentenceBefore += words.filter((w) => !upstream.correct(w.key)).length;
    sentenceAfter += words.filter((w) => !engine.isCorrect(w.key)).length;
}

const rows = WRONG_FORMS.map((c) => {
    const before = upstream.suggest(c.wrong).slice(0, 5);
    const after = engine.suggest(c.wrong);
    return { wrong: c.wrong, expected: c.expected, flaggedBefore: !upstream.correct(c.wrong), flaggedAfter: !engine.isCorrect(c.wrong),
        rankBefore: before.indexOf(c.expected) + 1 || null, rankAfter: after.indexOf(c.expected) + 1 || null, suggestionsAfter: after };
});

const report = {
    corpus: { validForms: VALID_FORMS.length, wrongForms: WRONG_FORMS.length, sentences: VALID_SENTENCES.length, sentenceWords },
    ownerExamples: OWNER_EXAMPLES.map((w) => ({ word: w, acceptedBefore: upstream.correct(w), acceptedAfter: engine.isCorrect(w) })),
    falsePositives: {
        validFormsRejectedBefore: VALID_FORMS.filter((w) => !upstream.correct(w)).length,
        validFormsRejectedAfter: VALID_FORMS.filter((w) => !engine.isCorrect(w)).length,
        sentenceWordsFlaggedBefore: sentenceBefore,
        sentenceWordsFlaggedAfter: sentenceAfter,
    },
    detection: {
        wrongFormsFlaggedBefore: rows.filter((r) => r.flaggedBefore).length,
        wrongFormsFlaggedAfter: rows.filter((r) => r.flaggedAfter).length,
        mustStayWrongAccepted: MUST_STAY_WRONG.filter((w) => engine.isCorrect(w)),
        mutantProbes: probes.length,
        mutantsAcceptedBefore: probes.filter((m) => upstream.correct(m)).length,
        mutantsAcceptedAfter: probes.filter((m) => engine.isCorrect(m)).length,
    },
    suggestions: {
        expectedFirstBefore: rows.filter((r) => r.rankBefore === 1).length,
        expectedFirstAfter: rows.filter((r) => r.rankAfter === 1).length,
        expectedInTop5Before: rows.filter((r) => r.rankBefore).length,
        expectedInTop5After: rows.filter((r) => r.rankAfter).length,
        rows,
    },
    documentedLimits: {
        knownGapsStillRejected: KNOWN_GAPS.filter((w) => !engine.isCorrect(w)),
        upstreamAcceptedWrongForms: KNOWN_UPSTREAM_ACCEPTED_WRONG_FORMS.filter((w) => engine.isCorrect(w)),
    },
};
const text = JSON.stringify(report, null, 2);
if (process.argv[2]) writeFileSync(process.argv[2], `${text}\n`);
else console.log(text);
