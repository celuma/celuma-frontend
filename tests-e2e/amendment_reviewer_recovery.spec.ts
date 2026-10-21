/**
 * Real end-to-end — Céluma 1.4 follow-up: amendment review availability and recovery
 * (synthetic laboratory, real backend; passwords are synthetic).
 *
 * A signed V2 report's old reviewer assignee loses the reviewer role (now admin only). In the browser:
 *   1. the admin opens an amendment, saves the change note and submits: refused in Spanish with an
 *      actionable message, the report stays DRAFT;
 *   2. the order page flags the assignee ("No puede revisar") and the admin replaces them with a
 *      qualified reviewer from the picker; submission then enters review;
 *   3. the admin gets no approval controls (an explanation instead) and cannot clear the last reviewer;
 *   4. the assigned reviewer sees Aprobar / Solicitar Cambios, approves and signs with their own password;
 *   5. the original signed emission still delivers its original PDF, byte for byte.
 */
import { createHash } from "node:crypto";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";

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
    const adminEmail = `e2e-amrev-admin-${suffix}@example.com`;
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", {
        data: {
            tenant: { name: `E2E AmRev ${suffix}` },
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
    const reviewerEmail = `e2e-amrev-rev-${suffix}@example.com`;
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
    return { adminEmail, admin, reviewerEmail, reviewerToken, orderId: order.id, reportId: report.id, branchId: reg.branch_id };
}


const SECOND_REVIEWER_PASSWORD = "E2eAmRevSecond!2026";

test.describe("Amendment reviewer availability and recovery (1.4)", () => {
    test("a stale assignee is refused clearly, repaired from the order page, and the new reviewer republishes", async ({ browser, request }) => {
        test.setTimeout(300_000);
        const lab = await publishedReport(request);
        const suffix = uniqueSuffix();
        const users = await api<{ users?: Array<{ id: string; email: string }> } | Array<{ id: string; email: string }>>(request, "GET", "/api/v1/users/", { token: lab.admin });
        const list = Array.isArray(users) ? users : users.users ?? [];
        const oldReviewer = list.find((u) => u.email === lab.reviewerEmail)!;

        // A second, qualified reviewer exists in the laboratory (not assigned yet).
        const secondEmail = `e2e-amrev-second-${suffix}@example.com`;
        await api(request, "POST", "/api/v1/users/", {
            data: { email: secondEmail, first_name: "Revisor", last_name: "Nuevo", role: "reviewer", password: SECOND_REVIEWER_PASSWORD, branch_ids: [lab.branchId] },
            token: lab.admin,
        });

        const original = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        const originalSha = createHash("sha256").update(await (await request.get(original.pdf_url)).body()).digest("hex");

        // The stale assignment: the old signer is now only an administrator.
        await api(request, "PUT", `/api/v1/users/${oldReviewer.id}`, { data: { role: "admin" }, token: lab.admin });

        // --- 1. admin opens the amendment, saves the note, submit is refused with guidance ---------
        const adminPage = await (await browser.newContext()).newPage();
        await login(adminPage, lab.adminEmail, ADMIN_PASSWORD);
        await adminPage.goto(`/reports/${lab.reportId}`);
        await expect(adminPage.getByTestId("amend-report")).toBeVisible({ timeout: 30_000 });
        await adminPage.getByTestId("amend-report").click();
        await confirmInDialog(adminPage, { password: ADMIN_PASSWORD, reason: "Ajuste posterior", category: "Complemento (p. ej., IHC)" });
        await expect(adminPage.getByTestId("amendment-in-progress")).toBeVisible({ timeout: 30_000 });
        await adminPage.getByTestId("amendment-change-note").fill("Se agrega información complementaria.");
        await adminPage.getByTestId("report-save-top").click();
        await expect(adminPage).toHaveURL(/\/orders\//, { timeout: 30_000 });
        await adminPage.goto(`/reports/${lab.reportId}`);
        await adminPage.getByRole("button", { name: "Enviar a Revisión" }).click();
        await expect(adminPage.getByText(/ningún revisor asignado a esta orden puede revisarla/)).toBeVisible({ timeout: 15_000 });
        await expect(adminPage.getByRole("button", { name: "Enviar a Revisión" })).toBeVisible(); // still DRAFT

        // --- 2. order page: the assignee is flagged; replace them from the picker --------------------
        await adminPage.goto(`/orders/${lab.orderId}`);
        await expect(adminPage.locator('[data-testid="reviewer-ineligible"]:visible').first()).toHaveText("No puede revisar", { timeout: 30_000 });
        await expect(adminPage.locator('[data-testid="reviewers-none-eligible"]:visible').first()).toContainText("Usa el selector para asignar un revisor activo");
        await adminPage.locator('[data-testid="reviewers-picker-trigger"]:visible').first().click();
        await adminPage.getByText("Revisor Nuevo").first().click();
        await adminPage.getByRole("button", { name: /Aplicar/ }).click();
        await expect(adminPage.getByTestId("reviewer-ineligible")).toHaveCount(0, { timeout: 15_000 });

        await adminPage.goto(`/reports/${lab.reportId}`);
        await adminPage.getByRole("button", { name: "Enviar a Revisión" }).click();
        await expect(adminPage.getByRole("button", { name: "Enviar a Revisión" })).toHaveCount(0, { timeout: 30_000 });

        // --- 3. admin: no approval controls, an explanation; the last reviewer cannot be cleared -------
        await adminPage.reload();
        await expect(adminPage.getByTestId("review-availability-note")).toContainText("Revisor Nuevo", { timeout: 30_000 });
        await expect(adminPage.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
        const cleared = await request.fetch(`${API_BASE}/api/v1/laboratory/orders/${lab.orderId}/reviewers`, {
            method: "PUT", headers: { Authorization: `Bearer ${lab.admin}`, "Content-Type": "application/json" }, data: { reviewer_ids: [] },
        });
        expect(cleared.status()).toBe(409);
        expect(JSON.stringify(await cleared.json())).toContain("review_requires_eligible_reviewer");

        // --- 4. the assigned reviewer has the real controls, approves and signs ----------------------
        const reviewerPage = await (await browser.newContext()).newPage();
        await login(reviewerPage, secondEmail, SECOND_REVIEWER_PASSWORD);
        await reviewerPage.goto(`/reports/${lab.reportId}`);
        await expect(reviewerPage.getByRole("button", { name: "Aprobar" })).toBeVisible({ timeout: 30_000 });
        await expect(reviewerPage.getByRole("button", { name: "Solicitar Cambios" })).toBeVisible();
        await expect(reviewerPage.getByTestId("review-availability-note")).toHaveCount(0);
        await reviewerPage.getByRole("button", { name: "Aprobar" }).click();
        await reviewerPage.getByRole("dialog").getByRole("button", { name: "Aprobar" }).click();
        await expect(reviewerPage.getByRole("button", { name: "Firmar y publicar" })).toBeVisible({ timeout: 30_000 });
        await reviewerPage.getByRole("button", { name: "Firmar y publicar" }).click();
        await confirmInDialog(reviewerPage, { password: SECOND_REVIEWER_PASSWORD });
        await expect(reviewerPage.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 90_000 });

        // --- 5. the first emission is intact (version 1 PDF), the amendment is a new version ---------
        const v1 = await api<{ pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/versions/${original.version_no}/pdf`, { token: lab.admin });
        expect(createHash("sha256").update(await (await request.get(v1.pdf_url)).body()).digest("hex")).toBe(originalSha);
        const after = await api<{ version_no: number }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        expect(after.version_no).toBeGreaterThan(original.version_no);
    });
});
