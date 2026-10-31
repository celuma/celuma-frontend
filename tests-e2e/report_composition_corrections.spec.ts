/**
 * Real-stack check of the report-composition corrections of 2026-10-30 — Céluma 1.4 #44 (empty general
 * fields omitted), #45 (centered signature), #48 (amendment details stay internal) and #49 (nine figures
 * 3 x 3 on one page at 5 mm margins with a three-line repeated band). Real API, database, object storage
 * emulation, browser and the OFFICIAL PDF printed by the backend's headless Chromium.
 *
 *   1. the author builds the report in the editor: nine figures of mixed aspect ratios with 25-character
 *      captions after enough clinical text to start a fresh image page; the preview omits every empty
 *      general field, measures a three-line band, keeps the nine figures 3 x 3 on one page and centers
 *      the signature on every page;
 *   2. the reviewer's local print copy has the same pages and figures as the preview, and the signed
 *      official PDF agrees: same pages, all nine figures (in order) on one page, no empty field, the
 *      signer centered on the page;
 *   3. an amendment is opened, noted, reviewed and signed: the draft never replaces the delivered
 *      emission, the original PDF bytes never change, and neither the preview nor the amended official
 *      PDF shows the amendment's identification, reason or change note — the editor's internal panel does.
 *
 * Everything is synthetic; CELUMA_COMPOSITION_OUT receives the PDFs and the measured geometry.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ADMIN_PASSWORD, REVIEWER_PASSWORD, api, figureLab, selectAllGalleryImages, type FigureLab } from "./fixtures/report_figures_lab";

const OUT_DIR = process.env.CELUMA_COMPOSITION_OUT;
const LABELS = "ABCDEFGHI".split("");
const REQUESTERS = [
    "Dra. Solicitante Sintética Número Uno De Un Hospital Ficticio",
    "Dr. Solicitante Sintético Número Dos",
    "Dra. Solicitante Sintética Número Tres Con Nombre Muy Largo",
].join("; ");
const REASON = "Motivo interno sintético E2E";
const NOTE = "Nota interna sintética de cambios E2E";
const INTERNAL = /ENMENDADO|Enmienda 1|Sustituye a la emisión|Motivo interno sintético|Nota interna sintética/;

const field = (label: string, extra: Record<string, unknown> = {}) => ({ is_visible: true, label, value: "", ...extra });
const TEMPLATE_JSON = {
    base: {
        order_code: field("Código de orden"),
        patient: field("Paciente", { repeat_on_every_page: true }),
        study_type: field("Tipo de estudio"),
        requesting_physician: field("Médico solicitante", { repeat_on_every_page: true }),
        // No request reference on the order: visible, flagged to repeat, and empty.
        expediente: field("Expediente", { repeat_on_every_page: true }),
        reception_date: field("Fecha de recepción"),
        delivery_date: field("Fecha de entrega"),
        observaciones: { ...field("Observaciones"), type: "text", is_custom: true },
    },
    sections: {
        hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: "" },
        figuras: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient", "study_type", "requesting_physician", "expediente", "reception_date", "delivery_date", "observaciones"],
    section_order: ["hallazgos", "figuras"],
    signatureMetadata: { show_signature_section: true, require_digital_signature: true },
};
const FILLER = "Texto clínico sintético sin relevancia real que precede a la página de figuras. ".repeat(6);

/** A caption of exactly 25 characters with wide glyphs. */
const caption = (label: string) => {
    const head = `Corte ${label} sint. `;
    return head + "MWMWMWMWMWMWMWMWMWMWMWMW".slice(0, 25 - head.length);
};

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

type Body = { base: Record<string, { value?: unknown; label?: string }>; base_order: string[]; section_order: string[]; sections: Record<string, unknown>; amendment?: Record<string, unknown> };

async function fullBody(request: APIRequestContext, lab: FigureLab): Promise<Body> {
    return (await api<{ report: { report: Body } }>(request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin })).report.report;
}

/** Labels of the visible general fields whose stored value is empty / printable. */
function splitLabels(body: Body) {
    const empty: string[] = [];
    const printed: string[] = [];
    for (const key of TEMPLATE_JSON.base_order) {
        const label = (TEMPLATE_JSON.base as Record<string, { label: string }>)[key].label;
        const value = body.base[key]?.value;
        (value == null || String(value).trim() === "" ? empty : printed).push(label);
    }
    return { empty, printed };
}

/** Waits until every figure image of the visible preview pages has decoded. */
async function waitForFigures(page: Page, count: number) {
    await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('[data-page-region="body"] [data-figure] img'))
        .filter((img) => !img.closest("[aria-hidden]") && img.complete && img.naturalWidth > 0).length), { timeout: 30_000 }).toBe(count);
}

/** Measured geometry of the visible preview pages (the renderer's hidden source excluded). */
async function previewGeometry(page: Page) {
    return page.evaluate(() => {
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
        const pages = Array.from(document.querySelectorAll<HTMLElement>("div")).filter(
            (d) => d.style.width === "8.5in" && d.style.position === "relative" && !d.closest("[aria-hidden]"),
        );
        return pages.map((p) => {
            const body = p.querySelector<HTMLElement>('[data-page-region="body"]')!;
            const b = body.getBoundingClientRect();
            const block = p.querySelector('[data-signature-block]')?.getBoundingClientRect() ?? null;
            const rep = p.querySelector('[data-page-band="repeated-fields"]');
            const mm = (el: Element | null) => (el ? +(el.getBoundingClientRect().height * 25.4 / 96).toFixed(2) : null);
            const figures = Array.from(body.querySelectorAll<HTMLElement>("[data-figure]")).map((f) => {
                const r = f.getBoundingClientRect();
                const img = f.querySelector("img")!;
                return {
                    n: Number(f.dataset.figure), top: Math.round(r.top), left: Math.round(r.left), bottom: r.bottom, text: f.textContent ?? "",
                    loaded: img.complete && img.naturalWidth > 0, natural: [img.naturalWidth, img.naturalHeight], objectFit: getComputedStyle(img).objectFit,
                };
            });
            return {
                text: p.textContent ?? "",
                bodyText: body.textContent ?? "",
                overflow: body.scrollHeight - body.clientHeight,
                bodyBottom: b.bottom,
                signatureGaps: block ? { left: block.left - b.left, right: b.right - block.right } : null,
                repeatedLines: lineCount(rep),
                figures,
                bandsMm: {
                    header: mm(p.querySelector('[data-page-region="header"]')), repeated: mm(rep),
                    signature: mm(p.querySelector('[data-page-band="signature"]')), footer: mm(p.querySelector('[data-page-region="footer"]')),
                    body: mm(body), bodyTop: +((b.top - p.getBoundingClientRect().top) * 25.4 / 96).toFixed(2),
                },
                figureFit: body.querySelector("[data-figure-section]")?.getAttribute("data-figure-fit") ?? null,
                imageArea: Number(body.querySelector("[data-figure-section]")?.getAttribute("data-figure-image-height")) || null,
            };
        });
    });
}

type Geometry = Awaited<ReturnType<typeof previewGeometry>>;

function expectNineOnOnePage(pages: Geometry) {
    const imagePages = pages.filter((g) => g.figures.length > 0);
    expect(imagePages, "pages holding figures").toHaveLength(1);
    const g = imagePages[0];
    expect(g.figureFit).toBe("page");
    expect(new Set(g.figures.map((f) => f.top)).size, "three rows").toBe(3);
    expect(new Set(g.figures.map((f) => f.left)).size, "three columns").toBe(3);
    expect([...g.figures].sort((a, b) => a.top - b.top || a.left - b.left).map((f) => f.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    g.figures.forEach((f) => {
        // The real stored image decoded (no broken figure), contained without crop or stretch.
        expect(f.loaded, `figure ${f.n} decoded`).toBe(true);
        expect(f.objectFit).toBe("contain");
        expect(f.text).toContain(`Figura ${f.n}.`);
        expect(f.text).toContain(caption(LABELS[f.n - 1]));
        expect(f.bottom).toBeLessThanOrEqual(g.bodyBottom + 1);
    });
}

async function pdfPages(bytes: Buffer) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const out: Array<{ text: string; width: number; items: Array<{ str: string; x: number; w: number }> }> = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
        const p = await doc.getPage(i);
        const content = await p.getTextContent();
        const items = content.items
            .filter((it): it is typeof it & { str: string; transform: number[]; width: number } => "str" in it)
            .map((it) => ({ str: it.str, x: it.transform[4], w: it.width }));
        out.push({ text: items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim(), width: p.getViewport({ scale: 1 }).width, items });
    }
    await doc.cleanup();
    return out;
}

async function download(request: APIRequestContext, url: string): Promise<Buffer> {
    const body = await (await request.get(url)).body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    return body;
}
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function save(name: string, data: Buffer | string) {
    if (!OUT_DIR) return;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}/${name}`, data);
}

test.describe("Report composition corrections on the real stack (1.4 #44 #45 #48 #49)", () => {
    test.describe.configure({ mode: "serial" });
    let lab: FigureLab;
    let livePages = 0;
    let originalSha = "";

    test.beforeAll(async ({ playwright }) => {
        const request = await playwright.request.newContext();
        lab = await figureLab(request, LABELS, {
            templateJson: TEMPLATE_JSON,
            requestedBy: REQUESTERS,
            uploadSignature: true,
            marginsCm: 0.5,
            // wide, tall, square and the default 4:3, cycled over the nine figures
            imageSizes: [[800, 400], [400, 800], [600, 600], [640, 480]],
        });
        const body = await fullBody(request, lab);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/new_version`, {
            token: lab.admin,
            data: {
                tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: lab.orderId, title: "Reporte sintético de composición",
                report: {
                    base: body.base, base_order: body.base_order, section_order: body.section_order,
                    sections: { hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: Array.from({ length: 7 }, (_, i) => `<p>Párrafo ${i + 1}. ${FILLER}</p>`).join("") } },
                },
            },
        });
    });

    test("editor preview: empty fields omitted, three-line band, nine figures 3 x 3, centered signature", async ({ page, request }) => {
        test.setTimeout(300_000);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        await selectAllGalleryImages(page, LABELS.length);
        await expect(page.locator('[data-testid^="report-figure-"]')).toHaveCount(LABELS.length);
        const captions = page.getByPlaceholder("Nota para esta imagen");
        for (let i = 0; i < LABELS.length; i += 1) {
            await captions.nth(i).click();
            await page.keyboard.type(caption(LABELS[i]));
        }
        await page.getByTestId("report-save-top").click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });

        const { empty, printed } = splitLabels(await fullBody(request, lab));
        // The fixture really has empty optional fields (no expediente, custom field, delivery date).
        expect(empty).toEqual(expect.arrayContaining(["Expediente", "Fecha de entrega", "Observaciones"]));

        await page.goto(`/reports/${lab.reportId}`);
        await expect.poll(async () => (await previewGeometry(page)).filter((g) => g.figures.length).length, { timeout: 30_000 }).toBeGreaterThan(0);
        await waitForFigures(page, LABELS.length);
        const pages = await previewGeometry(page);
        expect(pages.length).toBeGreaterThan(1);
        pages.forEach((g, i) => {
            expect(g.overflow, `page ${i + 1} overflow`).toBeLessThanOrEqual(0);
            for (const label of empty) expect(g.text, `page ${i + 1}`).not.toContain(`${label}:`);
            expect(g.text).not.toContain("Sin especificar");
            const gaps = g.signatureGaps!;
            expect(Math.abs(gaps.left - gaps.right), `page ${i + 1} signature centered`).toBeLessThanOrEqual(1);
            if (i > 0) expect(g.repeatedLines, `page ${i + 1} band lines`).toBe(3);
        });
        for (const label of printed) expect(pages[0].bodyText).toContain(`${label}:`);
        expectNineOnOnePage(pages);
        const evidence = pages.map((g) => ({
            figures: g.figures.length, naturals: g.figures.map((f) => f.natural), figureFit: g.figureFit, imageArea: g.imageArea,
            repeatedLines: g.repeatedLines, signatureGaps: g.signatureGaps, overflow: g.overflow, bandsMm: g.bandsMm,
        }));
        save("e2e-preview-geometry.json", JSON.stringify({ empty, printed, pages: evidence }, null, 1));
    });

    test("local print copy and the signed official PDF agree with the preview", async ({ page, request }) => {
        test.setTimeout(300_000);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });

        await login(page, lab.reviewerEmail, REVIEWER_PASSWORD);
        await page.addInitScript(() => {
            (window as unknown as { __printCopy: unknown }).__printCopy = null;
            setInterval(() => {
                const doc = (document.querySelector("iframe[data-celuma-local-print]") as HTMLIFrameElement | null)?.contentDocument;
                if (!doc || !doc.querySelectorAll('[data-page-region="body"]').length) return;
                const bodies = Array.from(doc.querySelectorAll<HTMLElement>('[data-page-region="body"]'));
                (window as unknown as { __printCopy: unknown }).__printCopy = {
                    figuresPerPage: bodies.map((b) => b.querySelectorAll("[data-figure]").length),
                    signatureGaps: bodies.map((b) => {
                        const block = b.parentElement!.querySelector("[data-signature-block]")!.getBoundingClientRect();
                        const r = b.getBoundingClientRect();
                        return Math.abs((block.left - r.left) - (r.right - block.right));
                    }),
                    text: bodies.map((b) => b.parentElement!.textContent ?? "").join("\n"),
                };
            }, 20);
        });
        await page.goto(`/reports/${lab.reportId}`);
        await expect(page.getByTestId("print-local-copy")).toBeVisible({ timeout: 30_000 });
        await expect.poll(async () => (await previewGeometry(page)).filter((g) => g.figures.length).length, { timeout: 30_000 }).toBeGreaterThan(0);
        await waitForFigures(page, LABELS.length);
        const live = await previewGeometry(page);
        livePages = live.length;
        expectNineOnOnePage(live);
        await page.getByTestId("print-local-copy").click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { __printCopy: unknown }).__printCopy), { timeout: 20_000 }).not.toBeNull();
        const printed = await page.evaluate(() => (window as unknown as { __printCopy: { figuresPerPage: number[]; signatureGaps: number[]; text: string } }).__printCopy);
        expect(printed.figuresPerPage).toEqual(live.map((g) => g.figures.length));
        printed.signatureGaps.forEach((d) => expect(d).toBeLessThanOrEqual(1));
        expect(printed.text).not.toContain("Sin especificar");

        await page.getByRole("button", { name: "Firmar y publicar" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByTestId("password-confirmation-input").fill(REVIEWER_PASSWORD);
        await dialog.getByTestId("password-confirmation-submit").click();
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 120_000 });

        const delivered = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        const pdf = await download(request, delivered.pdf_url);
        originalSha = sha(pdf);
        save("e2e-official-signed.pdf", pdf);
        const pdfText = await pdfPages(pdf);
        expect(pdfText).toHaveLength(livePages);
        const { empty } = splitLabels(await fullBody(request, lab));
        pdfText.forEach((p) => {
            for (const label of empty) expect(p.text).not.toContain(`${label}:`);
            expect(p.text).not.toContain("Sin especificar");
        });
        // The signed emission's delivery date is now a value, so it is printed.
        expect(pdfText[0].text).toContain("Fecha de entrega:");
        const imagePages = pdfText.filter((p) => /Figura \d+\./.test(p.text));
        expect(imagePages).toHaveLength(1);
        expect([...imagePages[0].text.matchAll(/Figura (\d+)\./g)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        // The signer's name is centered on the page (5 mm margins on both sides) on every page.
        pdfText.forEach((p, i) => {
            const name = p.items.find((it) => it.str.includes("Revisora Sintética"));
            expect(name, `signer on PDF page ${i + 1}`).toBeTruthy();
            expect(Math.abs(name!.x + name!.w / 2 - p.width / 2), `PDF page ${i + 1} signer centered`).toBeLessThanOrEqual(2);
        });
    });

    test("an amendment never reaches the document, and the original emission stays untouched", async ({ browser, request }) => {
        test.setTimeout(300_000);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/amendments`, {
            data: { category: "SUPPLEMENT", reason: REASON, password: REVIEWER_PASSWORD }, token: lab.reviewerToken,
        });
        // The open draft never replaces the delivered emission.
        const during = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        expect(sha(await download(request, during.pdf_url))).toBe(originalSha);

        const body = await fullBody(request, lab);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/new_version`, {
            token: lab.admin,
            data: {
                tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: lab.orderId, title: "Reporte sintético de composición",
                report: { ...body, amendment: { change_note: NOTE } },
            },
        });
        expect((await fullBody(request, lab)).amendment?.change_note).toBe(NOTE);

        // The author's editor: the draft preview carries no internal amendment information; the panel does.
        const authorContext = await browser.newContext();
        const author = await authorContext.newPage();
        await login(author, lab.adminEmail, ADMIN_PASSWORD);
        await author.goto(`/reports/${lab.reportId}`);
        await expect(author.getByTestId("amendment-in-progress")).toContainText(REASON, { timeout: 30_000 });
        await expect.poll(async () => (await previewGeometry(author)).length, { timeout: 30_000 }).toBeGreaterThan(1);
        (await previewGeometry(author)).forEach((g) => expect(g.text).not.toMatch(INTERNAL));
        await authorContext.close();

        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/sign-and-publish`, { data: { password: REVIEWER_PASSWORD }, token: lab.reviewerToken });

        const amended = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        expect(amended.version_no).toBeGreaterThan(during.version_no);
        const amendedPdf = await download(request, amended.pdf_url);
        save("e2e-official-amended.pdf", amendedPdf);
        const amendedText = await pdfPages(amendedPdf);
        amendedText.forEach((p) => expect(p.text).not.toMatch(INTERNAL));
        expect(amendedText.some((p) => /Figura 9\./.test(p.text))).toBe(true);

        // The original signed emission's bytes are unchanged and still downloadable by version.
        const v1 = await api<{ pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/versions/${during.version_no}/pdf`, { token: lab.admin });
        expect(sha(await download(request, v1.pdf_url))).toBe(originalSha);

        // Internal users keep the identification, reason and change note outside the document.
        const reviewerContext = await browser.newContext();
        const reviewer = await reviewerContext.newPage();
        await login(reviewer, lab.reviewerEmail, REVIEWER_PASSWORD);
        await reviewer.goto(`/reports/${lab.reportId}`);
        const internal = reviewer.getByTestId("amendment-identification-internal");
        await expect(internal).toContainText("Emisión vigente: Enmienda 1", { timeout: 30_000 });
        await expect(internal).toContainText(REASON);
        await expect(internal).toContainText(NOTE);
        await expect(reviewer.getByTestId("amendment-history-1")).toContainText(`Motivo de la enmienda: ${REASON}`);
        await expect.poll(async () => (await previewGeometry(reviewer)).length, { timeout: 30_000 }).toBeGreaterThan(1);
        (await previewGeometry(reviewer)).forEach((g) => expect(g.text).not.toMatch(INTERNAL));
        save("e2e-amendment.json", JSON.stringify({ originalSha, amendedSha: sha(amendedPdf), originalVersion: during.version_no, amendedVersion: amended.version_no }, null, 1));
        await reviewerContext.close();
    });
});
