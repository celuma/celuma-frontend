/**
 * Real browser regression — Céluma 1.4 issue #33: sample monthly codes are numbered by RECEIPT date.
 *
 * Fresh synthetic laboratory per test against a DISPOSABLE backend and PostgreSQL (never the owner's local
 * stack). The real web app registers samples through the real API; assertions read the created records
 * and the numbering ledger.
 *
 * Needs: API on CELUMA_E2E_API_BASE_URL, frontend (`npm run dev`, proxied to that API) on baseURL, and
 * CELUMA_E2E_PSQL — a shell command prefix that runs psql against the DISPOSABLE database.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8121";
const PSQL = (process.env.CELUMA_E2E_PSQL || "").split(" ").filter(Boolean);

function sql(query: string): string {
    if (PSQL.length === 0) throw new Error("CELUMA_E2E_PSQL is not set");
    return execFileSync(PSQL[0], [...PSQL.slice(1), "-At", "-c", query], { encoding: "utf8" }).trim();
}

const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function api<T = Json>(
    request: APIRequestContext, method: "GET" | "POST" | "PUT", path: string,
    opts: { data?: unknown; token?: string; key?: string; status?: number } = {},
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (method === "POST" && /\/laboratory\/(orders\/(unified)?|samples\/)$/.test(path)) {
        headers["Idempotency-Key"] = opts.key ?? crypto.randomUUID();
    }
    const res = await request.fetch(`${API_BASE}${path}`, { method, headers, data: opts.data });
    if (opts.status !== undefined) expect(res.status(), `${method} ${path}: ${await res.text()}`).toBe(opts.status);
    else if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()}: ${await res.text()}`);
    return (await res.json().catch(() => ({}))) as T;
}

interface Lab {
    email: string; password: string; token: string; tenantId: string; branchId: string;
    studyTypeId: string; sampleTypeId: string; patientId: string;
}

/** A synthetic laboratory with MONTHLY numbering activated for samples (default format, Mexico City zone). */
async function createLab(request: APIRequestContext, label: string): Promise<Lab> {
    const suffix = uid();
    const email = `e2e-${label}-${suffix}@example.com`;
    const password = "E2eReceipt!2026";
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", { data: {
        tenant: { name: `E2E ${label} ${suffix}` }, branch: { code: "MAIN", name: "Sede sintética" },
        admin_user: { email, password, full_name: `E2E ${label}` },
    } });
    const login = await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", { data: { username_or_email: email, password } });
    const token = login.access_token;
    const study = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", { token, data: { code: "HIS", name: "Histopatología sintética" } });
    const sample = await api<{ id: string }>(request, "POST", "/api/v1/sample-types/", { token, data: { code: "BX", name: "Biopsia sintética" } });
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", { token, data: {
        tenant_id: reg.tenant_id, branch_id: reg.branch_id, first_name: "Paciente", last_name: "Sintético", patient_code: `P-${suffix}` } });
    for (const kind of ["order", "sample"]) {
        await api(request, "PUT", `/api/v1/numbering/config/${kind}`, { token, data: {
            active: true, format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 1, scope: "tenant", timezone: "America/Mexico_City" } });
    }
    return { email, password, token, tenantId: reg.tenant_id, branchId: reg.branch_id,
        studyTypeId: study.id, sampleTypeId: sample.id, patientId: patient.id };
}

async function login(page: Page, lab: Lab) {
    await page.goto("/login");
    await page.getByLabel("Usuario o email").fill(lab.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(lab.password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page).not.toHaveURL(/\/login$/);
}

async function pick(page: Page, caption: string, option: string | RegExp, index = 0) {
    const field = page.locator("label", { hasText: caption }).nth(index).locator("xpath=ancestor::div[.//div[contains(@class,'ant-select')]][1]");
    await field.locator(".ant-select-selector").click();
    // The dropdown just opened is the LAST one mounted: a select used earlier keeps its (closing/hidden) one.
    await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option", { hasText: option }).last().click();
}

/** Types a date into a masked `FloatingCaptionDate`. */
async function fillDate(page: Page, caption: string, value: string, index = 0) {
    const input = page.locator("label", { hasText: caption }).nth(index).locator("xpath=ancestor::div[.//input][1]").locator("input").first();
    await input.click();
    // The masked picker (YYYY-MM-DD) takes keystrokes, not a bulk fill; the dashes are part of the mask.
    await input.pressSequentially(value.replace(/-/g, ""), { delay: 20 });
    await page.keyboard.press("Tab");   // commits on blur; Enter would SUBMIT the form
    await expect(input).toHaveValue(value);
}

const sampleCodes = (lab: Lab) =>
    sql(`SELECT string_agg(sample_code, ',' ORDER BY sample_code) FROM sample WHERE tenant_id = '${lab.tenantId}'`);
const periods = (lab: Lab) =>
    sql(`SELECT string_agg(code || ':' || period_year || '-' || period_month, ',' ORDER BY code) FROM numbering_allocation WHERE tenant_id = '${lab.tenantId}' AND entity_kind = 'sample'`);

test.describe("#33 — sample codes follow the receipt date", () => {
    test("standalone form: receipt in September, registered later, is numbered in September; the preview agrees and consumes nothing", async ({ page, request }) => {
        const lab = await createLab(request, "standalone");
        const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", { token: lab.token, data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: lab.studyTypeId } });
        await login(page, lab);
        await page.goto(`/samples/register?orderId=${order.id}`);
        await pick(page, "Sucursal", /MAIN/);
        await pick(page, "Tipo de muestra", "Biopsia sintética");

        // No estimate before a valid receipt date: the month of the code comes from it.
        const hint = page.getByTestId("auto-code-hint-sample");
        await expect(hint).toContainText("El mes del código sale de la fecha de recepción");
        await expect(hint).not.toContainText("Ejemplo");

        await fillDate(page, "Fecha de recepción", "2026-09-30");
        await expect(hint).toContainText("BX010926");
        await expect(hint).toContainText("septiembre 2026, según la fecha de recepción");
        expect(sql(`SELECT count(*) FROM numbering_counter WHERE tenant_id = '${lab.tenantId}' AND entity_kind = 'sample'`)).toBe("0"); // preview consumed nothing

        const posted = page.waitForRequest((r) => r.url().includes("/laboratory/samples/") && r.method() === "POST");
        await page.getByRole("button", { name: "Registrar" }).click();
        const body = (await posted).postDataJSON();
        expect(body.received_at).toBe("2026-09-30");               // date-only: never `…T00:00:00Z`
        expect(body).not.toHaveProperty("sample_code");
        await expect(page).toHaveURL(/\/samples\/[0-9a-f-]{36}$/, { timeout: 20_000 });
        expect(sampleCodes(lab)).toBe("BX010926");
        expect(periods(lab)).toBe("BX010926:2026-9");
    });

    test("first day of a month stays in that month (a UTC-midnight instant would have fallen in the previous one)", async ({ page, request }) => {
        const lab = await createLab(request, "firstday");
        const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", { token: lab.token, data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: lab.studyTypeId } });
        await login(page, lab);
        await page.goto(`/samples/register?orderId=${order.id}`);
        await pick(page, "Sucursal", /MAIN/);
        await pick(page, "Tipo de muestra", "Biopsia sintética");
        await fillDate(page, "Fecha de recepción", "2027-01-01");
        await page.getByRole("button", { name: "Registrar" }).click();
        await expect(page).toHaveURL(/\/samples\/[0-9a-f-]{36}$/, { timeout: 20_000 });
        expect(sampleCodes(lab)).toBe("BX010127");                    // January 2027, not December 2026
        expect(periods(lab)).toBe("BX010127:2027-1");
    });

    test("missing receipt date: the form blocks it and no request, record or number is created", async ({ page, request }) => {
        const lab = await createLab(request, "missing");
        const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", { token: lab.token, data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: lab.studyTypeId } });
        await login(page, lab);
        await page.goto(`/samples/register?orderId=${order.id}`);
        let posts = 0;
        page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/laboratory/samples/")) posts++; });
        await pick(page, "Sucursal", /MAIN/);
        await pick(page, "Tipo de muestra", "Biopsia sintética");
        await page.getByRole("button", { name: "Registrar" }).click();
        await expect(page.getByText("La fecha de recepción es requerida.")).toBeVisible();
        expect(posts).toBe(0);
        expect(sampleCodes(lab)).toBe("");
        expect(sql(`SELECT count(*) FROM numbering_allocation WHERE tenant_id = '${lab.tenantId}' AND entity_kind = 'sample'`)).toBe("0");
    });

    test("unified form: each sample is numbered by its own receipt date; the order keeps the registration policy", async ({ page, request }) => {
        const lab = await createLab(request, "unified");
        await login(page, lab);
        await page.goto("/orders/register");
        await pick(page, "Sucursal", /MAIN/);
        await pick(page, "Paciente", /P-/);
        await pick(page, "Tipo de estudio", /Histopatología sintética/);
        await page.getByRole("button", { name: "Agregar otra muestra" }).click();
        await pick(page, "Tipo de muestra", "Biopsia sintética", 0);
        await pick(page, "Tipo de muestra", "Biopsia sintética", 1);
        await fillDate(page, "Fecha de recepción", "2026-09-30", 0);
        await fillDate(page, "Fecha de recepción", "2026-10-01", 1);
        await fillDate(page, "Fecha de recolección", "2026-08-31", 0);   // collection is independent of numbering

        const posted = page.waitForRequest((r) => r.url().includes("/orders/unified") && r.method() === "POST");
        await page.getByRole("button", { name: "Registrar" }).click();
        const body = (await posted).postDataJSON();
        expect(body.samples.map((s: Json) => s.received_at)).toEqual(["2026-09-30", "2026-10-01"]);
        expect(body.samples[0].collected_at).toBe("2026-08-31");
        expect(body.samples[1]).not.toHaveProperty("collected_at");
        await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
        expect(sampleCodes(lab)).toBe("BX010926,BX011026");
        expect(periods(lab)).toBe("BX010926:2026-9,BX011026:2026-10");
        // the ORDER code still follows the allocation instant (today's month in the laboratory zone), not a sample's date
        const orderPeriod = sql(`SELECT period_year || '-' || period_month FROM numbering_allocation WHERE tenant_id = '${lab.tenantId}' AND entity_kind = 'order'`);
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "numeric" }).formatToParts(new Date());
        const part = (t: string) => today.find((p) => p.type === t)!.value;
        expect(orderPeriod).toBe(`${part("year")}-${part("month")}`);
    });

    test("a lost response is replayed with the same key even though the receipt month is long past", async ({ page, request }) => {
        const lab = await createLab(request, "replay");
        const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", { token: lab.token, data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: lab.studyTypeId } });
        await login(page, lab);
        await page.goto(`/samples/register?orderId=${order.id}`);
        await pick(page, "Sucursal", /MAIN/);
        await pick(page, "Tipo de muestra", "Biopsia sintética");
        await fillDate(page, "Fecha de recepción", "2026-09-30");
        let dropped = 0;
        await page.route("**/laboratory/samples/", async (route) => {
            if (route.request().method() === "POST" && dropped === 0) { dropped++; await route.fetch(); await route.abort("connectionreset"); }
            else await route.continue();
        });
        await page.getByRole("button", { name: "Registrar" }).click();
        await expect.poll(() => dropped).toBe(1);
        await expect(page).toHaveURL(/\/samples\/register/);
        await expect(page.getByText("Failed to fetch")).toBeVisible();
        const retry = page.waitForResponse((r) => r.url().includes("/laboratory/samples/") && r.request().method() === "POST");
        const submit = page.getByRole("button", { name: "Registrar" });
        await submit.focus();
        await page.keyboard.press("Enter");   // same payload => same Idempotency-Key => server replay
        const response = await retry;
        expect(response.status()).toBe(200);
        expect(response.headers()["idempotent-replayed"]).toBe("true");
        await expect(page).toHaveURL(/\/samples\/[0-9a-f-]{36}$/, { timeout: 20_000 });
        expect(sampleCodes(lab)).toBe("BX010926");
        expect(sql(`SELECT count(*) FROM numbering_allocation WHERE tenant_id = '${lab.tenantId}' AND entity_kind = 'sample'`)).toBe("1");
    });
});
