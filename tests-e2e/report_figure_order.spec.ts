/**
 * Real-browser regression — Céluma 1.4 (#18): reordering the figures selected
 * in a report. Uses synthetic images that are labelled A, B, C, D (the label is
 * drawn into the picture and is part of the stored object key) and distinct
 * captions, so every assertion identifies a figure by what it IS, not by its
 * position:
 *
 *   1. up/down controls, boundaries, stable focus, caption/image association,
 *      editing after a move, save + reload (also from a second session),
 *      add/remove keeping the remaining relative order, preview parity;
 *   2. the same stored order in the local print copy and in the officially
 *      generated PDF (written to CELUMA_FIGURES_OUT for pixel/text analysis);
 *   3. an unsigned amendment may be reordered while the signed source and the
 *      delivered PDF stay byte-identical.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ADMIN_PASSWORD, REVIEWER_PASSWORD, api, figureLab, selectAllGalleryImages, API_BASE, type FigureLab } from "./fixtures/report_figures_lab";

const OUT_DIR = process.env.CELUMA_FIGURES_OUT;

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

const labelOf = (src: string | null) => /\/([A-Z])_[0-9a-f]+\.jpg/.exec(src ?? "")?.[1] ?? "?";

/** The editor's figure cards as [image label, caption] in screen order. */
async function cards(page: Page): Promise<Array<[string, string]>> {
    return page.locator('[data-testid^="report-figure-"]').evaluateAll((els) =>
        els.map((el) => {
            const src = el.querySelector("img")?.getAttribute("src") ?? "";
            const label = /\/([A-Z])_[0-9a-f]+\.jpg/.exec(src)?.[1] ?? "?";
            return [label, (el.querySelector("textarea") as HTMLTextAreaElement).value] as [string, string];
        }),
    );
}

/** Figure labels as rendered by the shared renderer in the live preview. */
async function previewLabels(page: Page): Promise<string[]> {
    const srcs = await page.locator(".ant-card", { hasText: "Vista previa" }).locator("img").evaluateAll(
        // The renderer keeps an aria-hidden measuring copy of the content; only the visible pages count.
        (els) => els.filter((e) => !e.closest("[aria-hidden]")).map((e) => e.getAttribute("src")),
    );
    return srcs.map(labelOf).filter((l) => l !== "?");
}

async function activeLabel(page: Page) {
    return page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
}

async function saveAndReopen(page: Page, reportId: string) {
    await page.getByTestId("report-save-top").click();
    await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });
    await page.goto(`/reports/${reportId}`);
    await expect(page.locator('[data-testid^="report-figure-"]').first()).toBeVisible({ timeout: 30_000 });
}

async function storedImages(request: import("@playwright/test").APIRequestContext, lab: FigureLab) {
    const full = await api<{ report: { sections?: Record<string, { content?: Array<{ id: string; url: string; caption: string }> }> } & Record<string, unknown> }>(
        request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin },
    );
    const text = JSON.stringify(full);
    const m = /"figuras":\{[^{}]*"content":(\[[^\]]*\])/.exec(text);
    return (m ? JSON.parse(m[1]) : []) as Array<{ id: string; url: string; caption: string }>;
}

test.describe("Reordering selected report figures (1.4 #18)", () => {
    let lab: FigureLab;

    test.beforeAll(async ({ playwright }) => {
        lab = await figureLab(await playwright.request.newContext(), ["A", "B", "C", "D"]);
    });

    test("move, boundaries, focus, identity, save/reload, add/remove and preview", async ({ page, browser, request }) => {
        test.setTimeout(240_000);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);

        // Select A, B, C (the gallery order is not touched by anything below).
        await selectAllGalleryImages(page, 3);
        await expect(page.locator('[data-testid^="report-figure-"]')).toHaveCount(3);
        const captions = page.getByPlaceholder("Nota para esta imagen");
        for (const [i, text] of ["Cap A", "Cap B", "Cap C"].entries()) {
            await captions.nth(i).click();
            await page.keyboard.type(text);
        }
        expect(await cards(page)).toEqual([["A", "Cap A"], ["B", "Cap B"], ["C", "Cap C"]]);

        // Boundaries: the first cannot go up, the last cannot go down.
        await expect(page.getByRole("button", { name: "Subir Figura 1" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Bajar Figura 3" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Bajar Figura 1" })).toBeEnabled();

        // Move A down: image and caption travel together; focus follows the moved figure.
        await page.getByRole("button", { name: "Bajar Figura 1" }).focus();
        await page.keyboard.press("Enter");
        expect(await cards(page)).toEqual([["B", "Cap B"], ["A", "Cap A"], ["C", "Cap C"]]);
        expect(await activeLabel(page)).toBe("Bajar Figura 2");
        await expect(page.getByRole("heading", { name: "Figura 2" }).or(page.getByText("Figura 2", { exact: true })).first()).toBeVisible();

        // Move C up with the keyboard (Space) twice: it reaches the top, focus falls to its enabled control.
        await page.getByRole("button", { name: "Subir Figura 3" }).focus();
        await page.keyboard.press("Space");
        expect(await activeLabel(page)).toBe("Subir Figura 2");
        await page.keyboard.press("Space");
        expect(await cards(page)).toEqual([["C", "Cap C"], ["B", "Cap B"], ["A", "Cap A"]]);
        expect(await activeLabel(page)).toBe("Bajar Figura 1");
        await expect(page.getByRole("button", { name: "Subir Figura 1" })).toBeDisabled();

        // Editing in the middle after a move lands on the right image and keeps the caret.
        const second = page.getByPlaceholder("Nota para esta imagen").nth(1);
        await second.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(3, 3); });
        await page.keyboard.type("Z");
        const sel = await second.evaluate((el: HTMLTextAreaElement) => ({ v: el.value, s: el.selectionStart }));
        expect(sel).toEqual({ v: "CapZ B", s: 4 });
        expect(await cards(page)).toEqual([["C", "Cap C"], ["B", "CapZ B"], ["A", "Cap A"]]);

        // Preview follows the same order.
        await expect.poll(() => previewLabels(page), { timeout: 15_000 }).toEqual(["C", "B", "A"]);

        // Remove the middle one: the remaining relative order is preserved; renumbering is coherent.
        await page.getByRole("button", { name: "Quitar Figura 2" }).click();
        expect(await cards(page)).toEqual([["C", "Cap C"], ["A", "Cap A"]]);
        // Add D: appended, the rest untouched.
        await page.locator('div[role="button"]').nth(3).click();
        expect((await cards(page)).map((c) => c[0])).toEqual(["C", "A", "D"]);
        await page.getByRole("button", { name: "Subir Figura 3" }).click();
        expect((await cards(page)).map((c) => c[0])).toEqual(["C", "D", "A"]);

        // Persist and reopen: same order, captions attached to the same images.
        await saveAndReopen(page, lab.reportId);
        expect(await cards(page)).toEqual([["C", "Cap C"], ["D", ""], ["A", "Cap A"]]);
        // The figures are real pictures (not broken placeholders) in the editor cards and in the preview.
        await expect.poll(() => page.locator('[data-testid^="report-figure-"] img').evaluateAll(
            (els) => els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0),
        )).toBe(true);
        await expect.poll(() => page.locator(".ant-card", { hasText: "Vista previa" }).locator("img").evaluateAll(
            (els) => els.filter((e) => !e.closest("[aria-hidden]")).every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0),
        )).toBe(true);
        const stored = await storedImages(request, lab);
        expect(stored.map((s) => labelOf(s.url))).toEqual(["C", "D", "A"]);
        expect(stored.map((s) => s.caption)).toEqual(["Cap C", "", "Cap A"]);
        await expect.poll(() => previewLabels(page), { timeout: 15_000 }).toEqual(["C", "D", "A"]);

        // Another browser session sees the same order.
        const other = await (await browser.newContext()).newPage();
        await login(other, lab.adminEmail, ADMIN_PASSWORD);
        await other.goto(`/reports/${lab.reportId}`);
        await expect(other.locator('[data-testid^="report-figure-"]').first()).toBeVisible({ timeout: 30_000 });
        expect(await cards(other)).toEqual([["C", "Cap C"], ["D", ""], ["A", "Cap A"]]);

        // The sample gallery itself (not the report) is untouched: all four images are still there in upload order.
        const gallery = JSON.stringify(await api(request, "GET", `/api/v1/laboratory/samples/${lab.sampleId}/images`, { token: lab.admin }));
        const inGallery = new Set(Array.from(gallery.matchAll(/\/([A-D])_[0-9a-f]+\.jpg/g)).map((m) => m[1]));
        expect([...inGallery].sort()).toEqual(["A", "B", "C", "D"]);
    });

    test("local print, official PDF, and an unsigned amendment all follow the stored order", async ({ page, browser, request }) => {
        test.setTimeout(300_000);
        // Start from the order persisted by the previous test: C, D, A.
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });

        // --- local print copy of the stored order (iframe content captured before window.print) ---
        await login(page, lab.reviewerEmail, REVIEWER_PASSWORD);
        await page.addInitScript(() => {
            (window as unknown as { __printed: string[] }).__printed = [];
            setInterval(() => {
                const f = document.querySelector('iframe[data-celuma-local-print]') as HTMLIFrameElement | null;
                const imgs = f?.contentDocument?.querySelectorAll("img");
                if (imgs && imgs.length) (window as unknown as { __printed: string[] }).__printed = Array.from(imgs).map((i) => i.getAttribute("src") ?? "");
            }, 20);
        });
        await page.goto(`/reports/${lab.reportId}`);
        await expect(page.getByTestId("print-local-copy")).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => previewLabels(page), { timeout: 20_000 }).toEqual(["C", "D", "A"]);
        await page.getByTestId("print-local-copy").click();
        await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed)).map(labelOf).filter((l) => l !== "?"), { timeout: 20_000 }).toEqual(["C", "D", "A"]);

        // Reviewer cannot reorder or edit figures once the report is not DRAFT.
        await expect(page.getByRole("button", { name: /^(Subir|Bajar|Quitar) Figura/ })).toHaveCount(0);
        await expect(page.getByPlaceholder("Nota para esta imagen").first()).toBeDisabled();

        // --- sign and publish: official PDF ---
        await page.getByRole("button", { name: "Firmar y publicar" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByTestId("password-confirmation-input").fill(REVIEWER_PASSWORD);
        await dialog.getByTestId("password-confirmation-submit").click();
        await expect(page.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 90_000 });
        const delivered = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        const pdf1 = await (await request.get(delivered.pdf_url)).body();
        const sha1 = createHash("sha256").update(pdf1).digest("hex");
        if (OUT_DIR) {
            mkdirSync(OUT_DIR, { recursive: true });
            writeFileSync(`${OUT_DIR}/official-v${delivered.version_no}.pdf`, pdf1);
            writeFileSync(`${OUT_DIR}/expected.json`, JSON.stringify({ order: ["C", "D", "A"], captions: ["Cap C", "", "Cap A"], hue: { A: 0, B: 70, C: 140, D: 210 } }));
        }
        const signedStored = await storedImages(request, lab);
        expect(signedStored.map((s) => labelOf(s.url))).toEqual(["C", "D", "A"]);

        // --- unsigned amendment: reorder allowed, signed emission untouched ---
        await page.getByTestId("amend-report").click();
        const amendDialog = page.getByRole("dialog");
        await amendDialog.getByRole("combobox").click();
        await page.getByText("Complemento (p. ej., IHC)", { exact: true }).click();
        await amendDialog.getByTestId("password-confirmation-reason").fill("Reordenar figuras");
        await amendDialog.getByTestId("password-confirmation-input").fill(REVIEWER_PASSWORD);
        await amendDialog.getByTestId("password-confirmation-submit").click();
        await expect(page.getByTestId("amendment-in-progress")).toBeVisible({ timeout: 30_000 });

        const author = await (await browser.newContext()).newPage();
        await login(author, lab.adminEmail, ADMIN_PASSWORD);
        await author.goto(`/reports/${lab.reportId}`);
        await expect(author.getByTestId("amendment-change-note")).toBeVisible({ timeout: 30_000 });
        await author.getByRole("button", { name: "Bajar Figura 1" }).click();
        expect((await cards(author)).map((c) => c[0])).toEqual(["D", "C", "A"]);
        await author.getByTestId("amendment-change-note").fill("Se reordenan las figuras.");
        await author.getByTestId("report-save-top").click();
        await expect(author).toHaveURL(/\/orders\//, { timeout: 30_000 });

        // The delivered emission is still version 1, same bytes; the signed source order is unchanged.
        const stillDelivered = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        expect(stillDelivered.version_no).toBe(delivered.version_no);
        const pdfAgain = await (await request.get(stillDelivered.pdf_url)).body();
        expect(createHash("sha256").update(pdfAgain).digest("hex")).toBe(sha1);
        const v1 = await api<Record<string, unknown>>(request, "GET", `/api/v1/reports/${lab.reportId}/${delivered.version_no}`, { token: lab.admin });
        const v1text = JSON.stringify(v1);
        const pos = (l: string) => v1text.search(new RegExp(`/${l}_[0-9a-f]+\\.jpg`));
        expect(pos("C")).toBeLessThan(pos("D"));
        expect(pos("D")).toBeLessThan(pos("A"));
        void API_BASE;
    });
});
