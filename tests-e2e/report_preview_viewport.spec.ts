/**
 * Real-browser regression — Céluma 1.4 (#47): editing a figure caption keeps
 * the report preview where the user is reading.
 *
 * A multipage V2 report (long findings + twelve figures) is opened at a real
 * desktop viewport (two-column editor: the preview scrolls inside its card and
 * the page scrolls too). The preview is scrolled to a known figure and captions
 * are edited — typing, Backspace, Delete, paste, accents and selection
 * replacement at the start and in the middle — with a settled refresh after
 * each step. Every animation frame records both scroll positions and where
 * the anchored figure sits, so a jump between two settled refreshes cannot
 * hide between samples. jsdom has no layout, so only a real browser can show
 * this. Synthetic data only.
 */
import { test, expect, type APIRequestContext, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { ADMIN_PASSWORD, api, figureLab, type FigureLab } from "./fixtures/report_figures_lab";

const OUT_DIR = process.env.CELUMA_VIEWPORT_OUT || "";
const LABELS = "ABCDEFGHIJKL".split("");
const FILLER = "Texto clínico sintético sin relevancia real para ocupar varias páginas del reporte. ".repeat(7);
const SCROLLER = ".re-preview-col > .ant-card > .ant-card-body";
/** Tolerance for sub-pixel rounding, in CSS px. */
const TOLERANCE = 2;

type Figure = { id: string; url: string; caption: string };
type Body = { base: Record<string, unknown>; base_order: string[]; section_order: string[]; sections: Record<string, { content?: unknown }> };
type Sample = { t: number; scrollTop: number; windowY: number; pages: number; figureTop: number | null; figureScreenTop: number | null; stale: boolean };

function save(name: string, data: unknown) {
    if (!OUT_DIR) return;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}/${name}`, typeof data === "string" ? data : JSON.stringify(data, null, 1));
}

async function login(page: Page, email: string, password: string) {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Usuario o email" }).fill(email);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 15_000 });
}

async function storedFigures(request: APIRequestContext, lab: FigureLab): Promise<Figure[]> {
    const full = await api<{ report: { report: Body } }>(request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin });
    return (full.report.report.sections.figuras?.content ?? []) as Figure[];
}

/** Stores long findings and twelve figures (upload order A…L, empty captions) as the DRAFT's content. */
async function multipageReport(request: APIRequestContext, lab: FigureLab): Promise<Figure[]> {
    const full = await api<{ report: { report: Body } }>(request, "GET", `/api/v1/reports/${lab.reportId}/full`, { token: lab.admin });
    // The listing has no guaranteed order on every backend; the upload order is the creation order.
    const gallery = await api<{ images: Array<{ id: string; created_at: string; urls: { processed?: string } }> }>(
        request, "GET", `/api/v1/laboratory/samples/${lab.sampleId}/images`, { token: lab.admin },
    );
    const figures = [...gallery.images]
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map((img) => ({ id: img.id, url: img.urls.processed!, caption: "" }));
    expect(figures).toHaveLength(LABELS.length);
    const body = full.report.report;
    await api(request, "POST", `/api/v1/reports/${lab.reportId}/new_version`, {
        token: lab.admin,
        data: {
            tenant_id: lab.tenantId, branch_id: lab.branchId, order_id: lab.orderId, title: "Reporte sintético multipágina",
            report: {
                base: body.base, base_order: body.base_order, section_order: body.section_order,
                sections: {
                    hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: Array.from({ length: 14 }, (_, i) => `<p>Párrafo ${i + 1}. ${FILLER}</p>`).join("") },
                    figuras: { is_visible: true, label: "Imágenes", type: "images", content: figures },
                },
            },
        },
    });
    return figures;
}

async function settled(page: Page) {
    await expect(page.locator(".re-preview-col")).not.toHaveAttribute("data-preview-stale", "true", { timeout: 15_000 });
    // The settled preview repaginates in the next commit; leave it a few frames.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(150);
}

async function openEditor(page: Page, lab: FigureLab) {
    await page.goto(`/reports/${lab.reportId}`);
    const scroller = page.locator(SCROLLER);
    await expect.poll(() => scroller.locator("[data-page-region='body']").count(), { timeout: 30_000 }).toBeGreaterThan(2);
    await expect.poll(
        () => scroller.locator("[data-page-region='body'] img[data-figure-image]").evaluateAll(
            (imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length,
        ),
        { timeout: 30_000 },
    ).toBe(LABELS.length);
    // Every image of the page (sample gallery, figure cards) loaded: nothing above can still grow.
    await expect.poll(() => page.locator("img").evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete)), { timeout: 30_000 }).toBe(true);
    await settled(page);
    return scroller;
}

/** Scrolls the preview so that figure `n` sits `offset` px below the preview's visible top. */
async function scrollPreviewToFigure(page: Page, n: number, offset: number) {
    await page.evaluate(([sel, fig, off]) => {
        const scroller = document.querySelector(sel as string) as HTMLElement;
        const figure = scroller.querySelector(`[data-page-region='body'] [data-figure="${fig}"]`) as HTMLElement;
        scroller.scrollTop += figure.getBoundingClientRect().top - scroller.getBoundingClientRect().top - (off as number);
    }, [SCROLLER, n, offset] as const);
}

/** Records, every animation frame, both scroll positions and where figure `n` sits in the preview viewport. */
async function startRecorder(page: Page, n: number) {
    await page.evaluate(([sel, fig]) => {
        const w = window as unknown as { __vp: Sample[]; __vpStop: boolean };
        w.__vp = [];
        w.__vpStop = false;
        const scroller = document.querySelector(sel as string) as HTMLElement;
        const t0 = performance.now();
        const sample = () => {
            if (w.__vpStop) return;
            const f = scroller.querySelector(`[data-page-region='body'] [data-figure="${fig}"]`) as HTMLElement | null;
            w.__vp.push({
                t: Math.round(performance.now() - t0),
                scrollTop: Math.round(scroller.scrollTop),
                windowY: Math.round(window.scrollY),
                pages: scroller.querySelectorAll("[data-page-region='body']").length,
                figureTop: f ? Math.round(f.getBoundingClientRect().top - scroller.getBoundingClientRect().top) : null,
                figureScreenTop: f ? Math.round(f.getBoundingClientRect().top) : null,
                stale: document.querySelector(".re-preview-col")?.getAttribute("data-preview-stale") === "true",
            });
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    }, [SCROLLER, n] as const);
}

async function stopRecorder(page: Page): Promise<Sample[]> {
    return page.evaluate(() => {
        const w = window as unknown as { __vp: Sample[]; __vpStop: boolean };
        w.__vpStop = true;
        return w.__vp;
    });
}

/** Position of figure `n` inside the preview's scrollable content (changes only when the layout moves it). */
async function figureContentTop(page: Page, n: number) {
    return page.evaluate(([sel, fig]) => {
        const scroller = document.querySelector(sel as string) as HTMLElement;
        const f = scroller.querySelector(`[data-page-region='body'] [data-figure="${fig}"]`) as HTMLElement;
        return Math.round(f.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    }, [SCROLLER, n] as const);
}

async function captionState(box: Locator) {
    return box.evaluate((el: HTMLTextAreaElement) => ({ value: el.value, start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el }));
}
async function place(box: Locator, start: number, end = start) {
    await box.evaluate((el: HTMLTextAreaElement, [s, e]) => { el.focus(); el.setSelectionRange(s, e); }, [start, end]);
}

function spread(values: number[]) {
    return Math.max(...values) - Math.min(...values);
}

function expectSteady(samples: Sample[], label: string) {
    const figureTops = samples.map((s) => s.figureTop);
    expect(samples.some((s) => s.stale), `${label}: a settled refresh happened`).toBe(true);
    expect(figureTops.every((v) => v !== null), `${label}: figure present in every frame`).toBe(true);
    expect(spread(samples.map((s) => s.scrollTop)), `${label}: preview scroll never jumps (any frame)`).toBeLessThanOrEqual(TOLERANCE);
    expect(spread(figureTops as number[]), `${label}: viewed figure stays in place in the preview`).toBeLessThanOrEqual(TOLERANCE);
    // On screen too, so the page's own scroll is covered (raw scrollY may legitimately change when the
    // browser's scroll anchoring compensates for content above; what the reader sees must not move).
    expect(spread(samples.map((s) => s.figureScreenTop!)), `${label}: viewed figure stays in place on screen`).toBeLessThanOrEqual(TOLERANCE);
}

test.describe("Preview viewport while editing captions (1.4 #47)", () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: { width: 1440, height: 900 } });
    let lab: FigureLab;
    let original: Figure[];

    test.beforeAll(async ({ playwright }) => {
        const request = await playwright.request.newContext();
        lab = await figureLab(request, LABELS);
        original = await multipageReport(request, lab);
    });

    test("typing, deleting, pasting, accents and replacing keep the preview on the viewed figure", async ({ page, context, request }) => {
        test.setTimeout(240_000);
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        const scroller = await openEditor(page, lab);

        const box = page.getByLabel("Nota de Figura 5", { exact: true });
        // Fully visible, so typing never makes the browser scroll the caret into view (that is not the defect).
        await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await box.click();
        // Read figure 5 on its page: well inside the multipage preview, not the first page.
        await scrollPreviewToFigure(page, 5, 120);
        const startTop = await scroller.evaluate((el) => el.scrollTop);
        const startWindowY = await page.evaluate(() => window.scrollY);
        expect(startTop).toBeGreaterThan(1000);
        expect(startWindowY, "the page itself is scrolled too").toBeGreaterThan(0);

        const steps: Array<{ step: string; caption: Awaited<ReturnType<typeof captionState>>; samples: Sample[] }> = [];
        const step = async (name: string, act: () => Promise<void>) => {
            await startRecorder(page, 5);
            await act();
            await settled(page);
            const samples = await stopRecorder(page);
            steps.push({ step: name, caption: await captionState(box), samples });
            save("viewport-steps.json", { startTop, startWindowY, steps });
            expectSteady(samples, name);
            return steps.at(-1)!.caption;
        };

        expect(await step("type", () => page.keyboard.type("Corte medio", { delay: 60 })))
            .toEqual({ value: "Corte medio", start: 11, end: 11, focused: true });
        expect(await step("insert-middle", async () => { await place(box, 5); await page.keyboard.type("XY", { delay: 60 }); }))
            .toEqual({ value: "CorteXY medio", start: 7, end: 7, focused: true });
        expect(await step("backspace-delete-middle", async () => { await page.keyboard.press("Backspace"); await page.keyboard.press("Delete"); }))
            .toEqual({ value: "CorteXmedio", start: 6, end: 6, focused: true });
        expect(await step("paste-start", async () => {
            await page.evaluate(() => navigator.clipboard.writeText("PEG "));
            await place(box, 0);
            await page.keyboard.press("ControlOrMeta+V");
        })).toEqual({ value: "PEG CorteXmedio", start: 4, end: 4, focused: true });
        expect(await step("accents-middle", async () => { await place(box, 9); await page.keyboard.type("áñ", { delay: 60 }); }))
            .toEqual({ value: "PEG CorteáñXmedio", start: 11, end: 11, focused: true });
        expect(await step("replace-selection-start", async () => { await place(box, 0, 3); await page.keyboard.type("Z", { delay: 60 }); }))
            .toEqual({ value: "Z CorteáñXmedio", start: 1, end: 1, focused: true });
        const finalCaption = "Z LáminaáñXmedio";
        expect(await step("replace-selection-middle", async () => { await place(box, 2, 7); await page.keyboard.type("Lámina", { delay: 60 }); }))
            .toEqual({ value: finalCaption, start: 8, end: 8, focused: true });

        // The preview still follows the text, on the same figure, at the same place.
        const figure = (n: number) => scroller.locator(`[data-page-region='body'] [data-figure='${n}']`);
        await expect(figure(5)).toContainText(finalCaption);
        for (const n of [4, 6]) await expect(figure(n)).not.toContainText(finalCaption);
        expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - startTop)).toBeLessThanOrEqual(TOLERANCE);
        await page.screenshot({ path: OUT_DIR ? `${OUT_DIR}/after-caption-edits.png` : undefined });

        // The user's own scrolling is respected: the next refresh keeps the NEW place, not the old anchor.
        const previewBox = (await scroller.boundingBox())!;
        await page.mouse.move(previewBox.x + previewBox.width / 2, Math.min(previewBox.y + 300, 800));
        await page.mouse.wheel(0, 700);
        await expect.poll(() => scroller.evaluate((el) => Math.round(el.scrollTop))).toBeGreaterThan(Math.round(startTop) + 400);
        await page.waitForTimeout(300);
        const userTop = await scroller.evaluate((el) => el.scrollTop);
        await place(box, finalCaption.length);
        await page.keyboard.type(".", { delay: 60 });
        await settled(page);
        expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - userTop), "user scroll kept").toBeLessThanOrEqual(TOLERANCE);

        // Ordinary save and reload: caption stored on figure 5, figure order unchanged.
        await page.getByTestId("report-save-top").click();
        await expect(page).toHaveURL(/\/orders\//, { timeout: 30_000 });
        const stored = await storedFigures(request, lab);
        expect(stored.map((f) => f.id)).toEqual(original.map((f) => f.id));
        expect(stored.map((f) => f.caption)).toEqual(original.map((_, i) => (i === 4 ? `${finalCaption}.` : "")));
        await openEditor(page, lab);
        await expect(page.getByLabel("Nota de Figura 5", { exact: true })).toHaveValue(`${finalCaption}.`);
        await expect(page.locator(SCROLLER).locator("[data-page-region='body'] [data-figure='5']")).toContainText(`${finalCaption}.`);
    });

    test("a caption that reflows the figures above keeps the viewed figure in place", async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, lab.adminEmail, ADMIN_PASSWORD);
        const scroller = await openEditor(page, lab);
        const box = page.getByLabel("Nota de Figura 1", { exact: true });
        // Fully visible, so typing never makes the browser scroll the caret into view (that is not the defect).
        await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await box.click();
        await scrollPreviewToFigure(page, 7, 150);
        const before = await figureContentTop(page, 7);

        // 25 wide glyphs wrap the caption of figure 1 onto a second line: the rows below it on the page move.
        await startRecorder(page, 7);
        await page.keyboard.type("M".repeat(25), { delay: 40 });
        await settled(page);
        const samples = await stopRecorder(page);
        const after = await figureContentTop(page, 7);
        save("viewport-reflow.json", { before, after, samples });

        await expect(scroller.locator("[data-page-region='body'] [data-figure='1']")).toContainText("M".repeat(25));
        expect(Math.abs(after - before), "the layout above figure 7 really moved").toBeGreaterThan(5);
        const tops = samples.map((s) => s.figureTop).filter((v): v is number => v !== null);
        expect(Math.abs(tops.at(-1)! - tops[0]), "figure 7 kept at the same place on screen").toBeLessThanOrEqual(TOLERANCE);
        const screenTops = samples.map((s) => s.figureScreenTop).filter((v): v is number => v !== null);
        expect(Math.abs(screenTops.at(-1)! - screenTops[0]), "figure 7 kept at the same place on screen (page scroll included)").toBeLessThanOrEqual(TOLERANCE);
    });

    test.describe("one-column layout", () => {
        test.use({ viewport: { width: 1100, height: 900 } });

        test("the preview below the editor keeps its place and the page does not shrink under the reader", async ({ page }) => {
            test.setTimeout(180_000);
            await login(page, lab.adminEmail, ADMIN_PASSWORD);
            const scroller = await openEditor(page, lab);
            const box = page.getByLabel("Nota de Figura 2", { exact: true });
            await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
            await box.click();
            await scrollPreviewToFigure(page, 2, 80);
            const startTop = await scroller.evaluate((el) => el.scrollTop);
            const startY = await page.evaluate(() => window.scrollY);
            expect(startTop).toBeGreaterThan(1000);

            await startRecorder(page, 2);
            await page.keyboard.type("Columna única", { delay: 60 });
            await settled(page);
            const samples = await stopRecorder(page);
            save("viewport-one-column.json", { startTop, startY, samples });
            expectSteady(samples, "one-column");
            expect(spread(samples.map((s) => s.windowY)), "page scroll unchanged").toBeLessThanOrEqual(TOLERANCE);
            expect(Math.abs((await page.evaluate(() => window.scrollY)) - startY)).toBeLessThanOrEqual(TOLERANCE);
            await expect(scroller.locator("[data-page-region='body'] [data-figure='2']")).toContainText("Columna única");
        });
    });
});
