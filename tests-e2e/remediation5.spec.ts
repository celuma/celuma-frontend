/**
 * Real end-to-end — fifth post-Phase 2 remediation.
 *
 * A single continuous flow against the real backend covers both
 * observations and the blind spot that missed both:
 *
 * Observation A — the letterhead could only be changed before the first
 * save. Here the draft is saved, the editor is exited, reopened,
 * content is written, the letterhead is changed, and it is checked that the
 * content survives and the persisted snapshot carries the letterhead
 * new version. It then submits the report for review and verifies it is frozen.
 *
 * Observation B — the download of the official PDF returned 403. The cause was
 * `Order.billed_lock`, which the previous suite never activated because its
 * orders were never invoiced. Here the order is intentionally invoiced
 * before download, which is exactly the state that failed in
 * production.
 *
 * The download block also runs in WebKit (Safari engine), where the
 * `window.open` previous did not produce download. See
 * safari-pdf-download-contract.md.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";

function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function api<T>(
    request: APIRequestContext,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    urlPath: string,
    options: { data?: unknown; token?: string; expectStatus?: number } = {}
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
    const res = await request.fetch(`${API_BASE}${urlPath}`, { method, headers, data: options.data });
    if (options.expectStatus !== undefined) {
        expect(res.status(), `${method} ${urlPath}: ${await res.text()}`).toBe(options.expectStatus);
    } else if (!res.ok()) {
        throw new Error(`${method} ${urlPath} -> ${res.status()}: ${await res.text()}`);
    }
    return (await res.json().catch(() => ({}))) as T;
}

interface Lab {
    email: string;
    password: string;
    token: string;
    tenantId: string;
    branchId: string;
    suffix: string;
}

async function createLab(request: APIRequestContext, label: string): Promise<Lab> {
    const suffix = uniqueSuffix();
    const email = `e2e-r5-${label}-${suffix}@example.com`;
    const password = "E2eRem5!2026";
    const reg = await api<{ tenant_id: string; branch_id: string }>(
        request, "POST", "/api/v1/auth/register/unified",
        {
            data: {
                tenant: { name: `E2E R5 ${label} ${suffix}` },
                branch: { code: "MAIN", name: "Main Branch" },
                admin_user: { email, password, full_name: `E2E ${label}` },
            },
        }
    );
    const login = await api<{ access_token: string }>(
        request, "POST", "/api/v1/auth/login",
        { data: { username_or_email: email, password } }
    );
    await api(request, "PATCH", `/api/v1/tenants/${reg.tenant_id}`, {
        data: { reports_v2_enabled: true },
        token: login.access_token,
    });
    return { email, password, token: login.access_token, tenantId: reg.tenant_id, branchId: reg.branch_id, suffix };
}

function presentation(institutionName: string, color: string) {
    return {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
        header: { enabled: true, institution_name: institutionName },
        footer: { enabled: true, custom_text: `Pie de ${institutionName}`, show_page_number: true },
        style: { primary_color: color },
    };
}

/** two Letterheads ACTIVE, so the selector has something real to choose from. */
async function createTwoLetterheads(request: APIRequestContext, lab: Lab) {
    const make = async (name: string, color: string, isDefault: boolean) => {
        // The POST creates only the "shell"; the configuration is saved (and
        // active) with PUT .../versions/current, just like the editor does
        // Letterheads visual editor.
        const lh = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
            data: { name },
            token: lab.token,
        });
        await api(request, "PUT", `/api/v1/report-letterheads/${lh.id}/versions/current`, {
            data: { configuration: presentation(name, color) },
            token: lab.token,
        });
        if (isDefault) {
            await api(request, "POST", `/api/v1/report-letterheads/${lh.id}/default`, { token: lab.token });
        }
        return lh.id;
    };
    const generalId = await make(`Membrete general ${lab.suffix}`, "#336699", true);
    const nephroId = await make(`Membrete nefropatologia ${lab.suffix}`, "#aa0044", false);
    return { generalId, nephroId };
}

async function createClinicalSetup(request: APIRequestContext, lab: Lab) {
    const suffix = uniqueSuffix();
    const templateJson = {
        base: { diagnosis: { is_visible: true, label: "Diagnóstico", is_custom: true, type: "text", value: "" } },
        sections: { hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: "" } },
        base_order: ["diagnosis"],
        section_order: ["hallazgos"],
    };
    const template = await api<{ id: string }>(request, "POST", "/api/v1/reports/templates/", {
        data: { name: `Plantilla R5 ${suffix}`, template_json: templateJson },
        token: lab.token,
    });
    const version = await api<{ id: string }>(
        request, "POST", `/api/v1/reports/templates/${template.id}/versions`,
        {
            data: {
                configuration: {
                    schema_version: 2,
                    template: templateJson,
                    presentation: presentation("Placeholder", "#4A4A4A"),
                },
            },
            token: lab.token,
        }
    );
    await api(request, "POST", `/api/v1/reports/templates/${template.id}/versions/${version.id}/activate`, { token: lab.token });
    const studyType = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", {
        data: { code: `R5${suffix.slice(-6)}`, name: `Estudio R5 ${suffix}`, default_report_template_id: template.id },
        token: lab.token,
    });
    return { templateId: template.id, studyTypeId: studyType.id };
}

async function createOrder(request: APIRequestContext, lab: Lab, studyTypeId: string) {
    const suffix = uniqueSuffix();
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", {
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId,
            first_name: "E2E", last_name: "Paciente", patient_code: `R5-PAT-${suffix}`,
        },
        token: lab.token,
    });
    return api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", {
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId,
            patient_id: patient.id, study_type_id: studyTypeId,
            samples: [{ sample_code: `R5-S-${suffix}`, sample_type: "Bloque", collected_at: "2026-08-01", received_at: "2026-08-01" }],
        },
        token: lab.token,
    });
}

async function login(page: Page, lab: { email: string; password: string }) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(lab.email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(lab.password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

/** The letterhead selector, as seen by the user. */
function letterheadSelect(page: Page) {
    return page.getByTestId("letterhead-select").locator(".ant-select");
}

async function chooseLetterhead(page: Page, nameFragment: string | RegExp) {
    await letterheadSelect(page).locator(".ant-select-selector").click();
    await page.locator(".ant-select-item-option", { hasText: nameFragment }).first().click();
}

// ===========================================================================
// Observation A — the letterhead can change while the report remains DRAFT
// ===========================================================================

test.describe("Fifth remedy — editable letterhead in DRAFT", () => {
    test("save, exit, reopen, write, change letterhead, save and freeze on review", async ({ page, request }) => {
        const lab = await createLab(request, "draft");
        const { generalId, nephroId } = await createTwoLetterheads(request, lab);
        expect(generalId).toBeTruthy();
        expect(nephroId).toBeTruthy();
        const { studyTypeId } = await createClinicalSetup(request, lab);
        const order = await createOrder(request, lab, studyTypeId);
        await login(page, lab);

        // --- 3/4. create the report and save it as DRAFT ---
        await page.goto(`/reports/editor?orderId=${order.id}`);
        await expect(page.getByLabel("Nombre del reporte")).toBeVisible({ timeout: 20_000 });
        await page.getByLabel("Nombre del reporte").fill(`Reporte R5 ${lab.suffix}`);
        await expect(page.getByTestId("letterhead-panel")).toBeVisible({ timeout: 20_000 });

        // --- 5. Exit the editor ---
        await page.getByRole("button", { name: "Guardar reporte" }).click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 20_000 });

        const orderDetail = await api<{ report_id: string | null }>(
            request, "GET", `/api/v1/laboratory/orders/${order.id}`, { token: lab.token }
        );
        const reportId = orderDetail.report_id!;
        expect(reportId).toBeTruthy();

        // --- 6/7. Reopen it and confirm that the selector remains editable ---
        // (this is the heart of Observation A: before it disappeared)
        await page.goto(`/reports/${reportId}`);
        await expect(page.getByTestId("letterhead-panel")).toBeVisible({ timeout: 20_000 });
        await expect(letterheadSelect(page)).not.toHaveClass(/ant-select-disabled/);
        await expect(page.getByTestId("letterhead-panel")).toContainText("Membrete general");

        // --- 8. Write clinical content ---
        const diagnosis = `Carcinoma ductal ${lab.suffix}`;
        await page.getByLabel("Diagnóstico").fill(diagnosis);

        // --- 9. Change the letterhead ---
        await chooseLetterhead(page, "nefropatologia");
        await expect(page.getByTestId("letterhead-dirty-note")).toBeVisible({ timeout: 10_000 });

        // --- 10. The content remains intact and the preview has already changed ---
        await expect(page.getByLabel("Diagnóstico")).toHaveValue(diagnosis);
        await expect(page.locator(".report-page, [style*='8.5in']").first())
            .toContainText("Membrete nefropatologia", { timeout: 15_000 });

        // --- 11. save ---
        await page.getByRole("button", { name: "Guardar reporte" }).click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 20_000 });

        // --- 12. The persisted snapshot carries the new letterhead, and only that ---
        const saved = await api<{
            letterhead_version_id: string | null;
            template_version_id: string | null;
            report: { base: Record<string, { value?: string }>; rendering_snapshot: { presentation: { header: { institution_name: string } }; template: unknown } };
        }>(request, "GET", `/api/v1/reports/${reportId}`, { token: lab.token });

        expect(saved.report.rendering_snapshot.presentation.header.institution_name)
            .toContain("Membrete nefropatologia");
        expect(saved.report.base.diagnosis.value).toBe(diagnosis);
        expect(saved.template_version_id).toBeTruthy();

        // --- 13. Send to review ---
        const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", {
            data: {
                email: `e2e-r5-reviewer-${lab.suffix}@example.com`,
                first_name: "E2E", last_name: "Reviewer", role: "reviewer",
                password: "E2eReviewer!2026", branch_ids: [lab.branchId],
            },
            token: lab.token,
        });
        await api(request, "PUT", `/api/v1/laboratory/orders/${order.id}/reviewers`, {
            data: { reviewer_ids: [reviewer.id] }, token: lab.token,
        });
        await api(request, "POST", `/api/v1/reports/${reportId}/submit`, { token: lab.token, data: {} });

        // --- 14/15. reopen and confirm the blocked selector ---
        await page.goto(`/reports/${reportId}`);
        await expect(page.getByTestId("letterhead-panel")).toBeVisible({ timeout: 20_000 });
        await expect(letterheadSelect(page)).toHaveClass(/ant-select-disabled/);
        await expect(page.getByTestId("letterhead-frozen-note"))
            .toContainText("El membrete quedó fijado al enviar el reporte a revisión.");

        // And for payload direct neither: the backend responds 409, not 500.
        await api(request, "POST", `/api/v1/reports/${reportId}/new_version`, {
            data: {
                tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: order.id,
                report: { base: {}, sections: {}, base_order: [], section_order: [] },
                letterhead_version_id: "00000000-0000-0000-0000-000000000000",
            },
            token: lab.token,
            expectStatus: 409,
        });

        // The letterhead did not move.
        const afterFreeze = await api<{ report: { rendering_snapshot: { presentation: { header: { institution_name: string } } } } }>(
            request, "GET", `/api/v1/reports/${reportId}`, { token: lab.token }
        );
        expect(afterFreeze.report.rendering_snapshot.presentation.header.institution_name)
            .toContain("Membrete nefropatologia");
    });
});

// ===========================================================================
// Observation B — official PDF download (includes WebKit/Safari)
// ===========================================================================

test.describe("Fifth remedy — download from official PDF", () => {
    test("sign, publish and download with the order FACTURADA and blocked by payment", async ({ page, request, browserName }) => {
        const lab = await createLab(request, `pdf-${browserName}`);
        await createTwoLetterheads(request, lab);
        const { studyTypeId } = await createClinicalSetup(request, lab);
        const order = await createOrder(request, lab, studyTypeId);
        await login(page, lab);

        // --- report until APPROVED ---
        await page.goto(`/reports/editor?orderId=${order.id}`);
        await expect(page.getByLabel("Nombre del reporte")).toBeVisible({ timeout: 20_000 });
        await page.getByLabel("Nombre del reporte").fill(`Reporte PDF ${lab.suffix}`);
        await expect(page.getByTestId("letterhead-panel")).toBeVisible({ timeout: 20_000 });
        await page.getByRole("button", { name: "Guardar reporte" }).click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 20_000 });

        const orderDetail = await api<{ report_id: string | null }>(
            request, "GET", `/api/v1/laboratory/orders/${order.id}`, { token: lab.token }
        );
        const reportId = orderDetail.report_id!;

        const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", {
            data: {
                email: `e2e-r5-signer-${lab.suffix}@example.com`,
                first_name: "E2E", last_name: "Signer", role: "reviewer",
                password: "E2eReviewer!2026", branch_ids: [lab.branchId],
            },
            token: lab.token,
        });
        await api(request, "PUT", `/api/v1/laboratory/orders/${order.id}/reviewers`, {
            data: { reviewer_ids: [reviewer.id] }, token: lab.token,
        });
        await api(request, "POST", `/api/v1/reports/${reportId}/submit`, { token: lab.token, data: {} });
        await api(request, "POST", `/api/v1/reports/${reportId}/approve`, { token: lab.token, data: {} });

        // --- The missing condition: invoice the order and leave it with
        // pending balance, which is what activates `billed_lock` and what
        // produced 403 in production. The previous suite never billed an
        // order, so it never reached this state.
        // Creating an order now generates its invoice (with a total of 0).
        // Add an item so it has a pending balance, which
        // `update_order_payment_lock` translates to `billed_lock=true`.
        const invoice = await api<{ id: string }>(
            request, "GET", `/api/v1/billing/orders/${order.id}/invoice`, { token: lab.token }
        );
        await api(request, "POST", `/api/v1/billing/invoices/${invoice.id}/items`, {
            data: { description: "Estudio histopatológico", quantity: 1, unit_price: 1500 },
            token: lab.token,
        });
        const lockedOrder = await api<{ billed_lock: boolean }>(
            request, "GET", `/api/v1/laboratory/orders/${order.id}`, { token: lab.token }
        );
        expect(lockedOrder.billed_lock, "the order must be locked due to pending payment").toBe(true);

        // --- sign and publish as reviewer ---
        const reviewerContext = await page.context().browser()!.newContext({ acceptDownloads: true });
        const reviewerPage = await reviewerContext.newPage();
        await login(reviewerPage, {
            email: `e2e-r5-signer-${lab.suffix}@example.com`,
            password: "E2eReviewer!2026",
        });
        await reviewerPage.goto(`/reports/${reportId}`);
        await expect(reviewerPage.getByRole("button", { name: "Firmar y publicar" }))
            .toBeVisible({ timeout: 20_000 });

        // The actual sign-and-publish response is captured (§8).
        const publishResponse = reviewerPage.waitForResponse(
            (r) => r.url().includes("/sign-and-publish") && r.request().method() === "POST"
        );
        await reviewerPage.getByRole("button", { name: "Firmar y publicar" }).click();
        const published = await (await publishResponse).json();

        expect(published.status).toBe("PUBLISHED");
        expect(published.version_no, "sign-and-publish must announce the version").toBeGreaterThan(0);
        expect(published.official_pdf_available).toBe(true);
        expect(published.pdf_generation_status).toBe("READY");
        expect(published.report_version_id).toBeTruthy();

        // --- The immediate button appears without reloading ---
        await expect(reviewerPage.getByTestId("download-official-pdf"))
            .toBeVisible({ timeout: 20_000 });

        // --- The download: actual browser event ---
        const pdfRequest = reviewerPage.waitForResponse(
            (r) => r.url().includes(`/versions/${published.version_no}/pdf`)
        );
        const downloadPromise = reviewerPage.waitForEvent("download", { timeout: 30_000 });
        await reviewerPage.getByTestId("download-official-pdf").click();

        // The endpoint that previously returned 403 with the command blocked.
        expect((await pdfRequest).status(), "GET .../versions/N/pdf can no longer return 403").toBe(200);

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

        // --- The bytes are real PDF ---
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        const bytes = Buffer.concat(chunks);
        expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");

        // --- Local printing remains available as a secondary action ---
        await expect(reviewerPage.getByRole("button", { name: "Imprimir copia local" })).toBeVisible();

        // --- Reload and download again (§13 Case C) ---
        await reviewerPage.reload();
        await expect(reviewerPage.getByTestId("download-official-pdf")).toBeVisible({ timeout: 20_000 });
        const secondDownload = reviewerPage.waitForEvent("download", { timeout: 30_000 });
        await reviewerPage.getByTestId("download-official-pdf").click();
        expect((await secondDownload).suggestedFilename()).toMatch(/\.pdf$/i);

        // --- No empty tab opened (Safari symptom) ---
        expect(reviewerContext.pages().length).toBe(1);

        await reviewerContext.close();
    });

    test("a legitimate reader downloads; a user without permission gets 403; another tenant gets 404", async ({ request }) => {
        const lab = await createLab(request, "authz");
        await createTwoLetterheads(request, lab);
        const { studyTypeId } = await createClinicalSetup(request, lab);
        const order = await createOrder(request, lab, studyTypeId);

        const report = await api<{ id: string }>(request, "POST", "/api/v1/reports/", {
            data: {
                tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: order.id,
                title: "Autorización", report: { base: {}, sections: {}, base_order: [], section_order: [] },
            },
            token: lab.token,
        });
        await api(request, "POST", `/api/v1/reports/${report.id}/versions/1/generate-pdf`, { token: lab.token });

        // A legitimate reader from the same laboratory: /full and /pdf are coherent.
        const viewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", {
            data: {
                email: `e2e-r5-viewer-${lab.suffix}@example.com`,
                first_name: "E2E", last_name: "Viewer", role: "viewer",
                password: "E2eViewer!2026", branch_ids: [lab.branchId],
            },
            token: lab.token,
        });
        expect(viewer.id).toBeTruthy();
        const viewerLogin = await api<{ access_token: string }>(
            request, "POST", "/api/v1/auth/login",
            { data: { username_or_email: `e2e-r5-viewer-${lab.suffix}@example.com`, password: "E2eViewer!2026" } }
        );
        await api(request, "GET", `/api/v1/reports/${report.id}/full`, {
            token: viewerLogin.access_token, expectStatus: 200,
        });
        await api(request, "GET", `/api/v1/reports/${report.id}/versions/1/pdf`, {
            token: viewerLogin.access_token, expectStatus: 200,
        });

        // another laboratory: 404, never 403 (no confirmation that the id exists).
        const otherLab = await createLab(request, "intruder");
        await api(request, "GET", `/api/v1/reports/${report.id}/versions/1/pdf`, {
            token: otherLab.token, expectStatus: 404,
        });
        await api(request, "GET", `/api/v1/reports/${report.id}/full`, {
            token: otherLab.token, expectStatus: 404,
        });

        // Without a token: 401/403, never 200.
        const anon = await request.fetch(
            `${API_BASE}/api/v1/reports/${report.id}/versions/1/pdf`, { method: "GET" }
        );
        expect([401, 403]).toContain(anon.status());
    });
});
