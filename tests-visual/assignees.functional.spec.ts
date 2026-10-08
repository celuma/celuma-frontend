import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`finds and selects a user beyond the first page at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const users = Array.from({ length: 101 }, (_, i) => ({
            id: `user-${String(i + 1).padStart(3, "0")}`,
            name: i === 100 ? "Patologo Once" : `Usuario ${String(i + 1).padStart(3, "0")}`,
            username: i === 100 ? "patologo_once" : `usuario${i + 1}`,
            email: `user${i + 1}@example.invalid`, avatar_url: null,
        }));
        await page.route("**/v1/laboratory/users/assignable?**", async route => {
            const after = new URL(route.request().url()).searchParams.get("after");
            await route.fulfill({ json: after
                ? { users: users.slice(100), next_after: null }
                : { users: users.slice(0, 100), next_after: "user-100" } });
        });
        await page.goto("/assignees.html");
        await expect(page.getByTestId("loaded")).toHaveText("101");
        await page.getByRole("button", { name: "Configurar" }).click();
        await page.getByPlaceholder("Buscar usuario…").fill("patologo_once");
        await page.getByRole("button", { name: /Patologo Once/ }).click();
        await page.getByRole("button", { name: "Aplicar", exact: true }).click();
        await expect(page.getByTestId("selected")).toHaveText("user-002,user-101");
        await page.getByRole("button", { name: "Configurar" }).click();
        await page.getByPlaceholder("Buscar usuario…").fill("Patologo Once");
        await expect(page.getByRole("button", { name: /Patologo Once/ })).toBeVisible();
        await page.getByRole("button", { name: "Aplicar", exact: true }).click();
        await expect(page.getByTestId("selected")).toHaveText("user-002,user-101");
    });
}
