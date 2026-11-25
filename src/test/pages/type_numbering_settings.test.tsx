/**
 * Céluma 1.5, issue #64 — numbering per study type and per sample type, from BOTH entry points:
 * Configuración → Numeración (the per-type table and its editor panel) and the Numeración section of
 * Editar tipo de estudio / Editar tipo de muestra. Both use the same shared editor and the same API calls.
 *
 * Pins: inherited vs own vs stored-but-inactive, the read-only preview next to the controls, set / edit / clear
 * (with confirmation), parity and refresh between entry points, unsaved catalog edits surviving numbering actions,
 * the separate save boundary, the new-type path, read-only without the permission, and recovery after failures.
 * The API stays the authority. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NumberingSettings from "../../pages/numbering_settings";
import StudyTypes from "../../pages/study_types";
import SampleTypes from "../../pages/sample_types";

const perms = { manage: true };
vi.mock("../../hooks/use_user_profile", () => ({ useUserProfile: () => ({ hasPermission: (p: string) => p !== "admin:manage_catalog" || perms.manage }) }));
vi.mock("../../components/ui/sidebar_menu", () => ({ default: () => null }));

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DEFAULT = "{BASE}{SEQ}{MM}{YY}";
const HYPHEN = "{BASE}-{SEQ}{MM}{YY}";

interface Own { format: string; sequence_min_width: number; start_value: number }
interface World {
    active: boolean;
    own: Record<string, Own | undefined>;
    previews: Array<Record<string, unknown>>;
    writes: Array<{ url: string; method: string; body?: Record<string, unknown> }>;
    catalogWrites: Array<{ url: string; method: string; body: Record<string, unknown> }>;
    failNext: { put?: number; del?: number; list?: number; preview?: number };
}

const STUDY = [{ id: "st1", code: "CU", name: "Citología" }, { id: "st2", code: "HI", name: "Histología" }];
const SAMPLE = [{ id: "sp1", code: "BX", name: "Biopsia" }, { id: "sp2", code: "TJ", name: "Tejido" }];

function lab(w: World) {
    return { format: DEFAULT, sequence_min_width: 2, start_value: 1, active: w.active, scope: "tenant", timezone: "America/Mexico_City", scheme: w.active ? "monthly" : "legacy" };
}
function entry(w: World, kind: string, t: { id: string; code: string; name: string }) {
    const own = w.own[t.id];
    const l = lab(w);
    return {
        entity_kind: kind, type_id: t.id, code: t.code, name: t.name, is_active: true, source: own ? "type" : "laboratory",
        override: own ? { ...own, updated_at: null, updated_by: null } : null,
        effective: { ...l, ...(own ?? {}) },
    };
}
const render_ = (fmt: string, code: string, width: number, seq: number) =>
    fmt.replace("{BASE}", code).replace("{SEQ}", String(seq).padStart(width, "0")).replace("{MM}", "11").replace("{YY}", "26");

function world(over: Partial<World> = {}): World {
    const w: World = { active: true, own: { st2: { format: HYPHEN, sequence_min_width: 3, start_value: 1 } }, previews: [], writes: [], catalogWrites: [], failNext: {}, ...over };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (url.includes("/numbering/preview")) {
            w.previews.push(body);
            if (w.failNext.preview) { w.failNext.preview -= 1; return json({ detail: "preview caído" }, 500); }
            const kind = body.entity_kind as string;
            const t = [...STUDY, ...SAMPLE].find((x) => x.id === body.scope_id) ?? { id: "", code: "BASE", name: "" };
            const own = body.layer === "laboratory" ? undefined : w.own[t.id];
            const fmt = body.format ?? own?.format ?? DEFAULT;
            const width = body.sequence_min_width ?? own?.sequence_min_width ?? 2;
            const valid = fmt.includes("{MM}");
            return json({
                entity_kind: kind, valid, errors: valid ? [] : ["{MM} must appear exactly once"], format: fmt, sequence_min_width: width,
                scheme: w.active ? "monthly" : "legacy", timezone: "America/Mexico_City", period_year: 2026, period_month: 11, base_code: t.code,
                examples: valid ? [1, 2, 10, 100].map((n) => ({ sequence: n, code: render_(fmt, t.code, width, n) })) : [],
                estimate: valid ? { sequence: 4, code: w.active ? render_(fmt, t.code, width, 4) : `${t.code}-4`, reserved: false, skipped_occupied: 0 } : null,
                notice: "n", config_source: own ? "type" : "laboratory",
            });
        }
        const m = url.match(/\/numbering\/type-configs\/(order|sample)\/([^/?]+)/);
        if (m && method !== "GET") {
            w.writes.push({ url, method, body });
            if (method === "PUT") {
                if (w.failNext.put) { w.failNext.put -= 1; return json({ detail: { code: "numbering_invalid_config", message: "Servidor no disponible" } }, 503); }
                w.own[m[2]] = body as Own;
            } else {
                if (w.failNext.del) { w.failNext.del -= 1; return json({ detail: "Servidor no disponible" }, 503); }
                w.own[m[2]] = undefined;
            }
            const t = [...STUDY, ...SAMPLE].find((x) => x.id === m[2])!;
            return json(entry(w, m[1], t));
        }
        const l = url.match(/\/numbering\/type-configs\/(order|sample)$/);
        if (l) {
            if (w.failNext.list) { w.failNext.list -= 1; return json({ detail: "lista caída" }, 500); }
            const types = l[1] === "order" ? STUDY : SAMPLE;
            return json({ entity_kind: l[1], laboratory: lab(w), types: types.map((t) => entry(w, l[1], t)) });
        }
        if (url.includes("/numbering/config")) {
            const c = (kind: string) => ({ entity_kind: kind, ...lab(w), manual_policy: "allowed", is_default: false, registration: "automatic", legacy_manual_policy: false });
            return json({ order: c("order"), sample: c("sample") });
        }
        if (url.includes("/study-types/") && method !== "GET") {
            w.catalogWrites.push({ url, method, body });
            return json({ id: method === "POST" ? "st9" : "st1", ...body });
        }
        if (url.includes("/sample-types/") && method !== "GET") {
            w.catalogWrites.push({ url, method, body });
            return json({ id: method === "POST" ? "sp9" : "sp1", ...body });
        }
        if (url.includes("/study-types/")) {
            return json({ study_types: STUDY.map((t) => ({ ...t, tenant_id: "t", is_active: true, created_at: "2026-11-01T00:00:00" })) });
        }
        if (url.includes("/sample-types/")) {
            return json({ sample_types: SAMPLE.map((t) => ({ ...t, tenant_id: "t", is_active: true, created_at: "2026-11-01T00:00:00" })) });
        }
        if (url.includes("/reports/templates")) return json({ templates: [] });
        return json({});
    }));
    return w;
}

beforeEach(() => {
    perms.manage = true;
    localStorage.setItem("auth_token", "Bearer test-token");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

const settings = () => render(<MemoryRouter><NumberingSettings embedded /></MemoryRouter>);
const typeCard = (kind: string) => within(screen.getByTestId(`type-numbering-${kind}`));
const btn = (el: HTMLElement) => (el.closest("button") ?? el) as HTMLButtonElement;

async function openStudyEditor(code = "HI") {
    render(<MemoryRouter><StudyTypes embedded /></MemoryRouter>);
    const row = (await screen.findByText(code)).closest("tr")!;
    fireEvent.click(within(row).getByTitle("Editar"));
    return within(await screen.findByTestId("study-type-numbering"));
}
async function openSampleEditor(code = "BX") {
    render(<MemoryRouter><SampleTypes embedded /></MemoryRouter>);
    const row = (await screen.findByText(code)).closest("tr")!;
    fireEvent.click(within(row).getByTitle("Editar"));
    return within(await screen.findByTestId("sample-type-numbering"));
}

describe("Configuración → Numeración, per type", () => {
    it("lists every type with its source and an example, separately from the laboratory defaults", async () => {
        world();
        settings();
        await waitFor(() => expect(screen.getByTestId("source-order-CU").textContent).toContain("Predeterminada del laboratorio"));
        expect(screen.getByTestId("source-order-HI").textContent).toContain("Configuración propia");
        expect(screen.getByTestId("example-order-HI").textContent).toMatch(/^HI-001\d{4}$/);
        expect(screen.getByTestId("type-count-order").textContent).toContain("1 con configuración propia");
        // laboratory defaults and per-type settings are separate cards
        expect(screen.getByTestId("numbering-card-order")).not.toContainElement(screen.getByTestId("type-numbering-order"));
    });

    it("searches types by name or code", async () => {
        world();
        settings();
        await screen.findByTestId("source-order-HI");
        fireEvent.change(typeCard("order").getByPlaceholderText(/Buscar tipo de estudio/), { target: { value: "cu" } });
        await waitFor(() => expect(screen.queryByTestId("source-order-HI")).toBeNull());
        expect(screen.getByTestId("source-order-CU")).toBeInTheDocument();
    });

    it("Configurar opens the shared editor with a read-only preview of the type, without saving", async () => {
        const w = world();
        settings();
        fireEvent.click(btn(await screen.findByTestId("edit-order-CU")));
        const editor = within(await screen.findByTestId("type-editor-order"));
        expect(editor.getByText(/Al guardar, este tipo dejará de usar la numeración del laboratorio/)).toBeInTheDocument();
        fireEvent.click(editor.getByRole("button", { name: /Con guion/ }));
        await waitFor(() => expect(w.previews.some((p) => p.scope_id === "st1" && p.format === HYPHEN)).toBe(true), { timeout: 3000 });
        const p = w.previews.find((x) => x.scope_id === "st1" && x.format === HYPHEN)!;
        expect(p).toMatchObject({ entity_kind: "order", layer: "effective", sequence_min_width: 2, start_value: 1 });
        expect(p).not.toHaveProperty("scope");  // laboratory-only settings are never sent by the type editor
        await waitFor(() => expect(screen.getByTestId("row-order-CU-preview-code").textContent).toBe("CU-041126"));
        expect(screen.getByTestId("row-order-CU-preview-notice").textContent).toMatch(/no reserva ningún número/);
        expect(w.writes).toHaveLength(0);
    });

    it("saving sends only format, width and start value, then the table shows the new source", async () => {
        const w = world();
        settings();
        fireEvent.click(btn(await screen.findByTestId("edit-order-CU")));
        await screen.findByTestId("type-editor-order");
        fireEvent.click(within(screen.getByTestId("row-order-CU-separator")).getByRole("button", { name: /Con guion/ }));
        fireEvent.change(screen.getByTestId("row-order-CU-width"), { target: { value: "4" } });
        await waitFor(() => expect(btn(screen.getByTestId("row-order-CU-save")).disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(btn(screen.getByTestId("row-order-CU-save")));
        await waitFor(() => expect(w.writes).toHaveLength(1));
        expect(w.writes[0]).toMatchObject({ method: "PUT", body: { format: HYPHEN, sequence_min_width: 4, start_value: 1 } });
        expect(w.writes[0].url).toContain("/v1/numbering/type-configs/order/st1");
        await waitFor(() => expect(screen.getByTestId("source-order-CU").textContent).toContain("Configuración propia"));
    });

    it("a failed save keeps the typed values and the retry resends them", async () => {
        const w = world({ failNext: { put: 1 } });
        settings();
        fireEvent.click(btn(await screen.findByTestId("edit-order-CU")));
        await screen.findByTestId("type-editor-order");
        fireEvent.change(screen.getByTestId("row-order-CU-start"), { target: { value: "70" } });
        await waitFor(() => expect(btn(screen.getByTestId("row-order-CU-save")).disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(btn(screen.getByTestId("row-order-CU-save")));
        // A 5xx is reported with the app's standard server message.
        await waitFor(() => expect(screen.getByTestId("row-order-CU-save-error").textContent).toMatch(/servidor/i));
        expect((screen.getByTestId("row-order-CU-start") as HTMLInputElement).value).toBe("70");
        expect(btn(screen.getByTestId("row-order-CU-save")).textContent).toContain("Reintentar");
        fireEvent.click(btn(screen.getByTestId("row-order-CU-save")));
        await waitFor(() => expect(w.writes).toHaveLength(2));
        expect(w.writes[1].body).toMatchObject({ start_value: 70 });
        await waitFor(() => expect(screen.getByTestId("source-order-CU").textContent).toContain("Configuración propia"));
    });

    it("an invalid format is explained and cannot be saved", async () => {
        world();
        settings();
        fireEvent.click(btn(await screen.findByTestId("edit-order-CU")));
        await screen.findByTestId("type-editor-order");
        fireEvent.click(screen.getByTestId("row-order-CU-advanced"));
        fireEvent.change(screen.getByTestId("row-order-CU-format"), { target: { value: "{BASE}{SEQ}" } });
        await waitFor(() => expect(screen.getByTestId("row-order-CU-preview-errors").textContent).toContain("{MM}"), { timeout: 3000 });
        expect(btn(screen.getByTestId("row-order-CU-save")).disabled).toBe(true);
        expect((screen.getByTestId("row-order-CU-format") as HTMLInputElement).value).toBe("{BASE}{SEQ}");
    });

    it("clearing asks first, states the consequences, and a failed clear can be retried", async () => {
        const w = world({ failNext: { del: 1 } });
        settings();
        fireEvent.click(btn(await screen.findByTestId("edit-order-HI")));
        await screen.findByTestId("type-editor-order");
        fireEvent.click(btn(await screen.findByTestId("row-order-HI-cancel")));  // leave the editor: state view
        fireEvent.click(btn(await screen.findByTestId("row-order-HI-clear")));
        expect(w.writes).toHaveLength(0);
        const dialog = await screen.findByText("¿Usar la numeración del laboratorio?");
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText("Los códigos ya emitidos no cambian.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sí, usar la del laboratorio" }));
        await waitFor(() => expect(screen.getByTestId("row-order-HI-clear-error")).toBeInTheDocument());
        // (regex: in jsdom antd's spinner leave-animation never ends, so the name keeps a "loading" prefix)
        fireEvent.click(await screen.findByRole("button", { name: /Sí, usar la del laboratorio/ }));
        await waitFor(() => expect(w.writes.filter((x) => x.method === "DELETE")).toHaveLength(2));
        await waitFor(() => expect(screen.getByTestId("source-order-HI").textContent).toContain("Predeterminada del laboratorio"));
    });

    it("while monthly numbering is off, a stored type configuration is shown as having no effect", async () => {
        world({ active: false });
        settings();
        await waitFor(() => expect(screen.getByTestId("source-order-HI-inactive").textContent).toContain("sin efecto"));
        expect(screen.queryByTestId("source-order-CU-inactive")).toBeNull();
        expect(screen.getByTestId("example-order-HI").textContent).toBe("HI-1");
    });

    it("a failed list load offers a retry", async () => {
        world({ failNext: { list: 2 } });
        settings();
        fireEvent.click(btn(await screen.findByTestId("type-retry-order")));
        await waitFor(() => expect(screen.getByTestId("source-order-CU")).toBeInTheDocument());
    });
});

describe("Editar tipo de estudio / de muestra — Numeración section", () => {
    it("shows the same source and preview as the central page", async () => {
        world();
        const section = await openStudyEditor("HI");
        await waitFor(() => expect(section.getByTestId("study-type-numbering-source").textContent).toContain("Configuración propia"));
        expect(section.getByTestId("study-type-numbering-effective").textContent).toContain(HYPHEN);
        await waitFor(() => expect(section.getByTestId("study-type-numbering-preview-code").textContent).toBe("HI-0041126"));
    });

    it("numbering actions never discard or submit unsaved catalog edits; its own save is separate", async () => {
        const w = world();
        const section = await openStudyEditor("CU");
        const name = screen.getByDisplayValue("Citología") as HTMLInputElement;
        fireEvent.change(name, { target: { value: "Citología cervical" } });
        fireEvent.click(btn(await section.findByTestId("study-type-numbering-edit")));
        fireEvent.click(within(section.getByTestId("study-type-numbering-separator")).getByRole("button", { name: /Con guion/ }));
        // Enter inside a numbering field does not submit the catalog form.
        fireEvent.keyDown(section.getByTestId("study-type-numbering-width"), { key: "Enter" });
        await waitFor(() => expect(btn(section.getByTestId("study-type-numbering-save")).disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(btn(section.getByTestId("study-type-numbering-save")));
        await waitFor(() => expect(w.writes).toHaveLength(1));
        expect(w.catalogWrites).toHaveLength(0);
        expect((screen.getByDisplayValue("Citología cervical") as HTMLInputElement).value).toBe("Citología cervical");
        await waitFor(() => expect(section.getByTestId("study-type-numbering-source").textContent).toContain("Configuración propia"));
        // Clearing from here, too, keeps the unsaved name.
        fireEvent.click(btn(section.getByTestId("study-type-numbering-clear")));
        fireEvent.click(await screen.findByRole("button", { name: "Sí, usar la del laboratorio" }));
        await waitFor(() => expect(section.getByTestId("study-type-numbering-source").textContent).toContain("Predeterminada del laboratorio"));
        expect(screen.getByDisplayValue("Citología cervical")).toBeInTheDocument();
        expect(w.catalogWrites).toHaveLength(0);
        // The catalog save then saves the catalog data only.
        fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
        await waitFor(() => expect(w.catalogWrites).toHaveLength(1));
        expect(w.catalogWrites[0].body).toMatchObject({ name: "Citología cervical" });
        expect(w.writes).toHaveLength(2);
    });

    it("cancelling the numbering editor keeps catalog edits; saving the type with unsaved numbering asks first", async () => {
        const w = world();
        const section = await openSampleEditor("BX");
        fireEvent.change(screen.getByDisplayValue("Biopsia"), { target: { value: "Biopsia renal" } });
        fireEvent.click(btn(await section.findByTestId("sample-type-numbering-edit")));
        fireEvent.click(btn(section.getByTestId("sample-type-numbering-cancel")));
        expect(screen.getByDisplayValue("Biopsia renal")).toBeInTheDocument();
        fireEvent.click(btn(section.getByTestId("sample-type-numbering-edit")));
        fireEvent.change(section.getByTestId("sample-type-numbering-start"), { target: { value: "25" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
        expect(await screen.findByText("Hay cambios de numeración sin guardar")).toBeInTheDocument();
        expect(w.catalogWrites).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Volver" }));
        expect((section.getByTestId("sample-type-numbering-start") as HTMLInputElement).value).toBe("25");
        fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
        fireEvent.click(await screen.findByRole("button", { name: "Guardar sin la numeración" }));
        await waitFor(() => expect(w.catalogWrites).toHaveLength(1));
        expect(w.writes).toHaveLength(0);
    });

    it("the sample type controls its sample numbering through the sample endpoint", async () => {
        const w = world();
        const section = await openSampleEditor("TJ");
        fireEvent.click(btn(await section.findByTestId("sample-type-numbering-edit")));
        fireEvent.change(section.getByTestId("sample-type-numbering-width"), { target: { value: "3" } });
        await waitFor(() => expect(btn(section.getByTestId("sample-type-numbering-save")).disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(btn(section.getByTestId("sample-type-numbering-save")));
        await waitFor(() => expect(w.writes).toHaveLength(1));
        expect(w.writes[0].url).toContain("/v1/numbering/type-configs/sample/sp2");
        expect(w.previews.every((p) => p.entity_kind === "sample")).toBe(true);
    });

    it("a new type explains when numbering can be configured and «Crear y configurar numeración» continues in its editor", async () => {
        const w = world();
        render(<MemoryRouter><StudyTypes embedded /></MemoryRouter>);
        fireEvent.click(await screen.findByRole("button", { name: "Nuevo Tipo de Estudio" }));
        const section = within(await screen.findByTestId("study-type-numbering"));
        expect(section.getByText(/Al crearlo, este tipo usará la numeración del laboratorio/)).toBeInTheDocument();
        STUDY.push({ id: "st9", code: "PQ", name: "Pieza quirúrgica" });
        try {
            const dialog = within(screen.getByRole("dialog"));
            fireEvent.change(dialog.getAllByRole("textbox")[0], { target: { value: "PQ" } });
            fireEvent.change(dialog.getAllByRole("textbox")[1], { target: { value: "Pieza quirúrgica" } });
            fireEvent.click(btn(section.getByTestId("study-type-numbering-create-and-configure")));
            await waitFor(() => expect(w.catalogWrites).toHaveLength(1));
            expect(w.catalogWrites[0]).toMatchObject({ method: "POST" });
            // Same dialog, now editing the new type, with its numbering editor already open.
            expect(await screen.findByText("Editar Tipo de Estudio")).toBeInTheDocument();
            expect(await screen.findByTestId("study-type-numbering-editor")).toBeInTheDocument();
        } finally {
            STUDY.pop();
        }
    });

    it("without the catalog permission the section is read-only", async () => {
        perms.manage = false;
        world();
        const section = await openStudyEditor("HI");
        await waitFor(() => expect(section.getByTestId("study-type-numbering-readonly")).toBeInTheDocument());
        expect(section.queryByTestId("study-type-numbering-edit")).toBeNull();
        expect(section.queryByTestId("study-type-numbering-clear")).toBeNull();
    });

    it("a failed load in the type editor offers a retry", async () => {
        world({ failNext: { list: 1 } });
        const section = await openStudyEditor("CU");
        fireEvent.click(btn(await section.findByTestId("study-type-numbering-reload")));
        await waitFor(() => expect(section.getByTestId("study-type-numbering-source")).toBeInTheDocument());
    });

    it("a failed preview keeps the inputs and recovers on retry", async () => {
        const w = world();
        const section = await openStudyEditor("CU");
        fireEvent.click(btn(await section.findByTestId("study-type-numbering-edit")));
        w.failNext.preview = 1;
        fireEvent.change(section.getByTestId("study-type-numbering-start"), { target: { value: "9" } });
        await waitFor(() => expect(section.getByText(/No se pudo calcular la vista previa/)).toBeInTheDocument(), { timeout: 3000 });
        expect((section.getByTestId("study-type-numbering-start") as HTMLInputElement).value).toBe("9");
        await act(async () => { fireEvent.click(btn(section.getByTestId("study-type-numbering-preview-retry"))); });
        await waitFor(() => expect(section.queryByText(/No se pudo calcular la vista previa/)).toBeNull(), { timeout: 3000 });
    });
});
