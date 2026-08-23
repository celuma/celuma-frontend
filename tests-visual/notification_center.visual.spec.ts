import { test, expect } from "@playwright/test";

/**
 * Golden visual tests for the Notification Center (Céluma 1.3 Phase 3,
 * Block C).
 *
 * Extends the existing Playwright harness rather than replacing it: same
 * config, same tolerance, same never-auto-update policy. The addition is a
 * `?notifications=<scenario>` mode in tests-visual/harness, following the
 * fetch-stub pattern the `?internal_render=1` mode already established. **No
 * report-renderer snapshot is touched by this file** — these snapshots use the
 * "notifications-" prefix and cannot collide with a legacy or v2 golden.
 *
 * Determinism: fixture timestamps sit far enough in the past that relative
 * formatting falls through to the absolute date (so a snapshot does not drift
 * as time passes), and the timezone is pinned to UTC below so the absolute
 * rendering is the same on every machine.
 */

test.use({ timezoneId: "UTC" });

const BELL = /^Notificaciones,/;

test("bell — no unread notifications, badge hidden", async ({ page }) => {
    await page.goto("/?notifications=bell-zero");
    const bell = page.getByLabel("Notificaciones, ninguna sin leer");
    await expect(bell).toBeVisible();
    await expect(bell).toHaveScreenshot("notifications-bell-zero.png");
});

test("bell — more than nine unread, badge capped at 9+", async ({ page }) => {
    await page.goto("/?notifications=bell-nine-plus");
    const bell = page.getByLabel("Notificaciones, 12 sin leer");
    await expect(bell).toBeVisible();
    // The badge caps visually; the accessible name above still says 12.
    await expect(bell.getByText("9+")).toBeVisible();
    await expect(bell).toHaveScreenshot("notifications-bell-nine-plus.png");
});

test("popover — recent notifications, mixed read and unread", async ({ page }) => {
    await page.goto("/?notifications=popover-mixed");
    await page.getByLabel(BELL).click();
    await expect(page.getByRole("button", { name: "Ver todas" })).toBeVisible();

    const panel = page.locator(".ant-popover-inner");
    await expect(panel).toHaveScreenshot("notifications-popover-mixed.png");
});

test("history page — populated", async ({ page }) => {
    await page.goto("/?notifications=history-populated");
    await expect(page.getByText("Reporte publicado — Orden ORD-2026-00152")).toBeVisible();
    await expect(page.locator("#notification-host")).toHaveScreenshot(
        "notifications-history-populated.png",
    );
});

test("history page — empty inbox", async ({ page }) => {
    await page.goto("/?notifications=history-empty");
    await expect(page.getByText("No tienes notificaciones.")).toBeVisible();
    await expect(page.locator("#notification-host")).toHaveScreenshot(
        "notifications-history-empty.png",
    );
});

test("history page — loading skeleton", async ({ page }) => {
    await page.goto("/?notifications=history-loading");
    await expect(page.getByTestId("notification-list-skeleton")).toBeVisible();
    await expect(page.locator("#notification-host")).toHaveScreenshot(
        "notifications-history-loading.png",
        // The antd skeleton shimmers; animations are already disabled by the
        // shared expect config, and this keeps the remaining tolerance sane.
        { maxDiffPixelRatio: 0.05 },
    );
});

test("history page — error state with retry", async ({ page }) => {
    await page.goto("/?notifications=history-error");
    await expect(page.getByText("No fue posible cargar las notificaciones.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
    await expect(page.locator("#notification-host")).toHaveScreenshot(
        "notifications-history-error.png",
    );
});

test("mobile — the bell opens a full-width drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?notifications=popover-mixed");

    await page.getByLabel(BELL).click();
    await expect(page.getByRole("button", { name: "Ver todas" })).toBeVisible();

    await expect(page.locator(".ant-drawer-content")).toHaveScreenshot(
        "notifications-mobile-drawer.png",
    );
});

test("history page — responsive at a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?notifications=history-populated");
    await expect(page.getByText("Reporte publicado — Orden ORD-2026-00152")).toBeVisible();

    await expect(page.locator("#notification-host")).toHaveScreenshot(
        "notifications-history-mobile.png",
    );
});
