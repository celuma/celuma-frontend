/**
 * Real end-to-end — Céluma 1.4 order/sample management (#9, #10, #11, #16) and automatic registration.
 *
 * Synthetic laboratory created through the public registration API; never real data. One continuous
 * flow: the registration form has NO code inputs, several requesting physicians and an expediente
 * (leading zeroes) are captured, the server-assigned codes are shown, the order is edited, a sample code is
 * corrected, a sample is removed (the last one cannot be), and the order is removed.
 */
import { expect, test, type Page } from "@playwright/test";

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";

/** Opens the antd select that carries the given floating caption and picks the option containing `option`. */
async function pick(page: Page, caption: string, option: string | RegExp) {
    const field = page.locator("label", { hasText: caption }).first().locator("xpath=ancestor::div[.//div[contains(@class,'ant-select')]][1]");
    await field.locator(".ant-select-selector").click();
    await page.locator(".ant-select-item-option", { hasText: option }).filter({ visible: true }).first().click();
}

test("automatic registration, physicians + expediente, sample-code correction and removals", async ({ page, request }) => {
    const suffix = Date.now();
    const email = `mgmt-${suffix}@example.com`;
    const password = "SyntheticMgmt!2026";
    const registration = await request.post(`${API_BASE}/api/v1/auth/register/unified`, { data: {
        tenant: { name: `Synthetic management lab ${suffix}` },
        branch: { code: "MAIN", name: "Synthetic branch" },
        admin_user: { email, password, full_name: "Synthetic Admin" },
    } });
    expect(registration.ok()).toBeTruthy();
    const lab = await registration.json();
    const login = await request.post(`${API_BASE}/api/v1/auth/login`, { data: { username_or_email: email, password } });
    const { access_token: token } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };

    const study = await request.post(`${API_BASE}/api/v1/study-types/`, { headers, data: { code: "HIS", name: "Histopatología sintética" } });
    expect(study.ok()).toBeTruthy();
    const sampleType = await request.post(`${API_BASE}/api/v1/sample-types/`, { headers, data: { code: "BX", name: "Biopsia sintética" } });
    expect(sampleType.ok(), await sampleType.text()).toBeTruthy();
    const patient = await request.post(`${API_BASE}/api/v1/patients/`, { headers, data: {
        tenant_id: lab.tenant_id, branch_id: lab.branch_id, first_name: "Paciente", last_name: "Sintetico", patient_code: `MG-P-${suffix}` } });
    expect(patient.ok()).toBeTruthy();
    for (const [first, last] of [["Ana", "Uno"], ["Beto", "Dos"]]) {
        const doc = await request.post(`${API_BASE}/api/v1/requesting-physicians/`, { headers, data: {
            branch_id: lab.branch_id, first_name: first, last_name: last } });
        expect(doc.ok(), await doc.text()).toBeTruthy();
    }

    await page.goto("/login");
    await page.getByLabel("Usuario o email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page).not.toHaveURL(/\/login$/);

    // --- registration: no code inputs anywhere
    await page.goto("/orders/register");
    await expect(page.getByText("Registrar Caso")).toBeVisible();
    await expect(page.getByLabel(/Código de la orden/)).toHaveCount(0);
    await expect(page.getByLabel(/Código de Muestra/)).toHaveCount(0);
    await expect(page.getByTestId("auto-code-hint-order")).toContainText("se asigna automáticamente");
    await pick(page, "Sucursal", /MAIN/);
    await pick(page, "Paciente", /MG-P-/);
    await pick(page, "Tipo de estudio", /Histopatología sintética/);
    await pick(page, "Tipo de muestra", "Biopsia sintética");
    // multi-select: type to filter, Enter to pick (the floating dropdown can sit under the helper text)
    const physicians = page.locator("label", { hasText: "Médicos solicitantes (opcional)" }).first()
        .locator("xpath=ancestor::div[.//div[contains(@class,'ant-select')]][1]").locator(".ant-select-selector");
    await physicians.click();
    await page.keyboard.type("Ana");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Beto");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.getByLabel("Expediente (opcional)").fill("000731");
    await page.getByRole("button", { name: "Registrar" }).click();

    // --- the server-assigned code and the captured data are shown
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    const orderId = page.url().split("/").pop()!;
    await expect(page.getByText("CU-1").or(page.getByText("HIS-1")).first()).toBeVisible();
    await expect(page.getByTestId("order-expediente")).toHaveText("000731");
    await expect(page.getByText("Solicitantes:")).toBeVisible();
    await expect(page.getByText("Ana Uno")).toBeVisible();
    await expect(page.getByText("Beto Dos")).toBeVisible();

    const detail = await (await request.get(`${API_BASE}/api/v1/laboratory/orders/${orderId}/full`, { headers })).json();
    expect(detail.order.order_code).toMatch(/^HIS-1$/);
    expect(detail.samples.map((s: { sample_code: string }) => s.sample_code)).toEqual(["BX-1"]);
    expect(detail.order.requesting_physician).toBeNull(); // several physicians: no primary
    expect(detail.order.requesting_physicians).toHaveLength(2);

    // --- controlled edit
    await page.getByTestId("order-edit-button").click();
    await page.getByLabel("Expediente (opcional)").fill("0099");
    await page.getByRole("button", { name: "Guardar" }).last().click();
    await expect(page.getByTestId("order-expediente")).toHaveText("0099");

    // --- the last sample cannot be removed; a corrected code replaces the generated one
    const sampleId = detail.samples[0].id;
    await page.goto(`/samples/${sampleId}`);
    await expect(page.getByTestId("sample-remove-button")).toBeDisabled();
    await page.getByTestId("sample-correct-button").click();
    const dialog = page.getByTestId("sample-correct-dialog");
    await dialog.getByLabel("Nuevo código").fill("LAB.7-A");
    await page.getByLabel("Motivo de la corrección").fill("rotulada mal en recepción");
    await page.getByTestId("sample-correct-confirm").click();
    await expect(page.getByText("LAB.7-A").first()).toBeVisible();
    const afterCorrection = await (await request.get(`${API_BASE}/api/v1/laboratory/samples/${sampleId}`, { headers })).json();
    expect(afterCorrection.sample_code).toBe("LAB.7-A");

    // --- order removal: needs a reason, the code is never reused
    await page.goto(`/orders/${orderId}`);
    await page.getByTestId("order-remove-button").click();
    await expect(page.getByTestId("order-remove-dialog")).toContainText("never reused");
    await page.getByLabel("Motivo del retiro").fill("captura en el paciente equivocado");
    await page.getByTestId("order-remove-confirm").click();
    await expect(page).toHaveURL(/\/orders$/);
    const gone = await request.get(`${API_BASE}/api/v1/laboratory/orders/${orderId}`, { headers });
    expect(gone.status()).toBe(404);
    const next = await request.post(`${API_BASE}/api/v1/laboratory/orders/`, {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: { tenant_id: lab.tenant_id, branch_id: lab.branch_id, patient_id: (await patient.json()).id, study_type_id: (await study.json()).id },
    });
    expect((await next.json()).order_code).toBe("HIS-2"); // HIS-1 stays retired
});
