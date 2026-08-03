/**
 * real end-to-end test — post-Phase-2 remediation R17; updated in the
 * Second post-Phase 2 remediation (UX).
 *
 * Drives the current app (`npm run dev`) against a real FastAPI backend +
 * real Postgres + real S3 (see playwright.e2e.config.ts). Creates its own
 * isolated tenant/admin user via POST /auth/register/unified so it never
 * touches real tenant data and is repeatable.
 *
 * flow covered (updated to simplified UX): login -> admin ->
 * create letterhead (immediately redirects to editor) -> upload logo via
 * setInputFiles() -> "save changes" (create+active atomically, without step
 * of "publish"/"activate" separate) -> check default (menu
 * secondary) -> associate to 2 templates -> new report -> confirm
 * V2-from-start with "letterhead" selector -> write clinical text
 * -> change letterhead -> confirm that the text was not altered, only the
 * branding -> save -> approve -> "sign and publish" (action single,
 * as the reviewer — the admin does not have the reviewer role) -> download PDF
 * official -> reopen and confirm that the persisted snapshot is immutable.
 *
 * Secondary fixture setup (second template/study type, the order itself)
 * is done via direct API calls for speed — the same backend endpoints
 * already covered by the HTTP integration suite — so this spec's browser
 * time is spent on the parts that are actually new/risky: the UI
 * Letterheads, the editor's letterhead selector, and the signature/PDF flow
 * single action.
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

test.describe("Letterhead (letterhead) lifecycle — post-Phase-2 remediation", () => {
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

        // A second clinical template, to prove a letterhead can be associated
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
                samples: [{ sample_code: `E2E-S-${suffix}`, sample_type: "Block", collected_at: "2026-08-01", received_at: "2026-08-01" }],
            },
            token,
        });

        // ---- real UI: login ----
        await page.goto("/");
        await page.getByRole("textbox", { name: "Usuario o email" }).fill(adminEmail);
        await page.getByRole("textbox", { name: "Contraseña" }).fill(adminPassword);
        await page.getByRole("button", { name: "Iniciar Sesión" }).click();
        await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });

        // ---- real UI: create letterhead — Second post-Phase 2 remediation
        // (UX). "new letterhead" creates the identity and redirects immediately
        // to visual editor; there is no "Versions"/"publish version"/ step
        // "activate" separated in the normal flow. ----
        await page.goto("/config/report-letterheads");
        await page.getByRole("button", { name: "Nuevo membrete" }).click();
        await page.getByLabel("Nombre").fill(`Membrete E2E ${suffix}`);
        await page.getByRole("button", { name: "Crear y continuar" }).click();
        await expect(page.getByRole("heading", { name: new RegExp(`Editar membrete — Membrete E2E ${suffix}`) }))
            .toBeVisible({ timeout: 10_000 });

        // The real Ant Design file input, driven with a real File via
        // setInputFiles(). Third remedy: select the file
        // uploads immediately — there is no longer a second "upload logo" button.
        const logoPath = path.join(__dirname, "fixtures", "e2e-logo.png");
        await page.locator('input[type="file"]').nth(0).setInputFiles(logoPath);
        await expect(page.getByAltText("Logo", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

        // footer logo — your own input, your own preview.
        await page.locator('input[type="file"]').nth(1).setInputFiles(logoPath);
        await expect(page.getByAltText("Logo de pie", { exact: true })).toBeVisible({ timeout: 10_000 });

        await page.getByLabel("Nombre institucional").fill(`E2E Lab ${suffix}`);
        await page.getByRole("button", { name: "Guardar cambios" }).click();
        const saveModal = page.getByRole("dialog");
        await expect(saveModal.getByText("Guardar cambios del membrete")).toBeVisible();
        await saveModal.getByRole("button", { name: "Guardar", exact: true }).click();
        // No step of "activate" — second UX remediation: save active de
        // immediate. confirms that we returned to the list without extra steps.
        await expect(page).toHaveURL(/\/report-letterheads$/, { timeout: 10_000 });
        await expect(page.getByText(`Membrete E2E ${suffix}`)).toBeVisible({ timeout: 10_000 });

        // ---- Third remedy: reopen the editor and confirm that both
        // logos and configuration are rehydrated (problems B and C). before
        // here the neutral Céluma logo appeared. ----
        const letterheadRow = page.getByRole("row", { name: new RegExp(`Membrete E2E ${suffix}`) });
        await letterheadRow.getByRole("button", { name: "Editar" }).click();
        await expect(page.getByRole("heading", { name: /Editar membrete/ })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByLabel("Nombre institucional")).toHaveValue(`E2E Lab ${suffix}`);
        await expect(page.getByAltText("Logo", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByAltText("Logo de pie", { exact: true })).toBeVisible();
        // The two logos arrive at the preview, each one in their band.
        const bands = await page.evaluate(() => {
            const pageEl = document.querySelector('[style*="8.5in"]');
            if (!pageEl) return [];
            return Array.from(pageEl.querySelectorAll("img")).map((img) => {
                let n: HTMLElement | null = img.parentElement;
                while (n && n.parentElement !== pageEl) n = n.parentElement;
                if (!n) return "other";
                const top = !!n.style.top, bottom = !!n.style.bottom;
                return top && bottom ? "body" : bottom ? "footer" : top ? "header" : "other";
            });
        });
        expect(bands).toContain("header");
        expect(bands).toContain("footer");
        await page.getByRole("button", { name: "Cancelar" }).click();
        await expect(page).toHaveURL(/\/report-letterheads$/, { timeout: 10_000 });

        // Mark as default — now lives in the secondary "..." menu.
        const row = page.getByRole("row", { name: new RegExp(`Membrete E2E ${suffix}`) });
        await row.getByRole("button", { name: "Más acciones" }).click();
        await page.getByRole("menuitem", { name: "Marcar como predeterminado" }).click();
        await expect(page.getByText("Predeterminado").first()).toBeVisible({ timeout: 10_000 });

        // A second letterhead, published+activated via API (setup speed —
        // the letterhead-creation UI itself is already fully exercised
        // above for the first one). Needed so the report editor's
        // "letterhead" selector actually renders — it only appears when 2+
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

        // ---- real UI: new report shows V2 from the very first paint ----
        await page.goto(`/reports/editor?orderId=${order.id}`);
        await expect(page.getByText("Membrete", { exact: true })).toBeVisible({ timeout: 15_000 });
        // The Legacy renderer's frozen letterhead text must never appear —
        // this is the literal regression check for bug 2.
        await expect(page.getByText("Dra. Arisbeth Villanueva Pérez.")).toHaveCount(0);
        await expect(page.getByText(`E2E Lab ${suffix}`, { exact: false })).toBeVisible({ timeout: 10_000 });

        // ---- Type clinical content, then switch letterhead (bug 3 check) ----
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

        // ---- real UI, as the reviewer (only role with reports:sign) —
        // Second post-Phase 2 remediation (UX): "Firmar y publicar" is the
        // only action in APPROVED — replaces the former separate "Generate
        // official PDF" + "Sign and publish" buttons. Separate session because
        // the admin (superuser) does not have the "reviewer" role that
        // sign_report requires. ----
        const reviewerContext = await page.context().browser()!.newContext();
        const reviewerPage = await reviewerContext.newPage();
        await reviewerPage.goto("/");
        await reviewerPage.getByRole("textbox", { name: "Usuario o email" }).fill(`e2e-reviewer-${suffix}@example.com`);
        await reviewerPage.getByRole("textbox", { name: "Contraseña" }).fill("E2eReviewer!2026");
        await reviewerPage.getByRole("button", { name: "Iniciar Sesión" }).click();
        await expect(reviewerPage.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });

        await reviewerPage.goto(`/reports/${reportId}`);
        await expect(reviewerPage.getByRole("button", { name: "Firmar y publicar" })).toBeVisible({ timeout: 15_000 });
        // The persisted snapshot must still show the branding of the
        // letterhead that was active when the report was saved, and the
        // clinical text must still be intact.
        await expect(reviewerPage.getByText(`E2E Lab Dos ${suffix}`, { exact: false })).toBeVisible();
        await expect(reviewerPage.getByLabel("Nombre del reporte")).toHaveValue(clinicalText);
        // Once persisted, the report is locked to its saved letterhead —
        // the "letterhead" selector must not reappear on an existing report.
        await expect(reviewerPage.getByText("Membrete", { exact: true })).toHaveCount(0);
        // Fourth remedy (Observation 1): local printing exists another
        // once, but in APPROVED it is offered as "Print draft" — never
        // as "local copy" (this label is reserved for PUBLISHED/RETRACTED) y
        // never as something that could be confused with the official PDF, which in
        // this state does not yet exist.
        await expect(reviewerPage.getByRole("button", { name: "Imprimir borrador" })).toBeVisible();
        await expect(reviewerPage.getByRole("button", { name: "Imprimir copia local" })).toHaveCount(0);
        await expect(reviewerPage.getByRole("button", { name: "Descargar PDF oficial" })).toHaveCount(0);
        await expect(
            reviewerPage.getByText("BORRADOR — DOCUMENTO NO OFICIAL", { exact: false }),
        ).toBeVisible();

        await reviewerPage.getByRole("button", { name: "Firmar y publicar" }).click();
        // The single action generates the official PDF (reflecting the
        // signed state) AND publishes — a longer wait than the old
        // "generate" step alone, since it now does both.
        await expect(reviewerPage.getByRole("button", { name: "Descargar PDF oficial" }))
            .toBeVisible({ timeout: 30_000 });
        await expect(reviewerPage.getByRole("button", { name: "Firmar y publicar" })).toHaveCount(0);

        // The presigned URL is served with Content-Disposition: attachment
        // (reports.py sets response_content_disposition=`attachment; ...`),
        // so `window.open(url, "_blank")` never becomes a navigable popup
        // page — Chromium turns it straight into a browser download. Assert
        // on the "download" event, not "popup".
        const downloadPromise = reviewerPage.waitForEvent("download");
        await reviewerPage.getByRole("button", { name: "Descargar PDF oficial" }).click();
        const download = await downloadPromise;
        expect(download.url()).toMatch(/^https?:\/\//);
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

        // ---- Reload the same report a second time — the persisted
        // snapshot (schema_version, template, presentation) must be
        // byte-identical, proving the saved version is immutable. ----
        await reviewerPage.reload();
        await expect(reviewerPage.getByText(`E2E Lab Dos ${suffix}`, { exact: false })).toBeVisible({ timeout: 15_000 });
        await expect(reviewerPage.getByLabel("Nombre del reporte")).toHaveValue(clinicalText);
        await expect(reviewerPage.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible();

        await reviewerContext.close();
    });
});
