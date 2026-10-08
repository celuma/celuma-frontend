import { expect, test } from "@playwright/test";

const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";

test("assigns a pathologist in a laboratory with more than ten active users", async ({ page, request }) => {
    const suffix = Date.now();
    const email = `assignees-${suffix}@example.com`;
    const password = "SyntheticHotfix!2026";
    const registration = await request.post(`${API_BASE}/api/v1/auth/register/unified`, { data: {
        tenant: { name: `Synthetic assignee lab ${suffix}` },
        branch: { code: "MAIN", name: "Synthetic branch" },
        admin_user: { email, password, full_name: "Synthetic Admin" },
    } });
    expect(registration.ok()).toBeTruthy();
    const lab = await registration.json();
    const login = await request.post(`${API_BASE}/api/v1/auth/login`, {
        data: { username_or_email: email, password },
    });
    expect(login.ok()).toBeTruthy();
    const { access_token: token } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };
    let targetId = "";
    for (let index = 1; index <= 12; index++) {
        const created = await request.post(`${API_BASE}/api/v1/users/`, { headers, data: {
            email: `candidate${index}-${suffix}@example.com`, password,
            username: `candidate${index}`, first_name: "Patologo", last_name: `${index}`,
            role: "pathologist", branch_ids: [lab.branch_id],
        } });
        expect(created.ok()).toBeTruthy();
        if (index === 12) targetId = (await created.json()).id;
    }
    const study = await request.post(`${API_BASE}/api/v1/study-types/`, {
        headers, data: { code: "HIST", name: "Synthetic study" },
    });
    expect(study.ok()).toBeTruthy();
    const patientResponse = await request.post(`${API_BASE}/api/v1/patients/`, {
        headers, data: { tenant_id: lab.tenant_id, branch_id: lab.branch_id,
            first_name: "Paciente", last_name: "Sintetico", patient_code: `HF-P-${suffix}` },
    });
    expect(patientResponse.ok(), await patientResponse.text()).toBeTruthy();
    const orderResponse = await request.post(`${API_BASE}/api/v1/laboratory/orders/`, {
        headers, data: { tenant_id: lab.tenant_id, branch_id: lab.branch_id,
            patient_id: (await patientResponse.json()).id,
            study_type_id: (await study.json()).id, order_code: `HF-${suffix}` },
    });
    expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
    const order = await orderResponse.json();
    await page.goto("/login");
    await page.getByLabel("Usuario o email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto(`/orders/${order.id}`);
    await page.getByText("Asignados", { exact: true }).locator("..").getByRole("button", { name: "Configurar" }).click();
    await page.getByPlaceholder("Buscar usuario…").fill("candidate12");
    await page.getByRole("button", { name: /Patologo 12/ }).click();
    await page.getByRole("button", { name: "Aplicar", exact: true }).click();
    await expect(page.getByPlaceholder("Buscar usuario…")).not.toBeVisible();
    const saved = await request.get(`${API_BASE}/api/v1/laboratory/orders/${order.id}`, { headers });
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).assignees.map((u: { id: string }) => u.id)).toEqual([targetId]);
    await page.reload();
    await expect(page.getByText("Patologo 12", { exact: true }).filter({ visible: true })).toBeVisible();
});
