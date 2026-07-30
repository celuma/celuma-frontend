import { defineConfig, devices } from "@playwright/test";

// Golden visual tests for the legacy report renderer (Céluma 1.3 Fase 2,
// Bloque A / Historia A2). Separate from vitest.config.ts: this drives a real
// Chromium browser against the isolated harness in tests-visual/harness
// (served by vite.harness.config.ts), because jsdom cannot protect real
// layout, page breaks, or pagination — see report_preview_pages.test.tsx for
// the jsdom-side coverage and its documented limitation.
//
// Run:      npm run test:visual
// Update snapshots (explicit, manual, only after reviewing *why* the visual
// output changed): npm run test:visual:update
export default defineConfig({
    testDir: "./tests-visual",
    snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: [["list"]],
    expect: {
        // Reasonable tolerance for anti-aliasing/font-rendering differences
        // between runs/platforms while still catching real layout regressions.
        toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
    },
    use: {
        baseURL: "http://127.0.0.1:4174",
        trace: "retain-on-failure",
    },
    webServer: {
        command: "npx vite --config vite.harness.config.ts",
        url: "http://127.0.0.1:4174",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
