/**
 * Real end-to-end — Céluma 1.4 (#13): password-confirmed reopening and
 * signing, against the real backend and the real PDF pipeline.
 *
 * As the assigned reviewer, in the browser:
 *   1. "Reabrir reporte" with a wrong password is refused inline and the
 *      report stays APPROVED; with the reviewer's own password and a reason it
 *      returns to DRAFT.
 *   2. After a new review cycle, "Firmar y publicar" with a wrong password
 *      publishes nothing; with the reviewer's own password the official PDF
 *      is generated and the report is published.
 *   3. The order timeline shows the reopening (with its reason) and the
 *      publication as a publication — not as a second approval.
 * The password never appears in a request URL or in browser storage.
 *
 * Each run creates its own synthetic laboratory; passwords are synthetic.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";

const ADMIN_PASSWORD = "E2eAmend13!2026";
const REVIEWER_PASSWORD = "E2eAmendReviewer!2026";
const WRONG_PASSWORD = "E2eNotThePassword!2026";

type Json = Record<string, unknown>;

function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function api<T = Json>(
    request: APIRequestContext,
    method: "GET" | "POST" | "PUT" | "PATCH",
    urlPath: string,
    options: { data?: unknown; token?: string; expectStatus?: number } = {},
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
    if (method === "POST" && /\/laboratory\/(orders\/(unified)?|samples\/)$/.test(urlPath)) {
        headers["Idempotency-Key"] = crypto.randomUUID();
    }
    const res = await request.fetch(`${API_BASE}${urlPath}`, { method, headers, data: options.data });
    if (options.expectStatus !== undefined) {
        expect(res.status(), `${method} ${urlPath}: ${await res.text()}`).toBe(options.expectStatus);
    } else if (!res.ok()) {
        throw new Error(`${method} ${urlPath} -> ${res.status()}: ${await res.text()}`);
    }
    return (await res.json().catch(() => ({}))) as T;
}

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

async function confirmWithPassword(page: Page, password: string, reason?: string) {
    const dialog = page.getByRole("dialog");
    if (reason) await dialog.getByTestId("password-confirmation-reason").fill(reason);
    await dialog.getByTestId("password-confirmation-input").fill(password);
    await dialog.getByTestId("password-confirmation-submit").click();
}

/** A synthetic laboratory with one APPROVED V2 report and its assigned reviewer. */
async function approvedReport(request: APIRequestContext) {
    const suffix = uniqueSuffix();
    const adminEmail = `e2e-amend13-admin-${suffix}@example.com`;
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", {
        data: {
            tenant: { name: `E2E Amend13 ${suffix}` },
            branch: { code: "MAIN", name: "Main Branch" },
            admin_user: { email: adminEmail, password: ADMIN_PASSWORD, full_name: "E2E Admin" },
        },
    });
    const admin = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: adminEmail, password: ADMIN_PASSWORD },
    })).access_token;

    const letterhead = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
        data: { name: `Membrete ${suffix}` }, token: admin,
    });
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
    const template = await api<{ id: string }>(request, "POST", "/api/v1/reports/templates/", {
        data: { name: `Plantilla ${suffix}`, template_json: templateJson }, token: admin,
    });
    const studyType = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", {
        data: { code: `AM${suffix.slice(-6)}`, name: `Estudio ${suffix}`, default_report_template_id: template.id },
        token: admin,
    });
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id,
            first_name: "E2E", last_name: "Paciente", patient_code: `AM-PAT-${suffix}`,
        },
        token: admin,
    });
    const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id, patient_id: patient.id,
            study_type_id: studyType.id,
            samples: [{ sample_type: "Bloque", collected_at: "2026-10-01", received_at: "2026-10-01" }],
        },
        token: admin,
    });

    const reviewerEmail = `e2e-amend13-reviewer-${suffix}@example.com`;
    const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", {
        data: {
            email: reviewerEmail, first_name: "Revisora", last_name: "Sintética", role: "reviewer",
            password: REVIEWER_PASSWORD, branch_ids: [reg.branch_id],
        },
        token: admin,
    });
    await api(request, "PUT", `/api/v1/laboratory/orders/${order.id}/reviewers`, {
        data: { reviewer_ids: [reviewer.id] }, token: admin,
    });
    const reviewerToken = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: reviewerEmail, password: REVIEWER_PASSWORD },
    })).access_token;

    const tpl = await api<{ template_hash: string }>(request, "GET", `/api/v1/reports/templates/${template.id}`, { token: admin });
    const report = await api<{ id: string }>(request, "POST", "/api/v1/reports/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id, order_id: order.id,
            title: "Reporte sintético",
            report: { base: {}, sections: {}, base_order: [], section_order: [] },
            template_id: template.id, template_hash: tpl.template_hash,
        },
        token: admin,
    });
    const reviewCycle = async () => {
        await api(request, "POST", `/api/v1/reports/${report.id}/submit`, { data: {}, token: admin });
        await api(request, "POST", `/api/v1/reports/${report.id}/approve`, { data: {}, token: reviewerToken });
    };
    await reviewCycle();
    return { orderId: order.id, reportId: report.id, reviewerEmail, reviewerToken, admin, reviewCycle };
}

test.describe("Password-confirmed reopening and signing (1.4 #13)", () => {
    test("wrong password changes nothing; the reviewer's own password reopens and signs; the timeline tells it", async ({ browser, request }) => {
        test.setTimeout(180_000);
        const lab = await approvedReport(request);
        const status = async () =>
            (await api<{ status: string }>(request, "GET", `/api/v1/reports/${lab.reportId}`, { token: lab.admin })).status;

        const context = await browser.newContext();
        const page = await context.newPage();
        const requestedUrls: string[] = [];
        page.on("request", (r) => requestedUrls.push(r.url()));
        await login(page, lab.reviewerEmail, REVIEWER_PASSWORD);

        // --- 1. Reopen: wrong password, then the reviewer's own --------------
        await page.goto(`/reports/${lab.reportId}`);
        await expect(page.getByRole("button", { name: "Reabrir reporte" })).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Reabrir reporte" }).click();
        await confirmWithPassword(page, WRONG_PASSWORD);
        await expect(page.getByTestId("password-confirmation-error")).toContainText("no es correcta");
        await expect(page.getByTestId("password-confirmation-input")).toHaveValue("");
        expect(await status()).toBe("APPROVED");

        await confirmWithPassword(page, REVIEWER_PASSWORD, "Membrete incorrecto");
        await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Firmar y publicar" })).toHaveCount(0);
        expect(await status()).toBe("DRAFT");

        // --- 2. A new review cycle, then sign: wrong password, then own -------
        await lab.reviewCycle();
        await page.reload();
        await expect(page.getByRole("button", { name: "Firmar y publicar" })).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Firmar y publicar" }).click();
        await confirmWithPassword(page, WRONG_PASSWORD);
        await expect(page.getByTestId("password-confirmation-error")).toContainText("no es correcta");
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toHaveCount(0);
        expect(await status()).toBe("APPROVED");

        await confirmWithPassword(page, REVIEWER_PASSWORD);
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 60_000 });
        expect(await status()).toBe("PUBLISHED");

        // --- 3. Exactly one publication and one reopening, by structure -------
        const { events } = await api<{ events: Array<{ event_type: string; metadata?: Json }> }>(
            request, "GET", `/api/v1/laboratory/orders/${lab.orderId}/events`, { token: lab.admin },
        );
        const published = events.filter((e) => e.event_type === "REPORT_PUBLISHED");
        expect(published).toHaveLength(1);
        expect(published[0].metadata?.action).toBe("REPORT_PUBLISHED");
        expect(published[0].metadata?.publication_kind).toBe("INITIAL");
        const reopened = events.filter((e) => e.metadata?.action === "REPORT_REOPENED");
        expect(reopened).toHaveLength(1);
        expect(reopened[0].metadata?.reason).toBe("Membrete incorrecto");
        expect(events.filter((e) => e.event_type === "REPORT_APPROVED" && e.metadata?.published)).toHaveLength(0);

        await page.goto(`/orders/${lab.orderId}`);
        await expect(page.getByText(/firmó y publicó el/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Membrete incorrecto/)).toBeVisible();

        // --- The credential never left the request body ----------------------
        for (const url of requestedUrls) {
            expect(url).not.toContain(encodeURIComponent(REVIEWER_PASSWORD));
            expect(url).not.toContain(REVIEWER_PASSWORD);
            expect(url).not.toContain(WRONG_PASSWORD);
        }
        const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
        expect(storage).not.toContain(REVIEWER_PASSWORD);
        expect(storage).not.toContain(WRONG_PASSWORD);

        await context.close();
    });
});
