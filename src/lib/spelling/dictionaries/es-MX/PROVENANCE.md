# es-MX spelling dictionary — provenance

These files back the local report-editor spelling assistance (Céluma 1.4,
celuma-engineering#29). They are served by the application build as hashed
same-origin static assets and are read only by the spelling worker.

| File | Origin (unmodified) | SHA-256 |
| --- | --- | --- |
| `es-MX.aff` | `index.aff` of `dictionary-es-mx@2.0.0` | `4dc9ddafc140e0fc27a40fe808ff3d77138e12bf3db5748832f03d780aadecfa` |
| `es-MX.dic` | `index.dic` of `dictionary-es-mx@2.0.0` | `bfb17f2e285505fbe7a2d8c1785906e7ed2cd7f6fd6182afb9d8ac0e7e16d202` |
| `license` | `license` of `dictionary-es-mx@2.0.0` (upstream notice, Spanish) | `6292642265f1e6e105550e1212c5931b9d106480a370868e95620faaa5848495` |

- **Package:** `dictionary-es-mx@2.0.0`, npm tarball
  `https://registry.npmjs.org/dictionary-es-mx/-/dictionary-es-mx-2.0.0.tgz`,
  integrity `sha512-EkRPJAgPhY55oMiHqwEBavOpokkvXlOO5jOdwZJmV/B6w9pGpJxlm7YorgHjiB2HqyPGW0FRcOoJRBTspTXUEA==`
  (tarball SHA-256 `89f26b9821ab0ebbca319c52ca875a87d8e2abbb56cae0f06c0940d51b5e54cd`).
- **Packaging project:** https://github.com/wooorm/dictionaries/tree/main/dictionaries/es-MX
  (its own code is MIT; that license does **not** cover the dictionary data).
- **Upstream data:** RLA-ES "Diccionario para corrección ortográfica en español",
  es_MX, version 2.8, by Santiago Bosio and contributors — https://github.com/sbosio/rla-es.
- **Dictionary license:** the affix file and word list are distributed by
  upstream under three disjoint alternatives — GNU GPL 3.0 or later, GNU LGPL
  3.0 or later, or MPL 1.1 or later (SPDX expression in the package:
  `GPL-3.0 OR LGPL-3.0 OR MPL-1.1`). See `license` in this directory, kept
  byte-for-byte.
- **Modifications:** none. Only the file names changed (`index.*` → `es-MX.*`).
  `src/test/lib/spelling_dictionary.test.ts` fails if the bytes differ from
  the checksums above.

The files are kept separate and unmodified so each alternative remains
available. Which alternative Céluma distributes them under, and whether the
full text of that license must accompany the deployed assets, is an owner
decision recorded in celuma-engineering ADR 0020; this file is not legal
advice.

## Updating

Replace both files from a newer pinned package version, update the table and
the test's expected checksums, re-run the spelling unit tests and the browser
suite, and record the change in the ADR. Never edit these upstream files by
hand. Clinical vocabulary the upstream data does not know lives in the separate,
reviewed supplement `../../lexicon/` (see its PROVENANCE.md); a term outside both
is handled with the per-report "Ignorar" action.
