/**
 * Real-browser regression — Céluma 1.4 (#21): HEIC sample images.
 *
 * Synthetic fixtures only (fixtures/generate_heic_fixtures.py): h1 is a portrait
 * capture (EXIF orientation 6, embedded thumbnail), h2 a plain landscape image,
 * plus a truncated file and a two-image "burst". Covers
 *   1. the sample-detail upload path: conversion, listing, orientation, rejection
 *      messages in Spanish, nothing stored for rejected files;
 *   2. the report editor's gallery upload path, selection with the existing
 *      figure order/captions, save/reload, local print;
 *   3. the officially generated PDF (written to CELUMA_HEIC_OUT for pixel analysis).
 * The backend must run against a disposable database and storage.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_PASSWORD, REVIEWER_PASSWORD, api, figureLab, API_BASE, type FigureLab } from "./fixtures/report_figures_lab";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const H1 = path.join(FIX, "synthetic-heic-h1.heic");
const H2 = path.join(FIX, "synthetic-heic-h2.heic");
const CORRUPT = path.join(FIX, "synthetic-heic-corrupt.heic");
const BURST = path.join(FIX, "synthetic-heic-burst.heic");
const OUT_DIR = process.env.CELUMA_HEIC_OUT;

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

type Listed = { id: string; urls: { processed: string; thumbnail: string } };
async function listImages(request: import("@playwright/test").APIRequestContext, lab: FigureLab): Promise<Listed[]> {
    const res = await api<{ images: Listed[] }>(request, "GET", `/api/v1/laboratory/samples/${lab.sampleId}/images`, { token: lab.admin });
    return res.images;
}

/** Dimensions and magic bytes of a stored rendition fetched through its real URL. */
async function probe(request: import("@playwright/test").APIRequestContext, url: string) {
    const res = await request.get(url);
    expect(res.ok()).toBeTruthy();
    const body = await res.body();
    return { jpeg: body[0] === 0xff && body[1] === 0xd8, bytes: body.length, type: res.headers()["content-type"] };
}

test.describe("HEIC sample images (1.4 #21)", () => {
    let lab: FigureLab;
    test.beforeAll(async ({ playwright }) => {
        lab = await figureLab(await playwright.request.newContext(), ["A"]);
    });

    test("sample page: converts HEIC, rejects corrupt/burst with a Spanish reason and stores nothing for them", async ({ page, request }) => {
        test.setTimeout(120_000);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/samples/${lab.sampleId}`);
        await page.getByText("Galería de Imágenes").first().click();
        const input = page.locator('input[type="file"]').first();
        await expect(input).toBeAttached({ timeout: 30_000 });
        expect(await input.getAttribute("accept")).toContain(".heic");

        await input.setInputFiles(H1);
        await expect(page.getByText(/"synthetic-heic-h1\.heic" subida correctamente/)).toBeVisible({ timeout: 30_000 });
        expect(await listImages(request, lab)).toHaveLength(2); // seed PNG + H1

        // Rejections: the server's Spanish detail, not a status code or JSON.
        await input.setInputFiles(CORRUPT);
        await expect(page.getByText(/dañado o incompleto/)).toBeVisible({ timeout: 30_000 });
        await input.setInputFiles(BURST);
        await expect(page.getByText(/ráfaga o secuencia/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/\{"detail"/)).toHaveCount(0);
        expect(await listImages(request, lab)).toHaveLength(2);

        // The converted image really renders in the gallery (JPEG served, portrait after orientation).
        const imgs = await listImages(request, lab);
        const h1 = imgs[imgs.length - 1];
        for (const url of [h1.urls.processed, h1.urls.thumbnail]) {
            const p = await probe(request, url);
            expect(p.jpeg, url).toBe(true);
            expect(p.type).toContain("image/jpeg");
        }
        await expect.poll(() => page.locator("img").evaluateAll((els) =>
            els.some((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalHeight > (e as HTMLImageElement).naturalWidth && (e as HTMLImageElement).naturalWidth > 100),
        ), { timeout: 20_000 }).toBe(true);
        if (OUT_DIR) {
            mkdirSync(OUT_DIR, { recursive: true });
            await page.screenshot({ path: `${OUT_DIR}/sample-detail-gallery.png`, fullPage: true });
        }
    });

    test("report editor: upload HEIC in the picker, select with existing figures, order/captions, save, print, official PDF", async ({ page, request }) => {
        test.setTimeout(300_000);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        await page.goto(`/reports/${lab.reportId}`);
        const input = page.locator('input[type="file"]').first();
        await expect(input).toBeAttached({ timeout: 30_000 });
        expect(await input.getAttribute("accept")).toContain(".heic");
        await input.setInputFiles(H2);
        await expect(page.getByText(/subida correctamente/).first()).toBeVisible({ timeout: 30_000 });
        await input.setInputFiles(CORRUPT);
        await expect(page.getByText(/dañado o incompleto/)).toBeVisible({ timeout: 30_000 });
        expect(await listImages(request, lab)).toHaveLength(3); // A, H1, H2

        // Select all three gallery images: A (PNG), H1, H2.
        const cards = page.locator('div[role="button"]');
        await expect(cards.nth(2)).toBeVisible({ timeout: 30_000 });
        for (const i of [0, 1, 2]) await cards.nth(i).click();
        await expect(page.locator('[data-testid^="report-figure-"]')).toHaveCount(3);
        const captions = page.getByPlaceholder("Nota para esta imagen");
        for (const [i, text] of ["Cap A", "Cap H1", "Cap H2"].entries()) {
            await captions.nth(i).click();
            await page.keyboard.type(text);
        }
        // Existing ordering still works with a converted image: move H2 to the top.
        await page.getByRole("button", { name: "Subir Figura 3" }).click();
        await page.getByRole("button", { name: "Subir Figura 2" }).click();
        const order = await page.locator('[data-testid^="report-figure-"]').evaluateAll((els) =>
            els.map((el) => (el.querySelector("textarea") as HTMLTextAreaElement).value));
        expect(order).toEqual(["Cap H2", "Cap A", "Cap H1"]);

        await page.getByTestId("report-save-top").click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });
        await page.goto(`/reports/${lab.reportId}`);
        await expect(page.locator('[data-testid^="report-figure-"]').first()).toBeVisible({ timeout: 30_000 });
        expect(await page.locator('[data-testid^="report-figure-"] textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value)))
            .toEqual(["Cap H2", "Cap A", "Cap H1"]);
        await expect.poll(() => page.locator('[data-testid^="report-figure-"] img').evaluateAll(
            (els) => els.length === 3 && els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0),
        ), { timeout: 20_000 }).toBe(true);
        await expect.poll(() => page.locator(".ant-card", { hasText: "Vista previa" }).locator("img").evaluateAll(
            (els) => els.filter((e) => !e.closest("[aria-hidden]")).length >= 3
                && els.filter((e) => !e.closest("[aria-hidden]")).every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0),
        ), { timeout: 20_000 }).toBe(true);
        if (OUT_DIR) await page.screenshot({ path: `${OUT_DIR}/report-editor-figures.png`, fullPage: true });

        // Review → sign → official PDF.
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/submit`, { data: {}, token: lab.admin });
        await api(request, "POST", `/api/v1/reports/${lab.reportId}/approve`, { data: {}, token: lab.reviewerToken });
        const rev = await (await page.context().browser()!.newContext()).newPage();
        await login(rev, lab.reviewerEmail, REVIEWER_PASSWORD);
        // Local print copy: capture the iframe's images before window.print runs.
        await rev.addInitScript(() => {
            (window as unknown as { __printed: Array<[string, number]> }).__printed = [];
            setInterval(() => {
                const f = document.querySelector('iframe[data-celuma-local-print]') as HTMLIFrameElement | null;
                const imgs = f?.contentDocument?.querySelectorAll("img");
                if (imgs && imgs.length) (window as unknown as { __printed: Array<[string, number]> }).__printed =
                    Array.from(imgs).map((i) => [i.getAttribute("src") ?? "", (i as HTMLImageElement).naturalWidth]);
            }, 20);
        });
        await rev.goto(`/reports/${lab.reportId}`);
        await expect(rev.getByRole("button", { name: "Firmar y publicar" })).toBeVisible({ timeout: 30_000 });
        await rev.getByTestId("print-local-copy").click();
        await expect.poll(async () => {
            const printed = await rev.evaluate(() => (window as unknown as { __printed: Array<[string, number]> }).__printed);
            return printed.filter(([src]) => /\/(synthetic-heic-h2|A|synthetic-heic-h1)_[0-9a-f]+\.jpg/.test(src))
                .map(([src, w]) => [/\/(synthetic-heic-h2|A|synthetic-heic-h1)_/.exec(src)![1], w > 0]);
        }, { timeout: 20_000 }).toEqual([["synthetic-heic-h2", true], ["A", true], ["synthetic-heic-h1", true]]);
        await expect.poll(() => rev.locator(".ant-card", { hasText: "Vista previa" }).locator("img").evaluateAll(
            (els) => els.filter((e) => !e.closest("[aria-hidden]")).length >= 3 && els.every((e) => (e as HTMLImageElement).complete),
        ), { timeout: 20_000 }).toBe(true);
        await rev.getByRole("button", { name: "Firmar y publicar" }).click();
        const dialog = rev.getByRole("dialog");
        await dialog.getByTestId("password-confirmation-input").fill(REVIEWER_PASSWORD);
        await dialog.getByTestId("password-confirmation-submit").click();
        await expect(rev.getByRole("button", { name: "Descargar PDF oficial" })).toBeVisible({ timeout: 90_000 });
        const delivered = await api<{ version_no: number; pdf_url: string }>(request, "GET", `/api/v1/reports/${lab.reportId}/pdf`, { token: lab.admin });
        const pdf = await (await request.get(delivered.pdf_url)).body();
        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        if (OUT_DIR) {
            writeFileSync(`${OUT_DIR}/official-v${delivered.version_no}.pdf`, pdf);
            writeFileSync(`${OUT_DIR}/expected.json`, JSON.stringify({
                order: ["H2", "A", "H1"], captions: ["Cap H2", "Cap A", "Cap H1"], sha256: createHash("sha256").update(pdf).digest("hex"),
            }));
            await rev.screenshot({ path: `${OUT_DIR}/report-signed.png`, fullPage: true });
        }
        void API_BASE;
    });
});
