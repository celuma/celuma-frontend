import { test, expect } from "@playwright/test";

/**
 * Céluma 1.3 Phase 2, Block E, Story E17: real-browser coverage for the
 * InternalReportRender route (the one the backend's headless Chromium
 * navigates to for official PDF generation) — distinct from
 * report_renderer_legacy/versioned_v2.visual.spec.ts, which cover the
 * editor/detail preview's ReportRendererResolver directly.
 *
 * The core regression this guards: the app chrome InternalReportRender
 * mounts through (ConfigProvider/AntApp/index.css — see main.tsx) leaked a
 * few px of top spacing onto this otherwise chrome-free route. Invisible
 * next to normal page chrome elsewhere, it was just enough extra height to
 * make an exact-N-page report spill onto a genuine, blank N+1th physical
 * page when Chromium paginates for page.pdf() — confirmed against a real
 * headless Chromium instance during Story E13 manual validation, fixed
 * in internal_report_render.tsx by measuring and cancelling the offset at
 * runtime. The precise invariant that bug violated, and this test checks
 * directly: total rendered content height must be an exact multiple of one
 * physical page (1056px at 96dpi / Letter), never N pages plus a sliver.
 *
 * window.fetch is stubbed by the harness (tests-visual/harness/main.tsx) to
 * answer the render-data request with a fixture — no backend involved.
 */

const PAGE_HEIGHT_PX = 1056; // 11in at 96dpi

const CASES: Array<{ key: string; name: string; expectedPages: number }> = [
    { key: "draftSingleSampleNoImages", name: "internal-render-legacy-short", expectedPages: 1 },
    { key: "longContentMultipage", name: "internal-render-legacy-long", expectedPages: 2 },
    { key: "v2CompleteBranding", name: "internal-render-v2-branding", expectedPages: 2 },
];

for (const { key, name, expectedPages } of CASES) {
    test(`internal render route — ${key} — no phantom trailing page`, async ({ page }) => {
        await page.goto(`/?internal_render=1&fixture=${key}`);
        await page.waitForSelector('html[data-report-ready="true"]', { timeout: 15000 });

        const host = page.locator("#report-render-host");
        await expect(host).toBeVisible();

        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        expect(bodyHeight, `expected an exact multiple of ${PAGE_HEIGHT_PX}px, got ${bodyHeight}px`).toBe(
            PAGE_HEIGHT_PX * expectedPages,
        );

        await expect(host).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.02 });
    });
}
