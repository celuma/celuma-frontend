import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Cuarta remediación post-Fase 2 — PARIDAD EN PDF Legacy ↔ V2 (§16 del
 * encargo).
 *
 * `legacy_v2_parity.visual.spec.ts` prueba el DOM en pantalla. Esta suite
 * prueba el ARTEFACTO: genera dos PDFs por la MISMA vía que el backend
 * (`/internal/report-render/...`, `html[data-report-ready="true"]`,
 * `page.pdf({ preferCSSPageSize, printBackground })` — ver
 * `celuma-backend/app/services/report_pdf_generation.py::_render_pdf`) y
 * compara:
 *
 *   - número de páginas;
 *   - tamaño físico de cada página (MediaBox);
 *   - ausencia de página en blanco;
 *   - contenido completo (texto extraído, página por página);
 *   - firma incluida;
 *   - logotipos (imágenes incrustadas);
 *   - y, rasterizando cada página a mapa de bits, los PÍXELES.
 *
 * Ninguno de estos PDFs es un artefacto oficial: se generan en un
 * directorio temporal y se borran. Esta suite no toca almacenamiento,
 * hashes ni ningún PDF ya persistido.
 */

const CASES = [
    { key: "corto", description: "reporte corto sin imágenes" },
    { key: "secciones", description: "reporte con varias secciones" },
    { key: "imagenes", description: "reporte con imágenes" },
    { key: "firmado", description: "reporte firmado" },
    { key: "multipagina", description: "reporte multipágina" },
] as const;

/** Escala de rasterizado. 2 ≈ 144 dpi: suficiente para que un
 *  desplazamiento de medio milímetro sea visible, sin hacer las pruebas
 *  lentas. */
const RASTER_SCALE = 2;

/** Igual que en la paridad DOM: tolerancia cero, y cualquier diferencia
 *  residual se documenta en legacy-pdf-parity-report.md en vez de subir
 *  este número. */
const MAX_DIFF_PIXEL_RATIO = 0;

async function renderPdf(page: Page, fixture: string): Promise<Buffer> {
    await page.goto(`/?internal_render=1&fixture=${fixture}`);
    // Mismo selector que espera el generador oficial.
    await page.waitForSelector('html[data-report-ready="true"]', { state: "attached", timeout: 30_000 });
    return page.pdf({ preferCSSPageSize: true, printBackground: true });
}

interface PdfFacts {
    pageCount: number;
    mediaBoxes: string[];
    imageCount: number;
    perPageText: string[];
}

/**
 * Hechos del PDF leídos con pdf.js — el mismo motor que usa Chromium para
 * mostrar PDFs, así que "lo que dice pdf.js" es lo que verá el usuario al
 * abrir el archivo.
 */
async function readPdfFacts(bytes: Buffer): Promise<PdfFacts> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: true,
    }).promise;

    const mediaBoxes: string[] = [];
    const perPageText: string[] = [];
    let imageCount = 0;

    for (let i = 1; i <= doc.numPages; i += 1) {
        const p = await doc.getPage(i);
        const vp = p.getViewport({ scale: 1 });
        mediaBoxes.push(`${Math.round(vp.width)}x${Math.round(vp.height)}`);
        const content = await p.getTextContent();
        perPageText.push(
            content.items
                .map((it) => ("str" in it ? it.str : ""))
                .join(" ")
                .replace(/\s+/g, " ")
                .trim(),
        );
        const ops = await p.getOperatorList();
        imageCount += ops.fnArray.filter(
            (fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject,
        ).length;
    }

    await doc.cleanup();
    return { pageCount: doc.numPages, mediaBoxes, imageCount, perPageText };
}

/**
 * Rasteriza cada página a RGBA.
 *
 * `@napi-rs/canvas` no se elige por gusto: es el backend de lienzo que la
 * propia `NodeCanvasFactory` de pdf.js carga cuando se ejecuta fuera del
 * navegador (ver `pdfjs-dist/legacy/build/pdf.mjs`). Con él instalado,
 * pdf.js crea por su cuenta los lienzos auxiliares que necesita para
 * máscaras suaves y grupos de transparencia; sin él, la primera figura con
 * máscara aborta el render con "Image or Canvas expected".
 */
async function rasterizePages(bytes: Buffer): Promise<Array<{ width: number; height: number; data: Uint8ClampedArray }>> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;

    const out: Array<{ width: number; height: number; data: Uint8ClampedArray }> = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
        const p = await doc.getPage(i);
        const viewport = p.getViewport({ scale: RASTER_SCALE });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        // Fondo blanco explícito: el lienzo nace transparente y una hoja de
        // papel no lo es. Sin esto, dos páginas idénticas podrían diferir
        // solo en el canal alfa.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await p.render({
            canvas: canvas as never,
            canvasContext: ctx as never,
            viewport,
        } as Parameters<typeof p.render>[0]).promise;
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        out.push({
            width: canvas.width,
            height: canvas.height,
            data: img.data as unknown as Uint8ClampedArray,
        });
    }
    await doc.cleanup();
    return out;
}

/** Proporción de píxeles distintos entre dos mapas RGBA del mismo tamaño. */
function diffRatio(
    a: { width: number; height: number; data: Uint8ClampedArray },
    b: { width: number; height: number; data: Uint8ClampedArray },
): number {
    if (a.width !== b.width || a.height !== b.height) return 1;
    let different = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if (
            a.data[i] !== b.data[i]
            || a.data[i + 1] !== b.data[i + 1]
            || a.data[i + 2] !== b.data[i + 2]
            || a.data[i + 3] !== b.data[i + 3]
        ) {
            different += 1;
        }
    }
    return different / (a.width * a.height);
}

/** Una página "en blanco" no tiene ni texto ni tinta: se comprueban las dos
 *  cosas, porque una página solo con membrete tampoco debería existir aquí. */
function isBlank(
    raster: { width: number; height: number; data: Uint8ClampedArray },
    text: string,
): boolean {
    if (text.length > 0) return false;
    for (let i = 0; i < raster.data.length; i += 4) {
        if (raster.data[i] < 250 || raster.data[i + 1] < 250 || raster.data[i + 2] < 250) return false;
    }
    return true;
}

for (const { key, description } of CASES) {
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);

    test(`paridad PDF Legacy ↔ V2 — ${description}`, async ({ page }) => {
        test.slow();
        const legacyBytes = await renderPdf(page, `parity${capitalized}Legacy`);
        const v2Bytes = await renderPdf(page, `parity${capitalized}V2`);

        const legacy = await readPdfFacts(legacyBytes);
        const v2 = await readPdfFacts(v2Bytes);

        // Misma cantidad de páginas y mismo tamaño físico.
        expect(v2.pageCount).toBe(legacy.pageCount);
        expect(v2.mediaBoxes).toEqual(legacy.mediaBoxes);
        // Letter en puntos PostScript: 8.5in x 11in.
        expect(legacy.mediaBoxes.every((m) => m === "612x792")).toBe(true);
        // Contenido completo, página por página (esto es lo que detecta un
        // corte de paginación distinto, no solo un total igual).
        expect(v2.perPageText).toEqual(legacy.perPageText);
        // Logotipos e imágenes de figura: mismas incrustaciones.
        expect(v2.imageCount).toBe(legacy.imageCount);

        const legacyPages = await rasterizePages(legacyBytes);
        const v2Pages = await rasterizePages(v2Bytes);
        expect(v2Pages.length).toBe(legacyPages.length);

        for (let i = 0; i < legacyPages.length; i += 1) {
            // Ninguna página en blanco (ni la última, que es donde aparecía
            // la página fantasma del Bloque E).
            expect(isBlank(legacyPages[i], legacy.perPageText[i]), `Legacy p.${i + 1} en blanco`).toBe(false);
            expect(isBlank(v2Pages[i], v2.perPageText[i]), `V2 p.${i + 1} en blanco`).toBe(false);

            const ratio = diffRatio(legacyPages[i], v2Pages[i]);
            expect(
                ratio,
                `Página ${i + 1}: ${(ratio * 100).toFixed(4)}% de píxeles distintos entre el PDF Legacy y el PDF V2`,
            ).toBeLessThanOrEqual(MAX_DIFF_PIXEL_RATIO);
        }
    });
}

test("paridad PDF Legacy ↔ V2 — la firma real del reporte viaja en ambos PDFs", async ({ page }) => {
    test.slow();
    const legacyBytes = await renderPdf(page, "parityFirmadoLegacy");
    const v2Bytes = await renderPdf(page, "parityFirmadoV2");
    const legacy = await readPdfFacts(legacyBytes);
    const v2 = await readPdfFacts(v2Bytes);

    const legacyText = legacy.perPageText.join(" ");
    const v2Text = v2.perPageText.join(" ");
    // El bloque de firma del reporte (firmante real), no el firmante
    // institucional del membrete: son cosas distintas y ambas deben salir.
    expect(legacyText).toContain("Firmante de Prueba");
    expect(v2Text).toContain("Firmante de Prueba");
    expect(v2Text).toBe(legacyText);
});

test("los PDFs de esta suite son temporales y no tocan ningún artefacto oficial", async ({ page }) => {
    // Documenta (y comprueba) que la suite escribe, como mucho, en un
    // directorio temporal propio: nunca en storage, nunca con hash oficial.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "celuma-pdf-parity-"));
    try {
        const bytes = await renderPdf(page, "parityCortoV2");
        const file = path.join(dir, "copia.pdf");
        fs.writeFileSync(file, bytes);
        expect(fs.existsSync(file)).toBe(true);
        expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
