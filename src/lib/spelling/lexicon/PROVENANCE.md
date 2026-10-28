# Clinical spelling supplement — provenance

Céluma 1.4, celuma-engineering#29 (follow-up). The upstream dictionary in
`../dictionaries/es-MX` is **unmodified** (its checksums are enforced by
`src/test/lib/spelling_dictionary.test.ts`). This directory adds a separate,
reviewable supplement of Spanish medical / anatomical-pathology vocabulary that
is loaded in addition to it.

| File | Role | SHA-256 |
| --- | --- | --- |
| `clinical-es.lexicon` | **Source of truth**: reviewed entries, grouped in sections | `42447b9f083614cb7869a8ba0872112ee246fc3283b6cdbf5ec59ee437765f21` |
| `clinical-es.dic` | **Generated** Hunspell word list (`node scripts/build_clinical_lexicon.mjs`); never edited by hand | `0f00ea014a466cdb92cc5aab9efc97243519d3b33c1e0bf232d5422edbe9b941` |

`src/test/lib/spelling_clinical_lexicon.test.ts` regenerates the `.dic` from the
source and fails if the bytes differ, and fails if the checksums above are stale.

## What the entries are

- **Class R** — the three words Rafael supplied as correctly written
  (`inmunohistoquímico`, `histológico`, `negatividad`; their plural and gender
  forms follow from the flags).
- **Class T** — standard Spanish medical and anatomical-pathology vocabulary
  (processes and lesions, tumour entities, histology and cytology descriptors,
  cells and stains, anatomy, procedures and specimen processing, gross
  description, a few ALL-CAPS acronyms and proper names) listed by the change
  author for clinical reviewers.

**Status: a reviewable proposal, not a validated terminology.** The entries were
written by the change author (an AI assistant) from general knowledge of the
domain; no clinician has signed them off, and no entry was copied from a
report, a patient record, a licensed terminology or another dictionary. Reviewers
should check each section against, for example, the Real Academia Nacional de
Medicina *Diccionario de términos médicos*, the RAE *Diccionario de la lengua
española*, and WHO Classification of Tumours / ICD-O-3 Spanish usage — those are
suggested verification sources, **not** claimed provenance of any entry.

## Licence

The supplement is original work of the Céluma project and is distributed under
the same terms as the application source. It contains lexical items only (no
sentences, definitions or third-party text). Its affix flags (`G`, `S`) refer
to the upstream affix file and add nothing to it. The upstream data keeps its
own tri-licence (see `../dictionaries/es-MX/PROVENANCE.md`).

## Updating

1. Edit `clinical-es.lexicon` only: one entry per line (`term`, `term/S`,
   `term/GS`), inside a `## id | R|T | description` section. Letters only, NFC;
   a capitalised entry is a proper name. Add a corpus word (valid form and, where
   useful, a typical misspelling with its expected suggestion) to
   `src/test/fixtures/spelling_clinical_corpus.ts` in the same change.
2. Run `node scripts/build_clinical_lexicon.mjs`, copy the printed checksums into
   the table above, run the spelling unit tests.
3. A clinician reviews the diff. Never add generated vocabulary in bulk, patient
   or institution names, identifiers, or text copied from reports.

## Limits

A word list cannot judge context: it accepts a correctly spelled but wrong word
and every accentless form that is itself a Spanish word (`diagnostico`). A term
missing from the list is reported until added or ignored for the report. The
engine also accepts a closed list of Greek/Latin combining forms in front of a
long correct word, and treats unknown 4–5 letter ALL-CAPS tokens as acronyms
unless they are one edit from a real word (see `src/lib/spelling/engine.ts` and
`specs/reports/spelling.md`).
