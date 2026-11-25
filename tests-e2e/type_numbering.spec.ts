/**
 * Real browser — Céluma 1.5 issue #64: numbering per study type and per sample type, from both entry points
 * (Configuración → Numeración and the Numeración section of Editar tipo de estudio / de muestra).
 *
 * Fresh synthetic laboratory per test against a DISPOSABLE backend and PostgreSQL (never the owner's local
 * stack or any shared environment). The real web app talks to the real API; assertions read the API.
 *
 * Needs: API on CELUMA_E2E_API_BASE_URL and the frontend (`npm run dev`, proxied to that API) on baseURL.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8121";
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function api<T = Json>(
    request: APIRequestContext, method: "GET" | "POST" | "PUT" | "DELETE", path: string,
    opts: { data?: unknown; token?: string; status?: number } = {},
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (method === "POST" && /\/laboratory\/orders\/unified$/.test(path)) headers["Idempotency-Key"] = crypto.randomUUID();
    const res = await request.fetch(`${API_BASE}${path}`, { method, headers, data: opts.data });
    if (opts.status !== undefined) expect(res.status(), `${method} ${path}: ${await res.text()}`).toBe(opts.status);
    else if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()}: ${await res.text()}`);
    return (await res.json().catch(() => ({}))) as T;
}

interface Lab {
    email: string; password: string; token: string; tenantId: string; branchId: string; patientId: string;
    study: { id: string; code: string; name: string }; sample: { id: string; code: string; name: string };
}

async function createLab(request: APIRequestContext, label: string, active = true): Promise<Lab> {
    const suffix = uid();
    const email = `e2e-${label}-${suffix}@example.com`;
    const password = "E2eTypeNumbering!2026";
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", { data: {
        tenant: { name: `E2E ${label} ${suffix}` }, branch: { code: "MAIN", name: "Sede sintética" },
        admin_user: { email, password, full_name: `E2E ${label}` },
    } });
    const token = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", { data: { username_or_email: email, password } })).access_token;
    const study = await api(request, "POST", "/api/v1/study-types/", { token, data: { code: "HIS", name: "Histopatología sintética" } });
    const sample = await api(request, "POST", "/api/v1/sample-types/", { token, data: { code: "BX", name: "Biopsia sintética" } });
    const patient = await api(request, "POST", "/api/v1/patients/", { token, data: {
        tenant_id: reg.tenant_id, branch_id: reg.branch_id, first_name: "Paciente", last_name: "Sintético", patient_code: `P-${suffix}` } });
    for (const kind of ["order", "sample"]) {
        await api(request, "PUT", `/api/v1/numbering/config/${kind}`, { token, data: {
            active, format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 1, scope: "tenant", timezone: "America/Mexico_City" } });
    }
    return { email, password, token, tenantId: reg.tenant_id, branchId: reg.branch_id, patientId: patient.id,
        study: { id: study.id, code: "HIS", name: "Histopatología sintética" }, sample: { id: sample.id, code: "BX", name: "Biopsia sintética" } };
}

async function login(page: Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Usuario o email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page).not.toHaveURL(/\/login$/);
}

const typeSource = async (request: APIRequestContext, lab: Lab, kind: "order" | "sample", id: string) =>
    (await api(request, "GET", `/api/v1/numbering/type-configs/${kind}`, { token: lab.token })).types.find((t: Json) => t.type_id === id);

async function noHorizontalOverflow(page: Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal page overflow (px)").toBeLessThanOrEqual(1);
}

test.describe("numbering by type — #64", () => {
    test("keyboard: configure a study type from Configuración → Numeración; the editor of the type shows the same", async ({ page, request }) => {
        const lab = await createLab(request, "kbd");
        await login(page, lab.email, lab.password);
        await page.goto("/config/numbering");
        const configure = page.getByRole("button", { name: `Configurar numeración de ${lab.study.name}` });
        await configure.focus();
        await page.keyboard.press("Enter");
        const heading = page.getByRole("heading", { name: new RegExp(`Numeración de ${lab.study.name}`) });
        await expect(heading).toBeFocused();
        // Separator presets are buttons with aria-pressed; reachable and operable from the keyboard.
        const hyphen = page.getByTestId(`row-order-${lab.study.code}-separator`).getByRole("button", { name: /Con guion/ });
        await hyphen.focus();
        await page.keyboard.press("Enter");
        await expect(hyphen).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByTestId(`row-order-${lab.study.code}-preview-code`)).toHaveText(/^HIS-01\d{4}$/);
        await expect(page.getByTestId(`row-order-${lab.study.code}-preview-notice`)).toContainText("no reserva ningún número");
        const save = page.getByTestId(`row-order-${lab.study.code}-save`);
        await save.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId(`source-order-${lab.study.code}`)).toContainText("Configuración propia");
        expect((await typeSource(request, lab, "order", lab.study.id)).override.format).toBe("{BASE}-{SEQ}{MM}{YY}");

        // Parity: the type's own editor shows the same state.
        await page.goto("/config/study-types");
        await page.locator("tr", { hasText: lab.study.code }).getByTitle("Editar").click();
        const section = page.getByTestId("study-type-numbering");
        await expect(section.getByTestId("study-type-numbering-source")).toContainText("Configuración propia");
        await expect(section.getByTestId("study-type-numbering-effective")).toContainText("{BASE}-{SEQ}{MM}{YY}");
    });

    test("type editor: unsaved catalog edits survive set and clear; Guardar cambios saves only the catalog; the central page refreshes", async ({ page, request }) => {
        const lab = await createLab(request, "edit");
        await login(page, lab.email, lab.password);
        await page.goto("/config/sample-types");
        await page.locator("tr", { hasText: lab.sample.code }).getByTitle("Editar").click();
        const dialog = page.getByRole("dialog");
        const name = dialog.getByLabel("Nombre");
        await name.fill("Biopsia sintética renal");
        const section = dialog.getByTestId("sample-type-numbering");
        await section.getByTestId("sample-type-numbering-edit").click();
        await section.getByTestId("sample-type-numbering-width").fill("3");
        await expect(section.getByTestId("sample-type-numbering-preview-code")).toHaveText(/^BX001\d{4}$/);
        await section.getByTestId("sample-type-numbering-save").click();
        await expect(section.getByTestId("sample-type-numbering-source")).toContainText("Configuración propia");
        await expect(name).toHaveValue("Biopsia sintética renal");
        expect((await typeSource(request, lab, "sample", lab.sample.id)).source).toBe("type");

        // The estimate is what registration then issues for this sample type (same resolution).
        const estimate = (await section.getByTestId("sample-type-numbering-preview-code").textContent())!.trim();
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
        const reg = await api(request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token, data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: lab.study.id,
            samples: [{ sample_type_id: lab.sample.id, received_at: today }] } });
        expect(reg.samples[0].sample_code).toBe(estimate);

        await section.getByTestId("sample-type-numbering-clear").click();
        const confirm = page.getByRole("dialog").filter({ hasText: "¿Usar la numeración del laboratorio?" });
        await expect(confirm.getByText("Los códigos ya emitidos no cambian.")).toBeVisible();
        await page.getByRole("button", { name: "Sí, usar la del laboratorio" }).click();
        await expect(section.getByTestId("sample-type-numbering-source")).toContainText("Predeterminada del laboratorio");
        await expect(name).toHaveValue("Biopsia sintética renal");
        await dialog.getByRole("button", { name: "Guardar cambios" }).click();
        await expect(dialog).toBeHidden();
        const types = await api(request, "GET", "/api/v1/sample-types/?active_only=false", { token: lab.token });
        expect(types.sample_types.find((t: Json) => t.id === lab.sample.id).name).toBe("Biopsia sintética renal");

        await page.goto("/config/numbering");
        await page.getByTestId("tab-sample").click();
        await expect(page.getByTestId(`source-sample-${lab.sample.code}`)).toContainText("Predeterminada del laboratorio");
    });

    test("failure recovery: a failed save keeps the values and the retry succeeds", async ({ page, request }) => {
        const lab = await createLab(request, "fail");
        await login(page, lab.email, lab.password);
        await page.goto("/config/numbering");
        let failures = 1;
        await page.route("**/v1/numbering/type-configs/order/**", async (route) => {
            if (route.request().method() === "PUT" && failures > 0) {
                failures -= 1;
                await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "no disponible" }) });
            } else await route.continue();
        });
        await page.getByRole("button", { name: `Configurar numeración de ${lab.study.name}` }).click();
        await page.getByTestId(`row-order-${lab.study.code}-start`).fill("40");
        await page.getByTestId(`row-order-${lab.study.code}-save`).click();
        await expect(page.getByTestId(`row-order-${lab.study.code}-save-error`)).toBeVisible();
        await expect(page.getByTestId(`row-order-${lab.study.code}-start`)).toHaveValue("40");
        await page.getByTestId(`row-order-${lab.study.code}-save`).click();
        await expect(page.getByTestId(`source-order-${lab.study.code}`)).toContainText("Configuración propia");
        expect((await typeSource(request, lab, "order", lab.study.id)).override.start_value).toBe(40);
    });

    test("inactive monthly numbering: a stored type configuration is shown as having no effect", async ({ page, request }) => {
        const lab = await createLab(request, "inactive", false);
        await api(request, "PUT", `/api/v1/numbering/type-configs/sample/${lab.sample.id}`, { token: lab.token, data: { format: "{BASE}-{SEQ}{MM}{YY}", sequence_min_width: 3, start_value: 1 } });
        await login(page, lab.email, lab.password);
        await page.goto("/config/numbering");
        await page.getByTestId("tab-sample").click();
        await expect(page.getByTestId(`source-sample-${lab.sample.code}-inactive`)).toContainText("sin efecto");
        await expect(page.getByTestId(`example-sample-${lab.sample.code}`)).toHaveText(`${lab.sample.code}-1`);
    });

    test("narrow screen: no horizontal page overflow and the actions stay reachable", async ({ page, request }) => {
        const lab = await createLab(request, "narrow");
        await page.setViewportSize({ width: 390, height: 844 });
        await login(page, lab.email, lab.password);
        await page.goto("/config/numbering");
        await expect(page.getByTestId("numbering-card-order")).toBeVisible();
        await noHorizontalOverflow(page);
        const configure = page.getByRole("button", { name: `Configurar numeración de ${lab.study.name}` });
        await configure.scrollIntoViewIfNeeded();
        await expect(configure).toBeInViewport();
        await configure.click();
        await expect(page.getByTestId(`row-order-${lab.study.code}-save`)).toBeVisible();
        await noHorizontalOverflow(page);
        await page.goto("/config/study-types");
        await page.locator("tr", { hasText: lab.study.code }).getByTitle("Editar").click();
        await page.getByTestId("study-type-numbering-edit").click();
        await page.getByTestId("study-type-numbering-save").scrollIntoViewIfNeeded();
        await expect(page.getByTestId("study-type-numbering-save")).toBeInViewport();
        await noHorizontalOverflow(page);
    });

    test("insufficient permission: no write controls, and the API refuses the write", async ({ page, request }) => {
        const lab = await createLab(request, "perm");
        const techEmail = `e2e-tech-${uid()}@example.com`;
        const techPassword = "E2eTechNumbering!2026";
        await api(request, "POST", "/api/v1/users/", { token: lab.token, data: {
            email: techEmail, first_name: "Técnico", last_name: "Sintético", role: "lab_tech", password: techPassword, branch_ids: [lab.branchId] } });
        const techToken = (await api(request, "POST", "/api/v1/auth/login", { data: { username_or_email: techEmail, password: techPassword } })).access_token;
        await api(request, "PUT", `/api/v1/numbering/type-configs/order/${lab.study.id}`, {
            token: techToken, status: 403, data: { format: "{BASE}-{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 1 } });
        await login(page, techEmail, techPassword);
        await page.goto("/config/numbering");
        await expect(page.getByTestId("numbering-card-order")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /Configurar numeración de/ })).toHaveCount(0);
    });
});
