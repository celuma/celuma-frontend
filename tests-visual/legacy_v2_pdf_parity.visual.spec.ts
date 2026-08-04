import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Fourth post-Phase 2 remediation — Legacy ↔ V2 PDF PARITY (§16 of the
 * brief).
 *
 * `legacy_v2_parity.visual.spec.ts` tests the on-screen DOM. This suite
 * tests the ARTIFACT: it generates two PDFs through the SAME path as the
 * backend (`/internal/report-render/...`, `html[data-report-ready="true"]`,
 * `page.pdf({ preferCSSPageSize, printBackground })` — see
 * `celuma-backend/app/services/report_pdf_generation.py::_render_pdf`) and
 * compares:
 *
 *   - page count;
 *   - physical size of every page (MediaBox);
 *   - absence of blank pages;
 *   - complete content (extracted text, page by page);
 *   - included signature;
 *   - logos (embedded images);
 *   - and, by rasterizing every page into a bitmap, PIXELS.
 *
 * None of these PDFs is an official artifact: they are generated in a
 * temporary directory and removed. This suite does not touch storage, hashes,
 * or any persisted PDF.
 */

const CASES = [
    { key: "short", description: "short report without images" },
    { key: "sections", description: "report with multiple sections" },
    { key: "images", description: "report with images" },
    { key: "signed", description: "signed report" },
    { key: "multipage", description: "multipage report" },
] as const;

/** Rasterization scale. 2 ≈ 144 dpi: sufficient for a half-millimeter shift
 *  to be visible without making tests slow. */
const RASTER_SCALE = 2;

/** As in DOM parity: zero tolerance, and any residual difference is
 *  documented in legacy-pdf-parity-report.md instead of raising this value. */
const MAX_DIFF_PIXEL_RATIO = 0;

async function renderPdf(page: Page, fixture: string): Promise<Buffer> {
    await page.goto(`/?internal_render=1&fixture=${fixture}`);
    // Same selector awaited by the official generator.
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
 * PDF facts read with pdf.js — the same engine Chromium uses to display PDFs,
 * so "what pdf.js says" is what the user sees when opening the file.
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
 * Rasterizes each page to RGBA.
 *
 * `@napi-rs/canvas` is not chosen arbitrarily: it is the canvas backend
 * loaded by pdf.js's own `NodeCanvasFactory` outside the browser (see
 * `pdfjs-dist/legacy/build/pdf.mjs`). When installed, pdf.js creates the
 * auxiliary canvases required for soft masks and transparency groups; without
 * it, the first masked shape aborts rendering with "Image or Canvas expected".
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
        // Explicit white background: the canvas starts transparent while a
        // paper sheet is not. Without this, identical pages could differ only
        // in the alpha channel.
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

/** Ratio of different pixels between two equally sized RGBA maps. */
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

/** A "blank" page has neither text nor ink: both are checked because a page
 *  containing only a letterhead must not exist here either. */
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

    test(`Legacy ↔ V2 PDF parity — ${description}`, async ({ page }) => {
        test.slow();
        const legacyBytes = await renderPdf(page, `parity${capitalized}Legacy`);
        const v2Bytes = await renderPdf(page, `parity${capitalized}V2`);

        const legacy = await readPdfFacts(legacyBytes);
        const v2 = await readPdfFacts(v2Bytes);

        // Same page count and physical size.
        expect(v2.pageCount).toBe(legacy.pageCount);
        expect(v2.mediaBoxes).toEqual(legacy.mediaBoxes);
        // Letter in PostScript points: 8.5in x 11in.
        expect(legacy.mediaBoxes.every((m) => m === "612x792")).toBe(true);
        // Complete content, page by page (this detects a different pagination
        // break, not just an identical total).
        expect(v2.perPageText).toEqual(legacy.perPageText);
        // Logos and figure images: same embedded assets.
        expect(v2.imageCount).toBe(legacy.imageCount);

        const legacyPages = await rasterizePages(legacyBytes);
        const v2Pages = await rasterizePages(v2Bytes);
        expect(v2Pages.length).toBe(legacyPages.length);

        for (let i = 0; i < legacyPages.length; i += 1) {
            // No blank pages (including the final one, where the Block E
            // phantom page appeared).
            expect(isBlank(legacyPages[i], legacy.perPageText[i]), `Legacy p.${i + 1} is blank`).toBe(false);
            expect(isBlank(v2Pages[i], v2.perPageText[i]), `V2 p.${i + 1} is blank`).toBe(false);

            const ratio = diffRatio(legacyPages[i], v2Pages[i]);
            expect(
                ratio,
                `Page ${i + 1}: ${(ratio * 100).toFixed(4)}% of pixels differ between the Legacy and V2 PDFs`,
            ).toBeLessThanOrEqual(MAX_DIFF_PIXEL_RATIO);
        }
    });
}

test("Legacy ↔ V2 PDF parity — the report's real signature appears in both PDFs", async ({ page }) => {
    test.slow();
    const legacyBytes = await renderPdf(page, "paritySignedLegacy");
    const v2Bytes = await renderPdf(page, "paritySignedV2");
    const legacy = await readPdfFacts(legacyBytes);
    const v2 = await readPdfFacts(v2Bytes);

    const legacyText = legacy.perPageText.join(" ");
    const v2Text = v2.perPageText.join(" ");
    // The report signature block (actual signer), not the institutional
    // letterhead signer: they are distinct and both must appear.
    expect(legacyText).toContain("Firmante de Prueba");
    expect(v2Text).toContain("Firmante de Prueba");
    expect(v2Text).toBe(legacyText);
});

test("this suite's PDFs are temporary and do not affect official artifacts", async ({ page }) => {
    // Documents (and verifies) that the suite writes at most to its own
    // temporary directory: never to storage or with an official hash.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "celuma-pdf-parity-"));
    try {
        const bytes = await renderPdf(page, "parityShortV2");
        const file = path.join(dir, "copy.pdf");
        fs.writeFileSync(file, bytes);
        expect(fs.existsSync(file)).toBe(true);
        expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
