/**
 * Real-stack regressions for independent review round 1 (R1, R2, R3) — official PDF, real routes.
 *
 *  R1  one oversize paragraph is paginated: the OFFICIAL PDF keeps every repetition (CELUMA_COMPOSITION_OUT
 *      receives it for text extraction);
 *  R2  a layout with no usable page is refused at signing: nothing is stored or published, the report stays
 *      approved and the failure is the layout one, not a signature one;
 *  R3  an authorized code correction after the last save blocks submission with an actionable conflict,
 *      the corrected code is what gets saved, reviewed, approved and signed.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { ADMIN_PASSWORD, REVIEWER_PASSWORD, API_BASE, api, figureLab, type FigureLab } from "./fixtures/report_figures_lab";

const OUT_DIR = process.env.CELUMA_COMPOSITION_OUT;
const SENTENCE = "Texto de relleno sin relevancia clínica real para forzar la paginación. ";

const field = (label: string, extra: Record<string, unknown> = {}) => ({ is_visible: true, label, value: "", ...extra });
const template = (extraBase: Record<string, unknown> = {}) => ({
    base: { patient: field("Paciente", { repeat_on_every_page: true }), sample_codes: field("Códigos de muestra"), ...extraBase },
    sections: {
        hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: "" },
        figuras: { is_visible: true, label: "Imágenes", type: "images", content: [] },
    },
    base_order: ["patient", "sample_codes"],
    section_order: ["hallazgos", "figuras"],
    signatureMetadata: { show_signature_section: true, require_digital_signature: true },
});

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

async function saveContent(request: import("@playwright/test").APIRequestContext, lab: FigureLab, hallazgos: string) {
    const full = await api<{ report: { report: { base: Record<string, unknown>; base_order: string[]; section_order: string[] } } }>(
        request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin },
    );
    const r = full.report.report;
    await api(request, "POST", `/api/v1/reports/${lab.reportId}/new_version`, {
        token: lab.admin,
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: lab.orderId, title: "Reporte de revisión",
            report: { base: r.base, sections: { hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: hallazgos } }, base_order: r.base_order, section_order: r.section_order },
        },
    });
}

async function signViaUi(page: Page, lab: FigureLab) {
    await login(page, lab.reviewerEmail, REVIEWER_PASSWORD);
    await page.goto(`/reports/${lab.reportId}`);
    await page.getByRole("button", { name: "Firmar y publicar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("password-confirmation-input").fill(REVIEWER_PASSWORD);
    await dialog.getByTestId("password-confirmation-submit").click();
}

test.describe("Independent review round 1 — real stack", () => {
    test("R1: an oversize paragraph reaches the official PDF in full", async ({ page, request }) => {
        test.setTimeout(240_000);
        const lab = await figureLab(request, ["A"], { templateJson: template(), uploadSignature: true, marginsCm: 1.5 });
        await saveContent(request, lab, `<p>${SENTENCE.repeat(80)}</p>`);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });
        await signViaUi(page, lab);
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 120_000 });
        const delivered = await api<{ pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        const pdf = await (await request.get(delivered.pdf_url)).body();
        if (OUT_DIR) {
            mkdirSync(OUT_DIR, { recursive: true });
            writeFileSync(`${OUT_DIR}/long-paragraph.pdf`, pdf);
        }
        expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    });

    test("R2: a layout with no usable page is refused at signing; nothing is published", async ({ page, request }) => {
        test.setTimeout(240_000);
        // 4 cm margins + header 100 mm + footer 60 mm leave a valid base body (31 mm) that the per-page
        // signature band then exhausts: a composed layout with no usable page.
        const lab = await figureLab(request, ["A"], { templateJson: template(), uploadSignature: true, marginsCm: 4, headerHeightMm: 100, footerHeightMm: 60 });
        await saveContent(request, lab, `<p>${SENTENCE.repeat(40)}</p>`);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });
        await signViaUi(page, lab);
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toHaveCount(0, { timeout: 60_000 });
        const res = await request.fetch(`${API_BASE}/api/v1/reports/${lab.reportId}/pdf`, { headers: { Authorization: `Bearer ${lab.admin}` } });
        expect(res.ok()).toBe(false);
        const full = await api<{ report: { status: string; published_at: string | null } }>(
            request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin },
        );
        expect(full.report.status).toBe("APPROVED");
        expect(full.report.published_at).toBeNull();
    });

    test("R3: correction -> submit is refused -> save -> submit/approve/sign carry the corrected code", async ({ page, request }) => {
        test.setTimeout(240_000);
        const lab = await figureLab(request, ["A"], { templateJson: template({ expediente: field("Expediente") }), extraSamples: 1, uploadSignature: true, marginsCm: 1.5 });
        await saveContent(request, lab, "<p>Hallazgo sintético.</p>");
        const samples = (await api<{ samples: Array<{ id: string; sample_code: string }> }>(request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin })).samples;
        const target = samples[0];
        await api(request, "POST", `/api/v1/laboratory/samples/${target.id}/code-correction`, {
            data: { sample_code: "COR-REV-1", reason: "Corrección sintética de revisión" }, token: lab.admin,
        });

        // Submitting the stale content is refused with the actionable conflict; nothing moves.
        const blocked = await request.fetch(`${API_BASE}/api/v1/reports/${lab.reportId}/submit`, {
            method: "POST", headers: { Authorization: `Bearer ${lab.admin}`, "Content-Type": "application/json" }, data: {},
        });
        expect(blocked.status()).toBe(409);
        expect(await blocked.text()).toContain("report_sample_codes_stale");

        // In the editor, submitting shows the actionable warning instead of a raw error.
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        await page.getByRole("button", { name: "Enviar a Revisión" }).click();
        await expect(page.getByText("Los códigos de muestra cambiaron")).toBeVisible({ timeout: 15_000 });

        // Save (the author sees the live corrected code), then the submission goes through.
        await page.getByTestId("report-save-top").click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });
        const approved = JSON.stringify(await api(request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin }));
        expect(approved).toContain("COR-REV-1");
        expect(approved).not.toContain(target.sample_code);
        await signViaUi(page, lab);
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 120_000 });
    });
});
