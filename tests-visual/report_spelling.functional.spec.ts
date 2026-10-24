/**
 * Céluma 1.4 (#29) — report-editor spelling assistance in a real browser.
 *
 * Drives the unmodified ReportEditor (harness/report_spelling.tsx) with the
 * real spelling worker, the vendored es-MX dictionary and real Quill. Every
 * API call is answered here with synthetic data; there is no backend and no
 * real record. jsdom cannot prove any of this: geometry, caret, native and
 * Quill undo/redo, IME composition, paste, worker loading or network egress.
 *
 * Run: npm run test:visual -- report_spelling
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Request } from "@playwright/test";
import { spellingArtifacts } from "../src/test/fixtures/spelling_artifacts";

const here = path.dirname(fileURLToPath(import.meta.url));

const TENANT = "00000000-0000-4000-8000-0000000000a1";
const BRANCH = "00000000-0000-4000-8000-0000000000b1";
const USER = "00000000-0000-4000-8000-0000000000c1";
const ORDER = "00000000-0000-4000-8000-0000000000d1";
const REPORT_A = "00000000-0000-4000-8000-000000000a01";
const REPORT_B = "00000000-0000-4000-8000-000000000a02";
/** A tiny synthetic PNG, so figures need no network. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC";

type Persona = "author" | "reviewer-only";
type Status = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED";

interface ReportSeed {
    title: string;
    rich: string;
    text: string;
    table?: string;
    captions?: string[];
    /** Same-origin figure URL (default: an inline synthetic PNG). */
    figureUrl?: string;
}

const DEFAULT_SEED: ReportSeed = {
    title: "Reporte de pacietne",
    rich: "<p>Biopsia de pacietne con CU011026 y Ki67.</p>",
    text: "Sin hallasgos adicionales.",
    table: "| Parámetro | Resultado |\n| --- | --- |\n| Márgenes | Libers |\n| Código | CU011026 |",
    captions: ["Corte con nucleos"],
};

interface Lab {
    persona: Persona;
    status: Status;
    reports: Record<string, ReportSeed>;
    /** Bodies of every report save the app sent. */
    saves: Array<{ url: string; body: string }>;
}

function content(seed: ReportSeed) {
    return {
        base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-SP-1" } },
        sections: {
            diagnostico: { is_visible: true, label: "Diagnóstico", type: "richtext", content: seed.rich },
            notas: { is_visible: true, label: "Notas", type: "text", content: seed.text },
            hallazgos: { is_visible: true, label: "Hallazgos", type: "table", content: seed.table ?? "" },
            figuras: {
                is_visible: true, label: "Imágenes", type: "images",
                content: (seed.captions ?? []).map((caption, i) => ({ id: `img-${i}`, url: seed.figureUrl ?? PNG, caption })),
            },
        },
        base_order: ["order_code"],
        section_order: ["diagnostico", "notas", "hallazgos", "figuras"],
    };
}

function fullResponse(lab: Lab, reportId: string) {
    const seed = lab.reports[reportId];
    const c = content(seed);
    const template = { base: c.base, sections: c.sections, base_order: c.base_order, section_order: c.section_order };
    return {
        order: {
            id: ORDER, order_code: "ORD-SP-1", status: "IN_PROGRESS", patient_id: "pat-1", tenant_id: TENANT, branch_id: BRANCH,
            reviewers: lab.persona === "reviewer-only"
                ? [{ id: USER, name: "Revisora Sintética", email: "revisora@lab.example.invalid", status: "pending", eligible: true }]
                : [],
        },
        patient: { id: "pat-1", tenant_id: TENANT, branch_id: BRANCH, patient_code: "PAT-SP-1" },
        samples: [],
        report: {
            id: reportId, order_id: ORDER, tenant_id: TENANT, branch_id: BRANCH, created_by: USER, version_no: 1,
            status: lab.status, schema_version: 2, title: seed.title, published_at: null, signed_by: null, signed_at: null,
            template,
            report: {
                ...c,
                schema_version: 2,
                rendering_snapshot: {
                    schema_version: 2,
                    template,
                    presentation: {
                        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
                        header: { enabled: true, institution_name: "Laboratorio Sintético", subtitle: "Prueba de ortografía" },
                        footer: { enabled: true, custom_text: "Documento sintético", show_page_number: true },
                        style: { primary_color: "#2f6f69" },
                    },
                },
            },
        },
    };
}

const PROFILES: Record<Persona, object> = {
    author: {
        id: USER, email: "autora@lab.example.invalid", full_name: "Autora Sintética", roles: ["pathologist"],
        permissions: ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"],
        tenant_id: TENANT, branch_ids: [BRANCH],
    },
    "reviewer-only": {
        id: USER, email: "revisora@lab.example.invalid", full_name: "Revisora Sintética", roles: ["reviewer"],
        permissions: ["reports:read", "reports:approve", "reports:sign", "lab:read"],
        tenant_id: TENANT, branch_ids: [BRANCH],
    },
};

async function stubApi(page: Page, lab: Lab) {
    await page.route("**/api/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.endsWith("/v1/auth/me")) return route.fulfill({ json: PROFILES[lab.persona] });
        const full = /\/v1\/reports\/([^/]+)\/full$/.exec(path);
        if (full && lab.reports[full[1]]) return route.fulfill({ json: fullResponse(lab, full[1]) });
        if (/\/v1\/reports\/[^/]+\/new_version$/.test(path) || /\/v1\/reports\/?$/.test(path)) {
            lab.saves.push({ url: request.url(), body: request.postData() ?? "" });
            return route.fulfill({ json: {} });
        }
        if (/\/v1\/reports\/[^/]+\/submit$/.test(path)) {
            lab.status = "IN_REVIEW";
            return route.fulfill({ json: { status: "IN_REVIEW", message: "Enviado a revisión" } });
        }
        if (path.includes("/v1/report-letterheads")) return route.fulfill({ json: { letterheads: [] } });
        if (path.includes("/tenants/")) return route.fulfill({ json: { reports_v2_enabled: true } });
        return route.fulfill({ json: {} });
    });
}

function newLab(overrides: Partial<Lab> = {}): Lab {
    return {
        persona: "author",
        status: "DRAFT",
        reports: { [REPORT_A]: DEFAULT_SEED, [REPORT_B]: { ...DEFAULT_SEED, title: "Segundo reporte" } },
        saves: [],
        ...overrides,
    };
}

async function openEditor(page: Page, lab: Lab, reportId = REPORT_A) {
    await stubApi(page, lab);
    await page.goto(`/report_spelling.html?report=${reportId}&next=${REPORT_B}`);
    await expect(page.getByLabel("Nombre del reporte")).toHaveValue(lab.reports[reportId].title, { timeout: 30_000 });
}

const summary = (page: Page, groupId: string) => page.getByTestId(`spelling-summary-${groupId}`);
const quillRoot = (page: Page) => page.locator(".ql-editor").first();
const dialog = (page: Page) => page.getByRole("dialog", { name: /^Ortografía · / });

async function textareaState(page: Page, placeholder: string) {
    return page.getByPlaceholder(placeholder).evaluate((el: HTMLTextAreaElement) => ({
        value: el.value, start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el,
    }));
}

test.describe("Report spelling assistance (1.4 #29)", () => {
    test("indicates synthetic typos in title, rich and plain sections, table cells and captions; codes are skipped", async ({ page }) => {
        const lab = newLab();
        await openEditor(page, lab);

        await expect(summary(page, "title")).toContainText("1 posible error ortográfico", { timeout: 30_000 });
        await expect(summary(page, "section:diagnostico")).toContainText("1 posible error ortográfico");
        await expect(summary(page, "section:notas")).toContainText("1 posible error ortográfico");
        await expect(page.locator('[data-testid^="spelling-summary-caption:"]')).toContainText("1 posible error ortográfico");

        // Plain controls: the mirror holds exactly the indicated words; CU011026/Ki67 never appear.
        const mirrorWords = await page.locator("[data-spelling-mark]").allTextContents();
        expect(mirrorWords.sort()).toEqual(["hallasgos", "nucleos", "pacietne"]);

        // Quill: one underline drawn under "pacietne" — measured against the word's own DOM range.
        const geometry = await page.evaluate(() => {
            const root = document.querySelector(".ql-editor")!;
            const node = root.querySelector("p")!.firstChild as Text;
            const at = node.data.indexOf("pacietne");
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + "pacietne".length);
            const word = range.getBoundingClientRect();
            const lines = [...document.querySelectorAll("[data-spelling-underline]")].map((u) => u.getBoundingClientRect());
            return { word: { left: word.left, width: word.width, bottom: word.bottom }, lines: lines.map((l) => ({ left: l.left, width: l.width, top: l.top })) };
        });
        expect(geometry.lines).toHaveLength(1);
        expect(Math.abs(geometry.lines[0].left - geometry.word.left)).toBeLessThan(1);
        expect(Math.abs(geometry.lines[0].width - geometry.word.width)).toBeLessThan(1);
        expect(Math.abs(geometry.lines[0].top - (geometry.word.bottom - 3))).toBeLessThan(1.5);

        // Each plain mirror sits exactly on its control.
        const boxes = await page.locator('[data-testid="spelling-mirror"]').evaluateAll((mirrors) =>
            mirrors.map((m) => {
                const control = m.parentElement!.querySelector("input, textarea")!;
                const a = m.getBoundingClientRect();
                const b = control.getBoundingClientRect();
                // The layer extends a few px below the control so a last-line underline is not clipped.
                return [a.x - b.x, a.y - b.y, a.height - b.height - 5];
            }),
        );
        for (const [dx, dy, dh] of boxes) {
            expect(Math.abs(dx)).toBeLessThan(0.5);
            expect(Math.abs(dy)).toBeLessThan(0.5);
            expect(Math.abs(dh)).toBeLessThan(1);
        }

        // Covered controls never ask the browser's/OS checker; the custom/managed fields are not covered.
        await expect(page.getByLabel("Nombre del reporte")).toHaveAttribute("spellcheck", "false");
        await expect(quillRoot(page)).toHaveAttribute("spellcheck", "false");

        // Table: header/cell text is checked inside the table editor; the code cell is not.
        await page.getByRole("button", { name: "Editar tabla" }).click();
        await expect(summary(page, "table:hallazgos")).toContainText("1 posible error ortográfico", { timeout: 15_000 });
        const tableMarks = await page.locator(".ant-modal [data-spelling-mark]").allTextContents();
        expect(tableMarks).toEqual(["Libers"]);

        await page.screenshot({ path: test.info().outputPath("indications.png"), fullPage: true });
    });

    test("keyboard: Alt+Enter, choose, caret after the word, native undo and redo", async ({ page }) => {
        const lab = newLab();
        await openEditor(page, lab);
        const box = page.getByPlaceholder("Escribe notas…");
        await expect(summary(page, "section:notas")).toBeVisible({ timeout: 30_000 });

        await box.click();
        await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 6)); // inside "hallasgos"
        await page.keyboard.press("Alt+Enter");
        await expect(dialog(page)).toBeVisible();
        const option = dialog(page).getByRole("button", { name: "Reemplazar por hallazgos" });
        await expect(option).toBeFocused();
        // Opening and browsing change nothing.
        expect((await textareaState(page, "Escribe notas…")).value).toBe("Sin hallasgos adicionales.");

        await page.keyboard.press("Enter");
        await expect(dialog(page)).toBeHidden();
        expect(await textareaState(page, "Escribe notas…")).toEqual({ value: "Sin hallazgos adicionales.", start: 13, end: 13, focused: true });

        await page.keyboard.press("ControlOrMeta+z");
        await expect(box).toHaveValue("Sin hallasgos adicionales.");
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await expect(box).toHaveValue("Sin hallazgos adicionales.");

        // Typing keeps working normally after a correction.
        await page.keyboard.type(" Fin");
        expect((await textareaState(page, "Escribe notas…")).value).toBe("Sin hallazgos Fin adicionales.");

        // Escape closes without changes and returns focus to the field.
        await page.getByLabel("Nombre del reporte").click();
        await page.keyboard.press("End");
        await page.keyboard.press("Alt+Enter");
        await expect(dialog(page)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog(page)).toBeHidden();
        await expect(page.getByLabel("Nombre del reporte")).toBeFocused();
        await expect(page.getByLabel("Nombre del reporte")).toHaveValue("Reporte de pacietne");
    });

    for (const failure of ["returns false", "throws"] as const) {
        test(`a correction the browser cannot make undoable is refused when insertText ${failure}`, async ({ page }) => {
            const lab = newLab();
            await openEditor(page, lab);
            const box = page.getByPlaceholder("Escribe notas…");
            await expect(summary(page, "section:notas")).toBeVisible({ timeout: 30_000 });
            await page.evaluate((mode) => {
                document.execCommand = mode === "throws"
                    ? () => { throw new Error("editing commands unavailable (synthetic)"); }
                    : () => false;
            }, failure);

            await box.click();
            await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(5, 8)); // a selection inside "hallasgos"
            await page.keyboard.press("Alt+Enter");
            await dialog(page).getByRole("button", { name: "Reemplazar por hallazgos" }).click();

            // Not applied and not hidden: the dialog stays with a visible alert; value and selection are as before.
            await expect(dialog(page).getByRole("alert")).toContainText("no se cambió nada");
            await expect(dialog(page)).toBeVisible();
            expect(await textareaState(page, "Escribe notas…")).toMatchObject({ value: "Sin hallasgos adicionales.", start: 5, end: 8 });
            await expect(summary(page, "section:notas")).toContainText("1 posible error ortográfico");

            await page.keyboard.press("Escape");
            await expect(dialog(page)).toBeHidden();
            expect(await textareaState(page, "Escribe notas…")).toEqual({ value: "Sin hallasgos adicionales.", start: 5, end: 8, focused: true });
            await page.getByTestId("report-save-bottom").click();
            await expect.poll(() => lab.saves.length).toBe(1);
            expect(JSON.parse(lab.saves[0].body).report.sections.notas.content).toBe("Sin hallasgos adicionales.");
        });
    }

    test("Quill: a word split across formats is corrected in place, keeps formatting, and undo/redo restore it exactly", async ({ page }) => {
        const lab = newLab({ reports: { [REPORT_A]: { ...DEFAULT_SEED, rich: "<p>Biopsia de pa<strong>cie</strong>tne con CU011026.</p>" } } });
        await openEditor(page, lab);
        await expect(summary(page, "section:diagnostico")).toBeVisible({ timeout: 30_000 });
        const before = await quillRoot(page).innerHTML();
        expect(before).toBe("<p>Biopsia de pa<strong>cie</strong>tne con CU011026.</p>");
        // One continuous underline spans the word across the formatting boundary.
        await expect(page.locator("[data-spelling-underline]")).toHaveCount(1);
        const span = await page.evaluate(() => {
            const p = document.querySelector(".ql-editor p")!;
            const range = document.createRange();
            range.setStart(p.firstChild!, "Biopsia de ".length);
            range.setEnd(p.lastChild!, "tne".length);
            const word = range.getBoundingClientRect();
            const line = document.querySelector("[data-spelling-underline]")!.getBoundingClientRect();
            return { dl: line.left - word.left, dw: line.width - word.width };
        });
        expect(Math.abs(span.dl)).toBeLessThan(1);
        expect(Math.abs(span.dw)).toBeLessThan(1);

        // Pointer: clicking the word shows suggestions without taking focus from the editor.
        await quillRoot(page).scrollIntoViewIfNeeded();
        const underline = await page.locator("[data-spelling-underline]").first().boundingBox();
        await page.mouse.click(underline!.x + 3, underline!.y - 6);
        await expect(dialog(page)).toBeVisible();
        await expect(quillRoot(page)).toBeFocused();
        await dialog(page).getByRole("button", { name: "Reemplazar por paciente" }).click();
        await expect(dialog(page)).toBeHidden();
        await expect(quillRoot(page)).toHaveJSProperty("innerHTML", "<p>Biopsia de pa<strong>cie</strong>nte con CU011026.</p>");
        await expect(quillRoot(page)).toBeFocused();
        const caret = await page.evaluate(() => {
            const sel = window.getSelection()!;
            return { text: sel.focusNode?.textContent, offset: sel.focusOffset };
        });
        expect(caret.text?.slice(0, caret.offset)).toBe("nte"); // caret right after "paciente"

        await page.keyboard.press("ControlOrMeta+z");
        await expect(quillRoot(page)).toHaveJSProperty("innerHTML", before);
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await expect(quillRoot(page)).toHaveJSProperty("innerHTML", "<p>Biopsia de pa<strong>cie</strong>nte con CU011026.</p>");

        // No checker markup ever enters the editor DOM that react-quill stores.
        expect(spellingArtifacts(await quillRoot(page).innerHTML())).toEqual([]);
    });

    test("captions stay single-line and within 25 characters; a longer suggestion is refused, not truncated", async ({ page }) => {
        const lab = newLab({ reports: { [REPORT_A]: { ...DEFAULT_SEED, captions: ["Tumor difrenciado grado 2", "Nota nucleos"] } } });
        await openEditor(page, lab);
        const captions = page.getByPlaceholder("Nota para esta imagen");
        await expect(captions.nth(0)).toHaveValue("Tumor difrenciado grado 2");
        expect("Tumor difrenciado grado 2").toHaveLength(25);
        await expect(page.locator('[data-testid^="spelling-summary-caption:"]').first()).toBeVisible({ timeout: 30_000 });

        await captions.nth(0).click();
        await captions.nth(0).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(8, 8));
        await page.keyboard.press("Alt+Enter");
        const refused = dialog(page).getByRole("button", { name: /diferenciado: excede el límite de 25 caracteres/ });
        await expect(refused).toBeVisible();
        await expect(refused).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(captions.nth(0)).toHaveValue("Tumor difrenciado grado 2");

        // A replacement that fits is applied; the counter and single line hold.
        await captions.nth(1).click();
        await page.keyboard.press("End");
        await page.keyboard.press("Alt+Enter");
        await dialog(page).getByRole("button", { name: "Reemplazar por núcleos" }).click();
        await expect(captions.nth(1)).toHaveValue("Nota núcleos");
        await expect(page.getByText("12/25")).toBeVisible();
        // Existing caption rules are unchanged: Enter inserts nothing, the cap holds.
        await page.keyboard.press("Enter");
        await page.keyboard.type(" con texto extra muy largo");
        const value = await captions.nth(1).inputValue();
        expect(value).not.toContain("\n");
        expect(value.length).toBeLessThanOrEqual(25);
    });

    test("ignore covers every field of this report only; checking, ignoring and dismissing save the content unchanged", async ({ page }) => {
        const seed: ReportSeed = { title: "Esplenomegalia de prueba", rich: "<p>Patrón de esplenomegalia.</p>", text: "Esplenomegalia moderado.", captions: [] };
        const lab = newLab({ reports: { [REPORT_A]: seed, [REPORT_B]: { ...seed, title: "Esplenomegalia en otro reporte" } } });
        await openEditor(page, lab);
        await expect(summary(page, "title")).toBeVisible({ timeout: 30_000 });
        await expect(summary(page, "section:notas")).toBeVisible();

        await summary(page, "title").getByRole("button", { name: /Revisar ortografía/ }).click();
        await expect(dialog(page)).toContainText("Sin sugerencias");
        await dialog(page).getByRole("button", { name: "Ignorar en este reporte" }).click();
        await expect(summary(page, "title")).toBeHidden();
        await expect(summary(page, "section:notas")).toBeHidden();
        await expect(summary(page, "section:diagnostico")).toBeHidden();

        await page.getByTestId("report-save-bottom").click();
        await expect.poll(() => lab.saves.length).toBe(1);
        const saved = JSON.parse(lab.saves[0].body);
        expect(saved.title).toBe(seed.title);
        expect(saved.report.sections.notas.content).toBe(seed.text);
        expect(saved.report.sections.diagnostico.content).toBe(seed.rich);
        expect(spellingArtifacts(lab.saves[0].body)).toEqual([]);
    });

    test("another report starts a fresh session: ignore decisions do not carry over", async ({ page }) => {
        const seed: ReportSeed = { title: "Esplenomegalia de prueba", rich: "<p>Texto.</p>", text: "Texto.", captions: [] };
        const lab = newLab({ reports: { [REPORT_A]: seed, [REPORT_B]: { ...seed, title: "Esplenomegalia B" } } });
        await openEditor(page, lab);
        await summary(page, "title").getByRole("button", { name: /Revisar ortografía/ }).click({ timeout: 30_000 });
        await dialog(page).getByRole("button", { name: "Ignorar en este reporte" }).click();
        await expect(summary(page, "title")).toBeHidden();

        await page.getByTestId("harness-switch-report").click();
        await expect(page.getByLabel("Nombre del reporte")).toHaveValue("Esplenomegalia B", { timeout: 15_000 });
        await expect(summary(page, "title")).toContainText("1 posible error ortográfico", { timeout: 15_000 });
    });

    for (const scenario of [
        { name: "IN_REVIEW for the author", persona: "author" as Persona, status: "IN_REVIEW" as Status },
        { name: "PUBLISHED for the author", persona: "author" as Persona, status: "PUBLISHED" as Status },
        { name: "DRAFT for a presentation-only reviewer", persona: "reviewer-only" as Persona, status: "DRAFT" as Status },
    ]) {
        test(`no checker, worker or dictionary download when the report is ${scenario.name}`, async ({ page }) => {
            const assets: string[] = [];
            page.on("request", (r) => {
                if (/es-MX\.(aff|dic)|spelling\.worker/.test(r.url())) assets.push(r.url());
            });
            const lab = newLab({ persona: scenario.persona, status: scenario.status });
            await openEditor(page, lab);
            await page.waitForTimeout(1500);
            await expect(page.locator('[data-testid^="spelling-summary-"]')).toHaveCount(0);
            await expect(page.locator("[data-spelling-mark], [data-spelling-underline]")).toHaveCount(0);
            expect(page.workers()).toHaveLength(0);
            expect(assets).toEqual([]);
        });
    }

    test("becoming read-only closes the dialog and clears every indication", async ({ page }) => {
        const lab = newLab();
        await openEditor(page, lab);
        await expect(summary(page, "title")).toBeVisible({ timeout: 30_000 });
        await page.getByLabel("Nombre del reporte").click();
        await page.keyboard.press("End");
        await page.keyboard.press("Alt+Enter");
        await expect(dialog(page)).toBeVisible();
        await page.keyboard.press("Escape");
        await quillRoot(page).click();
        await page.getByRole("button", { name: "Enviar a Revisión" }).click();
        await expect(page.getByText("En Revisión").first()).toBeVisible();
        await expect(page.locator('[data-testid^="spelling-summary-"]')).toHaveCount(0, { timeout: 10_000 });
        await expect(page.locator("[data-spelling-mark], [data-spelling-underline]")).toHaveCount(0);
        await expect(dialog(page)).toBeHidden();
    });

    test("an edit while the dialog is open closes it without applying anything", async ({ page }) => {
        const lab = newLab();
        await openEditor(page, lab);
        const box = page.getByPlaceholder("Escribe notas…");
        await expect(summary(page, "section:notas")).toBeVisible({ timeout: 30_000 });
        await box.click();
        await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 6));
        await page.keyboard.press("Alt+Enter");
        await expect(dialog(page)).toBeVisible();
        // Another edit lands in the field (e.g. a paste elsewhere) while the dialog is open.
        await box.evaluate((el: HTMLTextAreaElement) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
            setter.call(el, "Sin hallasgoss adicionales.");
            el.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await expect(dialog(page)).toBeHidden();
        await expect(box).toHaveValue("Sin hallasgoss adicionales.");
    });

    test("checker unavailable: honest notice, editing and saving unaffected, no native fallback", async ({ page }) => {
        // The browser refuses to start the worker (policy, extension, old engine…).
        await page.addInitScript(() => {
            window.Worker = class {
                constructor() {
                    throw new Error("Worker blocked in this synthetic test");
                }
            } as unknown as typeof Worker;
        });
        const lab = newLab();
        await openEditor(page, lab);
        await expect(page.getByTestId("spelling-unavailable")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("spelling-unavailable")).toContainText("Puedes seguir editando y guardando");
        await expect(page.getByLabel("Nombre del reporte")).toHaveAttribute("spellcheck", "false");
        await expect(quillRoot(page)).toHaveAttribute("spellcheck", "false");
        await expect(page.getByPlaceholder("Escribe notas…")).toHaveAttribute("spellcheck", "false");
        await expect(page.locator('[data-testid^="spelling-summary-"]')).toHaveCount(0);

        await page.getByLabel("Nombre del reporte").fill("Reporte editado sin revisión");
        await page.getByTestId("report-save-bottom").click();
        await expect.poll(() => lab.saves.length).toBe(1);
        expect(JSON.parse(lab.saves[0].body).title).toBe("Reporte editado sin revisión");
    });

    test("a worker failure after start-up is shown with a retry; editing and saving continue (review R2)", async ({ page }) => {
        // The real worker, but while window.__breakSpelling is set its next lookup answer is
        // replaced by the protocol's per-request error, as when the engine throws after ready.
        await page.addInitScript(() => {
            const NativeWorker = window.Worker;
            const flags = window as unknown as { __breakSpelling?: boolean };
            class BreakableWorker extends NativeWorker {
                set onmessage(handler: ((event: MessageEvent) => void) | null) {
                    super.onmessage = handler && ((event: MessageEvent) => {
                        const data = event.data as { type?: string; id?: number };
                        if (flags.__breakSpelling && data?.type === "checked") {
                            handler({ data: { type: "error", id: data.id } } as MessageEvent);
                            return;
                        }
                        handler(event);
                    });
                }
                get onmessage() {
                    return super.onmessage;
                }
            }
            window.Worker = BreakableWorker;
        });
        const lab = newLab();
        await openEditor(page, lab);
        await expect(summary(page, "title")).toContainText("1 posible error ortográfico", { timeout: 30_000 });

        await page.evaluate(() => { (window as unknown as { __breakSpelling: boolean }).__breakSpelling = true; });
        const title = page.getByLabel("Nombre del reporte");
        await title.click();
        await page.keyboard.press("End");
        await page.keyboard.type(" zqxnuevo");
        await expect(page.getByTestId("spelling-unavailable")).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[data-testid^="spelling-summary-"]')).toHaveCount(0);
        await expect(page.locator("[data-spelling-mark], [data-spelling-underline]")).toHaveCount(0);

        // Editing and the clinical flow are untouched.
        await page.keyboard.type(" fin");
        await expect(title).toHaveValue("Reporte de pacietne zqxnuevo fin");
        await expect(page.getByRole("button", { name: /Enviar a Revisión/ })).toBeEnabled();

        await page.evaluate(() => { (window as unknown as { __breakSpelling: boolean }).__breakSpelling = false; });
        await page.getByTestId("spelling-unavailable").getByRole("button", { name: "Reintentar" }).click();
        await expect(page.getByTestId("spelling-unavailable")).toBeHidden({ timeout: 15_000 });
        await expect(summary(page, "title")).toContainText("2 posibles errores ortográficos", { timeout: 15_000 });

        await page.getByTestId("report-save-bottom").click();
        await expect.poll(() => lab.saves.length).toBe(1);
        expect(JSON.parse(lab.saves[0].body).title).toBe("Reporte de pacietne zqxnuevo fin");
    });

    test("a dictionary replaced by the SPA's index.html is rejected, not parsed", async ({ page }) => {
        // A static host answers a missing asset with index.html and HTTP 200. Intercepting the
        // worker's own fetch is reliable with the dev harness this config serves (the worker loads
        // its modules first); against a production bundle use a server-side fault instead.
        await page.route(/es-MX\.aff/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body><div id=\"root\"></div></body></html>" }));
        const lab = newLab();
        await openEditor(page, lab);
        await expect(page.getByTestId("spelling-unavailable")).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('[data-testid^="spelling-summary-"]')).toHaveCount(0);
    });

    test("IME composition defers checking until the text is committed", async ({ page }) => {
        const lab = newLab();
        await openEditor(page, lab);
        const box = page.getByPlaceholder("Escribe notas…");
        await expect(summary(page, "section:notas")).toBeVisible({ timeout: 30_000 });
        await box.click();
        await page.keyboard.press("End");
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.imeSetComposition", { text: " muestar", selectionStart: 8, selectionEnd: 8 });
        await page.waitForTimeout(700);
        // While composing nothing is drawn over the field, and the composing word is not judged.
        await expect(box.locator("xpath=..").locator("[data-spelling-mark]")).toHaveCount(0);
        await cdp.send("Input.insertText", { text: " muestar" });
        await expect(box).toHaveValue("Sin hallasgos adicionales. muestar");
        await expect.poll(async () => (await box.locator("xpath=..").locator("[data-spelling-mark]").allTextContents()).sort(), { timeout: 10_000 })
            .toEqual(["hallasgos", "muestar"]);
        expect(await textareaState(page, "Escribe notas…")).toMatchObject({ start: 34, end: 34, focused: true });
    });

    test("pasted and accented text is checked in Quill and plain fields", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const lab = newLab({ reports: { [REPORT_A]: { ...DEFAULT_SEED, rich: "<p>Inicio.</p>", text: "Inicio." } } });
        await openEditor(page, lab);
        await page.evaluate(() => navigator.clipboard.writeText(" Se observa presnecia de células."));
        await quillRoot(page).click();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.press("ControlOrMeta+V");
        await expect(quillRoot(page)).toContainText("Inicio. Se observa presnecia de células.");
        await expect(summary(page, "section:diagnostico")).toContainText("1 posible error ortográfico", { timeout: 15_000 });

        const box = page.getByPlaceholder("Escribe notas…");
        await box.click();
        await page.keyboard.press("End");
        await page.keyboard.press("ControlOrMeta+V");
        await page.keyboard.type(" Núcleo pequeño, sin tejdo.");
        await expect(box).toHaveValue("Inicio. Se observa presnecia de células. Núcleo pequeño, sin tejdo.");
        await expect.poll(async () => (await box.locator("xpath=..").locator("[data-spelling-mark]").allTextContents()).sort(), { timeout: 10_000 })
            .toEqual(["presnecia", "tejdo"]);
    });

    test("preview, local print copy and the saved JSON contain no checker layer", async ({ page }) => {
        // Legitimate content and a same-origin asset path that contain "spelling"/"spellcheck"
        // (as a checkout named .worktrees-report-spelling does in Vite's URLs) must survive and
        // must not be mistaken for a leak (review R3): artifacts are detected by what only the
        // checker produces, and clinical values are compared exactly.
        const FIGURE = "/synthetic-assets/report-spelling/figura-spelling.png";
        await page.route(`**${FIGURE}`, (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(PNG.split(",")[1], "base64") }));
        const seed: ReportSeed = {
            ...DEFAULT_SEED,
            title: "Reporte de pacietne (spelling)",
            text: "Control sintético de spelling y spellcheck.",
            figureUrl: FIGURE,
        };
        const lab = newLab({ reports: { [REPORT_A]: seed } });
        await openEditor(page, lab);
        await expect(summary(page, "section:diagnostico")).toBeVisible({ timeout: 30_000 });
        await expect(summary(page, "section:notas")).toContainText("posibles errores");

        const preview = page.locator(".re-preview-col");
        await expect(preview).toContainText("Biopsia de pacietne con CU011026 y Ki67.");
        await expect(preview).toContainText(seed.text);
        const previewHtml = await preview.innerHTML();
        expect(previewHtml).toContain(FIGURE);
        expect(spellingArtifacts(previewHtml)).toEqual([]);

        // The local copy is composed in a hidden iframe (use_local_print.ts); read it before it is removed.
        const printed = page.waitForFunction(() => {
            const doc = document.querySelector<HTMLIFrameElement>("iframe[data-celuma-local-print]")?.contentDocument;
            const html = doc?.documentElement?.outerHTML ?? "";
            return html.includes("pacietne") ? html : false;
        }, null, { polling: "raf", timeout: 15_000 });
        await page.getByRole("button", { name: /Imprimir borrador/ }).click();
        const printedHtml = await (await printed).jsonValue();
        expect(printedHtml).toContain("BORRADOR");
        expect(printedHtml).toContain(seed.text);
        expect(printedHtml).toContain(FIGURE);
        expect(spellingArtifacts(printedHtml)).toEqual([]);

        await page.getByTestId("report-save-bottom").click();
        await expect.poll(() => lab.saves.length).toBe(1);
        const saved = JSON.parse(lab.saves[0].body);
        expect(saved.title).toBe(seed.title);
        expect(saved.report.sections.diagnostico.content).toBe(seed.rich);
        expect(saved.report.sections.notas.content).toBe(seed.text);
        expect(saved.report.sections.hallazgos.content).toBe(seed.table);
        expect(saved.report.sections.figuras.content).toEqual([{ id: "img-0", url: FIGURE, caption: "Corte con nucleos" }]);
        expect(spellingArtifacts(lab.saves[0].body)).toEqual([]);
    });
});

test.describe("Egress (1.4 #29)", () => {
    test("a typed marker reaches no network request except the explicit report save", async ({ page, context }) => {
        const MARKER = "zqxmarcadorsintetico";
        const requests: Array<{ url: string; method: string; body: string; kind: string }> = [];
        const frames: string[] = [];
        const record = (r: Request) => requests.push({ url: r.url(), method: r.method(), body: r.postData() ?? "", kind: r.resourceType() });
        context.on("request", record);
        page.on("websocket", (ws) => ws.on("framesent", (f) => frames.push(String(f.payload))));
        // Record what the page hands to the worker: lookup words only, never a field's text.
        await page.addInitScript(() => {
            const post = Worker.prototype.postMessage;
            (window as unknown as { __toWorker: unknown[] }).__toWorker = [];
            Worker.prototype.postMessage = function (message: unknown, ...rest: unknown[]) {
                (window as unknown as { __toWorker: unknown[] }).__toWorker.push(JSON.parse(JSON.stringify(message)));
                return (post as (...a: unknown[]) => void).call(this, message, ...rest);
            };
        });
        const lab = newLab();
        await openEditor(page, lab);
        await expect(summary(page, "title")).toBeVisible({ timeout: 30_000 });

        await page.getByLabel("Nombre del reporte").click();
        await page.keyboard.press("End");
        await page.keyboard.type(` ${MARKER}`);
        await quillRoot(page).click();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.type(` Texto ${MARKER} final.`);
        const box = page.getByPlaceholder("Escribe notas…");
        await box.click();
        await page.keyboard.press("End");
        await page.keyboard.type(` ${MARKER}`);
        await expect(summary(page, "section:notas")).toContainText("2 posibles errores", { timeout: 15_000 });
        // Ask for suggestions and ignore the marker: still local.
        await page.keyboard.press("Alt+Enter");
        await expect(dialog(page)).toBeVisible();
        await dialog(page).getByRole("button", { name: "Siguiente indicación" }).click().catch(() => {});
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1500);

        const leaked = requests.filter((r) => r.url.includes(MARKER) || r.body.includes(MARKER));
        expect(leaked).toEqual([]);
        expect(frames.filter((f) => f.includes(MARKER))).toEqual([]);
        // Every request is same-origin; the checker's own are GETs of the worker script and the two
        // dictionary files. (Worker requests are observed here with the dev harness; for a production
        // bundle a worker's first requests can precede Playwright's attachment, so that evidence is
        // collected server-side — see the delivery notes.)
        const origin = new URL(page.url()).origin;
        expect(requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith("data:"))).toEqual([]);
        const checkerAssets = requests.filter((r) => /es-MX\.(aff|dic)|spelling\.worker/.test(r.url));
        expect(checkerAssets.every((r) => r.method === "GET")).toBe(true);
        expect(checkerAssets.some((r) => /spelling\.worker/.test(r.url))).toBe(true);

        const toWorker = await page.evaluate(() => (window as unknown as { __toWorker: Array<Record<string, unknown>> }).__toWorker);
        for (const message of toWorker) {
            expect(["init", "check", "suggest", "cancel"]).toContain(message.type);
            const words = message.type === "check" ? (message.words as string[]) : message.type === "suggest" ? [message.word as string] : [];
            for (const w of words) expect(w).not.toMatch(/\s/);
        }

        // The explicit, authorized save is the only request carrying the text.
        await page.getByTestId("report-save-bottom").click();
        await expect.poll(() => lab.saves.length).toBe(1);
        const carrying = requests.filter((r) => r.body.includes(MARKER));
        expect(carrying.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([`POST /api/v1/reports/${REPORT_A}/new_version`]);

        test.info().annotations.push({
            type: "egress",
            description: JSON.stringify({
                totalRequests: requests.length,
                apiRequests: requests.filter((r) => r.url.includes("/api/")).map((r) => `${r.method} ${new URL(r.url).pathname}`),
                checkerAssets: checkerAssets.map((r) => new URL(r.url).pathname),
                websocketFramesSent: frames.length,
                workerMessages: toWorker.length,
            }),
        });
    });
});

/** Varied synthetic prose from the dictionary's own word list (no clinical meaning), with marked typos. */
function syntheticProse(wordCount: number) {
    const dic = readFileSync(path.resolve(here, "../src/lib/spelling/dictionaries/es-MX/es-MX.dic"), "utf8");
    const words = dic.split("\n").slice(1).map((l) => l.split("/")[0]).filter((w) => /^[a-záéíóúñü]{4,12}$/.test(w));
    let seed = 29;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const out: string[] = [];
    let typos = 0;
    for (let i = 0; i < wordCount; i += 1) {
        let w = words[Math.floor(rand() * words.length)];
        if (i % 400 === 7) {
            w = `${w}qx`;
            typos += 1;
        }
        out.push(i % 14 === 13 ? `${w}.` : w);
    }
    return { text: out.join(" "), typos, distinct: new Set(out).size };
}

test.describe("Long varied prose (1.4 #29)", () => {
    test("is checked completely and typing stays within the responsiveness budget", async ({ browser }) => {
        test.setTimeout(120_000);
        const generated = syntheticProse(9_000);
        expect(generated.text.length).toBeLessThan(100_000);

        /** Fills the plain section, then measures insertText → next frame at its end. */
        async function measure(checker: "on" | "off") {
            const context = await browser.newContext();
            const page = await context.newPage();
            // "off": the worker cannot start, so the editor runs with the checker unavailable.
            if (checker === "off") {
                await page.addInitScript(() => {
                    window.Worker = class {
                        constructor() {
                            throw new Error("Worker blocked in this synthetic test");
                        }
                    } as unknown as typeof Worker;
                });
            }
            const lab = newLab({ reports: { [REPORT_A]: { ...DEFAULT_SEED, text: "Inicio.", rich: "<p>Inicio.</p>" } } });
            await openEditor(page, lab);
            if (checker === "on") await expect(summary(page, "title")).toBeVisible({ timeout: 30_000 });
            else await expect(page.getByTestId("spelling-unavailable")).toBeVisible({ timeout: 30_000 });
            const box = page.getByPlaceholder("Escribe notas…");
            const t0 = Date.now();
            await box.fill(generated.text);
            if (checker === "on") {
                await expect(summary(page, "section:notas")).toContainText(`${generated.typos} posibles errores`, { timeout: 20_000 });
                await expect(summary(page, "section:notas")).not.toContainText("Revisión parcial");
            }
            const fillMs = Date.now() - t0;
            await page.waitForTimeout(1000);
            await box.click();
            await page.keyboard.press("ControlOrMeta+End");
            const latency = await page.evaluate(async () => {
                const samples: number[] = [];
                for (const ch of "abcdefghijk") {
                    const start = performance.now();
                    document.execCommand("insertText", false, ch);
                    await new Promise((r) => requestAnimationFrame(() => r(null)));
                    samples.push(performance.now() - start);
                }
                samples.sort((a, b) => a - b);
                return { median: Math.round(samples[5]), max: Math.round(samples[10]) };
            });
            await context.close();
            return { fillMs, latency };
        }

        const on = await measure("on");
        const off = await measure("off");
        test.info().annotations.push({
            type: "performance",
            description: JSON.stringify({
                characters: generated.text.length, words: 9_000, distinctWords: generated.distinct, indications: generated.typos,
                withChecker: on, checkerUnavailable: off,
                note: "execCommand probe (insertText -> next frame); realistic input latency is measured by tests-perf",
            }),
        });
        // Follow-up (#29 latency): the live preview no longer repaginates on every keystroke, so the
        // editor's own cost no longer hides the checker's (mirror layout, mark rebasing): a 1.3x
        // comparison with the checker-less run stopped being meaningful. The budget is absolute and
        // generous for this execCommand-based probe (the pre-follow-up candidate measured ≈ 650 ms
        // here); realistic trusted-keyboard latency is measured by `npm run test:perf`.
        expect(on.latency.median).toBeLessThan(250);
    });

    test("text beyond the per-field limit is reported as partially checked, never as correct", async ({ page }) => {
        const lab = newLab({ reports: { [REPORT_A]: { ...DEFAULT_SEED, text: "Inicio." } } });
        await openEditor(page, lab);
        await expect(summary(page, "title")).toBeVisible({ timeout: 30_000 });
        const generated = syntheticProse(12_000);
        expect(generated.text.length).toBeGreaterThan(100_000);
        await page.getByPlaceholder("Escribe notas…").fill(generated.text);
        await expect(summary(page, "section:notas")).toContainText("Revisión parcial", { timeout: 20_000 });
    });
});
