/**
 * Real end-to-end — Céluma 1.4 (#13): amendments of signed reports, against
 * the real backend, real object storage emulation and the real PDF pipeline.
 *
 * 1. A V2 report is signed and published. The assigned reviewer opens an
 *    amendment in the browser (category, reason, own password); while it is
 *    drafted the delivered PDF is still the original. The author writes the
 *    change note, submits; the reviewer approves and signs with their
 *    password: the amended emission is republished and delivered, and the
 *    order timeline shows the reopening for amendment, the linked review steps
 *    and the republication, each exactly once.
 * 2. An open amendment is cancelled in the browser (reason + password): the
 *    report is published again with its original emission, and the timeline
 *    shows the cancellation.
 *
 * Each run creates its own synthetic laboratory; passwords are synthetic.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";
const OUT_DIR = process.env.CELUMA_E2E_OUT_DIR || "";

const ADMIN_PASSWORD = "E2eAmendAdmin!2026";
const REVIEWER_PASSWORD = "E2eAmendRev!2026";

type Json = Record<string, unknown>;

function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function api<T = Json>(
    request: APIRequestContext,
    method: "GET" | "POST" | "PUT" | "PATCH",
    urlPath: string,
    options: { data?: unknown; token?: string } = {},
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
    if (method === "POST" && /\/laboratory\/(orders\/(unified)?|samples\/)$/.test(urlPath)) {
        headers["Idempotency-Key"] = crypto.randomUUID();
    }
    const res = await request.fetch(`${API_BASE}${urlPath}`, { method, headers, data: options.data });
    if (!res.ok()) throw new Error(`${method} ${urlPath} -> ${res.status()}: ${await res.text()}`);
    return (await res.json().catch(() => ({}))) as T;
}

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

async function confirmInDialog(page: Page, { password, reason, category }: { password: string; reason?: string; category?: string }) {
    const dialog = page.getByRole("dialog");
    if (category) {
        await dialog.getByRole("combobox").click();
        await page.getByText(category, { exact: true }).click();
    }
    if (reason) await dialog.getByTestId("password-confirmation-reason").fill(reason);
    await dialog.getByTestId("password-confirmation-input").fill(password);
    await dialog.getByTestId("password-confirmation-submit").click();
}

/** A synthetic laboratory whose V2 report is signed and published (version 1). */
async function publishedReport(request: APIRequestContext) {
    const suffix = uniqueSuffix();
    const adminEmail = `e2e-amend-admin-${suffix}@example.com`;
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", {
        data: {
            tenant: { name: `E2E Enmiendas ${suffix}` },
            branch: { code: "MAIN", name: "Main Branch" },
            admin_user: { email: adminEmail, password: ADMIN_PASSWORD, full_name: "E2E Admin" },
        },
    });
    const admin = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: adminEmail, password: ADMIN_PASSWORD },
    })).access_token;
    const letterhead = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", { data: { name: `Membrete ${suffix}` }, token: admin });
    await api(request, "PUT", `/api/v1/report-letterheads/${letterhead.id}/versions/current`, {
        data: {
            configuration: {
                paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
                header: { enabled: true, institution_name: "Laboratorio Sintético" },
                footer: { enabled: true, custom_text: "Pie sintético", show_page_number: true },
                style: { primary_color: "#336699" },
            },
        },
        token: admin,
    });
    await api(request, "POST", `/api/v1/report-letterheads/${letterhead.id}/default`, { token: admin });
    const templateJson = {
        base: { diagnosis: { is_visible: true, label: "Diagnóstico", is_custom: true, type: "text", value: "" } },
        sections: { hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: "" } },
        base_order: ["diagnosis"],
        section_order: ["hallazgos"],
    };
    const template = await api<{ id: string }>(request, "POST", "/api/v1/reports/templates/", { data: { name: `Plantilla ${suffix}`, template_json: templateJson }, token: admin });
    const studyType = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", {
        data: { code: `EN${suffix.slice(-6)}`, name: `Estudio ${suffix}`, default_report_template_id: template.id }, token: admin,
    });
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", {
        data: { tenant_id: reg.tenant_id, branch_id: reg.branch_id, first_name: "E2E", last_name: "Paciente", patient_code: `EN-PAT-${suffix}` }, token: admin,
    });
    const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id, patient_id: patient.id, study_type_id: studyType.id,
            samples: [{ sample_type: "Bloque", collected_at: "2026-10-01", received_at: "2026-10-01" }],
        },
        token: admin,
    });
    const reviewerEmail = `e2e-amend-rev-${suffix}@example.com`;
    const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", {
        data: { email: reviewerEmail, first_name: "Revisora", last_name: "Sintética", role: "reviewer", password: REVIEWER_PASSWORD, branch_ids: [reg.branch_id] },
        token: admin,
    });
    await api(request, "PUT", `/api/v1/laboratory/orders/${order.id}/reviewers`, { data: { reviewer_ids: [reviewer.id] }, token: admin });
    const reviewerToken = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: reviewerEmail, password: REVIEWER_PASSWORD },
    })).access_token;
    const tpl = await api<{ template_hash: string }>(request, "GET", `/api/v1/reports/templates/${template.id}`, { token: admin });
    const report = await api<{ id: string }>(request, "POST", "/api/v1/reports/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id, order_id: order.id, title: "Reporte sintético",
            report: { base: {}, sections: {}, base_order: [], section_order: [] },
            template_id: template.id, template_hash: tpl.template_hash,
        },
        token: admin,
    });
    await api(request, "POST", `/api/v1/reports/${report.id}/submit`, { data: {}, token: admin });
    await api(request, "POST", `/api/v1/reports/${report.id}/approve`, { data: {}, token: reviewerToken });
    const published = await api<{ status: string; version_no: number }>(request, "POST", `/api/v1/reports/${report.id}/sign-and-publish`, {
        data: { password: REVIEWER_PASSWORD }, token: reviewerToken,
    });
    expect(published.status).toBe("PUBLISHED");
    return { adminEmail, admin, reviewerEmail, reviewerToken, orderId: order.id, reportId: report.id };
}

async function events(request: APIRequestContext, lab: { admin: string; orderId: string }) {
    return (await api<{ events: Array<{ event_type: string; metadata?: Json }> }>(
        request, "GET", `/api/v1/laboratory/orders/${lab.orderId}/events`, { token: lab.admin },
    )).events;
}

test.describe("Amendments of signed reports (1.4 #13)", () => {
    test("reopen for amendment, review and republish; the timeline tells it", async ({ browser, request }) => {
        test.setTimeout(240_000);
        const lab = await publishedReport(request);

        // --- 1. The reviewer opens the amendment in the browser -------------
        const reviewerContext = await browser.newContext();
        const reviewerPage = await reviewerContext.newPage();
        await login(reviewerPage, lab.reviewerEmail, REVIEWER_PASSWORD);
        await reviewerPage.goto(`/reports/${lab.reportId}`);
        await expect(reviewerPage.getByTestId("amend-report")).toBeVisible({ timeout: 30_000 });
        await reviewerPage.getByTestId("amend-report").click();
        await confirmInDialog(reviewerPage, {
            password: REVIEWER_PASSWORD, reason: "Resultado de IHC posterior", category: "Complemento (p. ej., IHC)",
        });
        await expect(reviewerPage.getByTestId("amendment-in-progress")).toContainText("Enmienda 1 en curso", { timeout: 30_000 });

        // While drafted, the delivered emission is still the original.
        const delivered = await api<{ version_no: number }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        expect(delivered.version_no).toBe(1);

        // --- 2. The author writes the change note and submits ---------------
        const authorContext = await browser.newContext();
        const authorPage = await authorContext.newPage();
        await login(authorPage, lab.adminEmail, ADMIN_PASSWORD);
        await authorPage.goto(`/reports/${lab.reportId}`);
        await expect(authorPage.getByTestId("amendment-change-note")).toBeVisible({ timeout: 30_000 });
        await authorPage.getByTestId("amendment-change-note").fill("Se agrega el resultado de inmunohistoquímica.");
        await authorPage.getByTestId("report-save-top").click();
        await expect(authorPage).toHaveURL(/\/orders\//, { timeout: 30_000 });
        await authorPage.goto(`/reports/${lab.reportId}`);
        await authorPage.getByRole("button", { name: "Enviar a Revisión" }).click();
        await expect(authorPage.getByRole("button", { name: "Enviar a Revisión" })).toHaveCount(0, { timeout: 30_000 });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });

        // --- 3. The reviewer signs: republication ---------------------------
        await reviewerPage.reload();
        await expect(reviewerPage.getByRole("button", { name: "Firmar y publicar" })).toBeVisible({ timeout: 30_000 });
        await reviewerPage.getByRole("button", { name: "Firmar y publicar" }).click();
        await confirmInDialog(reviewerPage, { password: REVIEWER_PASSWORD });
        await expect(reviewerPage.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 60_000 });
        const after = await api<{ version_no: number }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        expect(after.version_no).toBeGreaterThan(1);
        if (OUT_DIR) {
            mkdirSync(OUT_DIR, { recursive: true });
            writeFileSync(`${OUT_DIR}/amended-report.json`, JSON.stringify({ reportId: lab.reportId, versionNo: after.version_no }));
        }

        // --- 4. Exactly once, correlated, and visible ------------------------
        const all = await events(request, lab);
        const reopened = all.filter((e) => e.metadata?.action === "REPORT_REOPENED_FOR_AMENDMENT");
        const republished = all.filter((e) => e.metadata?.action === "REPORT_REPUBLISHED");
        expect(reopened).toHaveLength(1);
        expect(republished).toHaveLength(1);
        const amendmentId = reopened[0].metadata?.amendment_id;
        expect(republished[0].metadata?.amendment_id).toBe(amendmentId);
        expect(republished[0].metadata?.amends_version_no).toBe(1);
        expect(all.filter((e) => e.event_type === "REPORT_SUBMITTED" && e.metadata?.amendment_id === amendmentId)).toHaveLength(1);
        expect(all.filter((e) => e.event_type === "REPORT_APPROVED" && e.metadata?.amendment_id === amendmentId)).toHaveLength(1);

        await reviewerPage.goto(`/orders/${lab.orderId}`);
        await expect(reviewerPage.getByText(/Reabrió el reporte para la enmienda 1/)).toBeVisible({ timeout: 30_000 });
        await expect(reviewerPage.getByText(/firmó y republicó el/)).toBeVisible();
        await expect(reviewerPage.getByText(/firmó y publicó el/)).toBeVisible(); // the original publication remains
        await expect(reviewerPage.getByTestId("timeline-amendment-tag").first()).toBeVisible();

        await authorContext.close();
        await reviewerContext.close();
    });

    test("cancel an open amendment from the browser", async ({ browser, request }) => {
        test.setTimeout(180_000);
        const lab = await publishedReport(request);
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/amendments`, {
            data: { category: "CORRECTION", reason: "Corrección de lateralidad", password: REVIEWER_PASSWORD },
            token: lab.reviewerToken,
        });

        const context = await browser.newContext();
        const page = await context.newPage();
        await login(page, lab.reviewerEmail, REVIEWER_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        await expect(page.getByTestId("cancel-amendment")).toBeVisible({ timeout: 30_000 });
        await page.getByTestId("cancel-amendment").click();
        await confirmInDialog(page, { password: REVIEWER_PASSWORD, reason: "Se abrió por error" });
        await expect(page.getByTestId("amendment-in-progress")).toHaveCount(0, { timeout: 30_000 });
        const report = await api<{ status: string; version_no: number }>(request, "GET", `/api/v1/reports/${lab.reportId}`, { token: lab.admin });
        expect(report.status).toBe("PUBLISHED");
        expect(report.version_no).toBe(1);

        const cancelled = (await events(request, lab)).filter((e) => e.metadata?.action === "REPORT_AMENDMENT_CANCELLED");
        expect(cancelled).toHaveLength(1);
        await page.goto(`/orders/${lab.orderId}`);
        await expect(page.getByText(/Canceló la enmienda 1 del reporte/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Se abrió por error/)).toBeVisible();
        await context.close();
    });
});
