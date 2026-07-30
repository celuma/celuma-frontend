import { test, expect } from "@playwright/test";

/**
 * Golden visual tests for the legacy report renderer (Céluma 1.3 Fase 2,
 * Bloque A / Historia A2). Protects layout, margins, header, footer, page
 * breaks, and visible content that jsdom (report_preview_pages.test.tsx)
 * cannot verify because it has no real layout engine.
 *
 * Fixtures come from src/test/fixtures/reports (Fase 1, Workstream 5) —
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
        name: "reporte-corto",
        description: "Reporte corto — una muestra, sin imágenes, borrador",
    },
    {
        key: "longContentMultipage",
        name: "reporte-largo-multipagina",
        description: "Contenido largo — fuerza paginación real en múltiples páginas",
    },
    {
        key: "publishedMultiSampleWithImages",
        name: "reporte-con-imagenes-y-firma",
        description: "Múltiples muestras, grid de imágenes, firma digital requerida y firmada",
    },
    {
        key: "emptyOptionalSections",
        name: "reporte-secciones-opcionales-ausentes",
        description: "Secciones opcionales vacías u ocultas",
    },
    {
        key: "legacyOldestStructure",
        name: "reporte-historico-campos-ausentes",
        description: "Reporte histórico: sin base_order/section_order, sin signatureMetadata",
    },
    {
        key: "specialCharactersAccents",
        name: "reporte-caracteres-especiales",
        description: "Acentos y símbolos especiales",
    },
];

for (const { key, name, description } of CASES) {
    test(`renderer legado — ${description}`, async ({ page }) => {
        await page.goto(`/?fixture=${key}`);
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator("#pages-host")).toHaveScreenshot(`${name}.png`);
    });
}

// Dedicated case for the acceptance criterion "existe al menos una prueba
// visual del membrete actual" — the institutional letterhead (A1-A7 in
// ambassador-hardcoding-inventory.md) is unconditional, so it is present on
// page 1 of every case above too, but this test names it explicitly.
test("renderer legado — membrete institucional completo (header + footer, página 1)", async ({ page }) => {
    await page.goto("/?fixture=draftSingleSampleNoImages");
    await page.waitForSelector('[data-ready="true"]');
    const firstPage = page.locator("#pages-host > div").first();
    await expect(firstPage).toHaveScreenshot("membrete-legado-pagina-1.png");
});
