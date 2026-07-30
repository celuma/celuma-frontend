# Visual regression tests — legacy report renderer

Added in Céluma 1.3 Fase 2, Bloque A (Historia A2). Protects layout, margins,
header/footer, page breaks, and visible content of the report renderer using
a **real Chromium browser** via Playwright — `report_preview_pages.test.tsx`
(Vitest + jsdom) cannot protect this because jsdom has no layout engine
(`scrollHeight`/`clientHeight` are always 0 there).

## What this is

- `harness/` — an isolated React entry point, **not part of the production
  app** (own `index.html`, own `vite.harness.config.ts`), that renders one
  fixture from `src/test/fixtures/reports` through the current renderer
  (`ReportPreviewPages`, unmodified) based on a `?fixture=<key>` query param.
- `report_renderer_legacy.visual.spec.ts` — Playwright spec that loads the
  harness for each required case and screenshots the rendered pages.
- `__snapshots__/` — the approved golden images. **Committed to git.**

No real patient data: fixtures are the same anonymized, synthetic ones used
by the Vitest suite (Fase 1, Workstream 5).

## Running locally

```bash
npm run test:visual
```

This starts the harness dev server (`vite.harness.config.ts`, port 4174)
automatically via Playwright's `webServer` config, runs Chromium headless,
and compares against `__snapshots__/`. Tolerance is `maxDiffPixelRatio: 0.02`
(2%), set in `playwright.config.ts`, to absorb anti-aliasing/font-rendering
noise between runs without hiding a real layout regression.

If browsers aren't installed yet:

```bash
npx playwright install chromium
```

## Updating snapshots — explicit only, never automatic

Snapshots are **not** regenerated as a side effect of a normal test run. If
the legacy renderer's visual output changes intentionally:

```bash
npm run test:visual:update
```

Before running that command:

1. Confirm *why* the output changed (which code change, which case).
2. Confirm it was an intended change to `report_preview_pages.tsx` (or, after
   Historia A4, `legacy/legacy_report_renderer_v1.tsx`) — not an accidental
   regression.
3. Review the diff of the resulting PNGs, not just re-approve blindly.
4. Mention the change and its cause in the commit/PR description.

## Cases covered

| Case | Fixture | Protects |
|---|---|---|
| `reporte-corto` | `draftSingleSampleNoImages` | Short content, single sample, no images, draft |
| `reporte-largo-multipagina` | `longContentMultipage` | Real pagination into multiple physical pages |
| `reporte-con-imagenes-y-firma` | `publishedMultiSampleWithImages` | Image grid across samples + required/signed digital signature |
| `reporte-secciones-opcionales-ausentes` | `emptyOptionalSections` | Empty/hidden optional sections |
| `reporte-historico-campos-ausentes` | `legacyOldestStructure` | Oldest structure: no `base_order`/`section_order`, no `signatureMetadata` |
| `reporte-caracteres-especiales` | `specialCharactersAccents` | Accents and special symbols |
| `membrete-legado-pagina-1` | `draftSingleSampleNoImages` (page 1 only) | Institutional letterhead (A1–A7): header, footer, logo, color |

The letterhead is unconditional (renders on every report regardless of
tenant — see `ambassador-hardcoding-inventory.md`), so it is implicitly
covered by every case above; the last row names it explicitly per the
Fase 2 acceptance criteria.
