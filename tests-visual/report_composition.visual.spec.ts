/**
 * Real-browser geometry checks for report composition (Céluma 1.4, #12/#14/#15/#19).
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
import type { CompositionScenario } from "../src/test/fixtures/reports/composition_scenarios";

interface Rect { top: number; bottom: number; left: number; right: number; height: number; width: number }
interface PageGeometry {
    page: Rect;
    header: Rect | null;
    repeated: Rect | null;
    body: Rect;
    bodyScrollOverflow: number;
    signature: Rect | null;
    footer: Rect | null;
    figures: Array<{ n: number; rect: Rect; caption: string; text: string }>;
    bodyText: string;
    repeatedText: string | null;
    repeatedLabels: string[];
    signatureText: string | null;
    signatureImg: { rect: Rect; naturalWidth: number; naturalHeight: number } | null;
    signatureImgCount: number;
    bodyChildCount: number;
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
        return pages.map((p) => {
            const body = p.querySelector<HTMLElement>('[data-page-region="body"]')!;
            const repeated = p.querySelector<HTMLElement>('[data-page-band="repeated-fields"]');
            const signature = p.querySelector<HTMLElement>('[data-page-band="signature"]');
            const img = signature?.querySelector<HTMLImageElement>("img") ?? null;
            return {
                page: rectOf(p)!,
                header: rectOf(p.querySelector('[data-page-region="header"]')),
                repeated: rectOf(repeated),
                body: rectOf(body)!,
                bodyScrollOverflow: body.scrollHeight - body.clientHeight,
                signature: rectOf(signature),
                footer: rectOf(p.querySelector('[data-page-region="footer"]')),
                figures: Array.from(body.querySelectorAll<HTMLElement>("[data-figure]")).map((f) => ({
                    n: Number(f.dataset.figure),
                    rect: rectOf(f)!,
                    caption: (f.textContent ?? "").trim(),
                    text: (f.textContent ?? "").trim(),
                })),
                bodyText: body.textContent ?? "",
                repeatedText: repeated ? repeated.textContent : null,
                repeatedLabels: repeated
                    ? Array.from(repeated.querySelectorAll("b")).map((b) => b.textContent ?? "")
                    : [],
                signatureText: signature ? signature.textContent : null,
                signatureImg: img
                    ? { rect: rectOf(img)!, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }
                    : null,
                signatureImgCount: signature?.querySelectorAll("img").length ?? 0,
                bodyChildCount: body.childElementCount,
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

    test("an empty repeated value is shown as unspecified, not dropped", async ({ page }) => {
        const pages = await loadComposition(page, {
            figures: 6,
            paragraphs: 5,
            repeat: ["patient", "sample_codes"],
            extraBase: { sample_codes: "" },
        });
        expect(pages[1].repeatedLabels).toEqual(["Paciente:", "Códigos de muestra:"]);
        expect(pages[1].repeatedText).toContain("Sin especificar");
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
