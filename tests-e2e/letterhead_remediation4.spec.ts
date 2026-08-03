/**
 * real end-to-end — Fourth post-Phase 2 remediation.
 *
 * covers the three flows that this remediation touches, against the real backend:
 *
 * 1. Optional description: create a letterhead without a description, add
 * one, delete it, reload, and confirm that it remains empty (Observation 2).
 * 2. Legacy letterhead imported: create a report V2 with it and check in
 * the real DOM that the header does not have a logo, the footer does, and
 * that the layout is that of Legacy (Observation 3).
 * 3. Local printing: available before publication (marked as a draft) and
 * after publish, coexisting with "Download official PDF" without
 * replace or alter it (Observation 1).
 *
 * Each block creates its own tenant via POST /auth/register/unified, so it
 * never touches real data and can be repeated.
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
    const email = `e2e-r4-${label}-${suffix}@example.com`;
    const password = "E2eRem4!2026";
    const reg = await api<{ tenant_id: string; branch_id: string }>(
        request, "POST", "/api/v1/auth/register/unified",
        {
            data: {
                tenant: { name: `E2E R4 ${label} ${suffix}` },
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
        tenantId: reg.tenant_id, branchId: reg.branch_id, suffix,
    };
}

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
        data: { code: `R4${suffix.slice(-6)}`, name: `Estudio ${suffix}`, default_report_template_id: template.id },
        token: lab.token,
    });
    return { templateId: template.id, studyTypeId: studyType.id };
}

async function createOrder(request: APIRequestContext, lab: Lab, studyTypeId: string) {
    const suffix = uniqueSuffix();
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", {
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId,
            first_name: "E2E", last_name: "Paciente", patient_code: `R4-PAT-${suffix}`,
        },
        token: lab.token,
    });
    return api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", {
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId,
            patient_id: patient.id, study_type_id: studyTypeId,
            samples: [{ sample_code: `R4-S-${suffix}`, sample_type: "Bloque", collected_at: "2026-08-01", received_at: "2026-08-01" }],
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

/**
 * Open "Rename" (which edits name AND description) from the menu
 * actions of the first row. The item is located within the menu
 * dropdown on purpose: the title of the modal itself ("Rename
 * letterhead") remains in the DOM between openings and would make it ambiguous
 * search by loose text.
 */
async function openRenameModal(page: Page) {
    await page.getByRole("button", { name: /Más acciones/i }).first().click();
    await page.locator(".ant-dropdown-menu-title-content", { hasText: "Renombrar" }).click();
    await expect(page.getByPlaceholder("Descripción (opcional)")).toBeVisible({ timeout: 10_000 });
}

/**
 * Actual geometry of the first previewed sheet, measured in the browser.
 * Bands are located by position (not by class), just like in the
 * visual parity suite.
 */
async function readPreviewLayout(page: Page) {
    return page.evaluate(() => {
        const pageEl = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
            (el) => el.style.width === "8.5in",
        );
        if (!pageEl) return null;
        const children = Array.from(pageEl.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement,
        );
        const header = children.find((el) => el.style.top && !el.style.bottom);
        const footer = children.find((el) => el.style.bottom && !el.style.top);
        const body = children.find((el) => el.style.top && el.style.bottom);
        return {
            headerImages: header ? header.querySelectorAll("img").length : -1,
            footerImages: footer ? footer.querySelectorAll("img").length : -1,
            headerHeight: header?.style.height ?? "",
            headerTop: header?.style.top ?? "",
            footerHeight: footer?.style.height ?? "",
            footerBottom: footer?.style.bottom ?? "",
            footerWeight: footer?.style.fontWeight ?? "",
            bodyLeft: body?.style.left ?? "",
            bodyPaddingTop: body?.style.paddingTop ?? "",
            text: pageEl.innerText,
        };
    });
}

// ===========================================================================
// Observation 2 — description optional
// ===========================================================================

test.describe("Fourth remedy — optional letterhead description", () => {
    test("create without description, add it, delete it and confirm that it remains empty when reopening", async ({ page, request }) => {
        const lab = await createLab(request, "desc");
        await login(page, lab);

        // --- 1. Create without a description ---
        await page.goto("/config/report-letterheads");
        await page.getByRole("button", { name: "Nuevo membrete" }).click();
        await page.getByLabel("Nombre").fill("Membrete sin descripción");
        await page.getByRole("button", { name: "Crear y continuar" }).click();
        await expect(page.getByRole("heading", { name: /Editar membrete/ })).toBeVisible({ timeout: 10_000 });

        // --- 2. Reopen the list: the row shows no description ---
        await page.goto("/config/report-letterheads");
        await expect(page.getByText("Membrete sin descripción")).toBeVisible({ timeout: 10_000 });

        const letterheads = await api<{ letterheads: Array<{ id: string; name: string; description: string | null }> }>(
            request, "GET", "/api/v1/report-letterheads/", { token: lab.token }
        );
        const created = letterheads.letterheads.find((l) => l.name === "Membrete sin descripción")!;
        expect(created.description).toBeNull();

        // --- 3. Set a description for the UI ---
        await openRenameModal(page);
        await page.getByPlaceholder("Descripción (opcional)").fill("Una descripción temporal");
        await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
        await expect(page.getByText("Una descripción temporal")).toBeVisible({ timeout: 10_000 });

        // --- 4. BORRARLA — the reported bug ---
        await openRenameModal(page);
        const textarea = page.getByPlaceholder("Descripción (opcional)");
        await expect(textarea).toHaveValue("Una descripción temporal");
        await textarea.fill("");
        await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();

        // --- 5. really reload and confirm that it was empty ---
        await page.reload();
        await expect(page.getByText("Membrete sin descripción")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Una descripción temporal")).toHaveCount(0);

        const after = await api<{ letterheads: Array<{ id: string; description: string | null }> }>(
            request, "GET", "/api/v1/report-letterheads/", { token: lab.token }
        );
        expect(after.letterheads.find((l) => l.id === created.id)!.description).toBeNull();

        // --- 6. And the textarea rehydrates empty, not with the previous text ---
        await openRenameModal(page);
        await expect(page.getByPlaceholder("Descripción (opcional)")).toHaveValue("");
    });

    test("only spaces is equivalent to empty", async ({ page, request }) => {
        const lab = await createLab(request, "space");
        const created = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
            data: { name: "Membrete espacios", description: "Texto inicial" },
            token: lab.token,
        });

        await login(page, lab);
        await page.goto("/config/report-letterheads");
        await expect(page.getByText("Membrete espacios")).toBeVisible({ timeout: 10_000 });

        await openRenameModal(page);
        await page.getByPlaceholder("Descripción (opcional)").fill("     ");
        await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();

        await expect(async () => {
            const detail = await api<{ description: string | null }>(
                request, "GET", `/api/v1/report-letterheads/${created.id}`, { token: lab.token }
            );
            expect(detail.description).toBeNull();
        }).toPass({ timeout: 10_000 });
    });
});

// ===========================================================================
// Observations 1 and 3 — Legacy letterhead + local printing, in a only flow
// ===========================================================================

test.describe("Fourth Remediation — Legacy letterhead and local printing", () => {
    test("import Legacy, create V2 report, print draft, publish and download the official PDF", async ({ page, request }) => {
        test.slow();
        const lab = await createLab(request, "legacy");
        const { studyTypeId } = await createClinicalSetup(request, lab);
        const order = await createOrder(request, lab, studyTypeId);

        // --- Export the Legacy letterhead and import it, for the actual API ---
        const legacyEnvelope = await api<Record<string, unknown>>(
            request, "GET", "/api/v1/report-letterheads/legacy/export", { token: lab.token }
        );
        const importRes = await request.fetch(`${API_BASE}/api/v1/report-letterheads/import`, {
            method: "POST",
            headers: { Authorization: `Bearer ${lab.token}` },
            multipart: {
                file: {
                    name: "legado.cell",
                    mimeType: "application/json",
                    buffer: Buffer.from(JSON.stringify(legacyEnvelope), "utf-8"),
                },
            },
        });
        expect(importRes.status(), await importRes.text()).toBe(200);
        const imported = await importRes.json() as { report_letterhead_id: string };
        // Mark it as default: thus the report new resolves it without
        // depend on the interaction with the selector.
        await api(request, "POST",
            `/api/v1/report-letterheads/${imported.report_letterhead_id}/default`,
            { token: lab.token });

        await login(page, lab);

        // --- Create the V2 report with that letterhead ---
        await page.goto(`/reports/editor?orderId=${order.id}`);
        await expect(page.getByLabel("Nombre del reporte")).toBeVisible({ timeout: 20_000 });
        await page.getByLabel("Nombre del reporte").fill(`Reporte Legacy ${lab.suffix}`);

        // --- The Legacy letterhead in the real DOM ---
        await expect(async () => {
            const layout = await readPreviewLayout(page);
            expect(layout).not.toBeNull();
            // No neutral logo above (the original complaint).
            expect(layout!.headerImages).toBe(0);
            // With logo below, where Legacy has it.
            expect(layout!.footerImages).toBe(1);
            // geometry Legacy: 28/20mm bands flush with the blade, 18mm wide
            // side margins and 4mm of top padding in the body.
            expect(layout!.headerTop).toBe("0mm");
            expect(layout!.headerHeight).toBe("28mm");
            expect(layout!.footerBottom).toBe("0mm");
            expect(layout!.footerHeight).toBe("20mm");
            expect(layout!.bodyLeft).toBe("18mm");
            expect(layout!.bodyPaddingTop).toBe("4mm");
            // footer a ball.
            expect(layout!.footerWeight).toBe("700");
            // The institutional block of Legacy, and no page number.
            expect(layout!.text).toContain("Villanueva");
            expect(layout!.text).not.toMatch(/Página \d+ de \d+/);
        }).toPass({ timeout: 25_000 });

        // --- Print a local copy before publication ---
        await expect(page.getByRole("button", { name: "Imprimir borrador" })).toBeVisible();
        await expect(page.getByText("BORRADOR — DOCUMENTO NO OFICIAL")).toBeVisible();
        // Before publication, no official PDF is available for download: the two
        // actions are different and must not be confused.
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toHaveCount(0);

        // `print()` is intercepted so that the system dialog does not crash
        // the suite; What you check is that you get to print and what
        // document was composed.
        await page.addInitScript(() => {
            (window as unknown as { __printedDocs: string[] }).__printedDocs = [];
        });
        await page.evaluate(() => {
            (window as unknown as { __printedDocs: string[] }).__printedDocs = [];
            const originalCreate = document.createElement.bind(document);
            document.createElement = ((tag: string) => {
                const el = originalCreate(tag);
                if (tag === "iframe") {
                    queueMicrotask(() => {
                        const frame = el as HTMLIFrameElement;
                        const win = frame.contentWindow;
                        if (win) {
                            win.print = () => {
                                (window as unknown as { __printedDocs: string[] })
                                    .__printedDocs.push(win.document.body.innerText);
                            };
                            win.focus = () => {};
                        }
                    });
                }
                return el;
            }) as typeof document.createElement;
        });

        await page.getByRole("button", { name: "Imprimir borrador" }).click();
        await expect(async () => {
            const docs = await page.evaluate(
                () => (window as unknown as { __printedDocs: string[] }).__printedDocs,
            );
            expect(docs.length).toBeGreaterThan(0);
            expect(docs.join("\n")).toContain("BORRADOR — DOCUMENTO NO OFICIAL");
            expect(docs.join("\n")).toContain("no sustituye al PDF oficial");
        }).toPass({ timeout: 20_000 });

        // --- save and carry the report until APPROVED by API ---
        await page.getByRole("button", { name: "Guardar reporte" }).click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 20_000 });

        const orderDetail = await api<{ report_id: string | null }>(
            request, "GET", `/api/v1/laboratory/orders/${order.id}`, { token: lab.token }
        );
        const reportId = orderDetail.report_id!;
        expect(reportId).toBeTruthy();

        const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", {
            data: {
                email: `e2e-r4-reviewer-${lab.suffix}@example.com`,
                first_name: "E2E", last_name: "Reviewer", role: "reviewer",
                password: "E2eReviewer!2026", branch_ids: [lab.branchId],
            },
            token: lab.token,
        });
        await api(request, "PUT", `/api/v1/laboratory/orders/${order.id}/reviewers`, {
            data: { reviewer_ids: [reviewer.id] }, token: lab.token,
        });
        await api(request, "POST", `/api/v1/reports/${reportId}/submit`, { token: lab.token, data: {} });
        await api(request, "POST", `/api/v1/reports/${reportId}/approve`, { token: lab.token, data: {} });

        // --- sign and publish as reviewer ---
        const reviewerContext = await page.context().browser()!.newContext();
        const reviewerPage = await reviewerContext.newPage();
        await login(reviewerPage, {
            email: `e2e-r4-reviewer-${lab.suffix}@example.com`,
            password: "E2eReviewer!2026",
        });
        await reviewerPage.goto(`/reports/${reportId}`);
        await expect(reviewerPage.getByRole("button", { name: "Firmar y publicar" }))
            .toBeVisible({ timeout: 20_000 });
        // also in APPROVED local printing is available and checked.
        await expect(reviewerPage.getByRole("button", { name: "Imprimir borrador" })).toBeVisible();

        await reviewerPage.getByRole("button", { name: "Firmar y publicar" }).click();
        await expect(reviewerPage.getByRole("button", { name: "Descargar PDF oficial" }))
            .toBeVisible({ timeout: 45_000 });

        // --- PUBLISHED: the two actions coexist and are different ---
        await expect(reviewerPage.getByRole("button", { name: "Imprimir copia local" })).toBeVisible();
        await expect(reviewerPage.getByRole("button", { name: "Imprimir borrador" })).toHaveCount(0);
        await expect(reviewerPage.getByText("BORRADOR — DOCUMENTO NO OFICIAL")).toHaveCount(0);

        // --- The official PDF: hash and state before printing locally ---
        const before = await api<{ pdf_sha256: string | null; pdf_generation_status: string | null; status: string }>(
            request, "GET", `/api/v1/reports/${reportId}`, { token: lab.token }
        );
        expect(before.status).toBe("PUBLISHED");
        expect(before.pdf_sha256).toBeTruthy();

        // --- Print the local copy of a report ALREADY published ---
        await reviewerPage.evaluate(() => {
            (window as unknown as { __printedDocs: string[] }).__printedDocs = [];
            const originalCreate = document.createElement.bind(document);
            document.createElement = ((tag: string) => {
                const el = originalCreate(tag);
                if (tag === "iframe") {
                    queueMicrotask(() => {
                        const frame = el as HTMLIFrameElement;
                        const win = frame.contentWindow;
                        if (win) {
                            win.print = () => {
                                (window as unknown as { __printedDocs: string[] })
                                    .__printedDocs.push(win.document.body.innerText);
                            };
                            win.focus = () => {};
                        }
                    });
                }
                return el;
            }) as typeof document.createElement;
        });
        await reviewerPage.getByRole("button", { name: "Imprimir copia local" }).click();
        await expect(async () => {
            const docs = await reviewerPage.evaluate(
                () => (window as unknown as { __printedDocs: string[] }).__printedDocs,
            );
            expect(docs.length).toBeGreaterThan(0);
            // Published: without a draft mark, but with clarification that it
            // remains separate from the official document.
            expect(docs.join("\n")).not.toContain("BORRADOR");
            expect(docs.join("\n")).toContain("no sustituye al PDF oficial");
        }).toPass({ timeout: 20_000 });

        // --- The official artifact did not change even byte ---
        const after = await api<{ pdf_sha256: string | null; pdf_generation_status: string | null; status: string }>(
            request, "GET", `/api/v1/reports/${reportId}`, { token: lab.token }
        );
        expect(after.pdf_sha256).toBe(before.pdf_sha256);
        expect(after.pdf_generation_status).toBe(before.pdf_generation_status);
        expect(after.status).toBe(before.status);

        // --- And the official download remains working (it's a file, not the
        //browser print) ---
        const downloadPromise = reviewerPage.waitForEvent("download");
        await reviewerPage.getByRole("button", { name: "Descargar PDF oficial" }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

        await reviewerContext.close();
    });
});
