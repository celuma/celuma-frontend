/**
 * Real end-to-end — Céluma 1.4 (#39): laboratory-content cleanup, in a real browser.
 *
 * Disposable PostgreSQL, a local S3-protocol emulator (moto) and the real API — nothing stubbed. The operator
 * is the person who CREATED the synthetic laboratory through `POST /auth/register/unified` (the creator binding
 * is recorded atomically there; no deployment setting is involved). Needs:
 *   CELUMA_E2E_API_BASE_URL            the API (default http://localhost:8121)
 *   CELUMA_E2E_CLEANUP_EMAIL / _PASSWORD   the laboratory's creator
 *   CELUMA_E2E_CLEANUP_TENANT          the creator's tenant id
 *   CELUMA_E2E_PSQL                    shell prefix running psql against the DISPOSABLE database
 *   CELUMA_E2E_S3_LIST_URL             bucket listing URL of the emulator (…/<bucket>?list-type=2)
 * Skipped (not failed) when the creator is not provided.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8121";
const EMAIL = process.env.CELUMA_E2E_CLEANUP_EMAIL || "";
const PASSWORD = process.env.CELUMA_E2E_CLEANUP_PASSWORD || "";
const TENANT = process.env.CELUMA_E2E_CLEANUP_TENANT || "";
const S3_LIST_URL = process.env.CELUMA_E2E_S3_LIST_URL || "";
const PSQL = (process.env.CELUMA_E2E_PSQL || "").split(" ").filter(Boolean);
const LAB_NAME = "Laboratorio Embajador Sintético";

/** A valid 1x1 PNG: the upload pipeline decodes it into the processed JPEG and the thumbnail. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function sql(query: string): string {
    if (PSQL.length === 0) throw new Error("CELUMA_E2E_PSQL is not set");
    return execFileSync(PSQL[0], [...PSQL.slice(1), "-At", "-c", query], { encoding: "utf8" }).trim();
}

async function api<T = Json>(
    request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH", path: string,
    opts: { data?: unknown; token?: string; status?: number; multipart?: Record<string, unknown> } = {},
): Promise<T> {
    const headers: Record<string, string> = {};
    if (!opts.multipart) headers["Content-Type"] = "application/json";
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (method === "POST" && /\/laboratory\/(orders\/(unified)?|samples\/)$/.test(path)) headers["Idempotency-Key"] = crypto.randomUUID();
    const res = await request.fetch(`${API_BASE}${path}`, { method, headers, data: opts.data, multipart: opts.multipart as never });
    if (opts.status !== undefined) expect(res.status(), `${method} ${path}: ${await res.text()}`).toBe(opts.status);
    else if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()}: ${await res.text()}`);
    return (await res.json().catch(() => ({}))) as T;
}

async function s3Keys(request: APIRequestContext): Promise<string[]> {
    const res = await request.get(S3_LIST_URL);
    const xml = await res.text();
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}

async function loginUi(page: import("@playwright/test").Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Usuario o email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page).not.toHaveURL(/\/login$/);
}

test.describe("Laboratory-content cleanup (1.4 #39)", () => {
    test.skip(!EMAIL || !PASSWORD || !TENANT || PSQL.length === 0 || !S3_LIST_URL, "laboratory creator / disposable stack not provided");

    test("the laboratory's creator previews, confirms and completes; everyone else is refused; master data survives", async ({ page, browser, request }) => {
        // ---- synthetic laboratory content, through the real API --------------------------------------
        const login = await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", { data: { username_or_email: EMAIL, password: PASSWORD } });
        const token = login.access_token;
        const me = await api<{ id: string; tenant_id: string }>(request, "GET", "/api/v1/auth/me", { token });
        expect(me.tenant_id).toBe(TENANT);
        const branches = await api<Json>(request, "GET", `/api/v1/tenants/${TENANT}/branches`, { token });
        const branchId = (branches.branches ?? branches)[0].id as string;
        const study = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", { token, data: { code: "HIS", name: "Histopatología sintética" } });
        const sampleType = await api<{ id: string }>(request, "POST", "/api/v1/sample-types/", { token, data: { code: "BX", name: "Biopsia sintética" } });
        const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", { token, data: {
            tenant_id: TENANT, branch_id: branchId, first_name: "Paciente", last_name: "Sintético", patient_code: `P-${Date.now()}` } });
        const registered: Json[] = [];
        for (let i = 0; i < 2; i += 1) {
            registered.push(await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { token, data: {
                tenant_id: TENANT, branch_id: branchId, patient_id: patient.id, study_type_id: study.id,
                samples: [{ sample_type_id: sampleType.id, received_at: "2026-10-15" }] } }));
        }
        const sampleId = registered[0].samples[0].id as string;
        await api(request, "POST", `/api/v1/laboratory/samples/${sampleId}/images`, { token, multipart: { file: { name: "muestra.png", mimeType: "image/png", buffer: PNG } } });
        const invoice = sql(`SELECT id FROM invoice WHERE tenant_id = '${TENANT}' ORDER BY id LIMIT 1`);
        await api(request, "POST", "/api/v1/billing/payments/", { token, data: { tenant_id: TENANT, invoice_id: invoice, amount: 50, currency: "MXN", method: "cash" } });

        // Ordinary API calls of this build write no per-order audit row; seed one synthetic row (disposable database
        // only) carrying a sentinel, to prove the historical audit of removed content is DELETED, not redacted.
        sql(`INSERT INTO audit_log (created_at, id, tenant_id, action, entity_type, entity_id, order_id, sample_id, description) ` +
            `VALUES (now(), gen_random_uuid(), '${TENANT}', 'ORDER.UPDATED', 'order', '${registered[0].order.id}', '${registered[0].order.id}', '${sampleId}', 'SENTINEL-CLINICAL-TEXT-E2E')`);
        const imageKeys = (await s3Keys(request)).filter((k) => k.includes(sampleId));
        expect(imageKeys.length).toBeGreaterThanOrEqual(2);                 // processed + thumbnail
        const preserved = {
            patients: sql(`SELECT count(*) FROM patient WHERE tenant_id = '${TENANT}'`),
            studyTypes: sql(`SELECT count(*) FROM study_type WHERE tenant_id = '${TENANT}'`),
            counters: sql(`SELECT coalesce(sum(last_value),0) FROM numbering_counter WHERE tenant_id = '${TENANT}'`),
        };

        // ---- an ordinary administrator: no entry point, access denied, every route refuses ------------
        const adminEmail = `admin-${Date.now()}@example.com`;
        await api(request, "POST", "/api/v1/users/", { token, data: {
            email: adminEmail, password: "AdminOrdinary!2026", full_name: "Administrador Sintético", first_name: "Administrador", last_name: "Sintético", role: "admin" } });
        const users = sql(`SELECT count(*) FROM app_user WHERE tenant_id = '${TENANT}'`);   // creator + ordinary admin
        expect(users).toBe("2");
        const creator = sql(`SELECT created_by_user_id FROM tenant WHERE id = '${TENANT}'`);
        expect(creator).toBe(me.id);   // recorded by the registration itself
        const adminToken = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", { data: { username_or_email: adminEmail, password: "AdminOrdinary!2026" } })).access_token;
        await api(request, "POST", `/api/v1/maintenance/tenants/${TENANT}/laboratory-cleanup/preview`, { token: adminToken, data: {}, status: 403 });
        // the capability is not a role: the same ordinary administrator cannot become the creator through any API
        await request.fetch(`${API_BASE}/api/v1/tenants/${TENANT}`, {
            method: "PATCH", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
            data: { created_by_user_id: sql(`SELECT id FROM app_user WHERE email = '${adminEmail}'`) },
        });   // whatever the answer, the binding cannot move
        expect(sql(`SELECT created_by_user_id FROM tenant WHERE id = '${TENANT}'`)).toBe(creator);
        const adminCtx = await browser.newContext();
        const adminPage = await adminCtx.newPage();
        await loginUi(adminPage, adminEmail, "AdminOrdinary!2026");
        await adminPage.goto("/config/profile");
        await expect(adminPage.getByRole("menuitem", { name: "Gestión de Usuarios" }).first()).toBeVisible();
        await expect(adminPage.getByText("Mantenimiento")).toHaveCount(0);
        await adminPage.goto("/config/maintenance");
        await expect(adminPage.getByText("Acceso Denegado")).toBeVisible();
        await adminCtx.close();

        // ---- the laboratory's creator, in the browser ------------------------------------------------
        await loginUi(page, EMAIL, PASSWORD);
        await page.goto("/config/profile");
        await page.getByText("Mantenimiento").first().click();
        await expect(page).toHaveURL(/\/config\/maintenance$/);
        await expect(page.getByRole("heading", { name: "Limpieza de contenido del laboratorio" })).toBeVisible();
        await expect(page.getByText("Esta acción es irreversible")).toBeVisible();

        // no options exist: billing and audit are always part of the cleanup
        await expect(page.getByTestId("finance-switch")).toHaveCount(0);
        await page.getByTestId("preview-button").click();
        const preview = page.getByTestId("cleanup-preview");
        await expect(preview).toBeVisible();
        await expect(page.getByTestId("preview-lab-name")).toHaveText(LAB_NAME);
        await expect(page.getByTestId("preview-delete-orders")).toHaveText("2");
        await expect(page.getByTestId("preview-delete-samples")).toHaveText("2");
        await expect(page.getByTestId("preview-delete-invoices")).toHaveText("2");
        await expect(page.getByTestId("preview-delete-payments")).toHaveText("1");
        await expect(page.getByTestId("preview-delete-audit_rows")).toHaveText("1");
        await expect(page.getByTestId("preview-preserve-patients")).toHaveText("1");
        expect(Number(await page.getByTestId("preview-objects-count").innerText())).toBeGreaterThanOrEqual(2);
        // the preview wrote nothing
        expect(sql(`SELECT count(*) FROM "order" WHERE tenant_id = '${TENANT}'`)).toBe("2");

        // confirmation: nothing is enabled until reason, exact name, password and acknowledgement are all given
        const confirm = page.getByTestId("confirm-button");
        await expect(confirm).toBeDisabled();
        await page.getByLabel("Motivo de la limpieza").fill("Se eliminan las órdenes de prueba antes del arranque oficial");
        await page.getByLabel("Nombre del laboratorio").fill("Laboratorio Embajador");
        await page.getByLabel("Tu contraseña actual").fill(PASSWORD);
        await page.getByRole("checkbox").check();
        await expect(page.getByText("El nombre no coincide.")).toBeVisible();
        await expect(confirm).toBeDisabled();
        await page.getByLabel("Nombre del laboratorio").fill(LAB_NAME);
        await expect(confirm).toBeEnabled();

        // a wrong password is refused server-side, clears the field and changes nothing
        await page.getByLabel("Tu contraseña actual").fill("contraseña-incorrecta-1");
        await confirm.click();
        await expect(page.getByTestId("confirm-error")).toContainText("La contraseña no es correcta");
        await expect(page.getByLabel("Tu contraseña actual")).toHaveValue("");
        expect(sql(`SELECT count(*) FROM "order" WHERE tenant_id = '${TENANT}'`)).toBe("2");
        expect(sql(`SELECT count(*) FROM laboratory_cleanup_operation WHERE tenant_id = '${TENANT}'`)).toBe("0");

        // the right password starts the cleanup, and the progress is shown to completion
        await page.getByLabel("Tu contraseña actual").fill(PASSWORD);
        await confirm.click();
        await expect(page.getByTestId("cleanup-status")).toContainText(/En cola|En ejecución|Completada/);
        await expect(page.getByTestId("cleanup-status")).toContainText("Completada", { timeout: 30_000 });
        await expect(page.getByText("Limpieza completada")).toBeVisible();
        await expect(page.getByTestId("cleanup-executed")).toContainText("2 órdenes");

        // ---- what happened, verified outside the UI --------------------------------------------------
        const orders = await api<Json>(request, "GET", "/api/v1/laboratory/orders/", { token });
        expect(orders.orders).toEqual([]);
        for (const table of ["order", "sample", "sample_image", "invoice", "payment", "order_event"]) {
            expect(sql(`SELECT count(*) FROM "${table}" WHERE tenant_id = '${TENANT}'`), table).toBe("0");
        }
        expect(sql(`SELECT count(*) FROM patient WHERE tenant_id = '${TENANT}'`)).toBe(preserved.patients);
        expect(sql(`SELECT count(*) FROM study_type WHERE tenant_id = '${TENANT}'`)).toBe(preserved.studyTypes);
        expect(sql(`SELECT count(*) FROM app_user WHERE tenant_id = '${TENANT}'`)).toBe(users);
        expect(sql(`SELECT coalesce(sum(last_value),0) FROM numbering_counter WHERE tenant_id = '${TENANT}'`)).toBe(preserved.counters);
        const remainingKeys = await s3Keys(request);
        for (const key of imageKeys) expect(remainingKeys).not.toContain(key);   // physically gone from the S3-protocol store
        // the historical audit of the removed records is gone, not redacted; only the cleanup's own provenance remains
        expect(sql(`SELECT count(*) FROM audit_log WHERE tenant_id = '${TENANT}' AND (order_id IS NOT NULL OR sample_id IS NOT NULL)`)).toBe("0");
        expect(sql(`SELECT count(*) FROM audit_log WHERE description LIKE '%SENTINEL-CLINICAL-TEXT-E2E%'`)).toBe("0");
        expect(sql(`SELECT count(*) FROM audit_log WHERE tenant_id = '${TENANT}' AND entity_type = 'laboratory_cleanup'`)).not.toBe("0");
        expect(sql(`SELECT status || '/' || phase FROM laboratory_cleanup_operation WHERE tenant_id = '${TENANT}'`)).toBe("COMPLETED/DONE");

        // the laboratory resumes, and numbering never reissues a removed code
        const again = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { token, data: {
            tenant_id: TENANT, branch_id: branchId, patient_id: patient.id, study_type_id: study.id,
            samples: [{ sample_type_id: sampleType.id, received_at: "2026-10-15" }] } });
        expect([registered[0].order.order_code, registered[1].order.order_code]).not.toContain(again.order.order_code);

        // the finished cleanup is in the history; a new one can start again
        await page.reload();
        await expect(page.getByTestId("cleanup-history")).toBeVisible();
        await expect(page.getByTestId("preview-button")).toBeVisible();
    });
});
