import { test, expect } from "@playwright/test";

/**
 * Golden visual tests for VersionedReportRendererV2 (Céluma 1.3 Fase 2,
 * Bloque C / Historia C8). Extends the Playwright infrastructure added in
 * Bloque A (Historia A2) — same harness, same tolerance, same
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
        name: "v2-reporte-completo",
        description:
            "V2 completo — branding propio, logo, márgenes 1.5cm, header+footer, color personalizado, " +
            "firmante institucional, tabla, imágenes, firma digital real, contenido multipágina",
    },
    {
        key: "v2MinimalNeutral",
        name: "v2-reporte-minimo-defaults-neutrales",
        description: "V2 mínimo — todos los campos opcionales en null, defaults neutrales de Céluma",
    },
    {
        key: "v2NoHeader",
        name: "v2-sin-header",
        description: "V2 sin encabezado institucional (header.enabled = false)",
    },
    {
        key: "v2NoFooter",
        name: "v2-sin-footer",
        description: "V2 sin pie de página (footer.enabled = false)",
    },
    {
        key: "v2TightMargins",
        name: "v2-margenes-reducidos",
        description: "V2 con márgenes de 0.8-1.0cm, el rango cercano al requerimiento reportado por el cliente",
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
test("renderer V2 — encabezado con branding propio (página 1)", async ({ page }) => {
    await page.goto("/?fixture=v2CompleteBranding");
    await page.waitForSelector('[data-ready="true"]');
    const firstPage = page.locator("#pages-host > div").first();
    await expect(firstPage).toHaveScreenshot("v2-encabezado-branding-propio-pagina-1.png");
});

// Segunda remediación post-Fase 2 (UX) — golden de paridad Legacy
// (legacy-parity-contract.md). Renderiza V2 con un membrete que reproduce
// el membrete Legacy importado (mismo texto institucional, color #002060,
// header alineado al fondo, sin divisores) — comparar manualmente contra
// report_renderer_legacy.visual.spec.ts's golden para documentar las
// diferencias residuales (nunca actualizar el golden Legacy; este es un
// golden NUEVO y separado, nunca lo reemplaza).
test("renderer V2 — membrete Legacy importado (golden de paridad)", async ({ page }) => {
    await page.goto("/?fixture=v2LegacyImportedMembrete");
    await page.waitForSelector('[data-ready="true"]');
    await expect(page.locator("#pages-host")).toHaveScreenshot("v2-membrete-legacy-importado.png");
});

// Confirms visually that V1 and V2 look different for equivalent content —
// required by the acceptance criteria ("diferencia visual intencional entre
// V1 y V2"). This does not compare pixel snapshots against each other (that
// would be a second, redundant golden image); it just asserts both render
// without the other's identity leaking in.
test("renderer V2 — no reutiliza el membrete legado (ausencia de literales V1)", async ({ page }) => {
    await page.goto("/?fixture=v2CompleteBranding");
    await page.waitForSelector('[data-ready="true"]');
    const text = await page.locator("#pages-host").innerText();
    expect(text).not.toContain("Villanueva");
    expect(text).not.toContain("DGP3833349");
    expect(text).not.toContain("Guadalajara");
});
