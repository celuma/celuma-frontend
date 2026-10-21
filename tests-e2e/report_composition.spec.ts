/**
 * Real-stack check of report composition — Céluma 1.4 #12 (sample codes), #14 (compact signature per
 * page), #15 (repeated fields), #19 (figures and pagination). Real API, real database, real object
 * storage (synthetic/local), real browser, and the OFFICIAL PDF produced by the backend's headless
 * Chromium from the internal render route.
 *
 *   1. the editor shows the order's actual sample codes without the author typing them, follows a
 *      code corrected elsewhere when the tab regains focus (leaving typed edits untouched), and the
 *      save stores the server's value;
 *   2. the editor preview paginates 12 figures + repeated fields + a per-page signature without
 *      overlap or clipping, measured on real rectangles;
 *   3. the officially generated PDF of the signed report is written to CELUMA_COMPOSITION_OUT for
 *      text / page / image analysis (see the engineering notes), and its stored bytes never change.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ADMIN_PASSWORD, REVIEWER_PASSWORD, api, figureLab, selectAllGalleryImages, type FigureLab } from "./fixtures/report_figures_lab";

const OUT_DIR = process.env.CELUMA_COMPOSITION_OUT;
// 12 figures by default; CELUMA_COMPOSITION_FIGURES (up to 26) reproduces the 9 / 10 / 20 cases.
const FIGURE_COUNT = Math.min(26, Number(process.env.CELUMA_COMPOSITION_FIGURES || 12));
const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").slice(0, FIGURE_COUNT);

const field = (label: string, extra: Record<string, unknown> = {}, custom = false) => ({
    is_visible: true, label, value: "", ...(custom ? { type: "text", is_custom: true } : {}), ...extra,
});
const TEMPLATE_JSON = {
    base: {
        order_code: field("Código de orden"),
        patient: field("Paciente", { repeat_on_every_page: true }),
        study_type: field("Tipo de estudio"),
        requesting_physician: field("Médico solicitante", { repeat_on_every_page: true }),
        expediente: field("Expediente", { repeat_on_every_page: true }),
        sample_codes: field("Códigos de muestra", { repeat_on_every_page: true }),
        reception_date: field("Fecha de recepción"),
    },
    sections: {
        hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: "" },
        figuras: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["order_code", "patient", "study_type", "requesting_physician", "expediente", "sample_codes", "reception_date"],
    section_order: ["hallazgos", "figuras"],
    signatureMetadata: { show_signature_section: true, require_digital_signature: true },
};

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

/** Measured geometry of every rendered page of the live preview (visible pages only). */
async function previewGeometry(page: Page) {
    return page.evaluate(() => {
        const rect = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        };
        const pages = Array.from(document.querySelectorAll<HTMLElement>("div")).filter(
            (d) => d.style.width === "8.5in" && d.style.position === "relative" && !d.closest("[aria-hidden]"),
        );
        return pages.map((p) => {
            const body = p.querySelector<HTMLElement>('[data-page-region="body"]')!;
            const sig = p.querySelector('[data-page-band="signature"]');
            const rep = p.querySelector('[data-page-band="repeated-fields"]');
            return {
                page: rect(p)!,
                body: rect(body)!,
                header: rect(p.querySelector('[data-page-region="header"]')),
                footer: rect(p.querySelector('[data-page-region="footer"]')),
                signature: rect(sig),
                repeated: rect(rep),
                repeatedText: rep?.textContent ?? null,
                signatureImg: !!sig?.querySelector("img"),
                overflow: body.scrollHeight - body.clientHeight,
                figures: Array.from(body.querySelectorAll<HTMLElement>("[data-figure]")).map((f) => ({
                    n: Number(f.dataset.figure), rect: rect(f)!,
                })),
            };
        });
    });
}

test.describe("Report composition on the real stack (1.4 #12 #14 #15 #19)", () => {
    // The second test continues from the state the first leaves (a corrected code, a saved report).
    test.describe.configure({ mode: "serial" });
    let lab: FigureLab;
    let codes: string[] = [];

    test.beforeAll(async ({ playwright }) => {
        const request = await playwright.request.newContext();
        lab = await figureLab(request, LABELS, {
            templateJson: TEMPLATE_JSON,
            expediente: "00987654",
            requestedBy: "Dra. Solicitante Sintética E2E",
            extraSamples: 2,
            uploadSignature: true,
            marginsCm: 1.5,
        });
        const full = await api<{ samples: Array<{ sample_code: string }> }>(
            request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin },
        );
        codes = full.samples.map((s) => s.sample_code);
    });

    test("sample codes, repeated fields and the per-page signature in the editor", async ({ page, request }) => {
        test.setTimeout(300_000);
        expect(codes.length).toBe(3);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        // The images were uploaded to the first sample; the editor opens whichever sample the API lists
        // first, so open that sample's tab explicitly.
        const imageSampleCode = (await api<{ samples: Array<{ id: string; sample_code: string }> }>(
            request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin },
        )).samples.find((x) => x.id === lab.sampleId)!.sample_code;
        await page.getByText(new RegExp(`Muestra \\d+ · ${imageSampleCode}`)).first().click();
        await selectAllGalleryImages(page, LABELS.length);
        await expect(page.locator('[data-testid^="report-figure-"]')).toHaveCount(LABELS.length);
        const captions = page.getByPlaceholder("Nota para esta imagen");
        for (let i = 0; i < LABELS.length; i += 1) {
            await captions.nth(i).click();
            await page.keyboard.type(`Corte ${LABELS[i]}`);
        }

        const preview = page.locator(".ant-card", { hasText: "Vista previa" });
        // (#12) every actual code is in the preview, typed by nobody.
        const sorted = [...codes].sort();
        for (const code of sorted) await expect(preview).toContainText(code);

        // External correction while the report is open: the preview follows on focus, edits stay.
        const corrected = "COR-E2E-1";
        const target = full0(codes);
        await api(request, "POST", `/api/v1/laboratory/samples/${await sampleIdOf(request, lab, target)}/code-correction`, {
            data: { sample_code: corrected, reason: "Corrección de prueba E2E" }, token: lab.admin,
        });
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(preview).toContainText(corrected, { timeout: 20_000 });
        await expect(preview).not.toContainText(target);
        expect(await captions.first().inputValue()).toBe("Corte A");

        // (#12) the save stores the server-resolved value, in natural code order.
        await page.getByTestId("report-save-top").click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });
        const stored = await api<{ report: { report: { base: Record<string, { value: string }> } } }>(
            request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin },
        );
        const expectedCodes = codes.map((c) => (c === target ? corrected : c)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
        expect(stored.report.report.base.sample_codes.value.split(", ").sort()).toEqual([...expectedCodes].sort());
        expect(stored.report.report.base.expediente.value).toBe("00987654");

        // (#14/#15/#19) real geometry of the reopened editor preview.
        await page.goto(`/reports/${lab.reportId}`);
        await expect(preview).toContainText(corrected, { timeout: 30_000 });
        await expect.poll(async () => (await previewGeometry(page)).length, { timeout: 30_000 }).toBeGreaterThan(1);
        const pages = await previewGeometry(page);
        const overlap = (a: { top: number; bottom: number }, b: { top: number; bottom: number } | null) =>
            !!b && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
        pages.forEach((g, i) => {
            expect(g.overflow, `page ${i + 1} overflow`).toBeLessThanOrEqual(0);
            expect(g.signature, `signature on page ${i + 1}`).not.toBeNull();
            expect(overlap(g.body, g.signature)).toBe(false);
            expect(overlap(g.body, g.footer)).toBe(false);
            expect(overlap(g.signature!, g.footer)).toBe(false);
            expect(overlap(g.body, g.repeated)).toBe(false);
            expect(g.repeated !== null, `repeated band on page ${i + 1}`).toBe(i > 0);
            g.figures.forEach((f) => {
                expect(f.rect.top).toBeGreaterThanOrEqual(g.body.top - 1);
                expect(f.rect.bottom).toBeLessThanOrEqual(g.body.bottom + 1);
            });
        });
        expect(pages.flatMap((g) => g.figures.map((f) => f.n))).toEqual(LABELS.map((_, i) => i + 1));
        expect(pages[1].repeatedText).toContain("Paciente:");
        expect(pages[1].repeatedText).toContain("Expediente: 00987654");
        expect(pages[1].repeatedText).toContain(corrected);
        // Unsigned draft: the band says so and shows no autograph image.
        expect(pages.every((g) => !g.signatureImg)).toBe(true);
    });

    test("the official PDF of the signed report", async ({ page, request }) => {
        test.setTimeout(300_000);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });

        // A sample code can no longer change once the report is under review (frozen with the report).
        const locked = await request.fetch(
            `${process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000"}/api/v1/laboratory/samples/${await sampleIdOf(request, lab, "COR-E2E-1")}/code-correction`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${lab.admin}`, "Content-Type": "application/json" },
                data: { sample_code: "LATE-9", reason: "Corrección tardía" },
            },
        );
        expect(locked.ok()).toBe(false);

        await login(page, lab.reviewerEmail, REVIEWER_PASSWORD);
        // Local print copy: the cloned pages (captured from the print iframe before window.print) have
        // the same pages, bands and figures as the live preview of the same report.
        await page.addInitScript(() => {
            (window as unknown as { __printCopy: unknown }).__printCopy = null;
            setInterval(() => {
                const doc = (document.querySelector("iframe[data-celuma-local-print]") as HTMLIFrameElement | null)?.contentDocument;
                if (!doc || !doc.querySelectorAll('[data-page-region="body"]').length) return;
                (window as unknown as { __printCopy: unknown }).__printCopy = {
                    pages: doc.querySelectorAll('[data-page-region="body"]').length,
                    signatures: doc.querySelectorAll('[data-page-band="signature"]').length,
                    repeated: doc.querySelectorAll('[data-page-band="repeated-fields"]').length,
                    figures: Array.from(doc.querySelectorAll("[data-figure]")).map((f) => Number((f as HTMLElement).dataset.figure)),
                };
            }, 20);
        });
        await page.goto(`/reports/${lab.reportId}`);
        await expect(page.getByTestId("print-local-copy")).toBeVisible({ timeout: 30_000 });
        await expect.poll(async () => (await previewGeometry(page)).length, { timeout: 30_000 }).toBeGreaterThan(1);
        const live = await previewGeometry(page);
        await page.getByTestId("print-local-copy").click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { __printCopy: unknown }).__printCopy), { timeout: 20_000 }).not.toBeNull();
        const printed = await page.evaluate(() => (window as unknown as { __printCopy: { pages: number; signatures: number; repeated: number; figures: number[] } }).__printCopy);
        expect(printed.pages).toBe(live.length);
        expect(printed.signatures).toBe(live.length);
        expect(printed.repeated).toBe(live.length - 1);
        expect(printed.figures).toEqual(LABELS.map((_, i) => i + 1));

        await page.getByRole("button", { name: "Firmar y publicar" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByTestId("password-confirmation-input").fill(REVIEWER_PASSWORD);
        await dialog.getByTestId("password-confirmation-submit").click();
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 120_000 });

        const delivered = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        const pdf = await (await request.get(delivered.pdf_url)).body();
        expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        const sha = createHash("sha256").update(pdf).digest("hex");
        if (OUT_DIR) {
            mkdirSync(OUT_DIR, { recursive: true });
            writeFileSync(`${OUT_DIR}/official.pdf`, pdf);
            writeFileSync(`${OUT_DIR}/expected.json`, JSON.stringify({
                figures: LABELS.length,
                captions: LABELS.map((l) => `Corte ${l}`),
                codes: codes.map((c) => (c === full0(codes) ? "COR-E2E-1" : c)),
                expediente: "00987654",
                sha256: sha,
            }));
        }

        // The delivered artifact is stable: reading it again gives the same bytes.
        const again = await api<{ pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        expect(createHash("sha256").update(await (await request.get(again.pdf_url)).body()).digest("hex")).toBe(sha);
    });
});

/** The code the spec corrects: the lexicographically first generated one. */
function full0(codes: string[]): string {
    return [...codes].sort()[0];
}

async function sampleIdOf(request: import("@playwright/test").APIRequestContext, lab: FigureLab, code: string): Promise<string> {
    const full = await api<{ samples: Array<{ id: string; sample_code: string }> }>(
        request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin },
    );
    const found = full.samples.find((s) => s.sample_code === code);
    if (!found) throw new Error(`sample ${code} not found`);
    return found.id;
}
