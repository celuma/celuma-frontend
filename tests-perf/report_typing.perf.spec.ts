/**
 * Céluma 1.4 (#29 follow-up) — report-editor typing latency, measured in a
 * real browser with trusted keyboard input (CDP Input.dispatchKeyEvent).
 *
 * Opt-in: `npm run test:perf` (PERF_VARIANT / PERF_CHECKER / PERF_OUT / PERF_PORT /
 * PERF_THROTTLE / PERF_ONLY select the labelled variant and where the JSON result
 * goes). It drives the unmodified ReportEditor from tests-perf/harness with
 * synthetic API fixtures; there is no backend and no clinical data. Per typed key
 * it records keydown timestamp -> `input` event -> next animation frame (+ message
 * turn), the browser's own Event Timing (keydown processing + presentation), long
 * tasks / long animation frames, React commits, and spelling-worker requests. A
 * separate run per scenario captures a CDP CPU profile (never used for latency
 * because the profiler itself slows the page).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type CDPSession, type Page } from "@playwright/test";

const TENANT = "00000000-0000-4000-8000-0000000000a1";
const BRANCH = "00000000-0000-4000-8000-0000000000b1";
const USER = "00000000-0000-4000-8000-0000000000c1";
const ORDER = "00000000-0000-4000-8000-0000000000d1";
const REPORT = "00000000-0000-4000-8000-000000000a01";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC";

const VARIANT = process.env.PERF_VARIANT ?? "unlabelled";
const CHECKER = (process.env.PERF_CHECKER ?? "on") as "on" | "off";
const OUT = process.env.PERF_OUT ?? path.resolve(process.cwd(), ".perf-results", `${VARIANT}.json`);
const KEYS = Number(process.env.PERF_KEYS ?? 40);
const KEY_DELAY_MS = 80;
/** CDP CPU throttling (1 = this machine as is; 4 approximates a mid-range laptop). */
const THROTTLE = Number(process.env.PERF_THROTTLE ?? 1);

// ---------------------------------------------------------------- synthetic prose

const COMMON = ("de la el en con sin por para se que una un los las del al es son fue como más muy entre sobre " +
    "hacia desde hasta se observa presenta muestra no hay existe zona área región fragmento tejido muestra " +
    "pequeño grande moderado leve severo focal difuso múltiples algunos ambos lado derecho izquierdo superior " +
    "inferior medio centro borde margen superficie color blanco rosa pardo firme blando elástico liso rugoso " +
    "medida mide aproximadamente milímetros centímetros peso forma bordes definidos irregulares").split(" ");
// Legitimate terminology mixed in so the checker has marks to track.
const TERMS = ("histológicos inmunohistoquímicos negatividad carcinoma adenocarcinoma displasia hiperplasia metaplasia " +
    "necrosis mitosis neoplasia atipia pleomorfismo estroma epitelio epitelial linfocitos infiltrado fibrosis " +
    "queratinización endometrio eosina hematoxilina citoplasma núcleo nucléolo glándulas ganglio margen invasión " +
    "angiogénesis inflamación biopsia citológico macroscópica microscópico").split(" ");
const TYPOS = ["celulas", "hallasgos", "pacietne", "diagnostco", "tumro", "marjen", "nucleos", "libers"];

function prose(seed: number, chars: number): string {
    let s = seed;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const out: string[] = [];
    let len = 0;
    let i = 0;
    while (len < chars) {
        const r = rand();
        let w = r < 0.62 ? COMMON[Math.floor(rand() * COMMON.length)] : r < 0.95 ? TERMS[Math.floor(rand() * TERMS.length)] : TYPOS[Math.floor(rand() * TYPOS.length)];
        i += 1;
        if (i % 14 === 0) w += ".";
        out.push(w);
        len += w.length + 1;
    }
    return out.join(" ").slice(0, chars);
}

function richHtml(seed: number, chars: number): string {
    const words = prose(seed, chars).split(" ");
    const paragraphs: string[] = [];
    for (let i = 0; i < words.length; i += 60) {
        const chunk = words.slice(i, i + 60).map((w, k) => (k % 17 === 5 ? `<strong>${w}</strong>` : k % 23 === 9 ? `<em>${w}</em>` : w));
        paragraphs.push(`<p>${chunk.join(" ")}</p>`);
    }
    return paragraphs.join("");
}

// ---------------------------------------------------------------- fixture

interface Shape {
    rich: number;
    plain: number;
    richChars: number;
    plainChars: number;
    tableRows: number;
    figures: number;
}
const TYPICAL: Shape = { rich: 4, plain: 3, richChars: 1200, plainChars: 600, tableRows: 8, figures: 6 };
const MANY: Shape = { rich: 12, plain: 12, richChars: 1000, plainChars: 700, tableRows: 12, figures: 12 };
const LONG83K: Shape = { rich: 1, plain: 1, richChars: 83_000, plainChars: 83_000, tableRows: 4, figures: 4 };
const LONG20K: Shape = { rich: 1, plain: 1, richChars: 20_000, plainChars: 20_000, tableRows: 4, figures: 4 };

function reportContent(shape: Shape) {
    const sections: Record<string, unknown> = {};
    const order: string[] = [];
    for (let i = 0; i < shape.rich; i += 1) {
        const key = `rich${i}`;
        sections[key] = { is_visible: true, label: `Rich ${i + 1}`, type: "richtext", content: richHtml(100 + i, shape.richChars) };
        order.push(key);
    }
    for (let i = 0; i < shape.plain; i += 1) {
        const key = `plain${i}`;
        sections[key] = { is_visible: true, label: `Plain ${i + 1}`, type: "text", content: prose(500 + i, shape.plainChars) };
        order.push(key);
    }
    const rows = ["| Parámetro | Resultado |", "| --- | --- |"];
    for (let r = 0; r < shape.tableRows; r += 1) rows.push(`| ${prose(900 + r, 18)} | ${prose(950 + r, 24)} |`);
    sections.tabla = { is_visible: true, label: "Tabla", type: "table", content: rows.join("\n") };
    order.push("tabla");
    sections.figuras = {
        is_visible: true, label: "Imágenes", type: "images",
        content: Array.from({ length: shape.figures }, (_, i) => ({ id: `img-${i}`, url: PNG, caption: `Corte ${i + 1}` })),
    };
    order.push("figuras");
    return {
        base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-PF-1" } },
        sections,
        base_order: ["order_code"],
        section_order: order,
    };
}

function fullResponse(shape: Shape) {
    const c = reportContent(shape);
    const template = { base: c.base, sections: c.sections, base_order: c.base_order, section_order: c.section_order };
    return {
        order: { id: ORDER, order_code: "ORD-PF-1", status: "IN_PROGRESS", patient_id: "pat-1", tenant_id: TENANT, branch_id: BRANCH, reviewers: [] },
        patient: { id: "pat-1", tenant_id: TENANT, branch_id: BRANCH, patient_code: "PAT-PF-1" },
        samples: [],
        report: {
            id: REPORT, order_id: ORDER, tenant_id: TENANT, branch_id: BRANCH, created_by: USER, version_no: 1,
            status: "DRAFT", schema_version: 2, title: "Reporte de pacietne", published_at: null, signed_by: null, signed_at: null,
            template,
            report: {
                ...c,
                schema_version: 2,
                rendering_snapshot: {
                    schema_version: 2,
                    template,
                    presentation: {
                        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
                        header: { enabled: true, institution_name: "Laboratorio Sintético", subtitle: "Prueba de latencia" },
                        footer: { enabled: true, custom_text: "Documento sintético", show_page_number: true },
                        style: { primary_color: "#2f6f69" },
                    },
                },
            },
        },
    };
}

async function stubApi(page: Page, shape: Shape, saves: string[]) {
    const full = fullResponse(shape);
    const profile = {
        id: USER, email: "autora@lab.example.invalid", full_name: "Autora Sintética", roles: ["pathologist"],
        permissions: ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"],
        tenant_id: TENANT, branch_ids: [BRANCH],
    };
    await page.route("**/api/**", async (route) => {
        const request = route.request();
        const p = new URL(request.url()).pathname;
        if (p.endsWith("/v1/auth/me")) return route.fulfill({ json: profile });
        if (/\/v1\/reports\/[^/]+\/full$/.test(p)) return route.fulfill({ json: full });
        if (/\/v1\/reports\/[^/]+\/new_version$/.test(p) || /\/v1\/reports\/?$/.test(p)) {
            saves.push(request.postData() ?? "");
            return route.fulfill({ json: {} });
        }
        if (p.includes("/v1/report-letterheads")) return route.fulfill({ json: { letterheads: [] } });
        if (p.includes("/tenants/")) return route.fulfill({ json: { reports_v2_enabled: true } });
        return route.fulfill({ json: {} });
    });
}

// ---------------------------------------------------------------- instrumentation

const INSTRUMENT = () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as unknown as Record<string, unknown>;
    const keys: Array<{ keyToInput: number; keyToRaf: number; keyToFrame: number; wall: number }> = [];
    const events: Array<{ name: string; startTime: number; processingStart: number; processingEnd: number; duration: number }> = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const loaf: Array<{ start: number; duration: number; blocking: number; render: number; styleLayout: number; scripts: string[] }> = [];
    const worker = { posted: 0, byType: {} as Record<string, number>, keysSent: 0 };
    Object.assign(w, { __keys: keys, __events: events, __longTasks: longTasks, __loaf: loaf, __worker: worker });

    let t0: number | null = null;
    window.addEventListener("keydown", (e) => { if (e.isTrusted) t0 = e.timeStamp; }, true);
    window.addEventListener("input", (e) => {
        if (!e.isTrusted || t0 == null) return;
        const down = t0;
        t0 = null;
        const tInput = performance.now();
        requestAnimationFrame(() => {
            const tRaf = performance.now();
            const ch = new MessageChannel();
            ch.port1.onmessage = () => keys.push({ keyToInput: tInput - down, keyToRaf: tRaf - down, keyToFrame: performance.now() - down, wall: performance.timeOrigin + down });
            ch.port2.postMessage(0);
        });
    }, true);

    const observe = (type: string, cb: (e: PerformanceEntry & Record<string, any>) => void, extra: object = {}) => {
        try {
            new PerformanceObserver((l) => l.getEntries().forEach((e) => cb(e as PerformanceEntry & Record<string, any>))).observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        } catch { /* unsupported entry type in this engine */ }
    };
    observe("event", (e) => { if (e.name === "keydown") events.push({ name: e.name, startTime: e.startTime, processingStart: e.processingStart, processingEnd: e.processingEnd, duration: e.duration }); }, { durationThreshold: 16 });
    observe("longtask", (e) => longTasks.push({ start: e.startTime, duration: e.duration }));
    observe("long-animation-frame", (e) => loaf.push({
        start: e.startTime, duration: e.duration, blocking: e.blockingDuration ?? 0, render: e.renderStart - e.startTime, styleLayout: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
        scripts: (e.scripts ?? []).slice(0, 4).map((s: any) => `${s.invokerType}:${s.sourceFunctionName || "-"}:${Math.round(s.duration)}ms`),
    }));

    // Count spelling-worker requests by message type only (never the text).
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
        postMessage(message: unknown, ...rest: unknown[]) {
            const m = message as { type?: string; words?: unknown[] } | null;
            worker.posted += 1;
            const type = String(m?.type ?? "?");
            worker.byType[type] = (worker.byType[type] ?? 0) + 1;
            worker.keysSent += Array.isArray(m?.words) ? m.words.length : 0;
            return (super.postMessage as (...a: unknown[]) => void)(message, ...rest);
        }
    } as typeof Worker;
    /* eslint-enable @typescript-eslint/no-explicit-any */
};

const SUMMARY_TITLE = (page: Page) => page.getByTestId("spelling-summary-title");

interface Stats { n: number; median: number; p95: number; max: number }
const round = (n: number) => Math.round(n * 10) / 10;
function stats(values: number[]): Stats {
    const v = [...values].sort((a, b) => a - b);
    const at = (q: number) => v[Math.min(v.length - 1, Math.floor(q * v.length))] ?? 0;
    return { n: v.length, median: round(at(0.5)), p95: round(at(0.95)), max: round(v[v.length - 1] ?? 0) };
}

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }
function summarizeProfile(profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map<number, number>();
    profile.nodes.forEach((n) => n.children?.forEach((c) => parent.set(c, n.id)));
    const label = (n: ProfileNode) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()?.split("?")[0] ?? ""}:${n.callFrame.lineNumber + 1}`;
    const self = new Map<string, number>();
    const inclusive = new Map<string, number>();
    let total = 0;
    profile.samples.forEach((id, i) => {
        const dt = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0) / 1000;
        total += dt;
        const node = byId.get(id);
        if (!node) return;
        self.set(label(node), (self.get(label(node)) ?? 0) + dt);
        const seen = new Set<string>();
        for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
            const l = label(byId.get(cur)!);
            if (seen.has(l)) continue;
            seen.add(l);
            inclusive.set(l, (inclusive.get(l) ?? 0) + dt);
        }
    });
    const top = (m: Map<string, number>, n: number, skip: RegExp) => [...m.entries()].filter(([k]) => !skip.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ fn: k, ms: round(v) }));
    return {
        totalMs: round(total),
        topSelf: top(self, 14, /^\((idle|root)\)/),
        topInclusive: top(inclusive, 30, /^\((idle|root|program)\)|^\(anon\)  ?:|performWorkUntilDeadline|MessagePort/),
    };
}

// ---------------------------------------------------------------- scenarios

type FieldKind = "title" | "plain" | "quill" | "caption";
interface Scenario {
    id: string;
    description: string;
    shape: Shape;
    field: FieldKind;
    caret: "end" | "middle";
    index?: number;
}

const SCENARIOS: Scenario[] = [
    { id: "title-typical", description: "Report title, typical report (7 sections, table, 6 figures)", shape: TYPICAL, field: "title", caret: "end" },
    { id: "plain-typical", description: "Plain section (~600 chars), typical report", shape: TYPICAL, field: "plain", caret: "end" },
    { id: "quill-typical", description: "Quill section (~1.2k chars, bold/italic), typical report", shape: TYPICAL, field: "quill", caret: "end" },
    { id: "caption-typical", description: "Figure caption (25-char limit), typical report", shape: TYPICAL, field: "caption", caret: "end" },
    { id: "quill-many", description: "Quill section, 24 sections + table + 12 figures (~20k chars total)", shape: MANY, field: "quill", caret: "end" },
    { id: "quill-mid-20k", description: "Quill section of ~20k chars, caret in the middle", shape: LONG20K, field: "quill", caret: "middle" },
    { id: "plain-83k", description: "Plain section of ~83k chars, caret at the end", shape: LONG83K, field: "plain", caret: "end" },
    { id: "quill-83k", description: "Quill section of ~83k chars, caret at the end", shape: LONG83K, field: "quill", caret: "end" },
];
const ONLY = process.env.PERF_ONLY?.split(",").filter(Boolean);

async function focusField(page: Page, s: Scenario) {
    if (s.field === "title") {
        await page.getByLabel("Nombre del reporte").click();
        await page.keyboard.press("End");
        return;
    }
    if (s.field === "caption") {
        const cap = page.getByLabel(/^Nota de /).first();
        await cap.scrollIntoViewIfNeeded();
        await cap.click();
        return;
    }
    const locator = s.field === "quill" ? page.locator(".ql-editor").nth(s.index ?? 0) : page.getByPlaceholder(/^Escribe plain /i).nth(s.index ?? 0);
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    if (s.caret === "middle") {
        await locator.evaluate((el) => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const nodes: Text[] = [];
            for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
            const total = nodes.reduce((a, n) => a + n.length, 0);
            let target = Math.floor(total / 2);
            for (const n of nodes) {
                if (target <= n.length) {
                    const range = document.createRange();
                    range.setStart(n, target);
                    range.collapse(true);
                    const sel = window.getSelection()!;
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
                target -= n.length;
            }
        });
    } else {
        await page.keyboard.press("ControlOrMeta+End");
    }
}

/** Captions hold at most 25 characters: start each phase from an empty caption. */
async function clearCaption(page: Page, s: Scenario) {
    if (s.field !== "caption") return;
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
}

const TYPED = "hallazgo celular con nucleos prominentes y mitosis atipicas en el estroma. ".repeat(4);

async function openScenario(page: Page, s: Scenario, saves: string[]) {
    if (THROTTLE > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
    await page.addInitScript(INSTRUMENT);
    await stubApi(page, s.shape, saves);
    const t0 = Date.now();
    await page.goto(`/report_perf.html?report=${REPORT}`);
    await expect(page.getByLabel("Nombre del reporte")).toHaveValue("Reporte de pacietne", { timeout: 120_000 });
    const readyMs = Date.now() - t0;
    if (CHECKER === "on") await expect(SUMMARY_TITLE(page)).toBeVisible({ timeout: 120_000 });
    const checkedMs = Date.now() - t0;
    await page.waitForTimeout(2500); // let initial composition and checks settle: this is "warm editing"
    return { readyMs, checkedMs };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
for (const s of SCENARIOS.filter((x) => !ONLY || ONLY.length === 0 || ONLY.includes(x.id))) {
    test(`${VARIANT} :: ${s.id}`, async ({ browser }) => {
        test.setTimeout(900_000);
        const saves: string[] = [];
        const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
        const page = await context.newPage();
        const init = await openScenario(page, s, saves);
        const initState = await page.evaluate(() => ({
            longTaskMs: Math.round((window as any).__longTasks.reduce((a: number, t: { duration: number }) => a + t.duration, 0)),
            commits: (window as any).__perfCommits.length,
            worker: { ...(window as any).__worker },
            previewPages: document.querySelectorAll("[data-page-number]").length,
        }));

        await focusField(page, s);
        const reset = () => page.evaluate(() => {
            const w = window as any;
            w.__keys.length = 0; w.__events.length = 0; w.__longTasks.length = 0; w.__loaf.length = 0; w.__perfCommits.length = 0;
            w.__worker.posted = 0; w.__worker.byType = {}; w.__worker.keysSent = 0;
        });
        const warmKeys = s.field === "caption" ? Math.min(KEYS, 20) : KEYS;

        // Cold: the first keys after the page settled (caches/JIT cold for the typing path).
        await clearCaption(page, s);
        await reset();
        await page.keyboard.type(TYPED.slice(0, 8), { delay: KEY_DELAY_MS });
        await page.waitForTimeout(600);
        const cold = await page.evaluate(() => ((window as any).__keys as Array<{ keyToFrame: number }>).map((k) => k.keyToFrame));

        // Warm: sustained realistic typing (80 ms between keys).
        await clearCaption(page, s);
        await reset();
        const typed = TYPED.slice(8, 8 + warmKeys);
        // Independent ground truth for "when did the screen change": CDP screencast frames are only
        // emitted when the compositor presents a new frame (Event Timing alone proved misleading).
        const frames: number[] = [];
        const shot = await context.newCDPSession(page);
        shot.on("Page.screencastFrame", (f: { metadata: { timestamp?: number }; sessionId: number }) => {
            frames.push((f.metadata.timestamp ?? 0) * 1000);
            void shot.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
        });
        await shot.send("Page.startScreencast", { format: "jpeg", quality: 10, maxWidth: 320, maxHeight: 200, everyNthFrame: 1 });
        const tStart = Date.now();
        await page.keyboard.type(typed, { delay: KEY_DELAY_MS });
        const typingWallMs = Date.now() - tStart;
        await page.waitForTimeout(900);
        await shot.send("Page.stopScreencast").catch(() => {});
        const warm = await page.evaluate(() => {
            const w = window as any;
            return { keys: [...w.__keys], events: [...w.__events], longTasks: [...w.__longTasks], loaf: [...w.__loaf], commits: [...w.__perfCommits], worker: { ...w.__worker } };
        });

        // Burst: consecutive typing with no delay; keys must all land, in order.
        await clearCaption(page, s);
        await reset();
        const burst = TYPED.slice(0, s.field === "caption" ? 20 : 60);
        const bStart = Date.now();
        await page.keyboard.type(burst, { delay: 0 });
        const burstTypedMs = Date.now() - bStart;
        await page.waitForTimeout(900);
        const burstState = await page.evaluate(() => {
            const w = window as any;
            return { keys: [...w.__keys], longTasks: [...w.__longTasks], commits: [...w.__perfCommits].length, worker: { ...w.__worker } };
        });

        // Integrity: the focused field ends with exactly what was typed last (nothing dropped or reordered).
        const tail = await page.evaluate(() => {
            const el = document.activeElement as HTMLInputElement | HTMLElement | null;
            if (!el) return "";
            return "value" in el ? (el as HTMLInputElement).value : el.textContent ?? "";
        });
        const integrityOk = s.field === "caption" ? tail === burst : tail.includes(burst);

        // Per key: time until the first presented frame stamped after the keydown.
        const visible = warm.keys.map((k: { wall: number }) => {
            const next = frames.find((t) => t >= k.wall);
            return next === undefined ? Number.NaN : next - k.wall;
        }).filter((v: number) => !Number.isNaN(v));
        const keyToFrame = warm.keys.map((k: { keyToFrame: number }) => k.keyToFrame);
        const keyToInput = warm.keys.map((k: { keyToInput: number }) => k.keyToInput);
        const nextPaint = warm.events.map((e: { duration: number }) => e.duration);
        const commitMs = warm.commits.map((c: { actualDuration: number }) => c.actualDuration);
        const result = {
            variant: VARIANT, checker: CHECKER, cpuThrottle: THROTTLE, scenario: s.id, description: s.description, engine: browser.browserType().name(),
            init: { ...init, ...initState },
            warm: {
                keysTyped: typed.length, keysMeasured: warm.keys.length,
                keyToInputMs: stats(keyToInput), keyToFrameMs: stats(keyToFrame),
                eventTimingKeydownMs: stats(nextPaint), eventTimingKeydownEntries: nextPaint.length,
                presentedFrames: frames.length, keyToPresentedFrameMs: stats(visible),
                eventTimingSample: warm.events.slice(0, 6).map((e: any) => ({ at: round(e.startTime), processingStart: round(e.processingStart - e.startTime), processingEnd: round(e.processingEnd - e.startTime), duration: e.duration })),
                coldFirst8KeyToFrameMs: stats(cold),
                keysOver100ms: keyToFrame.filter((v: number) => v > 100).length,
                keysOver250ms: keyToFrame.filter((v: number) => v > 250).length,
                longTasks: { count: warm.longTasks.length, totalMs: round(warm.longTasks.reduce((a: number, t: { duration: number }) => a + t.duration, 0)), maxMs: round(Math.max(0, ...warm.longTasks.map((t: { duration: number }) => t.duration))) },
                loaf: { count: warm.loaf.length, maxMs: round(Math.max(0, ...warm.loaf.map((t: { duration: number }) => t.duration))), maxStyleLayoutMs: round(Math.max(0, ...warm.loaf.map((t: { styleLayout: number }) => t.styleLayout))), sample: warm.loaf.slice(0, 3).map((l: { scripts: string[]; duration: number }) => ({ ms: round(l.duration), scripts: l.scripts })) },
                reactCommitsPerKey: round(warm.commits.length / Math.max(1, typed.length)),
                reactCommitMs: stats(commitMs), reactCommitTotalMs: round(commitMs.reduce((a: number, b: number) => a + b, 0)),
                workerRequests: warm.worker.posted, workerByType: warm.worker.byType, workerKeysSent: warm.worker.keysSent,
                typingWallMs,
            },
            burst: {
                chars: burst.length, typedMs: burstTypedMs, keysMeasured: burstState.keys.length,
                keyToFrameMs: stats(burstState.keys.map((k: { keyToFrame: number }) => k.keyToFrame)),
                longTasks: burstState.longTasks.length, commits: burstState.commits, workerRequests: burstState.worker.posted,
            },
            integrityOk,
            savesDuringTyping: saves.length,
        };

        // CPU profile in a fresh page (the profiler slows typing, so it is never mixed with latency).
        const pctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
        const ppage = await pctx.newPage();
        await openScenario(ppage, s, []);
        await focusField(ppage, s);
        const cdp: CDPSession = await pctx.newCDPSession(ppage);
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
        await clearCaption(ppage, s);
        await ppage.keyboard.type(TYPED.slice(0, 6), { delay: KEY_DELAY_MS });
        await clearCaption(ppage, s);
        await cdp.send("Profiler.start");
        await ppage.keyboard.type(TYPED.slice(6, 6 + warmKeys), { delay: KEY_DELAY_MS });
        await ppage.waitForTimeout(900);
        const { profile } = await cdp.send("Profiler.stop");
        const profileSummary = summarizeProfile(profile as never);
        await pctx.close();
        await context.close();

        mkdirSync(path.dirname(OUT), { recursive: true });
        let existing: unknown[] = [];
        try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch { /* first scenario */ }
        writeFileSync(OUT, JSON.stringify([...existing, { ...result, cpuProfile: profileSummary }], null, 2));
        test.info().annotations.push({ type: "perf", description: JSON.stringify({ scenario: s.id, keyToFrame: result.warm.keyToFrameMs, longTasks: result.warm.longTasks }) });
        expect(result.integrityOk).toBe(true);
    });
}
