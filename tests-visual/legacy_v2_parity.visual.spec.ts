import { test, expect } from "@playwright/test";

/**
 * Los cinco casos exigidos por §15. Se declaran aquí, y no se importan de
 * `src/test/fixtures/reports/legacy_v2_parity.ts`, porque ese módulo
 * importa el bitmap del logotipo Legacy: Vite lo resuelve dentro del
 * harness, pero el runner de Playwright (Node, sin Vite) no puede.
 * `legacy_v2_parity.ts` exporta la misma lista para el harness, y
 * `LEGACY_V2_PARITY_CASE_KEYS` de aquí debe mantenerse en sincronía —
 * cualquier desajuste hace fallar el `page.goto` con "Fixture desconocido".
 */
const LEGACY_V2_PARITY_CASES = [
    { key: "corto", description: "reporte corto sin imágenes" },
    { key: "secciones", description: "reporte con varias secciones" },
    { key: "imagenes", description: "reporte con imágenes" },
    { key: "firmado", description: "reporte firmado" },
    { key: "multipagina", description: "reporte multipágina" },
] as const;

/**
 * Cuarta remediación post-Fase 2 — PARIDAD VISUAL Legacy ↔ V2 (§15 y §16
 * del encargo).
 *
 * Esta suite no comprueba que un `.cell` importe bien, ni que existan
 * campos, ni que ambos rendericen "algo parecido". Renderiza el MISMO
 * contenido clínico dos veces —
 *
 *     LegacyReportRendererV1
 *     VersionedReportRendererV2 + membrete Legacy importado
 *
 * — y compara geometría medida y píxeles reales.
 *
 * Contrato con los goldens existentes:
 *   - NO toca `report_renderer_legacy.visual.spec.ts` ni sus 7 snapshots.
 *   - NO toca los 5 snapshots V2 históricos.
 *   - Sus propias líneas base viven bajo el prefijo `parity-` y son
 *     NUEVAS; nunca sustituyen a ninguna existente.
 *
 * Las diferencias residuales se documentan en legacy-dom-parity-report.md
 * con su recuento de píxeles y su motivo. Ver también
 * legacy_v2_pdf_parity.visual.spec.ts para la comparación en PDF.
 */

/**
 * Tolerancia EXACTA, a propósito. El objetivo de esta remediación no es
 * "parecerse mucho": es que el cliente embajador no perciba ningún cambio
 * visual no solicitado. `threshold: 0` desactiva incluso la tolerancia
 * por-píxel que Playwright aplica por defecto (0.2), así que estas pruebas
 * solo pasan si las dos capturas son idénticas bit a bit.
 *
 * Si alguna vez hubiera que relajarlo, la diferencia residual debe quedar
 * medida y justificada en legacy-dom-parity-report.md — nunca subida en
 * silencio para que el CI vuelva a verde.
 */
const MAX_DIFF_PIXEL_RATIO = 0;
const PER_PIXEL_THRESHOLD = 0;

interface PageGeometry {
    pageCount: number;
    pageWidth: number;
    pageHeight: number;
    bodyTop: number;
    bodyLeft: number;
    bodyWidth: number;
    bodyClientHeight: number;
    headerTop: number;
    headerHeight: number;
    footerBottomFromPage: number;
    footerHeight: number;
    text: string;
    perPageTextLengths: number[];
}

/**
 * Mide la geometría real de las páginas ya renderizadas. Es deliberadamente
 * independiente del DOM interno de cada renderer: localiza las bandas por
 * su posición (hijo absoluto pegado arriba / abajo) en vez de por clases o
 * ids, que Legacy y V2 no comparten.
 *
 * Las hojas se localizan por `width: 8.5in`, que es como AMBOS renderers
 * las crean. `#pages-host > div` no sirve: devuelve el envoltorio del
 * componente (que además contiene la fuente oculta de paginación), con lo
 * que todas las comparaciones pasarían por igualdad trivial.
 */
async function readGeometry(page: import("@playwright/test").Page): Promise<PageGeometry> {
    return page.evaluate(() => {
        const host = document.getElementById("pages-host")!;
        const pages = Array.from(document.querySelectorAll<HTMLElement>("#pages-host div")).filter(
            (el) => el.style.width === "8.5in",
        );
        const first = pages[0];
        const firstRect = first.getBoundingClientRect();

        const children = Array.from(first.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
        // El cuerpo es el único hijo con `overflow: hidden` y alto explícito
        // en px; las bandas se declaran en mm.
        const body = children.find((el) => el.style.overflow === "hidden" && el.style.height.endsWith("px"))!;
        const bodyRect = body.getBoundingClientRect();
        const bands = children.filter((el) => el !== body);
        const header = bands.find((el) => el.style.top !== "" && el.style.bottom === "");
        const footer = bands.find((el) => el.style.bottom !== "" && el.style.top === "");

        const round = (n: number) => Math.round(n * 100) / 100;

        return {
            pageCount: pages.length,
            pageWidth: round(firstRect.width),
            pageHeight: round(firstRect.height),
            bodyTop: round(bodyRect.top - firstRect.top),
            bodyLeft: round(bodyRect.left - firstRect.left),
            bodyWidth: round(bodyRect.width),
            bodyClientHeight: body.clientHeight,
            headerTop: header ? round(header.getBoundingClientRect().top - firstRect.top) : -1,
            headerHeight: header ? round(header.getBoundingClientRect().height) : -1,
            footerBottomFromPage: footer
                ? round(firstRect.bottom - footer.getBoundingClientRect().bottom)
                : -1,
            footerHeight: footer ? round(footer.getBoundingClientRect().height) : -1,
            text: (host.innerText || "").replace(/\s+/g, " ").trim(),
            perPageTextLengths: pages.map((p) => (p.innerText || "").replace(/\s+/g, " ").trim().length),
        };
    });
}

for (const { key, description } of LEGACY_V2_PARITY_CASES) {
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    const legacyFixture = `parity${capitalized}Legacy`;
    const v2Fixture = `parity${capitalized}V2`;

    test(`paridad Legacy ↔ V2 — ${description}: geometría y paginación`, async ({ page }) => {
        await page.goto(`/?fixture=${legacyFixture}`);
        await page.waitForSelector('[data-ready="true"]');
        const legacy = await readGeometry(page);

        await page.goto(`/?fixture=${v2Fixture}`);
        await page.waitForSelector('[data-ready="true"]');
        const v2 = await readGeometry(page);

        // Dimensiones físicas y márgenes del área de contenido.
        expect(v2.pageWidth).toBe(legacy.pageWidth);
        expect(v2.pageHeight).toBe(legacy.pageHeight);
        expect(v2.bodyLeft).toBe(legacy.bodyLeft);
        expect(v2.bodyWidth).toBe(legacy.bodyWidth);
        // Altura de las bandas y separación con el cuerpo. Éste es el
        // criterio que fallaba antes de conectar `height_mm`/`offset_mm`.
        expect(v2.headerTop).toBe(legacy.headerTop);
        expect(v2.headerHeight).toBe(legacy.headerHeight);
        expect(v2.footerBottomFromPage).toBe(legacy.footerBottomFromPage);
        expect(v2.footerHeight).toBe(legacy.footerHeight);
        // Área paginable: si difiere aunque sea 1px, los saltos de página
        // pueden divergir en reportes largos.
        expect(v2.bodyTop).toBe(legacy.bodyTop);
        expect(v2.bodyClientHeight).toBe(legacy.bodyClientHeight);
        // Paginación: mismo número de páginas y mismo reparto de texto.
        expect(v2.pageCount).toBe(legacy.pageCount);
        expect(v2.perPageTextLengths).toEqual(legacy.perPageTextLengths);
    });

    test(`paridad Legacy ↔ V2 — ${description}: píxeles (V2 contra el golden Legacy del caso)`, async ({ page }) => {
        // Primero se fija la línea base a partir de Legacy...
        await page.goto(`/?fixture=${legacyFixture}`);
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator("#pages-host")).toHaveScreenshot(`parity-${key}-legacy.png`, {
            maxDiffPixelRatio: 0,
            threshold: PER_PIXEL_THRESHOLD,
        });

        // ...y después se compara V2 CONTRA ESA MISMA imagen. No es un
        // golden propio de V2: si V2 se desvía de Legacy, esto falla.
        await page.goto(`/?fixture=${v2Fixture}`);
        await page.waitForSelector('[data-ready="true"]');
        await expect(page.locator("#pages-host")).toHaveScreenshot(`parity-${key}-legacy.png`, {
            maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
            threshold: PER_PIXEL_THRESHOLD,
        });
    });
}

// El encabezado es donde vivían dos de las diferencias reportadas (caja de
// logo reservada e isotipo neutral). Una aserción explícita sobre el DOM,
// además del píxel, deja constancia de la causa si alguna vez reaparece.
test("paridad Legacy ↔ V2 — el encabezado V2 con membrete Legacy no contiene ninguna imagen", async ({ page }) => {
    await page.goto("/?fixture=parityCortoV2");
    await page.waitForSelector('[data-ready="true"]');
    const headerImages = await page.evaluate(() => {
        const first = Array.from(document.querySelectorAll<HTMLElement>("#pages-host div")).filter(
            (el) => el.style.width === "8.5in",
        )[0];
        const children = Array.from(first.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
        const header = children.find((el) => el.style.top !== "" && el.style.bottom === "");
        return header ? header.querySelectorAll("img").length : -1;
    });
    expect(headerImages).toBe(0);
});

test("paridad Legacy ↔ V2 — el pie V2 con membrete Legacy sí contiene el logotipo", async ({ page }) => {
    await page.goto("/?fixture=parityCortoV2");
    await page.waitForSelector('[data-ready="true"]');
    const footerImages = await page.evaluate(() => {
        const first = Array.from(document.querySelectorAll<HTMLElement>("#pages-host div")).filter(
            (el) => el.style.width === "8.5in",
        )[0];
        const children = Array.from(first.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
        const footer = children.find((el) => el.style.bottom !== "" && el.style.top === "");
        return footer ? footer.querySelectorAll("img").length : -1;
    });
    expect(footerImages).toBe(1);
});

// Legacy nunca imprimió número de página; el membrete Legacy debe
// reproducir esa ausencia.
test("paridad Legacy ↔ V2 — el membrete Legacy no imprime numeración de página", async ({ page }) => {
    await page.goto("/?fixture=parityMultipaginaV2");
    await page.waitForSelector('[data-ready="true"]');
    const text = await page.locator("#pages-host").innerText();
    expect(text).not.toMatch(/Página \d+ de \d+/);
});
