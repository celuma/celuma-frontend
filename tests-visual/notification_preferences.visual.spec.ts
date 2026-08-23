import { test, expect } from "@playwright/test";

/**
 * Golden visual tests for the Profile page's notification-preference section
 * (Céluma 1.3 Phase 3, Block D).
 *
 * Extends the existing Playwright harness the same way Block C did — a new
 * `?preferences=<scenario>` mode beside `?notifications=<scenario>`, same
 * config, same tolerance, same never-auto-update policy. **No Notification
 * Center or report-renderer snapshot is touched by this file**: these
 * snapshots carry the `preferences-` prefix and cannot collide with a
 * `notifications-`, legacy or v2 golden.
 *
 * Determinism needs no special handling here: the section renders no
 * timestamp and no relative time, so nothing in these images changes as
 * wall-clock time advances.
 */

const SECTION = "#preference-host";
const SAVE = /Guardar preferencias/;

test("preferences — every type at its policy default", async ({ page }) => {
    await page.goto("/?preferences=defaults");
    await expect(page.getByText("Preferencias de notificaciones")).toBeVisible();

    // Six rows, one email switch each, no in-app switch anywhere.
    await expect(page.getByRole("switch")).toHaveCount(6);
    // The in-app-only type is disabled and says why.
    await expect(page.getByText("Disponible únicamente dentro de Céluma.")).toBeVisible();
    // Nothing to save until the user changes something.
    await expect(page.getByRole("button", { name: SAVE })).toBeDisabled();

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-defaults.png");
});

test("preferences — explicit overrides mixed with defaults", async ({ page }) => {
    await page.goto("/?preferences=mixed");
    await expect(page.getByText("Preferencias de notificaciones")).toBeVisible();

    // Four implicit defaults carry the badge; the two explicit rows do not.
    await expect(page.getByText("Predeterminado")).toHaveCount(4);

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-mixed.png");
});

test("preferences — dirty state, ready to save", async ({ page }) => {
    await page.goto("/?preferences=defaults");
    await expect(page.getByText("Preferencias de notificaciones")).toBeVisible();

    await page.getByLabel("Recibir por correo electrónico: Reporte publicado").click();

    await expect(page.getByRole("button", { name: SAVE })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Restablecer" })).toBeEnabled();

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-dirty.png");
});

test("preferences — saving in flight", async ({ page }) => {
    await page.goto("/?preferences=saving");
    await expect(page.getByText("Preferencias de notificaciones")).toBeVisible();

    await page.getByLabel("Recibir por correo electrónico: Reporte publicado").click();
    await page.getByRole("button", { name: SAVE }).click();

    // The stubbed PUT never resolves, so the button stays in its loading state.
    await expect(page.locator(".ant-btn-loading")).toBeVisible();

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-saving.png", {
        // antd's button spinner is not fully frozen by `animations: "disabled"`.
        maxDiffPixelRatio: 0.05,
    });
});

test("preferences — first load", async ({ page }) => {
    await page.goto("/?preferences=loading");
    await expect(page.locator(".ant-skeleton")).toBeVisible();

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-loading.png", {
        maxDiffPixelRatio: 0.05,
    });
});

test("preferences — the list could not be loaded", async ({ page }) => {
    await page.goto("/?preferences=error");
    await expect(page.getByRole("alert")).toHaveText(
        "No fue posible cargar tus preferencias de notificaciones.",
    );

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-error.png");
});

test("preferences — embedded in the config panel's Profile", async ({ page }) => {
    await page.goto("/?preferences=embedded");
    await expect(page.getByText("Preferencias de notificaciones")).toBeVisible();

    // The same section, below the page's existing cards, with no sidebar —
    // this is what /config/profile renders.
    await expect(page.getByText("Editar Información")).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(6);

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-embedded.png");
});

test("preferences — responsive at a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?preferences=defaults");
    await expect(page.getByText("Preferencias de notificaciones")).toBeVisible();

    await expect(page.locator(SECTION)).toHaveScreenshot("preferences-mobile.png");
});
