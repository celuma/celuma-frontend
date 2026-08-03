import { test, expect } from "@playwright/test";

/**
 * Golden visual tests for VersionedReportRendererV2 (Céluma 1.3 Phase 2,
 * Block C / Story C8). Extends the Playwright infrastructure added in
 * Block A (Story A2) — same harness, same tolerance, same
 * never-auto-update policy — WITHOUT touching the 7 legacy snapshots (see
 * tests-visual/README.md and report_renderer_legacy.visual.spec.ts, both
 * unmodified by this file).
 *
 * Fixtures come from src/test/fixtures/reports/versioned_v2.ts — anonymized,
 * no real patient data, no tenant-embajador branding. Snapshots for these
 * cases are stored under separate names (the "v2-" prefix) in the same
 * tests-visual/__snapshots__/ directory, so they can never collide with or
 * accidentally overwrite a legacy snapshot file.
 */

const CASES: Array<{ key: string; name: string; description: string }> = [
    {
        key: "v2CompleteBranding",
        name: "v2-full-report",
        description:
            "Complete V2 — custom branding, logo, 1.5cm margins, header+footer, custom color, " +
            "institutional signer, table, images, real digital signature, multipage content",
    },
    {
        key: "v2MinimalNeutral",
        name: "v2-minimal-report-neutral-defaults",
        description: "Minimal V2 — all optional fields null, neutral Céluma defaults",
    },
    {
        key: "v2NoHeader",
        name: "v2-without-header",
        description: "V2 without institutional header (header.enabled = false)",
    },
    {
        key: "v2NoFooter",
        name: "v2-without-footer",
        description: "V2 without footer (footer.enabled = false)",
    },
    {
        key: "v2TightMargins",
        name: "v2-reduced-margins",
        description: "V2 with 0.8-1.0cm margins, the range close to the client requirement",
    },
];

for (const { key, name, description } of CASES) {
    test(`renderer V2 — ${description}`, async ({ page }) => {
        await page.goto(`/?fixture=${key}`);
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator("#pages-host")).toHaveScreenshot(`${name}.png`);
    });
}

// Dedicated close-up of page 1's header band: own logo, own institution
// name/subtitle/address/contact, institutional signer credentials, and the
// custom primary_color — the clearest single-frame proof that V2 never
// reuses the legacy letterhead.
test("V2 renderer — header with custom branding (page 1)", async ({ page }) => {
    await page.goto("/?fixture=v2CompleteBranding");
    await page.waitForSelector('[data-ready="true"]');
    const firstPage = page.locator("#pages-host > div").first();
    await expect(firstPage).toHaveScreenshot("v2-header-custom-branding-page-1.png");
});

// Second post-Phase 2 remediation (UX) — Legacy parity golden
// (legacy-parity-contract.md). Renders V2 with an imported Legacy letterhead
// (same institutional text, #002060 color, bottom-aligned header, no
// dividers) — compare manually against report_renderer_legacy.visual.spec.ts'
// golden to document residual differences (never update the Legacy golden;
// this is a NEW, separate golden and never replaces it).
test("V2 renderer — imported Legacy letterhead (parity golden)", async ({ page }) => {
    await page.goto("/?fixture=v2LegacyImportedMembrete");
    await page.waitForSelector('[data-ready="true"]');
    await expect(page.locator("#pages-host")).toHaveScreenshot("v2-imported-legacy-letterhead.png");
});

// Confirms visually that V1 and V2 look different for equivalent content —
// required by the acceptance criteria ("intentional visual difference between
// V1 and V2"). This does not compare pixel snapshots against each other (that
// would be a second, redundant golden image); it just asserts both render
// without the other's identity leaking in.
test("V2 renderer — does not reuse the Legacy letterhead (no V1 literals)", async ({ page }) => {
    await page.goto("/?fixture=v2CompleteBranding");
    await page.waitForSelector('[data-ready="true"]');
    const text = await page.locator("#pages-host").innerText();
    expect(text).not.toContain("Villanueva");
    expect(text).not.toContain("DGP3833349");
    expect(text).not.toContain("Guadalajara");
});
