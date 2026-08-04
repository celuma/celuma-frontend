import { test, expect } from "@playwright/test";

/**
 * Golden visual tests for the legacy report renderer (Céluma 1.3 Phase 2,
 * Block A / Story A2). Protects layout, margins, header, footer, page
 * breaks, and visible content that jsdom (report_preview_pages.test.tsx)
 * cannot verify because it has no real layout engine.
 *
 * Fixtures come from src/test/fixtures/reports (Phase 1, Workstream 5) —
 * anonymized, no real patient data. Do not edit fixtures to make a
 * screenshot pass; if behavior intentionally changes, update the fixture,
 * the unit tests, AND re-approve the snapshot together, explaining why.
 *
 * Snapshots are NEVER updated automatically. See README.md in this
 * directory for the explicit update command and review process.
 */

const CASES: Array<{ key: string; name: string; description: string }> = [
    {
        key: "draftSingleSampleNoImages",
        name: "report-short",
        description: "Short report — one sample, no images, draft",
    },
    {
        key: "longContentMultipage",
        name: "report-long-multipage",
        description: "Long content — forces real pagination across multiple pages",
    },
    {
        key: "publishedMultiSampleWithImages",
        name: "report-with-images-and-signature",
        description: "Multiple samples, image grid, required and completed digital signature",
    },
    {
        key: "emptyOptionalSections",
        name: "report-optional-sections-absent",
        description: "Empty or hidden optional sections",
    },
    {
        key: "legacyOldestStructure",
        name: "report-historic-fields-absent",
        description: "Historical report: no base_order/section_order or signatureMetadata",
    },
    {
        key: "specialCharactersAccents",
        name: "report-special-characters",
        description: "Accents and special symbols",
    },
];

for (const { key, name, description } of CASES) {
    test(`legacy renderer — ${description}`, async ({ page }) => {
        await page.goto(`/?fixture=${key}`);
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator("#pages-host")).toHaveScreenshot(`${name}.png`);
    });
}

// Dedicated case for the acceptance criterion "at least one visual test
// covers the current letterhead" — the institutional letterhead (A1-A7 in
// ambassador-hardcoding-inventory.md) is unconditional, so it is present on
// page 1 of every case above too, but this test names it explicitly.
test("legacy renderer — complete institutional letterhead (header + footer, page 1)", async ({ page }) => {
    await page.goto("/?fixture=draftSingleSampleNoImages");
    await page.waitForSelector('[data-ready="true"]');
    const firstPage = page.locator("#pages-host > div").first();
    await expect(firstPage).toHaveScreenshot("legacy-letterhead-page-1.png");
});
