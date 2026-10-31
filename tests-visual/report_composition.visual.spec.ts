/**
 * Real-browser geometry checks for report composition (Céluma 1.4, #12/#14/#15/#19, corrected by
 * #44/#45/#48/#49 on 2026-10-30).
 *
 * jsdom has no layout engine, so none of this can be proven there. Each case renders a synthetic
 * report (tests-visual/harness `?composition=<json>`, built by
 * src/test/fixtures/reports/composition_scenarios.ts) through the real `ReportRendererResolver`,
 * then asserts on MEASURED rectangles rather than on pixels: every figure sits inside the usable
 * body of its page, nothing overlaps the header, the repeated-fields band, the signature band or the
 * footer, every figure appears exactly once and in stored order, and no page is blank.
 *
 * The same scenarios are replayed through the internal render route (the page the backend's headless
 * Chromium prints) and `page.pdf()` to confirm the PDF has exactly as many pages as the live preview.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import type { CompositionScenario } from "../src/test/fixtures/reports/composition_scenarios";

interface Rect { top: number; bottom: number; left: number; right: number; height: number; width: number }
interface FigureGeometry {
    n: number;
    rect: Rect;
    caption: string;
    text: string;
    img: { rect: Rect; naturalWidth: number; naturalHeight: number; objectFit: string; alt: string };
    captionFontPx: number;
}
interface PageGeometry {
    page: Rect;
    header: Rect | null;
    repeated: Rect | null;
    body: Rect;
    bodyScrollOverflow: number;
    signature: Rect | null;
    footer: Rect | null;
    figures: FigureGeometry[];
    bodyText: string;
    repeatedText: string | null;
    repeatedLabels: string[];
    /** Rendered text lines of the repeated band, counted from its line boxes (not its fields). */
    repeatedLines: number;
    signatureText: string | null;
    signatureImg: { rect: Rect; naturalWidth: number; naturalHeight: number } | null;
    signatureImgCount: number;
    /** The centered identity block inside the signature band (#45). */
    signatureBlock: Rect | null;
    bodyChildCount: number;
    /** `data-figure-fit` / `data-figure-image-height` of the images section on this page (#49). */
    figureFit: string | null;
    figureImageHeight: number | null;
    /** Labels of the general-data rows printed in the body (`<p><b>Label:</b> value</p>`). */
    generalLabels: string[];
}

const PX_PER_MM = 96 / 25.4;

async function loadComposition(page: Page, scenario: CompositionScenario, extra = ""): Promise<PageGeometry[]> {
    await page.goto(`/?composition=${encodeURIComponent(JSON.stringify(scenario))}${extra}`);
    await page.waitForSelector('#pages-host[data-ready="true"]');
    // Header/footer logos in the fixture point at an invalid host; wait for everything to settle.
    await page.waitForTimeout(300);
    return page.evaluate(() => {
        const rectOf = (el: Element | null): Rect | null => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
        };
        const pages = Array.from(document.querySelectorAll<HTMLElement>("#pages-host div")).filter(
            (d) => d.style.width === "8.5in" && d.style.position === "relative",
        );
        // Rendered lines: the vertical centres of every text fragment, clustered (a bold label and its
        // value share a line; a wrapped value adds lines; several short fields can share one).
        const lineCount = (el: Element | null): number => {
            if (!el) return 0;
            const centres: number[] = [];
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                const range = document.createRange();
                range.selectNodeContents(n);
                Array.from(range.getClientRects()).filter((r) => r.width > 0).forEach((r) => centres.push(r.top + r.height / 2));
            }
            centres.sort((a, b) => a - b);
            return centres.reduce<number[]>((acc, c) => (acc.length && c - acc[acc.length - 1] <= 5 ? acc : [...acc, c]), []).length;
        };
        return pages.map((p) => {
            const body = p.querySelector<HTMLElement>('[data-page-region="body"]')!;
            const repeated = p.querySelector<HTMLElement>('[data-page-band="repeated-fields"]');
            const signature = p.querySelector<HTMLElement>('[data-page-band="signature"]');
            const img = signature?.querySelector<HTMLImageElement>("img") ?? null;
            const section = body.querySelector<HTMLElement>("[data-figure-section]");
            return {
                page: rectOf(p)!,
                header: rectOf(p.querySelector('[data-page-region="header"]')),
                repeated: rectOf(repeated),
                body: rectOf(body)!,
                bodyScrollOverflow: body.scrollHeight - body.clientHeight,
                signature: rectOf(signature),
                footer: rectOf(p.querySelector('[data-page-region="footer"]')),
                figures: Array.from(body.querySelectorAll<HTMLElement>("[data-figure]")).map((f) => {
                    const fig = f.querySelector<HTMLImageElement>("img")!;
                    const caption = fig.nextElementSibling as HTMLElement;
                    return {
                        n: Number(f.dataset.figure),
                        rect: rectOf(f)!,
                        caption: (f.textContent ?? "").trim(),
                        text: (f.textContent ?? "").trim(),
                        img: {
                            rect: rectOf(fig)!,
                            naturalWidth: fig.naturalWidth,
                            naturalHeight: fig.naturalHeight,
                            objectFit: getComputedStyle(fig).objectFit,
                            alt: fig.alt,
                        },
                        captionFontPx: parseFloat(getComputedStyle(caption).fontSize),
                    };
                }),
                bodyText: body.textContent ?? "",
                repeatedText: repeated ? repeated.textContent : null,
                repeatedLabels: repeated
                    ? Array.from(repeated.querySelectorAll("b")).map((b) => b.textContent ?? "")
                    : [],
                repeatedLines: lineCount(repeated),
                signatureText: signature ? signature.textContent : null,
                signatureImg: img
                    ? { rect: rectOf(img)!, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }
                    : null,
                signatureImgCount: signature?.querySelectorAll("img").length ?? 0,
                signatureBlock: rectOf(signature?.querySelector("[data-signature-block]") ?? null),
                bodyChildCount: body.childElementCount,
                figureFit: section?.getAttribute("data-figure-fit") ?? null,
                figureImageHeight: section ? Number(section.getAttribute("data-figure-image-height")) || null : null,
                generalLabels: Array.from(body.children)
                    .filter((c) => c.tagName === "DIV" && !c.hasAttribute("data-figure-section"))
                    .flatMap((c) => Array.from(c.children).filter((x) => x.tagName === "P" && x.firstElementChild?.tagName === "B"))
                    .map((x) => x.firstElementChild!.textContent ?? ""),
            };
        });
    });
}

const within = (inner: Rect, outer: Rect, tol = 1) =>
    inner.top >= outer.top - tol && inner.bottom <= outer.bottom + tol
    && inner.left >= outer.left - tol && inner.right <= outer.right + tol;
const overlaps = (a: Rect, b: Rect, tol = 0.5) =>
    a.top < b.bottom - tol && a.bottom > b.top + tol && a.left < b.right - tol && a.right > b.left + tol;

/** The invariants every composed report must satisfy, whatever the content. */
function expectCoherentPages(pages: PageGeometry[], opts: { figures?: number; signature: boolean; repeated: boolean }) {
    expect(pages.length).toBeGreaterThan(0);
    pages.forEach((g, i) => {
        // Nothing the body holds is cut off by its own box.
        expect(g.bodyScrollOverflow, `page ${i + 1} body overflow`).toBeLessThanOrEqual(0);
        // No blank pages.
        expect(g.bodyChildCount, `page ${i + 1} is blank`).toBeGreaterThan(0);
        // The body stays on the sheet and clear of every band.
        expect(within(g.body, g.page)).toBe(true);
        if (g.header) expect(overlaps(g.body, g.header), `page ${i + 1} body/header`).toBe(false);
        if (g.footer) expect(overlaps(g.body, g.footer), `page ${i + 1} body/footer`).toBe(false);
        if (g.repeated) {
            expect(overlaps(g.body, g.repeated), `page ${i + 1} body/repeated band`).toBe(false);
            if (g.header) expect(overlaps(g.repeated, g.header), `page ${i + 1} repeated/header`).toBe(false);
        }
        if (g.signature) {
            expect(overlaps(g.body, g.signature), `page ${i + 1} body/signature`).toBe(false);
            if (g.footer) expect(overlaps(g.signature, g.footer), `page ${i + 1} signature/footer`).toBe(false);
            expect(within(g.signature, g.page)).toBe(true);
        }
        // Every figure is fully inside the body and clear of every band.
        g.figures.forEach((f) => {
            expect(within(f.rect, g.body), `figure ${f.n} inside body`).toBe(true);
            if (g.signature) expect(overlaps(f.rect, g.signature), `figure ${f.n}/signature`).toBe(false);
            if (g.footer) expect(overlaps(f.rect, g.footer), `figure ${f.n}/footer`).toBe(false);
            if (g.repeated) expect(overlaps(f.rect, g.repeated), `figure ${f.n}/repeated`).toBe(false);
            // Image and caption travel together.
            expect(f.caption).toContain(`Figura ${f.n}.`);
            expect(f.caption).toContain(`Corte ${f.n} sint.`);
        });
        // The repeated band appears on every page after the first, never on the first.
        if (opts.repeated) expect(g.repeated !== null, `repeated band on page ${i + 1}`).toBe(i > 0);
        else expect(g.repeated).toBeNull();
        // The compact signature is on every page, or on none.
        expect(g.signature !== null, `signature on page ${i + 1}`).toBe(opts.signature);
    });
    if (opts.figures !== undefined) {
        const all = pages.flatMap((g) => g.figures.map((f) => f.n));
        expect(all).toEqual(Array.from({ length: opts.figures }, (_, i) => i + 1));
    }
}

test.describe("figures: 9, 10, 12 and 20 paginate without clipping (#19)", () => {
    for (const figures of [9, 10, 12, 20]) {
        for (const mixedAspect of [false, true]) {
            test(`${figures} figures${mixedAspect ? " (mixed aspect ratios)" : ""}`, async ({ page }) => {
                const pages = await loadComposition(page, { figures, mixedAspect, paragraphs: 3 });
                expectCoherentPages(pages, { figures, signature: true, repeated: false });
            });
        }
    }

    test("20 figures with repeated fields, tight margins and a long signer name", async ({ page }) => {
        const pages = await loadComposition(
            page,
            {
                figures: 20,
                mixedAspect: true,
                paragraphs: 4,
                longValues: true,
                repeat: ["patient", "requesting_physician", "sample_codes", "expediente"],
                extraBase: {
                    sample_codes: Array.from({ length: 30 }, (_, i) => `2610-${String(i + 1).padStart(4, "0")}`).join(", "),
                    expediente: "00123456",
                },
                margins: [0.5, 0.5, 0.5, 0.5],
            },
            "&longSigner=1",
        );
        expectCoherentPages(pages, { figures: 20, signature: true, repeated: true });
    });
});

test.describe("three rows of figures at 5 mm margins (#19)", () => {
    for (const figures of [9, 10, 12, 20]) {
        for (const mixedAspect of [false, true]) {
            test(`${figures} figures at 5 mm${mixedAspect ? " (mixed aspect ratios)" : ""}`, async ({ page }) => {
                const pages = await loadComposition(page, {
                    figures, mixedAspect, paragraphs: 0,
                    margins: [0.5, 0.5, 0.5, 0.5],
                    repeat: ["patient", "requesting_physician", "sample_codes", "expediente"],
                    extraBase: { sample_codes: "CU011026, CU021026, CU031026", expediente: "SYN-001" },
                }, "&clearOffsets=1");
                expectCoherentPages(pages, { figures, signature: true, repeated: true });
                if (figures === 9) {
                    // The complete section (including its heading) fits together on a fresh page.
                    const imagePages = pages.filter((g) => g.figures.length > 0);
                    expect(imagePages).toHaveLength(1);
                    expect(imagePages[0].figures).toHaveLength(9);
                    expect(imagePages[0].bodyText).toContain("Imágenes");
                }
                if (figures === 20) expect(pages.some((g) => g.figures.length === 9)).toBe(true);
            });
        }
    }
});

test.describe("repeated fields (#15) and sample codes (#12)", () => {
    test("repeats the chosen visible fields, in report order, on pages after the first only", async ({ page }) => {
        const pages = await loadComposition(page, {
            figures: 6,
            paragraphs: 5,
            repeat: ["patient", "requesting_physician"],
        });
        expect(pages.length).toBeGreaterThan(1);
        expect(pages[0].repeated).toBeNull();
        // Page 1 still prints every visible field in the body (nothing is duplicated there).
        expect(pages[0].bodyText).toContain("Paciente:");
        expect(pages[0].bodyText).toContain("Código de orden:");
        pages.slice(1).forEach((g) => {
            expect(g.repeatedLabels).toEqual(["Paciente:", "Médico solicitante:"]);
            expect(g.repeatedText).toContain("Paciente Sintético Compuesto");
            expect(g.repeatedText).not.toContain("Código de orden");
        });
        expectCoherentPages(pages, { figures: 6, signature: true, repeated: true });
    });

    test("with nothing marked to repeat, no band is drawn on any page", async ({ page }) => {
        const pages = await loadComposition(page, { figures: 12, paragraphs: 5 });
        pages.forEach((g) => expect(g.repeated).toBeNull());
    });

    test("long names, several requesters and many sample codes wrap — nothing is cropped", async ({ page }) => {
        const codes = Array.from({ length: 40 }, (_, i) => `2610-${String(i + 1).padStart(4, "0")}`).join(", ");
        const pages = await loadComposition(page, {
            figures: 6,
            paragraphs: 5,
            longValues: true,
            repeat: ["patient", "requesting_physician", "sample_codes"],
            extraBase: { sample_codes: codes },
        });
        const band = pages[1];
        expect(band.repeated).not.toBeNull();
        // Taller than a single line, and every code is present in full.
        expect(band.repeated!.height).toBeGreaterThan(40);
        expect(band.repeatedText).toContain("2610-0001");
        expect(band.repeatedText).toContain("2610-0040");
        expect(band.repeatedText).toContain("Extraordinariamente Largo");
        expect(band.repeatedText).toContain("Dra. Solicitante Sintética Número Tres");
        expectCoherentPages(pages, { figures: 6, signature: true, repeated: true });
    });

    // #44 (owner correction 2026-10-30) supersedes printing "Sin especificar" for an empty value.
    test("an empty repeated value is omitted, label and placeholder", async ({ page }) => {
        const pages = await loadComposition(page, {
            figures: 6,
            paragraphs: 5,
            repeat: ["patient", "sample_codes"],
            extraBase: { sample_codes: "" },
        });
        pages.slice(1).forEach((g) => {
            expect(g.repeatedLabels).toEqual(["Paciente:"]);
            expect(g.repeatedText).not.toContain("Sin especificar");
            expect(g.repeatedText).not.toContain("Códigos de muestra");
        });
        expectCoherentPages(pages, { figures: 6, signature: true, repeated: true });
    });
});

test.describe("compact signature per page (#14)", () => {
    test("signed with a required autograph: one image per page within 45 x 12 mm, aspect preserved", async ({ page }) => {
        for (const autograph of ["default", "wide", "tall", "square"] as const) {
            const pages = await loadComposition(page, { figures: 10, paragraphs: 4, autograph });
            expectCoherentPages(pages, { figures: 10, signature: true, repeated: false });
            pages.forEach((g, i) => {
                expect(g.signatureImgCount, `${autograph} page ${i + 1}`).toBe(1);
                const img = g.signatureImg!;
                expect(img.naturalWidth).toBeGreaterThan(0);
                expect(img.rect.width / PX_PER_MM).toBeLessThanOrEqual(45 + 0.5);
                expect(img.rect.height / PX_PER_MM).toBeLessThanOrEqual(12 + 0.5);
                const natural = img.naturalWidth / img.naturalHeight;
                expect(Math.abs(img.rect.width / img.rect.height - natural) / natural).toBeLessThan(0.03);
                expect(g.signatureText).toContain("Firmante Real V2 de Prueba");
                expect(g.signatureText).toContain("Firmado digitalmente el");
            });
        }
    });

    test("unsigned draft: no image, no implied signature, same band height as when signed", async ({ page }) => {
        const unsigned = await loadComposition(page, { figures: 6, paragraphs: 3, signature: "unsigned" });
        const signed = await loadComposition(page, { figures: 6, paragraphs: 3, signature: "signed" });
        unsigned.forEach((g) => {
            expect(g.signatureImgCount).toBe(0);
            expect(g.signatureText).toContain("Pendiente de firma");
            expect(g.signatureText).not.toContain("Firmado");
        });
        expect(unsigned.length).toBe(signed.length);
        // The image area keeps its reserved height in every state, so signing does not repaginate.
        expect(Math.abs(unsigned[0].body.height - signed[0].body.height)).toBeLessThan(6);
    });

    test("signed without a digital image: a compact line and name only", async ({ page }) => {
        const pages = await loadComposition(page, { figures: 6, paragraphs: 3, signature: "plain" });
        expectCoherentPages(pages, { figures: 6, signature: true, repeated: false });
        pages.forEach((g) => {
            expect(g.signatureImgCount).toBe(0);
            expect(g.signatureText).toMatch(/Firmado el/);
        });
    });

    test("signature section hidden: no band and no space reserved", async ({ page }) => {
        const hidden = await loadComposition(page, { figures: 6, paragraphs: 3, signature: "hidden" });
        const shown = await loadComposition(page, { figures: 6, paragraphs: 3, signature: "plain" });
        expectCoherentPages(hidden, { figures: 6, signature: false, repeated: false });
        expect(hidden[0].body.height).toBeGreaterThan(shown[0].body.height);
    });

    test("a very long signer name wraps inside the block and clears the footer", async ({ page }) => {
        const pages = await loadComposition(page, { figures: 6, paragraphs: 3 }, "&longSigner=1");
        expectCoherentPages(pages, { figures: 6, signature: true, repeated: false });
        pages.forEach((g) => {
            expect(g.signatureText).toContain("Extraordinariamente Largos");
            expect(g.signature!.width / PX_PER_MM).toBeGreaterThan(0);
        });
    });
});

test.describe("combinations and long content", () => {
    test("long prose and a long table split across pages without loss", async ({ page }) => {
        const pages = await loadComposition(page, { paragraphs: 25, tableRows: 60, figures: 4 });
        expectCoherentPages(pages, { figures: 4, signature: true, repeated: false });
        const text = pages.map((g) => g.bodyText).join("\n");
        expect(text).toContain("Párrafo sintético 25.");
        expect(text).toContain("Hallazgo 60");
        // Every table row exactly once.
        for (let i = 1; i <= 60; i += 1) {
            expect(text.match(new RegExp(`Hallazgo ${i}(?!\\d)`, "g"))?.length, `row ${i}`).toBe(1);
        }
    });

    test("no footer and no header", async ({ page }) => {
        const pages = await loadComposition(page, { figures: 12, header: false, footer: false, repeat: ["patient"] });
        expectCoherentPages(pages, { figures: 12, signature: true, repeated: true });
    });
});

test.describe("official render route and PDF page count", () => {
    for (const figures of [9, 10, 12, 20]) {
        test(`${figures} figures: PDF pages equal live pages, with a signature on each`, async ({ page }) => {
            const scenario: CompositionScenario = {
                figures, mixedAspect: true, paragraphs: 3, repeat: ["patient", "requesting_physician"],
            };
            const live = await loadComposition(page, scenario);

            await page.goto(`/?internal_render=1&composition=${encodeURIComponent(JSON.stringify(scenario))}`);
            await page.waitForSelector('html[data-report-ready="true"], html[data-report-render-error]', {
                state: "attached",
            });
            expect(await page.getAttribute("html", "data-report-render-error")).toBeNull();
            const rendered = await page.evaluate(() => ({
                pages: document.querySelectorAll('#report-render-host [data-page-region="body"]').length,
                autographs: document.querySelectorAll('img[data-signature-autograph="required"]').length,
            }));
            expect(rendered.pages).toBe(live.length);
            // One decoded autograph per page (the readiness gate refuses anything less).
            expect(rendered.autographs).toBe(live.length);

            const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
            const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
            expect(pdfPages).toBe(live.length);
        });
    }
});

// ---------------------------------------------------------------------------------------------------
// Independent review round 1 (R1/R2): oversize indivisible/text units and unusable layouts are never
// "ready", never clipped, and never exported as a warning-only page.
// ---------------------------------------------------------------------------------------------------

interface RenderOutcome {
    ready: string | null;
    error: string | null;
    pages: number;
    overflowPx: number[];
    pagesText: string;
    pdfPages: number;
    warning: boolean;
    overflowWarning: boolean;
}

async function officialRender(page: Page, scenario: CompositionScenario): Promise<RenderOutcome> {
    await page.goto(`/?internal_render=1&composition=${encodeURIComponent(JSON.stringify(scenario))}`);
    await page.waitForFunction(
        () => document.documentElement.dataset.reportReady === "true" || !!document.documentElement.dataset.reportRenderError,
        undefined,
        { timeout: 30_000 },
    );
    await page.waitForTimeout(200);
    const facts = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll<HTMLElement>("#report-render-host div")).filter(
            (d) => d.style.width === "8.5in" && d.style.position === "relative",
        );
        return {
            ready: document.documentElement.dataset.reportReady ?? null,
            error: document.documentElement.dataset.reportRenderError ?? null,
            pages: pages.length,
            overflowPx: pages.map((p) => {
                const b = p.querySelector<HTMLElement>('[data-page-region="body"]')!;
                return b.scrollHeight - b.clientHeight;
            }),
            // Body text only, joined without separators: a word-split paragraph is whole again.
            pagesText: pages.map((p) => p.querySelector('[data-page-region="body"]')?.textContent ?? "").join(""),
            warning: !!document.querySelector('[data-testid="unusable-page-layout"]'),
            overflowWarning: !!document.querySelector('[data-testid="layout-overflow"]'),
        };
    });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    return { ...facts, pdfPages };
}

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
const FILLER = "Texto de relleno sin relevancia clínica real";

test.describe("R1 — oversize text is paginated, oversize indivisible units fail safely", () => {
    test("one paragraph of ~9k characters keeps all its text across pages, ready, PDF pages = live pages", async ({ page }) => {
        const out = await officialRender(page, { figures: 0, paragraphs: 1, paragraphRepeats: 80 });
        expect(out.error).toBeNull();
        expect(out.ready).toBe("true");
        out.overflowPx.forEach((o) => expect(o).toBeLessThanOrEqual(0));
        expect(occurrences(out.pagesText, FILLER)).toBe(80);
        expect(out.pages).toBeGreaterThan(1);
        expect(out.pdfPages).toBe(out.pages);
    });

    test("inline formatting survives the split and every sentence is present once", async ({ page }) => {
        const out = await officialRender(page, { figures: 0, paragraphs: 1, paragraphRepeats: 80, inlineMarkup: true });
        expect(out.ready).toBe("true");
        out.overflowPx.forEach((o) => expect(o).toBeLessThanOrEqual(0));
        expect(occurrences(out.pagesText, FILLER)).toBe(80);
        const strongs = await page.evaluate(() =>
            Array.from(document.querySelectorAll("#report-render-host strong")).filter((e) => !e.closest("[aria-hidden]")).length,
        );
        expect(strongs).toBeGreaterThanOrEqual(80);
    });

    test("a list taller than a page keeps every item once and in order", async ({ page }) => {
        const out = await officialRender(page, { figures: 0, paragraphs: 1, listItems: 70 });
        expect(out.ready).toBe("true");
        out.overflowPx.forEach((o) => expect(o).toBeLessThanOrEqual(0));
        for (let i = 1; i <= 70; i += 1) expect(occurrences(out.pagesText, `Elemento ${i} de la lista`), `item ${i}`).toBe(1);
        const order = [...out.pagesText.matchAll(/Elemento (\d+) de la lista/g)].map((m) => Number(m[1]));
        expect(order).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
    });

    test("an atomic figure row taller than the usable body is a controlled layout failure, never ready", async ({ page }) => {
        // Body stays usable (about 52 mm, above the 30 mm floor) but a row of figure cards (~63 mm) cannot fit it.
        const out = await officialRender(page, { figures: 4, paragraphs: 0, margins: [4, 1.5, 4, 1.5], headerHeightMm: 70, footerHeightMm: 45 });
        expect(out.ready).toBeNull();
        expect(out.error).toBe("LAYOUT_OVERFLOW");
        expect(out.overflowWarning).toBe(true);
    });
});

test.describe("R2 — an unusable layout is a layout failure under every signature setting", () => {
    const longPatient = "Identificación ficticia para prueba. ".repeat(300);
    for (const signature of ["hidden", "unsigned", "plain", "signed"] as const) {
        test(`repeated band exhausts the page (signature: ${signature})`, async ({ page }) => {
            const out = await officialRender(page, {
                figures: 1, paragraphs: 0, signature, repeat: ["patient"], extraBase: { patient: longPatient },
            });
            expect(out.ready).toBeNull();
            expect(out.error).toMatch(/^LAYOUT_/);
            expect(out.pages).toBe(0);
        });
    }

    test("a valid layout still signals ready with no signature requirement at all", async ({ page }) => {
        for (const signature of ["hidden", "unsigned", "plain", "signed"] as const) {
            const out = await officialRender(page, { figures: 3, paragraphs: 2, signature });
            expect(out.error, signature).toBeNull();
            expect(out.ready, signature).toBe("true");
            expect(out.pages).toBeGreaterThan(0);
        }
    });
});

// ---------------------------------------------------------------------------------------------------
// Owner corrections of 2026-10-30: #44 (omit empty general fields), #45 (centered signature), #48
// (amendment details stay internal) and #49 (nine figures 3 x 3 with up to three repeated lines at 5 mm).
// Every case checks the live preview, the official render route (what the backend's Chromium prints)
// and the PDF Chromium produces from it.
// ---------------------------------------------------------------------------------------------------

const MM_PER_PX = 25.4 / 96;
const EVIDENCE_DIR = process.env.CELUMA_COMPOSITION_EVIDENCE;

/** Text of every PDF page, read with pdf.js (what a reader of the file sees). */
async function pdfPageTexts(bytes: Buffer): Promise<string[]> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
        const content = await (await doc.getPage(i)).getTextContent();
        out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim());
    }
    await doc.cleanup();
    return out;
}

interface OfficialOutput {
    ready: string | null;
    error: string | null;
    pages: number;
    figuresPerPage: number[];
    pageTexts: string[];
    pdfTexts: string[];
}

/** The official render route for `scenario`, then the PDF Chromium prints from it. */
async function officialOutput(page: Page, scenario: CompositionScenario, extra = ""): Promise<OfficialOutput> {
    await page.goto(`/?internal_render=1&composition=${encodeURIComponent(JSON.stringify(scenario))}${extra}`);
    await page.waitForFunction(
        () => document.documentElement.dataset.reportReady === "true" || !!document.documentElement.dataset.reportRenderError,
        undefined,
        { timeout: 30_000 },
    );
    const facts = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll<HTMLElement>("#report-render-host div")).filter(
            (d) => d.style.width === "8.5in" && d.style.position === "relative",
        );
        return {
            ready: document.documentElement.dataset.reportReady ?? null,
            error: document.documentElement.dataset.reportRenderError ?? null,
            pages: pages.length,
            figuresPerPage: pages.map((p) => p.querySelectorAll('[data-page-region="body"] [data-figure]').length),
            pageTexts: pages.map((p) => p.textContent ?? ""),
        };
    });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return { ...facts, pdfTexts: await pdfPageTexts(pdf) };
}

function recordEvidence(name: string, data: unknown) {
    const body = JSON.stringify(data, null, 1);
    test.info().attach(name, { body, contentType: "application/json" });
    if (EVIDENCE_DIR) {
        mkdirSync(EVIDENCE_DIR, { recursive: true });
        writeFileSync(`${EVIDENCE_DIR}/${name}.json`, body);
    }
}

test.describe("#44 — empty general fields are omitted", () => {
    test("mixed populated and empty fields: no label, placeholder or empty row; 0 kept; order kept", async ({ page }) => {
        const scenario: CompositionScenario = {
            figures: 6, paragraphs: 5,
            repeat: ["patient", "study_type", "sample_codes", "expediente"],
            extraBase: { study_type: "", patient_age: "0", sample_codes: "   ", expediente: "SYN-77" },
        };
        const pages = await loadComposition(page, scenario);
        expect(pages.length).toBeGreaterThan(1);
        expect(pages[0].generalLabels).toEqual(["Código de orden:", "Paciente:", "Edad:", "Médico solicitante:", "Expediente:"]);
        expect(pages[0].bodyText).toContain("Edad: 0");
        expect(pages[0].bodyText).not.toMatch(/Tipo de estudio|Códigos de muestra|Sin especificar/);
        pages.slice(1).forEach((g) => {
            expect(g.repeatedLabels).toEqual(["Paciente:", "Expediente:"]);
            expect(g.repeatedText).not.toMatch(/Tipo de estudio|Códigos de muestra|Sin especificar/);
        });
        expectCoherentPages(pages, { figures: 6, signature: true, repeated: true });

        const official = await officialOutput(page, scenario);
        expect(official.error).toBeNull();
        expect(official.ready).toBe("true");
        expect(official.pages).toBe(pages.length);
        expect(official.pdfTexts).toHaveLength(pages.length);
        for (const text of [...official.pageTexts, ...official.pdfTexts]) {
            expect(text).not.toMatch(/Tipo de estudio|Códigos de muestra|Sin especificar/);
        }
        expect(official.pdfTexts[0]).toMatch(/Edad: 0/);
        expect(official.pdfTexts[1]).toMatch(/Expediente: SYN-77/);
    });

    for (const multipage of [false, true]) {
        test(`every optional field empty (${multipage ? "multipage" : "one page"}): no general block, separator or band`, async ({ page }) => {
            const empty = { order_code: "", patient: " ", study_type: "", patient_age: "", requesting_physician: "" };
            const scenario: CompositionScenario = {
                figures: multipage ? 6 : 1, paragraphs: multipage ? 6 : 1,
                repeat: ["patient", "requesting_physician"], extraBase: empty,
            };
            const pages = await loadComposition(page, scenario);
            expect(pages.length > 1).toBe(multipage);
            expect(pages[0].generalLabels).toEqual([]);
            // The document opens with the first section: no empty block and no orphan rule above it.
            const first = await page.evaluate(() => {
                const body = document.querySelector('#pages-host [data-page-region="body"]')!;
                return { tag: body.firstElementChild?.tagName, text: (body.firstElementChild?.textContent ?? "").slice(0, 12) };
            });
            expect(first).toEqual({ tag: "DIV", text: "Macroscópica" });
            pages.forEach((g) => expect(g.repeated).toBeNull());
            expectCoherentPages(pages, { figures: multipage ? 6 : 1, signature: true, repeated: false });
            const official = await officialOutput(page, scenario);
            expect(official.ready).toBe("true");
            expect(official.pages).toBe(pages.length);
            official.pdfTexts.forEach((t) => expect(t).not.toMatch(/Paciente|Código de orden|Sin especificar/));
        });
    }
});

test.describe("#45 — the signature block is centered horizontally in the content area", () => {
    /** Left and right clearance of the 64 mm identity block inside the body's content width. */
    const gaps = (g: PageGeometry) => ({ left: g.signatureBlock!.left - g.body.left, right: g.body.right - g.signatureBlock!.right });

    const cases: Array<{ name: string; scenario: CompositionScenario; extra?: string }> = [
        { name: "asymmetric margins, wide autograph", scenario: { figures: 6, paragraphs: 5, margins: [1.5, 3.0, 1.5, 0.8], autograph: "wide" } },
        { name: "asymmetric margins the other way, tall autograph", scenario: { figures: 6, paragraphs: 5, margins: [2, 0.5, 2, 4], autograph: "tall" } },
        { name: "5 mm margins, square autograph, repeated fields", scenario: { figures: 12, paragraphs: 3, margins: [0.5, 0.5, 0.5, 0.5], autograph: "square", repeat: ["patient"] } },
        { name: "very long signer name", scenario: { figures: 6, paragraphs: 5, margins: [1.5, 3.0, 1.5, 0.8] }, extra: "&longSigner=1" },
        { name: "unsigned draft (no autograph)", scenario: { figures: 6, paragraphs: 5, margins: [1.5, 3.0, 1.5, 0.8], signature: "unsigned" } },
        { name: "signed without a digital image", scenario: { figures: 6, paragraphs: 5, margins: [1.5, 3.0, 1.5, 0.8], signature: "plain" } },
    ];
    for (const c of cases) {
        test(c.name, async ({ page }) => {
            const pages = await loadComposition(page, c.scenario, c.extra ?? "");
            expect(pages.length).toBeGreaterThan(1);
            expectCoherentPages(pages, {
                figures: c.scenario.figures, signature: true, repeated: (c.scenario.repeat ?? []).length > 0,
            });
            const first = gaps(pages[0]);
            pages.forEach((g, i) => {
                const { left, right } = gaps(g);
                expect(Math.abs(left - right), `page ${i + 1} centered (${left} vs ${right})`).toBeLessThanOrEqual(1);
                expect(left).toBeGreaterThan(0);
                expect(g.signatureBlock!.width * MM_PER_PX).toBeCloseTo(64, 0);
                // Same place on every page, and still above the footer clearance (no overlap).
                expect(Math.abs(left - first.left)).toBeLessThanOrEqual(0.5);
                expect(g.signatureBlock!.bottom).toBeLessThanOrEqual(g.signature!.bottom + 0.5);
                if (g.footer) expect(g.signature!.bottom).toBeLessThanOrEqual(g.footer.top + 0.5);
                if (g.signatureImg) {
                    const centre = (g.signatureImg.rect.left + g.signatureImg.rect.right) / 2;
                    expect(Math.abs(centre - (g.signatureBlock!.left + g.signatureBlock!.right) / 2)).toBeLessThanOrEqual(1);
                }
            });
            if (c.scenario.signature === "unsigned") pages.forEach((g) => expect(g.signatureText).toContain("Pendiente de firma"));
            const official = await officialOutput(page, c.scenario, c.extra ?? "");
            expect(official.ready).toBe("true");
            expect(official.pages).toBe(pages.length);
        });
    }
});

test.describe("#48 — amendment identification, reason and change note never reach the document", () => {
    for (const signature of ["signed", "unsigned"] as const) {
        test(`amended emission (${signature === "signed" ? "signed" : "open draft"}): preview, render route and PDF`, async ({ page }) => {
            const scenario: CompositionScenario = { figures: 3, paragraphs: 2, amendment: true, signature };
            const internal = /ENMENDADO|Enmienda 2|Sustituye a la emisión|Motivo interno sintético|Nota interna sintética/;
            const pages = await loadComposition(page, scenario);
            pages.forEach((g) => expect(g.bodyText).not.toMatch(internal));
            const hidden = await page.evaluate(() => document.getElementById("reporte-content-v2")?.textContent ?? "");
            expect(hidden).not.toMatch(internal);
            // The clinical report itself is unchanged: general data and sections open the document.
            expect(pages[0].generalLabels[0]).toBe("Código de orden:");
            expect(pages[0].bodyText).toContain("Párrafo sintético 1.");
            expectCoherentPages(pages, { figures: 3, signature: true, repeated: false });
            const official = await officialOutput(page, scenario);
            expect(official.ready).toBe("true");
            expect(official.pages).toBe(pages.length);
            [...official.pageTexts, ...official.pdfTexts].forEach((t) => expect(t).not.toMatch(internal));
            expect(official.pdfTexts[0]).toMatch(/Párrafo sintético 1\./);
        });
    }
});

// ---- #49 --------------------------------------------------------------------------------------------

const REQUESTERS_LONG = [
    "Dra. Solicitante Sintética Número Uno De Un Hospital Ficticio",
    "Dr. Solicitante Sintético Número Dos",
    "Dra. Solicitante Sintética Número Tres Con Nombre Muy Largo",
].join("; ");
const codes = (n: number) => Array.from({ length: n }, (_, i) => `2610-${String(i + 1).padStart(4, "0")}`).join(", ");

/** Repeated-field fixtures by the number of lines they render at 5 mm margins (asserted, not assumed). */
const BANDS: Record<number, Pick<CompositionScenario, "repeat" | "extraBase">> = {
    0: { repeat: [] },
    // Two fields sharing one line.
    1: { repeat: ["patient", "requesting_physician"] },
    // One long value wrapping onto a second line.
    2: { repeat: ["requesting_physician"], extraBase: { requesting_physician: REQUESTERS_LONG } },
    // A field on its own line, then one long value wrapping onto two more.
    3: { repeat: ["patient", "requesting_physician"], extraBase: { requesting_physician: REQUESTERS_LONG } },
};
const FIVE_MM: CompositionScenario["margins"] = [0.5, 0.5, 0.5, 0.5];

function nineFigureScenario(lines: number, overrides: CompositionScenario = {}): CompositionScenario {
    const band = BANDS[lines];
    return {
        figures: 9, mixedAspect: true, paragraphs: 6, margins: FIVE_MM, longCaptions: true,
        repeat: band.repeat,
        // The omission policy is part of the combined layout: two empty general fields are left out.
        extraBase: { study_type: "", patient_age: "", ...(band.extraBase ?? {}) },
        ...overrides,
    };
}

/** All nine figures on one page, as three rows of three in stored order, with the section heading. */
function expectNineOnOnePage(pages: PageGeometry[]) {
    const imagePages = pages.filter((g) => g.figures.length > 0);
    expect(imagePages, "pages holding figures").toHaveLength(1);
    const g = imagePages[0];
    expect(g.bodyText).toContain("Imágenes");
    expect(g.figureFit).toBe("page");
    const rows = [...new Set(g.figures.map((f) => Math.round(f.rect.top)))];
    const cols = [...new Set(g.figures.map((f) => Math.round(f.rect.left)))];
    expect(rows, "three rows").toHaveLength(3);
    expect(cols, "three columns").toHaveLength(3);
    const reading = [...g.figures].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left).map((f) => f.n);
    expect(reading).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    return g;
}

/** Legibility and identity: contained (never cropped or stretched), readable size, caption kept. */
function expectReadableFigures(g: PageGeometry) {
    g.figures.forEach((f) => {
        expect(f.img.objectFit).toBe("contain");
        expect(f.img.naturalWidth).toBeGreaterThan(0);
        expect(f.img.rect.height).toBeGreaterThanOrEqual(150 - 0.5);
        expect(f.img.rect.height).toBeLessThanOrEqual(180 + 0.5);
        expect(f.captionFontPx).toBeCloseTo(12, 1);
        expect(f.caption).toContain(`Figura ${f.n}.`);
        expect(f.caption).toContain(`Corte ${f.n} sint.`);
        expect(f.caption).toContain(f.img.alt);
    });
}

/** Geometry worth keeping as evidence: band and signature heights, image area, drawn figure sizes. */
function geometryRecord(pages: PageGeometry[]) {
    const mm = (px: number | undefined | null) => (px == null ? null : +(px * MM_PER_PX).toFixed(2));
    return pages.map((g) => ({
        headerMm: mm(g.header?.height), footerMm: mm(g.footer?.height), signatureMm: mm(g.signature?.height),
        repeatedMm: mm(g.repeated?.height), repeatedLines: g.repeatedLines,
        bodyTopMm: mm(g.body.top - g.page.top), bodyMm: mm(g.body.height),
        figures: g.figures.length, figureFit: g.figureFit, imageAreaPx: g.figureImageHeight,
        drawnFiguresMm: g.figures.map((f) => {
            const s = Math.min(f.img.rect.width / f.img.naturalWidth, f.img.rect.height / f.img.naturalHeight);
            return [mm(f.img.naturalWidth * s), mm(f.img.naturalHeight * s)];
        }),
    }));
}

test.describe("#49 — nine figures fit 3 x 3 on one page at 5 mm margins with 0 to 3 repeated lines", () => {
    for (const lines of [0, 1, 2, 3]) {
        for (const signature of ["signed", "unsigned"] as const) {
            test(`${lines} repeated line(s), ${signature} signature, 25-character captions, mixed aspect ratios`, async ({ page }) => {
                const scenario = nineFigureScenario(lines, { signature });
                const pages = await loadComposition(page, scenario, "&clearOffsets=1");
                pages.slice(1).forEach((g) => expect(g.repeatedLines, "rendered band lines").toBe(lines));
                expectCoherentPages(pages, { figures: 9, signature: true, repeated: lines > 0 });
                const g = expectNineOnOnePage(pages);
                expectReadableFigures(g);
                // The centered signature (#45) and the omission policy (#44) are part of this layout.
                expect(Math.abs((g.signatureBlock!.left - g.body.left) - (g.body.right - g.signatureBlock!.right))).toBeLessThanOrEqual(1);
                expect(pages[0].bodyText).not.toMatch(/Tipo de estudio|Edad:|Sin especificar/);
                recordEvidence(`49-${lines}-lines-${signature}`, geometryRecord(pages));

                const official = await officialOutput(page, scenario, "&clearOffsets=1");
                expect(official.error).toBeNull();
                expect(official.ready).toBe("true");
                expect(official.figuresPerPage).toEqual(pages.map((p) => p.figures.length));
                expect(official.pdfTexts).toHaveLength(pages.length);
                const pdfImagePages = official.pdfTexts.filter((t) => /Figura \d+\./.test(t));
                expect(pdfImagePages).toHaveLength(1);
                const order = [...pdfImagePages[0].matchAll(/Figura (\d+)\./g)].map((m) => Number(m[1]));
                expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                expect(pdfImagePages[0]).toContain("Imágenes");
            });
        }
    }

    test("a value at the three-line wrap boundary fits; one more word (four lines) paginates safely", async ({ page }) => {
        // Grow the patient name (on its own line above the wrapped requesters) word by word: the longest
        // name that keeps the band at three rendered lines, then the first that makes four.
        const words = Array.from({ length: 40 }, (_, i) => `Apellidosintético${i + 1}`);
        const at = async (n: number) => {
            const scenario = nineFigureScenario(3, { extraBase: { study_type: "", patient_age: "", requesting_physician: REQUESTERS_LONG, patient: words.slice(0, n).join(" ") } });
            const pages = await loadComposition(page, scenario, "&clearOffsets=1");
            return { scenario, pages, lines: pages[1].repeatedLines };
        };
        let lo = 1;
        let hi = words.length;
        expect((await at(lo)).lines).toBe(3);
        expect((await at(hi)).lines).toBeGreaterThan(3);
        while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if ((await at(mid)).lines <= 3) lo = mid; else hi = mid;
        }
        const boundary = await at(lo);
        expect(boundary.lines).toBe(3);
        expectCoherentPages(boundary.pages, { figures: 9, signature: true, repeated: true });
        expectReadableFigures(expectNineOnOnePage(boundary.pages));
        const beyond = await at(lo + 1);
        expect(beyond.lines).toBe(4);
        expectCoherentPages(beyond.pages, { figures: 9, signature: true, repeated: true });
        recordEvidence("49-wrap-boundary", { boundaryWords: lo, three: geometryRecord(boundary.pages), four: geometryRecord(beyond.pages) });
        const official = await officialOutput(page, boundary.scenario, "&clearOffsets=1");
        expect(official.ready).toBe("true");
        expect(official.figuresPerPage).toEqual(boundary.pages.map((p) => p.figures.length));
    });

    for (const bandCodes of [24, 60, 140]) {
        test(`a band beyond three lines (${bandCodes} sample codes) never clips: rows fit or flow`, async ({ page }) => {
            const scenario = nineFigureScenario(3, {
                repeat: ["patient", "requesting_physician", "sample_codes"],
                extraBase: { study_type: "", patient_age: "", requesting_physician: REQUESTERS_LONG, sample_codes: codes(bandCodes) },
            });
            const pages = await loadComposition(page, scenario, "&clearOffsets=1");
            expect(pages[1].repeatedLines).toBeGreaterThan(3);
            expectCoherentPages(pages, { figures: 9, signature: true, repeated: true });
            const fit = pages.find((g) => g.figureFit)!.figureFit;
            const imagePages = pages.filter((g) => g.figures.length > 0);
            // Either a measured 3 x 3 fit, or rows of three flowing to another page: never a clipped row.
            if (fit === "page") expect(imagePages.map((g) => g.figures.length)).toEqual([9]);
            else expect(imagePages.every((g) => g.figures.length % 3 === 0 || g === imagePages[imagePages.length - 1])).toBe(true);
            recordEvidence(`49-beyond-three-lines-${bandCodes}`, geometryRecord(pages));
            const official = await officialOutput(page, scenario, "&clearOffsets=1");
            expect(official.ready).toBe("true");
            expect(official.figuresPerPage).toEqual(pages.map((p) => p.figures.length));
        });
    }

    for (const figures of [10, 12, 20]) {
        test(`${figures} figures with three repeated lines: full image pages hold 3 x 3, the rest flows`, async ({ page }) => {
            const scenario = nineFigureScenario(3, { figures });
            const pages = await loadComposition(page, scenario, "&clearOffsets=1");
            expectCoherentPages(pages, { figures, signature: true, repeated: true });
            const perPage = pages.map((g) => g.figures.length).filter((n) => n > 0);
            expect(perPage[0]).toBe(9);
            expect(perPage.reduce((a, b) => a + b, 0)).toBe(figures);
            perPage.slice(0, -1).forEach((n) => expect(n).toBe(9));
            const official = await officialOutput(page, scenario, "&clearOffsets=1");
            expect(official.ready).toBe("true");
            expect(official.figuresPerPage).toEqual(pages.map((p) => p.figures.length));
        });
    }

    test("an abnormally tall letterhead is a physical limit: rows flow, never shrunk below legibility", async ({ page }) => {
        const scenario = nineFigureScenario(3, { headerHeightMm: 70 });
        const pages = await loadComposition(page, scenario, "&clearOffsets=1");
        expectCoherentPages(pages, { figures: 9, signature: true, repeated: true });
        const imagePages = pages.filter((g) => g.figures.length > 0);
        expect(imagePages.length).toBeGreaterThan(1);
        imagePages.forEach((g) => {
            expect(g.figureFit).toBe("flow");
            g.figures.forEach((f) => expect(f.img.rect.height).toBeCloseTo(180, 0));
        });
        recordEvidence("49-tall-letterhead-limit", geometryRecord(pages));
        const official = await officialOutput(page, scenario, "&clearOffsets=1");
        expect(official.error).toBeNull();
        expect(official.ready).toBe("true");
    });
});
