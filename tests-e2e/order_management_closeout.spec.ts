/**
 * Real end-to-end close-out — Céluma 1.4 order/sample management (#9, #10, #11, #16) + automatic registration.
 *
 * Fresh synthetic laboratory per test, disposable PostgreSQL, local Moto object storage, a real official PDF
 * (headless Chromium rendering the real frontend) — nothing stubbed in creation or in the report lifecycle.
 * Needs: API on CELUMA_E2E_API_BASE_URL, frontend on baseURL, DATABASE reachable with `CELUMA_E2E_PSQL`
 * (a shell command prefix that runs psql against the DISPOSABLE database; used only to seed a legacy
 * configuration state that has no API any more, and to read retained rows).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

/** Response bodies of the synthetic API are asserted field by field; a loose alias keeps this spec readable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8121";
const OUT_DIR = process.env.CELUMA_E2E_OUT_DIR || "/tmp/celuma-e2e-out";
const PSQL = (process.env.CELUMA_E2E_PSQL || "").split(" ").filter(Boolean);

function sql(query: string): string {
    if (PSQL.length === 0) throw new Error("CELUMA_E2E_PSQL is not set");
    return execFileSync(PSQL[0], [...PSQL.slice(1), "-At", "-c", query], { encoding: "utf8" }).trim();
}

const uid = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function api<T = Json>(
    request: APIRequestContext, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string,
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
    email: string; password: string; token: string; tenantId: string; branchId: string; suffix: string;
    studyTypeId: string; sampleTypeId: string; patientId: string;
}

async function createLab(request: APIRequestContext, label: string, extra: { v2?: boolean } = {}): Promise<Lab> {
    const suffix = uid();
    const email = `e2e-${label}-${suffix}@example.com`;
    const password = "E2eCloseout!2026";
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", { data: {
        tenant: { name: `E2E ${label} ${suffix}` }, branch: { code: "MAIN", name: "Sede sintética" },
        admin_user: { email, password, full_name: `E2E ${label}` },
    } });
    const login = await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", { data: { username_or_email: email, password } });
    const token = login.access_token;
    if (extra.v2) {
        await api(request, "PATCH", `/api/v1/tenants/${reg.tenant_id}`, { data: { reports_v2_enabled: true }, token });
        // an official PDF needs the laboratory's default letterhead
        const lh = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", { token, data: { name: `Membrete ${suffix}` } });
        await api(request, "PUT", `/api/v1/report-letterheads/${lh.id}/versions/current`, { token, data: { configuration: presentation() } });
        await api(request, "POST", `/api/v1/report-letterheads/${lh.id}/default`, { token });
    }
    const study = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", { token, data: { code: "HIS", name: "Histopatología sintética" } });
    const sample = await api<{ id: string }>(request, "POST", "/api/v1/sample-types/", { token, data: { code: "BX", name: "Biopsia sintética" } });
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", { token, data: {
        tenant_id: reg.tenant_id, branch_id: reg.branch_id, first_name: "Paciente", last_name: "Sintético", patient_code: `P-${suffix}` } });
    return { email, password, token, tenantId: reg.tenant_id, branchId: reg.branch_id, suffix,
        studyTypeId: study.id, sampleTypeId: sample.id, patientId: patient.id };
}

async function physician(request: APIRequestContext, lab: Lab, first: string, last: string) {
    return (await api<{ id: string }>(request, "POST", "/api/v1/requesting-physicians/", { token: lab.token, data: {
        branch_id: lab.branchId, first_name: first, last_name: last } })).id;
}

const unified = (lab: Lab, extra: Record<string, unknown> = {}, samples = 1) => ({
    tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: lab.studyTypeId,
    samples: Array.from({ length: samples }, () => ({ sample_type_id: lab.sampleTypeId })), ...extra,
});

async function login(page: Page, lab: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Usuario o email").fill(lab.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(lab.password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page).not.toHaveURL(/\/login$/);
}

async function pick(page: Page, caption: string, option: string | RegExp) {
    const field = page.locator("label", { hasText: caption }).first().locator("xpath=ancestor::div[.//div[contains(@class,'ant-select')]][1]");
    await field.locator(".ant-select-selector").click();
    await page.locator(".ant-select-item-option", { hasText: option }).filter({ visible: true }).first().click();
}

// ---------------------------------------------------------------------------------------------------------
// Official PDF, authoritative metadata and a frozen artifact
// ---------------------------------------------------------------------------------------------------------

function presentation() {
    return {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
        header: { enabled: true, institution_name: "Laboratorio sintético" },
        footer: { enabled: true, custom_text: "Pie sintético", show_page_number: true },
        style: { primary_color: "#336699" },
    };
}

async function studyTypeWithTemplate(request: APIRequestContext, lab: Lab, code: string, withExpediente: boolean) {
    const base: Record<string, unknown> = {
        requesting_physician: { is_visible: true, label: "Médico solicitante", value: "" },
        diagnosis: { is_visible: true, label: "Diagnóstico", is_custom: true, type: "text", value: "" },
    };
    const order = ["requesting_physician", "diagnosis"];
    if (withExpediente) {
        base.expediente = { is_visible: true, label: "Expediente", value: "" };
        order.push("expediente");
    }
    const templateJson = {
        base, sections: { hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: "" } },
        base_order: order, section_order: ["hallazgos"],
    };
    const template = await api<{ id: string }>(request, "POST", "/api/v1/reports/templates/", { token: lab.token,
        data: { name: `Plantilla ${code} ${lab.suffix}`, template_json: templateJson } });
    const version = await api<{ id: string }>(request, "POST", `/api/v1/reports/templates/${template.id}/versions`, { token: lab.token,
        data: { configuration: { schema_version: 2, template: templateJson, presentation: presentation() } } });
    await api(request, "POST", `/api/v1/reports/templates/${template.id}/versions/${version.id}/activate`, { token: lab.token });
    return (await api<{ id: string }>(request, "POST", "/api/v1/study-types/", { token: lab.token,
        data: { code, name: `Estudio ${code}`, default_report_template_id: template.id } })).id;
}

async function publishedReport(page: Page, request: APIRequestContext, lab: Lab, orderId: string) {
    const reviewerEmail = `rev-${lab.suffix}@example.com`;
    const reviewerPassword = "E2eReviewer!2026";
    const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", { token: lab.token, data: {
        email: reviewerEmail, first_name: "E2E", last_name: "Revisor", role: "reviewer", password: reviewerPassword, branch_ids: [lab.branchId] } });
    await api(request, "PUT", `/api/v1/laboratory/orders/${orderId}/reviewers`, { token: lab.token, data: { reviewer_ids: [reviewer.id] } });
    await login(page, lab);
    await page.goto(`/reports/editor?orderId=${orderId}`);
    await expect(page.getByLabel("Nombre del reporte")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Nombre del reporte").fill(`Reporte ${lab.suffix}`);
    await page.getByLabel("Diagnóstico").fill("Carcinoma sintético");
    await page.getByTestId("report-save-top").click();
    await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });
    const reportId = (await api<{ report_id: string }>(request, "GET", `/api/v1/laboratory/orders/${orderId}`, { token: lab.token })).report_id;
    const reviewerToken = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: reviewerEmail, password: reviewerPassword } })).access_token;
    await api(request, "POST", `/api/v1/reports/${reportId}/submit`, { token: lab.token, data: {} });
    await api(request, "POST", `/api/v1/reports/${reportId}/approve`, { token: reviewerToken, data: {} });
    const published = await api<{ status: string; version_no: number; pdf_generation_status: string }>(
        request, "POST", `/api/v1/reports/${reportId}/sign-and-publish`, { token: reviewerToken, data: {} });
    expect(published.status).toBe("PUBLISHED");
    expect(published.pdf_generation_status).toBe("READY");
    return { reportId: reportId!, versionNo: published.version_no, reviewerToken };
}

async function pdfBytes(request: APIRequestContext, lab: Lab, reportId: string, versionNo: number): Promise<Buffer> {
    const meta = await api<{ pdf_url: string }>(request, "GET", `/api/v1/reports/${reportId}/versions/${versionNo}/pdf`, { token: lab.token });
    const res = await request.get(meta.pdf_url);
    expect(res.ok()).toBeTruthy();
    return Buffer.from(await res.body());
}

test.describe("official PDF and frozen artifacts", () => {
    test("authoritative physicians + expediente reach the official PDF; a frozen PDF survives every rejected management attempt", async ({ page, request }) => {
        test.setTimeout(240_000);
        mkdirSync(OUT_DIR, { recursive: true });
        const lab = await createLab(request, "pdf", { v2: true });
        const studyWith = await studyTypeWithTemplate(request, lab, "CON", true);
        const docs = [
            await physician(request, lab, "Ana María", "Fernández-Villaseñor Ñandú"),
            await physician(request, lab, "Beto", "Dos"),
        ];
        const order = await api<{ order: { id: string; order_code: string }; samples: { id: string; sample_code: string }[] }>(
            request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token,
                data: unified(lab, { study_type_id: studyWith, requesting_physician_ids: docs, expediente: "000731" }) });
        const orderId = order.order.id;

        const { reportId, versionNo, reviewerToken } = await publishedReport(page, request, lab, orderId);

        // Editable-report metadata was resolved by the server: all names, expediente verbatim (leading zeroes).
        const stored = await api<{ report: { base: Record<string, { value?: string }> } }>(request, "GET", `/api/v1/reports/${reportId}`, { token: lab.token });
        expect(stored.report.base.requesting_physician.value).toBe("Ana María Fernández-Villaseñor Ñandú; Beto Dos");
        expect(stored.report.base.expediente.value).toBe("000731");

        // The official PDF is real and carries the metadata (text checked with pypdf by the harness).
        const bytes = await pdfBytes(request, lab, reportId, versionNo);
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
        const sha = createHash("sha256").update(bytes).digest("hex");
        writeFileSync(`${OUT_DIR}/official-with-expediente.pdf`, bytes);
        const dbBefore = sql(`SELECT pdf_sha256 || '|' || pdf_size_bytes FROM report_version WHERE report_id = '${reportId}' AND version_no = ${versionNo}`);
        expect(dbBefore.split("|")[0]).toBe(sha);

        // Every management attempt on the frozen case is refused and changes nothing.
        const sampleId = order.samples[0].id;
        const attempts: Array<[string, string, unknown]> = [
            ["PATCH", `/api/v1/laboratory/orders/${orderId}`, { requesting_physician_ids: [docs[1]], expediente: "9" }],
            ["PATCH", `/api/v1/laboratory/orders/${orderId}/notes`, { notes: "tarde" }],
            ["POST", `/api/v1/laboratory/samples/${sampleId}/code-correction`, { sample_code: "TARDE-1", reason: "intento tardío" }],
            ["POST", `/api/v1/laboratory/samples/${sampleId}/removal`, { reason: "intento tardío" }],
            ["POST", `/api/v1/laboratory/orders/${orderId}/removal`, { reason: "intento tardío" }],
        ];
        for (const [method, path, data] of attempts) {
            const res = await request.fetch(`${API_BASE}${path}`, { method, data, headers: { Authorization: `Bearer ${lab.token}`, "Content-Type": "application/json" } });
            expect(res.status(), `${method} ${path}`).toBe(409);
            expect((await res.json()).detail.code).toBe("order_not_directly_modifiable");
        }
        const after = await api<{ order: { expediente: string; requesting_physicians: { id: string }[] } }>(request, "GET", `/api/v1/laboratory/orders/${orderId}/full`, { token: lab.token });
        expect(after.order.expediente).toBe("000731");
        expect(after.order.requesting_physicians.map((p) => p.id)).toEqual(docs);
        const bytesAfter = await pdfBytes(request, lab, reportId, versionNo);
        expect(createHash("sha256").update(bytesAfter).digest("hex")).toBe(sha);
        expect(sql(`SELECT pdf_sha256 || '|' || pdf_size_bytes FROM report_version WHERE report_id = '${reportId}' AND version_no = ${versionNo}`)).toBe(dbBefore);
        expect(sql(`SELECT count(*) FROM sample_code_correction WHERE tenant_id = '${lab.tenantId}'`)).toBe("0");
        expect(reviewerToken).toBeTruthy();
    });

    test("a template that does not declare the expediente stays compatible and prints no expediente", async ({ page, request }) => {
        test.setTimeout(240_000);
        mkdirSync(OUT_DIR, { recursive: true });
        const lab = await createLab(request, "pdf-legacy", { v2: true });
        const studyWithout = await studyTypeWithTemplate(request, lab, "SIN", false);
        const doc = await physician(request, lab, "Carla", "Tres");
        const order = await api<{ order: { id: string } }>(request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token,
            data: unified(lab, { study_type_id: studyWithout, requesting_physician_ids: [doc], expediente: "00042" }) });
        const { reportId, versionNo } = await publishedReport(page, request, lab, order.order.id);
        const stored = await api<{ report: { base: Record<string, unknown> } }>(request, "GET", `/api/v1/reports/${reportId}`, { token: lab.token });
        expect(stored.report.base).not.toHaveProperty("expediente");
        const bytes = await pdfBytes(request, lab, reportId, versionNo);
        writeFileSync(`${OUT_DIR}/official-without-expediente.pdf`, bytes);
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    });
});

// ---------------------------------------------------------------------------------------------------------
// Registration: no typed codes, inactive / active / former manual-required, lost-response retry
// ---------------------------------------------------------------------------------------------------------

async function fillRegistration(page: Page, opts: { physicians?: string[]; expediente?: string; notes?: string } = {}) {
    await page.goto("/orders/register");
    await expect(page.getByText("Registrar Caso")).toBeVisible();
    await pick(page, "Sucursal", /MAIN/);
    await pick(page, "Paciente", /P-/);
    await pick(page, "Tipo de estudio", /Histopatología sintética/);
    await pick(page, "Tipo de muestra", "Biopsia sintética");
    if (opts.physicians?.length) {
        const selector = page.locator("label", { hasText: "Médicos solicitantes (opcional)" }).first()
            .locator("xpath=ancestor::div[.//div[contains(@class,'ant-select')]][1]").locator(".ant-select-selector");
        await selector.click();
        for (const name of opts.physicians) {
            await page.keyboard.type(name);
            await page.keyboard.press("Enter");
        }
        await page.keyboard.press("Escape");
    }
    if (opts.expediente !== undefined) await page.getByLabel("Expediente (opcional)").fill(opts.expediente);
}

test.describe("registration", () => {
    test("no registration route accepts a typed code; inactive, active monthly and former manual-required all generate", async ({ request }) => {
        const lab = await createLab(request, "reg");
        const h = { token: lab.token };
        const study = lab.studyTypeId;
        const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", { ...h, data: { tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: study } });
        // typed (and even empty) codes are refused explicitly on EVERY route
        for (const code of ["MAN-1", ""]) {
            await api(request, "POST", "/api/v1/laboratory/orders/", { ...h, status: 422, data: { tenant_id: lab.tenantId, branch_id: lab.branchId, patient_id: lab.patientId, study_type_id: study, order_code: code } });
            await api(request, "POST", "/api/v1/laboratory/samples/", { ...h, status: 422, data: { tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: order.id, sample_type_id: lab.sampleTypeId, sample_code: code } });
            await api(request, "POST", "/api/v1/laboratory/orders/unified", { ...h, status: 422, data: { ...unified(lab), order_code: code } });
            await api(request, "POST", "/api/v1/laboratory/orders/unified", { ...h, status: 422, data: { ...unified(lab), samples: [{ sample_type_id: lab.sampleTypeId, sample_code: code }] } });
        }
        // inactive (never configured): compatibility generation for BOTH kinds, several samples of one type
        const inactive = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { ...h, data: unified(lab, {}, 2) });
        expect(inactive.order.order_code).toBe("HIS-2");
        expect(inactive.samples.map((s: Json) => s.sample_code)).toEqual(["BX-1", "BX-2"]);
        // a former manual-required configuration (seeded; the API can no longer create it) does not block
        const config = (active: boolean) => sql(`INSERT INTO numbering_config (tenant_id, entity_kind, active, manual_policy, format, sequence_min_width, start_value, scope, timezone, updated_at)
            SELECT '${lab.tenantId}', k, ${active}, 'required', '{BASE}{SEQ}{MM}{YY}', 2, 1, 'tenant', 'America/Mexico_City', now() FROM unnest(ARRAY['order','sample']) k
            ON CONFLICT (tenant_id, entity_kind) DO UPDATE SET active = ${active}, manual_policy = 'required'`);
        config(false);
        const legacyRequired = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { ...h, data: unified(lab) });
        expect(legacyRequired.order.order_code).toBe("HIS-3");
        const cfg = await api<Json>(request, "GET", "/api/v1/numbering/config", h);
        expect(cfg.order.legacy_manual_policy).toBe(true);
        expect(cfg.order.registration).toBe("automatic");
        // deliberate monthly activation (policy omitted: the stored value is kept untouched)
        const activated = await api<Json>(request, "PUT", "/api/v1/numbering/config/order", { ...h, data: { active: true, format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 1, scope: "tenant" } });
        expect(activated.manual_policy).toBe("required");
        await api(request, "PUT", "/api/v1/numbering/config/order", { ...h, status: 200, data: { active: true, manual_policy: "allowed", format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 1, scope: "tenant" } });
        await api(request, "PUT", "/api/v1/numbering/config/order", { ...h, status: 422, data: { active: true, manual_policy: "required", format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 1, scope: "tenant" } });
        const monthly = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { ...h, data: unified(lab) });
        expect(monthly.order.order_code).toMatch(/^HIS\d{2}\d{4}$/);       // active monthly, e.g. HIS011026
        expect(monthly.samples[0].sample_code).toMatch(/^BX-\d+$/);        // samples stayed inactive (deliberate, per kind)
        expect(sql(`SELECT count(*) FROM numbering_config WHERE tenant_id = '${lab.tenantId}' AND active`)).toBe("1");
        // the same key with the same payload replays the committed records (lost-response retry at API level)
        const key = crypto.randomUUID();
        const first = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { ...h, key, data: unified(lab) });
        const again = await request.fetch(`${API_BASE}/api/v1/laboratory/orders/unified`, { method: "POST", data: unified(lab),
            headers: { Authorization: `Bearer ${lab.token}`, "Content-Type": "application/json", "Idempotency-Key": key } });
        expect(again.headers()["idempotent-replayed"]).toBe("true");
        expect((await again.json()).order.order_code).toBe(first.order.order_code);
    });

    test("the form has no code fields and a retry after a committed-but-lost response creates ONE order", async ({ page, request }) => {
        const lab = await createLab(request, "retry");
        await login(page, lab);
        await fillRegistration(page);
        await expect(page.getByLabel(/Código de la orden/)).toHaveCount(0);
        await expect(page.getByLabel(/Código de Muestra/)).toHaveCount(0);
        // let the server COMMIT, then drop the response on the floor (what a flaky network does)
        let dropped = 0;
        await page.route("**/laboratory/orders/unified", async (route) => {
            if (dropped === 0) { dropped++; await route.fetch(); await route.abort("connectionreset"); }
            else await route.continue();
        });
        await page.getByRole("button", { name: "Registrar" }).click();
        await expect.poll(() => dropped).toBe(1);
        await expect(page).toHaveURL(/\/orders\/register/);          // no navigation: the client does not know it committed
        await expect(page.getByText("Failed to fetch")).toBeVisible();   // the form has finished failing (and re-enabled itself)
        const retry = page.waitForResponse((r) => r.url().includes("/orders/unified") && r.request().method() === "POST");
        // keyboard submit: a pointer click can land on the floating field hint that the first failed attempt left open
        const submit = page.getByRole("button", { name: "Registrar" });
        await submit.focus();
        await page.keyboard.press("Enter");   // same payload => same Idempotency-Key => server replay
        const response = await retry;
        expect(response.status()).toBe(200);
        expect(response.headers()["idempotent-replayed"]).toBe("true");
        await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
        expect(sql(`SELECT count(*) FROM "order" WHERE tenant_id = '${lab.tenantId}'`)).toBe("1");
        expect(sql(`SELECT count(*) FROM sample WHERE tenant_id = '${lab.tenantId}'`)).toBe("1");
        expect(sql(`SELECT count(*) FROM numbering_allocation WHERE tenant_id = '${lab.tenantId}'`)).toBe("2");
        await expect(page.getByText("HIS-1").first()).toBeVisible();
    });

    test("physicians without expediente, expediente with a patient and no physician, both, leading zeroes, long names", async ({ page, request }) => {
        const lab = await createLab(request, "phys");
        const longLast = "Fernández-Villaseñor de la Concepción y Ñandú";
        const names = ["Ana María", "Beto José", "Carla Inés", "Daniel Ángel", "Elena Sofía", "Fabián Óscar", "Gabriela Ñ", "Héctor Úrsulo"];
        for (const first of names) await physician(request, lab, first, longLast);
        await login(page, lab);

        const created: string[] = [];
        for (const variant of [
            { physicians: ["Ana", "Beto"], expediente: undefined },
            { physicians: [], expediente: "000731" },
            { physicians: ["Carla"], expediente: "0042-A" },
            { physicians: names.map((n) => n.split(" ")[0]), expediente: undefined },
        ]) {
            await fillRegistration(page, variant);
            await page.getByRole("button", { name: "Registrar" }).click();
            await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
            created.push(page.url().split("/").pop()!);
        }
        const detail = (id: string) => api<Json>(request, "GET", `/api/v1/laboratory/orders/${id}`, { token: lab.token });
        const [a, b, c, d] = await Promise.all(created.map(detail));
        expect(a.requesting_physicians).toHaveLength(2); expect(a.expediente).toBeNull(); expect(a.requesting_physician).toBeNull();
        expect(b.requesting_physicians).toHaveLength(0); expect(b.expediente).toBe("000731"); expect(b.requesting_physician_id).toBeNull();
        expect(c.requesting_physicians).toHaveLength(1); expect(c.expediente).toBe("0042-A"); expect(c.requesting_physician.full_name).toContain("Carla");
        expect(d.requesting_physicians).toHaveLength(8);
        expect(d.requested_by.length).toBeLessThanOrEqual(255);          // legacy summary is bounded...
        expect(d.requesting_physicians.every((p: Json) => p.full_name.includes(longLast))).toBe(true);   // ...the list is complete
        await page.goto(`/orders/${created[3]}`);
        await expect(page.getByText("Solicitantes:")).toBeVisible();
        for (const first of names) await expect(page.getByText(new RegExp(first)).first()).toBeVisible();
        await page.goto(`/orders/${created[1]}`);
        await expect(page.getByTestId("order-expediente")).toHaveText("000731");
        // the list shows physicians and expediente too
        await page.goto("/orders");
        await expect(page.getByText("Expediente 000731")).toBeVisible();
    });
});

// ---------------------------------------------------------------------------------------------------------
// Edit, code correction, permissions, review/approval blockers
// ---------------------------------------------------------------------------------------------------------

async function draftReport(page: Page, request: APIRequestContext, lab: Lab, orderId: string) {
    const reviewerEmail = `rev-${lab.suffix}@example.com`;
    const reviewerPassword = "E2eReviewer!2026";
    const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", { token: lab.token, data: {
        email: reviewerEmail, first_name: "E2E", last_name: "Revisor", role: "reviewer", password: reviewerPassword, branch_ids: [lab.branchId] } });
    await api(request, "PUT", `/api/v1/laboratory/orders/${orderId}/reviewers`, { token: lab.token, data: { reviewer_ids: [reviewer.id] } });
    await page.goto(`/reports/editor?orderId=${orderId}`);
    await expect(page.getByLabel("Nombre del reporte")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Nombre del reporte").fill(`Reporte ${lab.suffix}`);
    await page.getByLabel("Diagnóstico").fill("Hallazgo sintético");
    await page.getByTestId("report-save-top").click();
    await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });
    const reportId = (await api<{ report_id: string }>(request, "GET", `/api/v1/laboratory/orders/${orderId}`, { token: lab.token })).report_id!;
    const reviewerToken = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: reviewerEmail, password: reviewerPassword } })).access_token;
    return { reportId, reviewerToken };
}

test.describe("management inside the window and its blockers", () => {
    test("edit and code correction in the window; permissions, foreign tenant, review/approval blockers", async ({ page, request }) => {
        test.setTimeout(240_000);
        const lab = await createLab(request, "mgmt", { v2: true });
        const other = await createLab(request, "other");
        const studyType = await studyTypeWithTemplate(request, lab, "TPL", false);
        const docA = await physician(request, lab, "Ana", "Uno");
        const docB = await physician(request, lab, "Beto", "Dos");
        const created = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token,
            data: unified(lab, { study_type_id: studyType, requesting_physician_ids: [docA] }, 2) });
        const orderId = created.order.id;
        const [s1, s2] = created.samples.map((s: Json) => s.id);
        await login(page, lab);

        // --- UI edit inside the window
        await page.goto(`/orders/${orderId}`);
        await page.getByTestId("order-edit-button").click();
        await page.getByLabel("Expediente (opcional)").fill("0099");
        await page.getByRole("button", { name: "Guardar" }).last().click();
        await expect(page.getByTestId("order-expediente")).toHaveText("0099");
        // --- UI sample-code correction inside the window
        await page.goto(`/samples/${s1}`);
        await page.getByTestId("sample-correct-button").click();
        await page.getByTestId("sample-correct-dialog").getByLabel("Nuevo código").fill("LAB.7-A");
        await page.getByLabel("Motivo de la corrección").fill("rotulada mal");
        await page.getByTestId("sample-correct-confirm").click();
        await expect(page.getByText("LAB.7-A").first()).toBeVisible();

        // --- permissions: a lab_tech holds neither lab:update_order, lab:remove_capture nor lab:enter_manual_code
        const techEmail = `tech-${lab.suffix}@example.com`;
        await api(request, "POST", "/api/v1/users/", { token: lab.token, data: { email: techEmail, first_name: "T", last_name: "Tec", role: "lab_tech", password: "E2eTech!2026", branch_ids: [lab.branchId] } });
        const tech = (await api<Json>(request, "POST", "/api/v1/auth/login", { data: { username_or_email: techEmail, password: "E2eTech!2026" } })).access_token;
        await api(request, "PATCH", `/api/v1/laboratory/orders/${orderId}`, { token: tech, status: 403, data: { expediente: "1" } });
        await api(request, "POST", `/api/v1/laboratory/samples/${s2}/code-correction`, { token: tech, status: 403, data: { sample_code: "X-1", reason: "no autorizado" } });
        await api(request, "POST", `/api/v1/laboratory/samples/${s2}/removal`, { token: tech, status: 403, data: { reason: "no autorizado" } });
        await api(request, "POST", `/api/v1/laboratory/orders/${orderId}/removal`, { token: tech, status: 403, data: { reason: "no autorizado" } });
        // ...and a foreign laboratory cannot even see the case
        await api(request, "PATCH", `/api/v1/laboratory/orders/${orderId}`, { token: other.token, status: 404, data: { expediente: "1" } });
        await api(request, "POST", `/api/v1/laboratory/samples/${s2}/code-correction`, { token: other.token, status: 404, data: { sample_code: "X-1", reason: "ajeno" } });
        await api(request, "POST", `/api/v1/laboratory/orders/${orderId}/removal`, { token: other.token, status: 404, data: { reason: "ajeno" } });
        expect(sql(`SELECT expediente FROM "order" WHERE id = '${orderId}'`)).toBe("0099");
        // the technician's screen offers no management panel at all
        const techPage = await page.context().browser()!.newContext();
        const tp = await techPage.newPage();
        await login(tp, { email: techEmail, password: "E2eTech!2026" });
        await tp.goto(`/orders/${orderId}`);
        await expect(tp.getByText("Solicitantes:").or(tp.getByText("Solicitante:"))).toBeVisible();
        await expect(tp.getByTestId("order-management")).toHaveCount(0);
        await techPage.close();

        // --- a report in DRAFT does not close the window; submitting it does, and so does approval
        const { reportId, reviewerToken } = await draftReport(page, request, lab, orderId);
        await api(request, "PATCH", `/api/v1/laboratory/orders/${orderId}`, { token: lab.token, status: 200, data: { requesting_physician_ids: [docA, docB] } });
        await api(request, "POST", `/api/v1/reports/${reportId}/submit`, { token: lab.token, data: {} });
        await page.goto(`/orders/${orderId}`);
        await expect(page.getByTestId("order-edit-blockers")).toBeVisible();
        await expect(page.getByTestId("order-edit-button")).toBeDisabled();
        await expect(page.getByTestId("order-remove-button")).toBeDisabled();
        await api(request, "PATCH", `/api/v1/laboratory/orders/${orderId}`, { token: lab.token, status: 409, data: { expediente: "1" } });
        await api(request, "POST", `/api/v1/reports/${reportId}/approve`, { token: reviewerToken, data: {} });
        await page.goto(`/samples/${s2}`);
        await expect(page.getByTestId("sample-blockers")).toBeVisible();
        await expect(page.getByTestId("sample-correct-button")).toBeDisabled();
        await api(request, "POST", `/api/v1/laboratory/samples/${s2}/code-correction`, { token: lab.token, status: 409, data: { sample_code: "X-2", reason: "tardío" } });
        // a draft RETURNED from review stays protected by history (reopen is the supported flow, not this editor)
        await api(request, "POST", `/api/v1/reports/${reportId}/reopen`, { token: reviewerToken, data: {} }).catch(() => undefined);
        await api(request, "PATCH", `/api/v1/laboratory/orders/${orderId}`, { token: lab.token, status: 409, data: { expediente: "2" } });
        expect(sql(`SELECT expediente FROM "order" WHERE id = '${orderId}'`)).toBe("0099");
        expect(sql(`SELECT count(*) FROM sample_code_correction WHERE tenant_id = '${lab.tenantId}'`)).toBe("1");  // only the in-window correction
    });
});

// ---------------------------------------------------------------------------------------------------------
// Removal: last sample, retained identifiers, billing dependency, replay of removed creation
// ---------------------------------------------------------------------------------------------------------

test.describe("removal", () => {
    test("last-sample denial, sample and order removal, retained identifiers, billing denial and replay of a removed creation", async ({ page, request }) => {
        test.setTimeout(180_000);
        const lab = await createLab(request, "rm");
        const key = crypto.randomUUID();
        const created = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token, key, data: unified(lab, {}, 2) });
        const orderId = created.order.id;
        const [s1, s2] = created.samples.map((s: Json) => s.id);
        await login(page, lab);

        // payment on a second case: removal is denied in the UI and the API, nothing hidden
        const paid = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token, data: unified(lab) });
        const invoice = await api<Json>(request, "GET", `/api/v1/billing/orders/${paid.order.id}/invoice`, { token: lab.token });
        await api(request, "POST", "/api/v1/billing/payments/", { token: lab.token, data: { tenant_id: lab.tenantId, invoice_id: invoice.id, amount: 5 } });
        await page.goto(`/orders/${paid.order.id}`);
        await expect(page.getByTestId("order-remove-button")).toBeDisabled();
        await expect(page.getByTestId("order-removal-blockers")).toContainText("payments");
        await api(request, "POST", `/api/v1/laboratory/orders/${paid.order.id}/removal`, { token: lab.token, status: 409, data: { reason: "con pago" } });
        expect((await api<Json[]>(request, "GET", "/api/v1/billing/invoices/", { token: lab.token })).length).toBe(2);

        // sample removal through the UI; the last remaining sample is then protected
        await page.goto(`/samples/${s2}`);
        await page.getByTestId("sample-remove-button").click();
        await expect(page.getByTestId("sample-remove-dialog")).toContainText("never reused");
        await page.getByLabel("Motivo del retiro").fill("muestra duplicada");
        await page.getByTestId("sample-remove-confirm").click();
        await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
        await page.goto(`/samples/${s1}`);
        await expect(page.getByTestId("sample-remove-button")).toBeDisabled();
        await expect(page.getByTestId("sample-blockers")).toContainText("only sample");
        await api(request, "POST", `/api/v1/laboratory/samples/${s1}/removal`, { token: lab.token, status: 409, data: { reason: "última" } });

        // order removal through the UI
        await page.goto(`/orders/${orderId}`);
        await page.getByTestId("order-remove-button").click();
        await page.getByLabel("Motivo del retiro").fill("captura en el paciente equivocado");
        await page.getByTestId("order-remove-confirm").click();
        await expect(page).toHaveURL(/\/orders$/);
        await api(request, "GET", `/api/v1/laboratory/orders/${orderId}`, { token: lab.token, status: 404 });

        // identifiers, ledger and audit are retained; the invoice is kept (hidden) and not voided
        expect(sql(`SELECT count(*) FROM "order" WHERE id = '${orderId}' AND removed_at IS NOT NULL AND order_code = '${created.order.order_code}'`)).toBe("1");
        expect(sql(`SELECT count(*) FROM sample WHERE order_id = '${orderId}' AND removed_at IS NOT NULL`)).toBe("2");
        expect(sql(`SELECT count(*) FROM numbering_allocation WHERE tenant_id = '${lab.tenantId}' AND code IN ('${created.order.order_code}', '${created.samples[0].sample_code}', '${created.samples[1].sample_code}')`)).toBe("3");
        expect(sql(`SELECT status FROM invoice WHERE order_id = '${orderId}'`)).toBe("PENDING");
        expect(sql(`SELECT count(*) FROM audit_log WHERE action IN ('ORDER.REMOVED','SAMPLE.REMOVED') AND tenant_id = '${lab.tenantId}'`)).toBe("2");
        // codes are not reused...
        const next = await api<Json>(request, "POST", "/api/v1/laboratory/orders/unified", { token: lab.token, data: unified(lab) });
        expect(next.order.order_code).not.toBe(created.order.order_code);
        // ...and replaying the removed creation is refused (410), not recreated
        const replay = await request.fetch(`${API_BASE}/api/v1/laboratory/orders/unified`, { method: "POST", data: unified(lab, {}, 2),
            headers: { Authorization: `Bearer ${lab.token}`, "Content-Type": "application/json", "Idempotency-Key": key } });
        expect(replay.status()).toBe(410);
        const orders = await api<Json>(request, "GET", "/api/v1/laboratory/orders/", { token: lab.token });
        expect(orders.orders.map((o: Json) => o.id)).not.toContain(orderId);
    });
});
