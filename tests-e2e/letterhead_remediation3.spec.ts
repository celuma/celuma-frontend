/**
 * real end-to-end — Third post-Phase 2 remediation.
 *
 * Complements letterhead_lifecycle.spec.ts (which covers create -> upload logo ->
 * save -> report -> sign -> PDF) with the flows that this remediation
 * introduces or repairs, and what the previous test did not touch on:
 *
 * 1. Real round-trip `.cell` between two isolated tenants, compared field
 * by field and visually in the tenant destination editor (issue A).
 * 2. explicit state blocked without default letterhead, and V2 in
 * how much there is — never Legacy (issue F).
 * 3. Deterministic default: change the default affects the
 * reports NUEVOS and never to those already created (issue E).
 * 4. delete a letterhead without references; reject the removed from
 * referenced; deactivate as alternative (issue D).
 *
 * each block creates its own tenant via POST /auth/register/unified, thus
 * It never touches real data and can be repeated.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";
const LOGO_PATH = path.join(__dirname, "fixtures", "e2e-logo.png");

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
}

/** An isolated lab with reports_v2_enabled. */
async function createLab(request: APIRequestContext, label: string): Promise<Lab> {
    const suffix = uniqueSuffix();
    const email = `e2e-r3-${label}-${suffix}@example.com`;
    const password = "E2eRem3!2026";
    const reg = await api<{ tenant_id: string; branch_id: string }>(
        request, "POST", "/api/v1/auth/register/unified",
        {
            data: {
                tenant: { name: `E2E R3 ${label} ${suffix}` },
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
    return {
        email, password, token: login.access_token,
        tenantId: reg.tenant_id, branchId: reg.branch_id,
    };
}

/** Clinical template with an ACTIVE version and its study type. */
async function createClinicalSetup(request: APIRequestContext, lab: Lab) {
    const suffix = uniqueSuffix();
    const templateJson = {
        base: { diagnosis: { is_visible: true, label: "Diagnóstico", is_custom: true, type: "text", value: "" } },
        sections: {}, base_order: ["diagnosis"], section_order: [],
    };
    const template = await api<{ id: string }>(request, "POST", "/api/v1/reports/templates/", {
        data: { name: `Plantilla ${suffix}`, template_json: templateJson },
        token: lab.token,
    });
    const version = await api<{ id: string }>(
        request, "POST", `/api/v1/reports/templates/${template.id}/versions`,
        {
            data: {
                configuration: {
                    schema_version: 2,
                    template: templateJson,
                    presentation: {
                        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
                        header: { enabled: true, institution_name: "Placeholder" },
                        footer: { enabled: true, show_page_number: true },
                        style: { primary_color: "#4A4A4A" },
                    },
                },
            },
            token: lab.token,
        }
    );
    await api(request, "POST", `/api/v1/reports/templates/${template.id}/versions/${version.id}/activate`, { token: lab.token });
    const studyType = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", {
        data: { code: `R3${suffix.slice(-6)}`, name: `Estudio ${suffix}`, default_report_template_id: template.id },
        token: lab.token,
    });
    return { templateId: template.id, templateVersionId: version.id, studyTypeId: studyType.id };
}

async function createOrder(request: APIRequestContext, lab: Lab, studyTypeId: string) {
    const suffix = uniqueSuffix();
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", {
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId,
            first_name: "E2E", last_name: "Paciente", patient_code: `R3-PAT-${suffix}`,
        },
        token: lab.token,
    });
    return api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", {
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId,
            patient_id: patient.id, study_type_id: studyTypeId,
            samples: [{ sample_code: `R3-S-${suffix}`, sample_type: "Bloque", collected_at: "2026-08-01", received_at: "2026-08-01" }],
        },
        token: lab.token,
    });
}

async function login(page: Page, lab: Lab) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(lab.email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(lab.password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

/** In which band of the previewed page each `<img>` falls. */
async function previewLogoBands(page: Page): Promise<string[]> {
    return page.evaluate(() => {
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
}

test.describe("Third Remediation — Letterheads", () => {
    test("round-trip .cell between tenants preserves configuration and both logos", async ({ page, request }) => {
        const labA = await createLab(request, "a");
        const labB = await createLab(request, "b");

        // --- Tenant A: create the letterhead for the real UI, with the two logos ---
        await login(page, labA);
        await page.goto("/config/report-letterheads");
        await page.getByRole("button", { name: "Nuevo membrete" }).click();
        await page.getByLabel("Nombre").fill("Membrete Origen");
        await page.getByRole("button", { name: "Crear y continuar" }).click();
        await expect(page.getByRole("heading", { name: /Editar membrete/ })).toBeVisible({ timeout: 10_000 });

        // Selecting the file uploads it immediately (without a second button) and
        // the asset appears immediately — the drag-and-drop failure.
        await page.locator('input[type="file"]').nth(0).setInputFiles(LOGO_PATH);
        await expect(page.getByAltText("Logo", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await page.locator('input[type="file"]').nth(1).setInputFiles(LOGO_PATH);
        await expect(page.getByAltText("Logo de pie", { exact: true })).toBeVisible({ timeout: 10_000 });

        await page.getByLabel("Nombre institucional").fill("Laboratorio Origen");
        await page.getByRole("button", { name: "Guardar cambios" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
        await expect(page).toHaveURL(/\/report-letterheads$/, { timeout: 10_000 });

        // --- Exit and return: the two logos and the configuration are rehydrated ---
        await page.reload();
        await page.getByRole("row", { name: /Membrete Origen/ }).getByRole("button", { name: "Editar" }).click();
        await expect(page.getByLabel("Nombre institucional")).toHaveValue("Laboratorio Origen");
        await expect(page.getByAltText("Logo", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByAltText("Logo de pie", { exact: true })).toBeVisible();
        const bandsA = await previewLogoBands(page);
        expect(bandsA).toContain("header");
        expect(bandsA).toContain("footer");

        // --- Export and import in tenant B ---
        const { letterheads } = await api<{ letterheads: Array<{ id: string; name: string }> }>(
            request, "GET", "/api/v1/report-letterheads/?active_only=false", { token: labA.token }
        );
        const sourceId = letterheads.find((l) => l.name === "Membrete Origen")!.id;
        const activeA = await api<{ id: string; configuration: Record<string, any> }>(
            request, "GET", `/api/v1/report-letterheads/${sourceId}/versions/active`, { token: labA.token }
        );
        const envelope = await api<Record<string, unknown>>(
            request, "GET", `/api/v1/report-letterheads/${sourceId}/versions/${activeA.id}/export`, { token: labA.token }
        );
        expect(Object.keys(envelope.assets as object).sort()).toEqual(["footer_logo", "header_logo"]);

        const imported = await request.fetch(`${API_BASE}/api/v1/report-letterheads/import`, {
            method: "POST",
            headers: { Authorization: `Bearer ${labB.token}` },
            multipart: {
                file: {
                    name: "membrete.cell",
                    mimeType: "application/json",
                    buffer: Buffer.from(JSON.stringify(envelope)),
                },
            },
        });
        expect(imported.ok(), await imported.text()).toBeTruthy();
        const importedBody = await imported.json();
        // Imported = usable immediately (ACTIVE), but never default.
        expect(importedBody.status).toBe("ACTIVE");

        // Field-by-field equality, ignoring only StorageObject ids.
        const scrub = (c: Record<string, any>) => {
            const copy = JSON.parse(JSON.stringify(c));
            copy.header.logo_storage_id = "<id>";
            copy.footer.logo_storage_id = "<id>";
            return copy;
        };
        expect(scrub(importedBody.configuration)).toEqual(scrub(activeA.configuration));
        // ...and the ids WERE regenerated (those from the tenant source were not filtered).
        expect(importedBody.configuration.header.logo_storage_id)
            .not.toBe(activeA.configuration.header.logo_storage_id);

        // --- Tenant B: open the imported one and check it visually ---
        const pageB = await page.context().browser()!.newContext();
        const b = await pageB.newPage();
        await login(b, labB);
        await b.goto(`/config/report-letterheads/${importedBody.report_letterhead_id}/versions/new`);
        await expect(b.getByRole("heading", { name: /Editar membrete/ })).toBeVisible({ timeout: 15_000 });
        await expect(b.getByLabel("Nombre institucional")).toHaveValue("Laboratorio Origen");
        await expect(b.getByAltText("Logo", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await expect(b.getByAltText("Logo de pie", { exact: true })).toBeVisible();
        const bandsB = await previewLogoBands(b);
        expect(bandsB).toContain("header");
        expect(bandsB).toContain("footer");
        await pageB.close();
    });

    test("without a default letterhead V2 blocks explicitly; with one, never Legacy", async ({ page, request }) => {
        const lab = await createLab(request, "block");
        const setup = await createClinicalSetup(request, lab);
        const order = await createOrder(request, lab, setup.studyTypeId);

        await login(page, lab);
        await page.goto(`/reports/editor?orderId=${order.id}`);

        // Blocked, actionable state — and never the Legacy letterhead.
        await expect(page.getByText(/Falta el membrete predeterminado del laboratorio/i))
            .toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Ir a Membretes" })).toBeVisible();
        await expect(page.getByText("Dra. Arisbeth Villanueva Pérez.")).toHaveCount(0);

        // Set the default and return: now V2, with your brand.
        const lh = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
            data: { name: "Predeterminado E2E" }, token: lab.token,
        });
        await api(request, "PUT", `/api/v1/report-letterheads/${lh.id}/versions/current`, {
            data: {
                configuration: {
                    paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
                    header: { enabled: true, institution_name: "LAB PREDETERMINADO" },
                    footer: { enabled: true, show_page_number: true },
                    style: { primary_color: "#336699" },
                },
            },
            token: lab.token,
        });
        await api(request, "POST", `/api/v1/report-letterheads/${lh.id}/default`, { token: lab.token });

        await page.goto(`/reports/editor?orderId=${order.id}`);
        await expect(page.getByText("LAB PREDETERMINADO")).toBeVisible({ timeout: 15_000 });
        // The UI states why that letterhead was selected, without technical IDs.
        await expect(page.getByTestId("letterhead-resolution-source"))
            .toHaveText(/Predeterminado del laboratorio/);
        await expect(page.getByText("Dra. Arisbeth Villanueva Pérez.")).toHaveCount(0);
    });

    test("change the default affects new reports, never those already created", async ({ request }) => {
        const lab = await createLab(request, "default");
        const setup = await createClinicalSetup(request, lab);

        const makeLetterhead = async (name: string, institution: string) => {
            const lh = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
                data: { name }, token: lab.token,
            });
            await api(request, "PUT", `/api/v1/report-letterheads/${lh.id}/versions/current`, {
                data: {
                    configuration: {
                        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
                        header: { enabled: true, institution_name: institution },
                        footer: { enabled: true, show_page_number: true },
                        style: { primary_color: "#336699" },
                    },
                },
                token: lab.token,
            });
            return lh.id;
        };
        const idA = await makeLetterhead("Membrete A", "INSTITUCION A");
        const idB = await makeLetterhead("Membrete B", "INSTITUCION B");

        const makeReport = async () => {
            const order = await createOrder(request, lab, setup.studyTypeId);
            const report = await api<{ id: string }>(request, "POST", "/api/v1/reports/", {
                data: {
                    tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: order.id,
                    title: "Reporte", schema_version: 2, template_version_id: setup.templateVersionId,
                    template: { base: {}, sections: {} },
                    report: { base: {}, sections: {}, base_order: [], section_order: [] },
                },
                token: lab.token,
            });
            return report.id;
        };
        const institutionOf = async (reportId: string) => {
            const detail = await api<{ report: { rendering_snapshot: { presentation: { header: { institution_name: string } } } } }>(
                request, "GET", `/api/v1/reports/${reportId}`, { token: lab.token }
            );
            return detail.report.rendering_snapshot.presentation.header.institution_name;
        };

        await api(request, "POST", `/api/v1/report-letterheads/${idA}/default`, { token: lab.token });
        const first = await makeReport();
        expect(await institutionOf(first)).toBe("INSTITUCION A");

        await api(request, "POST", `/api/v1/report-letterheads/${idB}/default`, { token: lab.token });
        const second = await makeReport();
        expect(await institutionOf(second)).toBe("INSTITUCION B");

        // The previous report preserves its snapshot intact.
        expect(await institutionOf(first)).toBe("INSTITUCION A");
    });

    test("delete without references works; with references it rejects and is disabled", async ({ page, request }) => {
        const lab = await createLab(request, "delete");

        const makeLetterhead = async (name: string) => {
            const lh = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
                data: { name }, token: lab.token,
            });
            await api(request, "PUT", `/api/v1/report-letterheads/${lh.id}/versions/current`, {
                data: {
                    configuration: {
                        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
                        header: { enabled: true, institution_name: name },
                        footer: { enabled: true, show_page_number: true },
                        style: { primary_color: "#336699" },
                    },
                },
                token: lab.token,
            });
            return lh.id;
        };
        const disposableId = await makeLetterhead("Membrete Desechable");
        const defaultId = await makeLetterhead("Membrete Predeterminado");
        await api(request, "POST", `/api/v1/report-letterheads/${defaultId}/default`, { token: lab.token });

        // The default cannot be deleted or deactivated.
        await api(request, "DELETE", `/api/v1/report-letterheads/${defaultId}?hard_delete=true`, {
            token: lab.token, expectStatus: 409,
        });
        await api(request, "DELETE", `/api/v1/report-letterheads/${defaultId}`, {
            token: lab.token, expectStatus: 409,
        });

        // The disposable one does: because of the real UI, with its confirmation dialog.
        await login(page, lab);
        await page.goto("/config/report-letterheads");
        const row = page.getByRole("row", { name: /Membrete Desechable/ });
        await row.getByRole("button", { name: "Más acciones" }).click();
        await page.getByRole("menuitem", { name: "Eliminar" }).click();
        await expect(page.getByText(/no se puede deshacer/i)).toBeVisible();
        await page.getByRole("button", { name: "Sí, eliminar" }).click();
        await expect(page.getByRole("row", { name: /Membrete Desechable/ })).toHaveCount(0, { timeout: 10_000 });

        await api(request, "GET", `/api/v1/report-letterheads/${disposableId}`, {
            token: lab.token, expectStatus: 404,
        });

        // a letterhead referenced by a template: it is not removed, it is disabled.
        const referencedId = await makeLetterhead("Membrete Referenciado");
        const setup = await createClinicalSetup(request, lab);
        await api(request, "PUT", `/api/v1/reports/templates/${setup.templateId}`, {
            data: { preferred_letterhead_id: referencedId }, token: lab.token,
        });
        await api(request, "DELETE", `/api/v1/report-letterheads/${referencedId}?hard_delete=true`, {
            token: lab.token, expectStatus: 409,
        });

        await page.reload();
        const refRow = page.getByRole("row", { name: /Membrete Referenciado/ });
        await refRow.getByRole("button", { name: "Más acciones" }).click();
        // "delete" is not even offered — the backend already said it is not safe.
        await expect(page.getByRole("menuitem", { name: "Eliminar" })).toHaveCount(0);
        await page.getByRole("menuitem", { name: "Desactivar" }).click();
        await expect(page.getByText(/está configurado como membrete de/i)).toBeVisible();
        await page.getByRole("button", { name: "Sí, desactivar" }).click();
        await expect(page.getByRole("row", { name: /Membrete Referenciado/ }).getByText("Inactivo"))
            .toBeVisible({ timeout: 10_000 });
    });
});
