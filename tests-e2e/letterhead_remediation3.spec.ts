/**
 * Real end-to-end — TERCERA remediación post-Fase 2.
 *
 * Complementa letterhead_lifecycle.spec.ts (que cubre crear -> subir logo ->
 * guardar -> reporte -> firmar -> PDF) con los flujos que esta remediación
 * introduce o repara, y que ninguna prueba anterior tocaba:
 *
 *   1. Round-trip `.cell` REAL entre DOS tenants aislados, comparado campo
 *      por campo y visualmente en el editor del tenant destino (problema A).
 *   2. Estado BLOQUEADO explícito sin membrete predeterminado, y V2 en
 *      cuanto lo hay — nunca Legacy (problema F).
 *   3. Default determinista: cambiar el predeterminado afecta a los
 *      reportes NUEVOS y jamás a los ya creados (problema E).
 *   4. Eliminar un membrete sin referencias; rechazar el eliminado del
 *      referenciado; desactivar como alternativa (problema D).
 *
 * Cada bloque crea su propio tenant vía POST /auth/register/unified, así
 * que nunca toca datos reales y se puede repetir.
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

/** Un laboratorio aislado con reports_v2_enabled. */
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

/** Plantilla clínica con versión ACTIVE + tipo de estudio que la usa. */
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

/** En qué banda de la página previsualizada cae cada `<img>`. */
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

test.describe("Tercera remediación — membretes", () => {
    test("round-trip .cell entre tenants conserva configuración y ambos logos", async ({ page, request }) => {
        const labA = await createLab(request, "a");
        const labB = await createLab(request, "b");

        // --- Tenant A: crear el membrete por la UI real, con los dos logos ---
        await login(page, labA);
        await page.goto("/config/report-letterheads");
        await page.getByRole("button", { name: "Nuevo membrete" }).click();
        await page.getByLabel("Nombre").fill("Membrete Origen");
        await page.getByRole("button", { name: "Crear y continuar" }).click();
        await expect(page.getByRole("heading", { name: /Editar membrete/ })).toBeVisible({ timeout: 10_000 });

        // Seleccionar el archivo lo sube de inmediato (sin segundo botón) y
        // el asset aparece al instante — el fallo del drag-and-drop.
        await page.locator('input[type="file"]').nth(0).setInputFiles(LOGO_PATH);
        await expect(page.getByAltText("Logo", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await page.locator('input[type="file"]').nth(1).setInputFiles(LOGO_PATH);
        await expect(page.getByAltText("Logo de pie", { exact: true })).toBeVisible({ timeout: 10_000 });

        await page.getByLabel("Nombre institucional").fill("Laboratorio Origen");
        await page.getByRole("button", { name: "Guardar cambios" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
        await expect(page).toHaveURL(/\/report-letterheads$/, { timeout: 10_000 });

        // --- Salir y volver: los dos logos y la configuración se rehidratan ---
        await page.reload();
        await page.getByRole("row", { name: /Membrete Origen/ }).getByRole("button", { name: "Editar" }).click();
        await expect(page.getByLabel("Nombre institucional")).toHaveValue("Laboratorio Origen");
        await expect(page.getByAltText("Logo", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByAltText("Logo de pie", { exact: true })).toBeVisible();
        const bandsA = await previewLogoBands(page);
        expect(bandsA).toContain("header");
        expect(bandsA).toContain("footer");

        // --- Exportar e importar en el tenant B ---
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
        // Importado = usable de inmediato (ACTIVE), pero nunca predeterminado.
        expect(importedBody.status).toBe("ACTIVE");

        // Igualdad campo por campo, ignorando solo los ids de StorageObject.
        const scrub = (c: Record<string, any>) => {
            const copy = JSON.parse(JSON.stringify(c));
            copy.header.logo_storage_id = "<id>";
            copy.footer.logo_storage_id = "<id>";
            return copy;
        };
        expect(scrub(importedBody.configuration)).toEqual(scrub(activeA.configuration));
        // ...y los ids SÍ se regeneraron (no se filtraron los del tenant origen).
        expect(importedBody.configuration.header.logo_storage_id)
            .not.toBe(activeA.configuration.header.logo_storage_id);

        // --- Tenant B: abrir el importado y comprobarlo VISUALMENTE ---
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

    test("sin membrete predeterminado bloquea V2 explícitamente; con él, nunca Legacy", async ({ page, request }) => {
        const lab = await createLab(request, "block");
        const setup = await createClinicalSetup(request, lab);
        const order = await createOrder(request, lab, setup.studyTypeId);

        await login(page, lab);
        await page.goto(`/reports/editor?orderId=${order.id}`);

        // Estado bloqueado, accionable — y NUNCA el membrete legado.
        await expect(page.getByText(/Falta el membrete predeterminado del laboratorio/i))
            .toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Ir a Membretes" })).toBeVisible();
        await expect(page.getByText("Dra. Arisbeth Villanueva Pérez.")).toHaveCount(0);

        // Configurar el predeterminado y volver: ahora V2, con su marca.
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
        // La UI dice POR QUÉ salió ese membrete, sin ids técnicos.
        await expect(page.getByTestId("letterhead-resolution-source"))
            .toHaveText(/Predeterminado del laboratorio/);
        await expect(page.getByText("Dra. Arisbeth Villanueva Pérez.")).toHaveCount(0);
    });

    test("cambiar el predeterminado afecta a reportes nuevos, nunca a los ya creados", async ({ request }) => {
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

        // El reporte anterior conserva su snapshot intacto.
        expect(await institutionOf(first)).toBe("INSTITUCION A");
    });

    test("eliminar sin referencias funciona; con referencias se rechaza y se desactiva", async ({ page, request }) => {
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

        // El predeterminado no se puede eliminar ni desactivar.
        await api(request, "DELETE", `/api/v1/report-letterheads/${defaultId}?hard_delete=true`, {
            token: lab.token, expectStatus: 409,
        });
        await api(request, "DELETE", `/api/v1/report-letterheads/${defaultId}`, {
            token: lab.token, expectStatus: 409,
        });

        // El desechable sí: por la UI real, con su diálogo de confirmación.
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

        // Un membrete referenciado por una plantilla: no se elimina, se desactiva.
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
        // "Eliminar" ni siquiera se ofrece — el backend ya dijo que no es seguro.
        await expect(page.getByRole("menuitem", { name: "Eliminar" })).toHaveCount(0);
        await page.getByRole("menuitem", { name: "Desactivar" }).click();
        await expect(page.getByText(/está configurado como membrete de/i)).toBeVisible();
        await page.getByRole("button", { name: "Sí, desactivar" }).click();
        await expect(page.getByRole("row", { name: /Membrete Referenciado/ }).getByText("Inactivo"))
            .toBeVisible({ timeout: 10_000 });
    });
});
