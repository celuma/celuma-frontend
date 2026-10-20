/**
 * Real-browser regression — Céluma 1.4 (#20): the caption caret stays where
 * the user is editing. jsdom cannot prove this (it has no real selection or
 * layout engine), so the assertions read the live textarea's selection range.
 *
 * Keeps the contract unchanged: 25 characters, single line.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN_PASSWORD, figureLab, selectAllGalleryImages, type FigureLab } from "./fixtures/report_figures_lab";

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

async function state(box: Locator) {
    return box.evaluate((el: HTMLTextAreaElement) => ({
        value: el.value, start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el,
    }));
}
async function place(box: Locator, start: number, end = start) {
    await box.evaluate((el: HTMLTextAreaElement, [s, e]) => { el.focus(); el.setSelectionRange(s, e); }, [start, end]);
}

test.describe("Caption caret stability (1.4 #20)", () => {
    let lab: FigureLab;
    test.beforeAll(async ({ playwright }) => {
        const request = await playwright.request.newContext();
        lab = await figureLab(request, ["A", "B"]);
    });

    test("typing, deleting, pasting and replacing in the middle keep focus and the caret", async ({ page, context }) => {
        test.setTimeout(120_000);
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        await selectAllGalleryImages(page, 2);

        const first = page.getByPlaceholder("Nota para esta imagen").nth(0);
        const second = page.getByPlaceholder("Nota para esta imagen").nth(1);
        await expect(first).toBeVisible({ timeout: 30_000 });

        await first.click();
        await page.keyboard.type("Hallazgo base");
        expect(await state(first)).toMatchObject({ value: "Hallazgo base", start: 13, focused: true });

        // Insert in the middle: the caret must follow the typed text, not jump to the end.
        await place(first, 3);
        await page.keyboard.type("XY");
        expect(await state(first)).toEqual({ value: "HalXYlazgo base", start: 5, end: 5, focused: true });

        // Backspace and Delete in the middle.
        await page.keyboard.press("Backspace");
        expect(await state(first)).toEqual({ value: "HalXlazgo base", start: 4, end: 4, focused: true });
        await page.keyboard.press("Delete");
        expect(await state(first)).toEqual({ value: "HalXazgo base", start: 4, end: 4, focused: true });

        // Selection replaced by typing.
        await place(first, 0, 3);
        await page.keyboard.type("Z");
        expect(await state(first)).toEqual({ value: "ZXazgo base", start: 1, end: 1, focused: true });

        // Paste at the beginning.
        await page.evaluate(() => navigator.clipboard.writeText("PEG"));
        await place(first, 0);
        await page.keyboard.press("ControlOrMeta+V");
        expect(await state(first)).toEqual({ value: "PEGZXazgo base", start: 3, end: 3, focused: true });

        // Accents in the middle.
        await place(first, 3);
        await page.keyboard.type("áñ");
        expect(await state(first)).toEqual({ value: "PEGáñZXazgo base", start: 5, end: 5, focused: true });

        // The other caption is untouched.
        expect((await state(second)).value).toBe("");
    });

    test("the 25-character, single-line contract is unchanged", async ({ page }) => {
        test.setTimeout(120_000);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        await selectAllGalleryImages(page, 1);
        const box = page.getByPlaceholder("Nota para esta imagen").nth(0);
        await expect(box).toBeVisible({ timeout: 30_000 });

        await box.fill("");
        await box.click();
        await page.keyboard.type("1234567890123456789012345");
        expect((await state(box)).value).toHaveLength(25);
        await page.keyboard.type("EXTRA");
        expect((await state(box)).value).toBe("1234567890123456789012345");

        // Enter inserts nothing.
        await place(box, 3);
        await box.press("Backspace");
        await page.keyboard.press("Enter");
        expect((await state(box)).value).not.toContain("\n");
        await expect(page.getByText("24/25")).toBeVisible();
    });

    test("a pasted line break is flattened without moving the caret (middle paste, selection replacement, truncation)", async ({ page, context }) => {
        test.setTimeout(120_000);
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        await selectAllGalleryImages(page, 1);
        const box = page.getByPlaceholder("Nota para esta imagen").nth(0);
        await expect(box).toBeVisible({ timeout: 30_000 });
        const paste = async (text: string) => {
            await page.evaluate((t) => navigator.clipboard.writeText(t), text);
            await page.keyboard.press("ControlOrMeta+V");
        };

        await box.fill("Cap A");
        await place(box, 3);
        await paste("X\nY");
        expect(await state(box)).toEqual({ value: "CapX Y A", start: 6, end: 6, focused: true });

        // Selection replacement by a pasted multi-line text.
        await place(box, 0, 3);
        await paste("P\nQ");
        expect(await state(box)).toEqual({ value: "P QX Y A", start: 3, end: 3, focused: true });

        // Truncated middle paste: the 25 cap holds, single line, caret after the accepted text.
        await box.fill("0123456789012345678901");
        await place(box, 2);
        await paste("a\nbcdefgh");
        const t = await state(box);
        expect(t.value).toHaveLength(25);
        expect(t.value).not.toContain("\n");
        expect(t.value.startsWith("01a b2")).toBe(true); // the browser keeps only "a\nb" of the paste (maxLength)
        expect([t.start, t.end, t.focused]).toEqual([5, 5, true]);
        // Typing continues exactly at the caret.
        await page.keyboard.press("Backspace");
        expect((await state(box)).value).toHaveLength(24);
    });
});
