import { test, expect } from "@playwright/test";

/**
 * Golden visual tests for the tenant usage dashboard (Céluma 1.3 Phase 4,
 * Block F).
 *
 * Extends the existing Playwright harness rather than replacing it: same
 * config, same tolerance, same never-auto-update policy, through a
 * `?usage=<scenario>` mode that follows the fetch-stub pattern the
 * `?internal_render=1` and `?notifications=` modes already established. **No
 * report-renderer or notification snapshot is touched by this file** — these
 * use the "usage-" prefix and cannot collide with an existing golden.
 *
 * These cover what jsdom structurally cannot: a bar's *width* (clamped at 100%
 * while the number beside it reads 123%), the *absence* of a bar where there is
 * no denominator, the tone of each verification state, and the two-column
 * layout collapsing to one.
 *
 * Determinism: every fixture timestamp is fixed and far in the past, and the
 * timezone is pinned to UTC below so the rendered date is identical on every
 * machine.
 */

test.use({ timezoneId: "UTC" });

const HOST = "#usage-host";

test("healthy — storage and users under their limits, side by side", async ({ page }) => {
    await page.goto("/?usage=healthy");
    await expect(page.getByText("Sin incidencias detectadas")).toBeVisible();
    await expect(page.locator(HOST)).toHaveScreenshot("usage-healthy.png");
});

test("uninitialized — no fabricated 0 B, no bar, a verify action instead", async ({ page }) => {
    await page.goto("/?usage=uninitialized");
    await expect(page.getByText("Uso aún no calculado")).toBeVisible();
    // The rule this whole state exists for.
    await expect(page.getByText("0 B")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(1); // the users bar only
    await expect(page.locator(HOST)).toHaveScreenshot("usage-uninitialized.png");
});

test("unlimited — absolute numbers and no denominator anywhere", async ({ page }) => {
    await page.goto("/?usage=unlimited");
    await expect(page.getByText("127.9 MB utilizados")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.locator(HOST)).toHaveScreenshot("usage-unlimited.png");
});

test("over limit — the number is not clamped, only the bar is", async ({ page }) => {
    await page.goto("/?usage=over-limit");
    await expect(page.getByText("123%")).toBeVisible();
    await expect(page.getByText("120%")).toBeVisible();

    // The geometry stops at the track while the value stays honest.
    const bars = page.getByRole("progressbar");
    for (const bar of await bars.all()) {
        const fillWidth = await bar.locator("> div").evaluate((el) => el.style.width);
        expect(fillWidth).toBe("100%");
    }

    await expect(page.locator(HOST)).toHaveScreenshot("usage-over-limit.png");
});

test("running — a pending verification with the action disabled", async ({ page }) => {
    await page.goto("/?usage=running");
    await expect(page.getByRole("button", { name: /Verificando/ })).toBeDisabled();
    await expect(page.locator(HOST)).toHaveScreenshot("usage-running.png", {
        // The spinner is a CSS animation; the shared config disables animations,
        // and this keeps the remaining tolerance sane.
        maxDiffPixelRatio: 0.05,
    });
});

test("accounting only — informational, never green", async ({ page }) => {
    await page.goto("/?usage=accounting-only");
    await expect(page.getByText(/Uso verificado/)).toBeVisible();
    await expect(page.getByText("Sin incidencias detectadas")).toHaveCount(0);
    await expect(page.locator(HOST)).toHaveScreenshot("usage-accounting-only.png");
});

test("failed — the sanitized cause, never the backend code", async ({ page }) => {
    await page.goto("/?usage=failed");
    await expect(page.getByText("No fue posible acceder al almacenamiento.")).toBeVisible();
    await expect(page.getByText("s3_access_denied")).toHaveCount(0);
    await expect(page.locator(HOST)).toHaveScreenshot("usage-failed.png");
});

test("load failure — a recoverable page-level error, not zeros", async ({ page }) => {
    await page.goto("/?usage=error");
    await expect(page.getByText("No fue posible cargar la información de uso.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
    await expect(page.locator(HOST)).toHaveScreenshot("usage-error.png");
});

test("loading — a skeleton rather than a flash of fake zeros", async ({ page }) => {
    await page.goto("/?usage=loading");
    await expect(page.locator(".ant-skeleton").first()).toBeVisible();
    await expect(page.getByText("0%")).toHaveCount(0);
    await expect(page.locator(HOST)).toHaveScreenshot("usage-loading.png", {
        maxDiffPixelRatio: 0.05,
    });
});

test("narrow viewport — the two cards stack into one column", async ({ page }) => {
    // 560px of layout width: below the point where two 300px-minimum cards fit,
    // so the grid must collapse rather than squeeze or scroll sideways.
    await page.setViewportSize({ width: 560, height: 900 });
    await page.goto("/?usage=over-limit");
    await expect(page.getByText("123%")).toBeVisible();

    const columns = await page
        .locator(".usage-grid-2")
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(columns.split(" ").length).toBe(1);

    // The findings breakdown must stay readable without horizontal scrolling.
    const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);

    await expect(page.locator(HOST)).toHaveScreenshot("usage-narrow.png");
});
