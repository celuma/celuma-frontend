# tests-perf — report-editor typing latency (opt-in)

Céluma 1.4 (#29 follow-up). Measures trusted-keyboard input → value update → next
animation frame / presented frame in a real Chromium against the unmodified
`ReportEditor`, with synthetic API fixtures (no backend, no clinical data).

```
npm run test:perf                       # all scenarios, this machine as is
PERF_THROTTLE=4 PERF_ONLY=quill-typical,quill-many npm run test:perf
PERF_VARIANT=my-label PERF_OUT=/tmp/my.json PERF_CHROMIUM=/path/to/chrome npm run test:perf
```

Variables: `PERF_VARIANT` (label), `PERF_CHECKER` (`on`|`off`: whether the spelling
summary is awaited), `PERF_OUT` (JSON result path, default `.perf-results/`),
`PERF_THROTTLE` (CDP CPU throttling), `PERF_ONLY` (comma-separated scenario ids),
`PERF_KEYS`, `PERF_PORT`, `PERF_CHROMIUM` (executable, when Playwright's pinned
build is not installed). Output per scenario: key→frame and key→presented-frame
(CDP screencast) median/p95/max, long tasks and long animation frames, React
commits (profiling build), spelling-worker requests by type, cold vs warm keys,
a no-delay burst, an integrity check of the typed text and a CPU profile summary.

The build is unminified and uses `react-dom/profiling` (`vite.perf.config.ts`); the
harness under `tests-perf/harness/` is never part of the application. One run per
cell on one machine is evidence of where time goes, not a benchmark of any user's
computer. Output directories (`.perf-dist`, `.perf-results`) are git-ignored.
