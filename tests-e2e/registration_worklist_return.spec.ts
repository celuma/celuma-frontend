/**
 * Real browser — Céluma 1.5 #66 (returning to a list) and #67 (correcting and retrying a registration).
 *
 * Fresh synthetic laboratory per test against a DISPOSABLE backend and PostgreSQL (never the owner's local
 * stack). The real web app drives the real API; network failures are injected with Playwright routing
 * (an aborted request, and a request the server completes whose response is then dropped).
 *
 * Needs: API on CELUMA_E2E_API_BASE_URL and the frontend (`npm run dev`, proxied to that API) on baseURL.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8015";
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function api<T = Json>(
    request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH", path: string,
    opts: { data?: unknown; token?: string } = {},
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (method === "POST" && /\/laboratory\/(orders\/(unified)?|samples\/)$/.test(path)) headers["Idempotency-Key"] = crypto.randomUUID();
    const res = await request.fetch(`${API_BASE}${path}`, { method, headers, data: opts.data });
    if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()}: ${await res.text()}`);
    return (await res.json().catch(() => ({}))) as T;
}

interface Lab {
    email: string; password: string; token: string; tenantId: string; branchId: string;
    studyTypeId: string; patientId: string; patientCode: string; types: Record<string, string>;
}

async function createLab(request: APIRequestContext, label: string): Promise<Lab> {
    const suffix = uid();
    const email = `e2e-${label}-${suffix}@example.com`;
    const password = "E2eReturn!2026";
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", { data: {
        tenant: { name: `E2E ${label} ${suffix}` }, branch: { code: "MAIN", name: "Sede sintética" },
        admin_user: { email, password, full_name: `E2E ${label}` },
    } });
    const token = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", { data: { username_or_email: email, password } })).access_token;
    const study = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", { token, data: { code: "HIS", name: "Histopatología sintética" } });
    const types: Record<string, string> = {};
    for (const [code, name] of [["BX", "Biopsia sintética"], ["CIT", "Citología sintética"], ["LAM", "Laminilla sintética"]]) {
        types[code] = (await api<{ id: string }>(request, "POST", "/api/v1/sample-types/", { token, data: { code, name } })).id;
    }
    const patientCode = `P-${suffix}`;
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", { token, data: {
        tenant_id: reg.tenant_id, branch_id: reg.branch_id, first_name: "Paciente", last_name: "Sintético", patient_code: patientCode } });
    return { email, password, token, tenantId: reg.tenant_id, branchId: reg.branch_id, studyTypeId: study.id, patientId: patient.id, patientCode, types };
}

async function createOrders(request: APIRequestContext, lab: Lab, count: number) {
    const created: Array<{ id: string; code: string; sampleId: string }> = [];
    for (let i = 0; i < count; i++) {
        const res = await api(request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token, data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: lab.studyTypeId,
            samples: [{ sample_type_id: lab.types.BX, received_at: "2026-11-20" }],
        } });
        created.push({ id: res.order.id, code: res.order.order_code, sampleId: res.samples[0].id });
    }
    return created;
}

const orderCount = async (request: APIRequestContext, lab: Lab) =>
    (await api(request, "GET", "/api/v1/laboratory/orders/?page=1&page_size=100", { token: lab.token })).total as number;

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
    await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option", { hasText: option }).last().click();
}

const shots = process.env.CELUMA_E2E_SHOTS_DIR;
async function shot(page: Page, name: string) {
    if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test.describe("#66 — returning to the orders list", () => {
    test("Back and «Volver a Órdenes» keep filters, page and scroll, and say when the order left the filter", async ({ page, request }) => {
        const lab = await createLab(request, "return");
        const orders = await createOrders(request, lab, 25);
        await page.setViewportSize({ width: 1280, height: 600 });
        await login(page, lab);

        // The dashboard-style link, then page 2 and a scroll.
        await page.goto("/orders?status=RECEIVED");
        await page.getByLabel("Página 2").click();
        await expect(page).toHaveURL(/\/orders\?status=RECEIVED&page=2$/);
        const target = orders.slice().sort((a, b) => a.code.localeCompare(b.code))[17];
        await expect(page.getByText(target.code, { exact: true })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 400));
        const scrolled = await page.evaluate(() => window.scrollY);
        expect(scrolled).toBeGreaterThan(100);
        await shot(page, "66-1-list-page2-scrolled");

        await page.getByText(target.code, { exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/orders/${target.id}$`));
        await expect(page.getByTestId("list-return-link")).toHaveText("Volver a Órdenes");

        // The order's status changes while it is open: its sample goes into processing.
        await api(request, "PATCH", `/api/v1/laboratory/samples/${target.sampleId}/state`, { token: lab.token, data: { state: "PROCESSING" } });

        await page.goBack();
        await expect(page).toHaveURL(/\/orders\?status=RECEIVED&page=2$/);
        await expect(page.getByTestId("returned-record-notice")).toContainText(`La orden ${target.code} ya no coincide con la búsqueda y los filtros actuales`);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrolled);
        await expect(page.getByText(target.code, { exact: true })).toHaveCount(0);
        await shot(page, "66-2-back-no-longer-matches");

        // The in-app return to an order that still matches: the row is highlighted, no notice.
        const other = orders.slice().sort((a, b) => a.code.localeCompare(b.code))[12];
        await page.getByText(other.code, { exact: true }).click();
        await page.getByTestId("list-return-link").click();
        await expect(page).toHaveURL(/\/orders\?status=RECEIVED&page=2$/);
        await expect(page.locator("tr.celuma-row-returned")).toContainText(other.code);
        await expect(page.getByTestId("returned-record-notice")).toHaveCount(0);
        await shot(page, "66-3-in-app-return-highlight");

        // A reload keeps the view too.
        await page.reload();
        await expect(page).toHaveURL(/\/orders\?status=RECEIVED&page=2$/);
        await expect(page.getByText(other.code, { exact: true })).toBeVisible();
    });
});

test.describe("#67 — correcting and retrying a three-sample registration", () => {
    async function fillOrder(page: Page, lab: Lab, expediente: string) {
        await page.goto("/orders/register");
        await pick(page, "Sucursal", "MAIN");
        await pick(page, "Paciente", lab.patientCode);
        await pick(page, "Tipo de estudio", "Histopatología sintética");
        await page.getByRole("button", { name: "Agregar otra muestra" }).click();
        await page.getByRole("button", { name: "Agregar otra muestra" }).click();
        await pick(page, "Tipo de muestra", "Biopsia sintética", 0);
        await pick(page, "Tipo de muestra", "Citología sintética", 1);
        await pick(page, "Tipo de muestra", "Laminilla sintética", 2);
        await page.locator("label", { hasText: "Expediente (opcional)" }).locator("xpath=ancestor::div[.//input][1]").locator("input").first().fill(expediente);
    }

    test("a refused row is marked, nothing is lost, the correction and a retry after a network cut register once", async ({ page, request }) => {
        const lab = await createLab(request, "refused");
        await login(page, lab);
        await fillOrder(page, lab, "000777");
        // The catalog changes while the form is open.
        await api(request, "PUT", `/api/v1/sample-types/${lab.types.LAM}`, { token: lab.token, data: { is_active: false } });

        await page.getByRole("button", { name: "Registrar" }).click();
        await expect(page.getByTestId("sample-row-2")).toContainText("Muestra 3 · revise los campos marcados");
        await expect(page.getByTestId("sample-row-2")).toContainText("Este tipo de muestra fue desactivado. Elija otro.");
        await expect(page.getByTestId("sample-row-0")).not.toContainText("revise");
        await expect(page.getByText("No se registró nada. Corrija los campos marcados (muestra 3); los demás datos se conservaron.")).toBeVisible();
        await expect(page.getByTestId("sample-row-1")).toContainText("Citología sintética");
        expect(await orderCount(request, lab)).toBe(0);
        await shot(page, "67-1-refused-row-marked");

        await pick(page, "Tipo de muestra", "Biopsia sintética", 2);
        // The network drops the next request before it reaches the server.
        await page.route("**/api/v1/laboratory/orders/unified", (route) => route.abort("internetdisconnected"), { times: 1 });
        await page.getByRole("button", { name: "Registrar" }).click();
        await expect(page.getByText("No se pudo confirmar si la orden se registró")).toBeVisible();
        await expect(page.getByRole("button", { name: "Reintentar registro" })).toBeVisible();
        expect(await orderCount(request, lab)).toBe(0);
        await shot(page, "67-2-network-cut");

        await page.getByRole("button", { name: "Reintentar registro" }).click();
        await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
        expect(await orderCount(request, lab)).toBe(1);
        // The request never arrived, so this is a first registration: no "already saved" notice.
        await expect(page.getByTestId("registration-notice")).toHaveCount(0);
        const listed = await api(request, "GET", "/api/v1/laboratory/samples/?page=1&page_size=100", { token: lab.token });
        expect(listed.total).toBe(3);
    });

    test("a correction after a lost response opens the order already saved and never creates a second one", async ({ page, request }) => {
        const lab = await createLab(request, "lost");
        await login(page, lab);
        await fillOrder(page, lab, "000888");
        // The server registers the order, but the response never reaches the browser.
        await page.route("**/api/v1/laboratory/orders/unified", async (route) => {
            await route.fetch();
            await route.abort("connectionreset");
        }, { times: 1 });
        await page.getByRole("button", { name: "Registrar" }).click();
        await expect(page.getByText("No se pudo confirmar si la orden se registró")).toBeVisible();
        expect(await orderCount(request, lab)).toBe(1);

        // The user corrects a field before retrying.
        await page.locator("label", { hasText: "Expediente (opcional)" }).locator("xpath=ancestor::div[.//input][1]").locator("input").first().fill("000889");
        await page.getByRole("button", { name: "Reintentar registro" }).click();
        await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
        // Said on the order itself, persistently: the later correction was not applied.
        await expect(page.getByTestId("registration-notice")).toContainText("ya se había registrado en un intento anterior cuya respuesta no llegó; no se duplicó.");
        await expect(page.getByTestId("registration-notice")).toContainText("no se aplicaron");
        await shot(page, "67-3-lost-response-recovered");
        expect(await orderCount(request, lab)).toBe(1);
        const orderId = page.url().split("/").pop();
        // It is the order of the FIRST attempt: the later correction was not applied.
        const detail = await api(request, "GET", `/api/v1/laboratory/orders/${orderId}`, { token: lab.token });
        expect(detail.expediente).toBe("000888");
    });
});
