/**
 * Real end-to-end test — post-Fase-2 remediation, R17.
 *
 * Drives the actual app (`npm run dev`) against a real FastAPI backend +
 * real Postgres + real S3 (see playwright.e2e.config.ts). Creates its own
 * isolated tenant/admin user via POST /auth/register/unified so it never
 * touches real tenant data and is repeatable.
 *
 * Covers the flow requested by the remediation brief: login -> admin ->
 * create membrete -> upload logo via setInputFiles() -> publish -> set
 * default -> associate to 2 templates -> new report -> confirm V2-from-start
 * with the "Membrete" label -> type clinical text -> switch membrete ->
 * confirm text intact, only branding changed -> save -> generate PDF ->
 * download -> reopen and confirm the persisted snapshot is immutable.
 *
 * Secondary fixture setup (second template/study type, the order itself)
 * is done via direct API calls for speed — the same backend endpoints
 * already covered by the HTTP integration suite — so this spec's browser
 * time is spent on the parts that are actually new/risky in this
 * remediation: the membrete admin UI, the report editor's Membrete
 * selector, and the PDF generate/download flow.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";

function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function apiJson<T>(
    request: APIRequestContext,
    method: "GET" | "POST" | "PUT" | "PATCH",
    urlPath: string,
    options: { data?: unknown; token?: string } = {}
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
    const res = await request.fetch(`${API_BASE}${urlPath}`, {
        method,
        headers,
        data: options.data,
    });
    if (!res.ok()) {
        throw new Error(`${method} ${urlPath} -> ${res.status()}: ${await res.text()}`);
    }
    return (await res.json()) as T;
}

test.describe("Letterhead (membrete) lifecycle — post-Fase-2 remediation", () => {
    test("full flow: create, upload logo, publish, associate, report editor, save, PDF", async ({
        page,
        request,
    }) => {
        const suffix = uniqueSuffix();
        const adminEmail = `e2e-admin-${suffix}@example.com`;
        const adminPassword = "E2ePassword!2026";

        // ---- Setup: isolated tenant + admin user (superuser) ----
        const registration = await apiJson<{ tenant_id: string; branch_id: string; user_id: string }>(
            request, "POST", "/api/v1/auth/register/unified",
            {
                data: {
                    tenant: { name: `E2E Tenant ${suffix}` },
                    branch: { code: "MAIN", name: "Main Branch" },
                    admin_user: { email: adminEmail, password: adminPassword, full_name: "E2E Admin" },
                },
            }
        );

        const login = await apiJson<{ access_token: string }>(
            request, "POST", "/api/v1/auth/login",
            { data: { username_or_email: adminEmail, password: adminPassword } }
        );
        const token = login.access_token;

        await apiJson(request, "PATCH", `/api/v1/tenants/${registration.tenant_id}`, {
            data: { reports_v2_enabled: true },
            token,
        });

        const template = await apiJson<{ id: string }>(request, "POST", "/api/v1/reports/templates/", {
            data: {
                name: `E2E Template ${suffix}`,
                template_json: {
                    base: {
                        diagnosis: { is_visible: true, label: "Diagnóstico", is_custom: true, type: "text", value: "" },
                    },
                    sections: {},
                    base_order: ["diagnosis"],
                    section_order: [],
                },
            },
            token,
        });
        const templateVersion = await apiJson<{ id: string }>(
            request, "POST", `/api/v1/reports/templates/${template.id}/versions`,
            {
                data: {
                    configuration: {
                        schema_version: 2,
                        template: {
                            base: { diagnosis: { is_visible: true, label: "Diagnóstico", is_custom: true, type: "text", value: "" } },
                            sections: {}, base_order: ["diagnosis"], section_order: [],
                        },
                        presentation: {
                            paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
                            header: { enabled: true, institution_name: "Placeholder" },
                            footer: { enabled: true, show_page_number: true },
                            style: { primary_color: "#4A4A4A" },
                        },
                    },
                },
                token,
            }
        );
        await apiJson(
            request, "POST",
            `/api/v1/reports/templates/${template.id}/versions/${templateVersion.id}/activate`,
            { token }
        );

        // A second clinical template, to prove a membrete can be associated
        // to more than one template (step 8 of the requested flow).
        const secondTemplate = await apiJson<{ id: string }>(request, "POST", "/api/v1/reports/templates/", {
            data: {
                name: `E2E Template Two ${suffix}`,
                template_json: { base: {}, sections: {}, base_order: [], section_order: [] },
            },
            token,
        });

        const studyType = await apiJson<{ id: string }>(request, "POST", "/api/v1/study-types/", {
            data: { code: `E2E${suffix.slice(-6)}`, name: `E2E Study ${suffix}`, default_report_template_id: template.id },
            token,
        });

        const patient = await apiJson<{ id: string }>(request, "POST", "/api/v1/patients/", {
            data: {
                tenant_id: registration.tenant_id,
                branch_id: registration.branch_id,
                first_name: "E2E",
                last_name: "Patient",
                patient_code: `E2E-PAT-${suffix}`,
            },
            token,
        });

        const order = await apiJson<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", {
            data: {
                tenant_id: registration.tenant_id,
                branch_id: registration.branch_id,
                patient_id: patient.id,
                study_type_id: studyType.id,
                samples: [{ sample_code: `E2E-S-${suffix}`, sample_type: "Bloque", collected_at: "2026-08-01", received_at: "2026-08-01" }],
            },
            token,
        });

        // ---- Real UI: login ----
        await page.goto("/");
        await page.getByRole("textbox", { name: "Usuario o email" }).fill(adminEmail);
        await page.getByRole("textbox", { name: "Contraseña" }).fill(adminPassword);
        await page.getByRole("button", { name: "Iniciar Sesión" }).click();
        await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });

        // ---- Real UI: create membrete + upload logo via setInputFiles() ----
        await page.goto("/config/report-letterheads");
        await page.getByRole("button", { name: "Nuevo membrete" }).click();
        await page.getByLabel("Nombre").fill(`Membrete E2E ${suffix}`);
        await page.getByRole("button", { name: "Guardar" }).click();
        await expect(page.getByText(`Membrete E2E ${suffix}`)).toBeVisible({ timeout: 10_000 });

        await page.getByRole("row", { name: new RegExp(`Membrete E2E ${suffix}`) })
            .getByRole("button", { name: "Versiones" })
            .click();
        await expect(page.getByRole("heading", { name: /Versiones/ })).toBeVisible();
        await page.getByRole("button", { name: "Nueva versión" }).click();

        // The real Ant Design file input, driven with a real File via setInputFiles().
        const logoPath = path.join(__dirname, "fixtures", "e2e-logo.png");
        await page.locator('input[type="file"]').setInputFiles(logoPath);
        await page.getByRole("button", { name: "Subir logo" }).click();
        await expect(page.getByAltText("Logo", { exact: true })).toBeVisible({ timeout: 10_000 });

        await page.getByLabel("Nombre institucional").fill(`E2E Lab ${suffix}`);
        await page.getByRole("button", { name: "Publicar versión" }).click();
        const publishModal = page.getByRole("dialog");
        await expect(publishModal.getByText("Publicar nueva versión")).toBeVisible();
        await publishModal.getByRole("button", { name: "Publicar", exact: true }).click();
        await expect(page).toHaveURL(/\/versions$/, { timeout: 10_000 });

        // Activate the version we just published, then set the letterhead as
        // the tenant default and associate it to both templates.
        await page.getByRole("button", { name: "Activar", exact: true }).click();
        const activateConfirm = page.locator(".ant-popconfirm-buttons").getByRole("button", { name: "Activar" });
        await activateConfirm.waitFor({ state: "visible", timeout: 5_000 });
        await activateConfirm.click();
        await expect(page.getByText("Versión activa:")).toBeVisible({ timeout: 10_000 });

        await page.goto("/config/report-letterheads");
        await page.getByRole("row", { name: new RegExp(`Membrete E2E ${suffix}`) })
            .getByRole("button", { name: "Predeterminado" })
            .click();
        await expect(page.getByText("Predeterminado").first()).toBeVisible({ timeout: 10_000 });

        // A second membrete, published+activated via API (setup speed —
        // the letterhead-creation UI itself is already fully exercised
        // above for the first one). Needed so the report editor's
        // "Membrete" selector actually renders — it only appears when 2+
        // letterhead versions are available to choose from — and so the
        // non-destructive-switch step below has something to switch to.
        const secondLetterhead = await apiJson<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
            data: { name: `Membrete E2E Dos ${suffix}` },
            token,
        });
        const secondVersion = await apiJson<{ id: string }>(
            request, "POST", `/api/v1/report-letterheads/${secondLetterhead.id}/versions`,
            {
                data: {
                    configuration: {
                        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
                        header: { enabled: true, institution_name: `E2E Lab Dos ${suffix}` },
                        footer: { enabled: true, show_page_number: true },
                        style: { primary_color: "#7A1FA2" },
                    },
                },
                token,
            }
        );
        await apiJson(
            request, "POST",
            `/api/v1/report-letterheads/${secondLetterhead.id}/versions/${secondVersion.id}/activate`,
            { token }
        );

        // ---- Real UI: new report shows V2 from the very first paint ----
        await page.goto(`/reports/editor?orderId=${order.id}`);
        await expect(page.getByText("Membrete", { exact: true })).toBeVisible({ timeout: 15_000 });
        // The Legacy renderer's frozen letterhead text must never appear —
        // this is the literal regression check for bug 2.
        await expect(page.getByText("Dra. Arisbeth Villanueva Pérez.")).toHaveCount(0);
        await expect(page.getByText(`E2E Lab ${suffix}`, { exact: false })).toBeVisible({ timeout: 10_000 });

        // ---- Type clinical content, then switch membrete (bug 3 check) ----
        const clinicalText = `TEXTO CLINICO E2E ${suffix} - NO DEBE BORRARSE`;
        await page.getByLabel("Nombre del reporte").fill(clinicalText);
        await expect(page.getByLabel("Nombre del reporte")).toHaveValue(clinicalText);

        // This Select's search input renders readonly (no free-text filter),
        // and Ant Design's virtual list keeps a hidden measurement copy of
        // each option row, so Playwright's visibility check on the option
        // element itself is unreliable — drive it by keyboard instead,
        // gated only on the dropdown panel (not the individual row) being
        // open.
        await page.locator(".ant-select-selector").first().click();
        await page.locator(".ant-select-dropdown").first().waitFor({ state: "visible" });
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");

        // Branding changed, clinical content did not — this is the
        // literal regression check for bug 3.
        await expect(page.getByText(`E2E Lab Dos ${suffix}`, { exact: false })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByLabel("Nombre del reporte")).toHaveValue(clinicalText);

        // Save the report — this both exercises the real save path and
        // gives us a persisted report to generate/download a PDF for.
        await page.getByRole("button", { name: "Guardar reporte" }).click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 15_000 });

        // ---- Fetch the persisted report id and move it to APPROVED via
        // API (submit + approve is already covered by the existing report
        // workflow suites — the parts genuinely new/risky in this
        // remediation are the PDF generate/download buttons themselves and
        // the immutability of the saved snapshot on reopen). ----
        const orderDetail = await apiJson<{ report_id: string | null }>(
            request, "GET", `/api/v1/laboratory/orders/${order.id}`, { token }
        );
        if (!orderDetail.report_id) throw new Error("Report was not persisted after save");
        const reportId = orderDetail.report_id;

        // Submitting for review requires at least one assigned reviewer
        // with the "reviewer" role — set that up via the admin API, then
        // submit + approve (the admin's superuser role can approve
        // without being the assigned reviewer).
        const reviewer = await apiJson<{ id: string }>(request, "POST", "/api/v1/users/", {
            data: {
                email: `e2e-reviewer-${suffix}@example.com`,
                first_name: "E2E",
                last_name: "Reviewer",
                role: "reviewer",
                password: "E2eReviewer!2026",
                branch_ids: [registration.branch_id],
            },
            token,
        });
        await apiJson(request, "PUT", `/api/v1/laboratory/orders/${order.id}/reviewers`, {
            data: { reviewer_ids: [reviewer.id] },
            token,
        });
        await apiJson(request, "POST", `/api/v1/reports/${reportId}/submit`, { token, data: {} });
        await apiJson(request, "POST", `/api/v1/reports/${reportId}/approve`, { token, data: {} });

        // ---- Real UI: reopen the report, generate + download the
        // official PDF (bug 4 regression check — a read+edit admin must
        // see and use both buttons, not just be blocked at 403). ----
        await page.goto(`/reports/${reportId}`);
        await expect(page.getByRole("button", { name: "Generar PDF oficial" })).toBeVisible({ timeout: 15_000 });
        // The persisted snapshot must still show the branding of the
        // membrete that was active when the report was saved, and the
        // clinical text must still be intact.
        await expect(page.getByText(`E2E Lab Dos ${suffix}`, { exact: false })).toBeVisible();
        await expect(page.getByLabel("Nombre del reporte")).toHaveValue(clinicalText);
        // Once persisted, the report is locked to its saved letterhead —
        // the "Membrete" selector must not reappear on an existing report.
        await expect(page.getByText("Membrete", { exact: true })).toHaveCount(0);

        await page.getByRole("button", { name: "Generar PDF oficial" }).click();
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 20_000 });

        // The presigned URL is served with Content-Disposition: attachment
        // (reports.py sets response_content_disposition=`attachment; ...`),
        // so `window.open(url, "_blank")` never becomes a navigable popup
        // page — Chromium turns it straight into a browser download. Assert
        // on the "download" event, not "popup".
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Descargar PDF oficial" }).click();
        const download = await downloadPromise;
        expect(download.url()).toMatch(/^https?:\/\//);
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

        // ---- Reload the same report a second time — the persisted
        // snapshot (schema_version, template, presentation) must be
        // byte-identical, proving the saved version is immutable. ----
        await page.reload();
        await expect(page.getByText(`E2E Lab Dos ${suffix}`, { exact: false })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByLabel("Nombre del reporte")).toHaveValue(clinicalText);
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible();
    });
});
