/**
 * Céluma 1.5, issue #64 — Configuración → Numeración, per study type and per sample type.
 *
 * Pins what the screen asks for and shows: inherited vs own numbering, a read-only preview of the type being
 * edited (it never saves by itself), setting and clearing, and the laboratory card previewing the laboratory
 * layer. The API stays the authority (validation, permission, audit, resolution). Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NumberingSettings from "../../pages/numbering_settings";

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DEFAULT = "{BASE}{SEQ}{MM}{YY}";
const HYPHEN = "{BASE}-{SEQ}{MM}{YY}";

const cfg = (kind: string, over: Record<string, unknown> = {}) => ({
    entity_kind: kind, active: true, manual_policy: "allowed", format: DEFAULT, sequence_min_width: 2,
    start_value: 1, scope: "tenant", timezone: "America/Mexico_City", is_default: false, registration: "automatic",
    legacy_manual_policy: false, ...over,
});

const effective = (over: Record<string, unknown> = {}) => ({
    format: DEFAULT, sequence_min_width: 2, start_value: 1, active: true, scope: "tenant",
    timezone: "America/Mexico_City", scheme: "monthly", ...over,
});

const entry = (kind: string, id: string, code: string, name: string, own: Record<string, unknown> | null) => ({
    entity_kind: kind, type_id: id, code, name, is_active: true, source: own ? "type" : "laboratory",
    override: own ? { format: HYPHEN, sequence_min_width: 3, start_value: 1, updated_at: null, updated_by: null, ...own } : null,
    effective: effective(own ? { format: HYPHEN, sequence_min_width: 3, ...own } : {}),
});

const preview = (over: Record<string, unknown> = {}) => ({
    entity_kind: "order", valid: true, errors: [], format: DEFAULT, sequence_min_width: 2, scheme: "monthly",
    timezone: "America/Mexico_City", period_year: 2026, period_month: 10, base_code: "CU",
    examples: [1, 2].map((n) => ({ sequence: n, code: `CU${String(n).padStart(2, "0")}1026` })),
    estimate: { sequence: 3, code: "CU031026", reserved: false, skipped_occupied: 0 }, notice: "n",
    config_source: "laboratory", ...over,
});

interface Calls {
    previews: Array<Record<string, unknown>>;
    writes: Array<{ url: string; method: string; body?: Record<string, unknown> }>;
    lists: number;
}

function stub(opts: { labActive?: boolean; previewFor?: (b: Record<string, unknown>) => unknown } = {}): Calls {
    const calls: Calls = { previews: [], writes: [], lists: 0 };
    const active = opts.labActive ?? true;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.includes("/numbering/preview")) {
            const body = JSON.parse(String(init?.body));
            calls.previews.push(body);
            return json(opts.previewFor ? opts.previewFor(body) : preview());
        }
        if (url.includes("/numbering/type-configs/") && method !== "GET") {
            calls.writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            return json(entry("order", "st1", "CU", "Citología", method === "PUT" ? {} : null));
        }
        if (url.includes("/numbering/type-configs/order")) {
            calls.lists += 1;
            return json({
                entity_kind: "order", laboratory: effective({ active }),
                types: [entry("order", "st1", "CU", "Citología", null), entry("order", "st2", "HI", "Histología", {})],
            });
        }
        if (url.includes("/numbering/type-configs/sample")) {
            calls.lists += 1;
            return json({ entity_kind: "sample", laboratory: effective({ active }), types: [entry("sample", "sp1", "BX", "Biopsia", null)] });
        }
        if (url.includes("/numbering/config")) return json({ order: cfg("order", { active }), sample: cfg("sample", { active }) });
        if (url.includes("/study-types/")) {
            return json({ study_types: [
                { id: "st1", code: "CU", name: "Citología", is_active: true },
                { id: "st2", code: "HI", name: "Histología", is_active: true },
            ] });
        }
        if (url.includes("/sample-types/")) return json({ sample_types: [{ id: "sp1", code: "BX", name: "Biopsia", is_active: true }] });
        return json({});
    }));
    return calls;
}

beforeEach(() => localStorage.setItem("auth_token", "Bearer test-token"));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

const renderPage = () => render(<MemoryRouter><NumberingSettings embedded /></MemoryRouter>);
const typeCard = (kind: string) => within(screen.getByTestId(`type-numbering-${kind}`));

describe("numbering by type", () => {
    it("lists every type with whether it inherits the laboratory's numbering or has its own", async () => {
        stub();
        renderPage();
        await waitFor(() => expect(screen.getByTestId("source-order-CU").textContent).toBe("Laboratorio (predeterminada)"));
        expect(screen.getByTestId("source-order-HI").textContent).toBe("Propia");
        expect(screen.getByTestId("effective-order-CU").textContent).toContain(DEFAULT);
        expect(screen.getByTestId("effective-order-HI").textContent).toContain(HYPHEN);
        expect(screen.getByTestId("source-sample-BX").textContent).toBe("Laboratorio (predeterminada)");
        // Only a type with its own numbering can be cleared.
        expect(screen.queryByTestId("clear-order-CU")).toBeNull();
        expect(screen.getByTestId("clear-order-HI")).toBeInTheDocument();
    });

    it("the editor shows the inherited settings and previews the type without saving", async () => {
        const calls = stub();
        renderPage();
        fireEvent.click(await screen.findByTestId("edit-order-CU"));
        const editor = within(await screen.findByTestId("type-order-CU-editor"));
        const inherited = screen.getByTestId("type-order-CU-inherited").textContent ?? "";
        expect(inherited).toContain("activa");
        expect(inherited).toContain("todo el laboratorio");
        expect(inherited).toContain("America/Mexico_City");
        fireEvent.click(editor.getByLabelText(/Con guion/));
        await waitFor(() => expect(calls.previews.some((p) => p.scope_id === "st1" && p.format === HYPHEN)).toBe(true), { timeout: 3000 });
        expect(calls.previews.find((p) => p.scope_id === "st1" && p.format === HYPHEN)).toMatchObject({
            entity_kind: "order", layer: "effective", sequence_min_width: 2, start_value: 1,
        });
        // The editor's preview never sends laboratory-only settings and never writes anything.
        expect(calls.previews.find((p) => p.format === HYPHEN && p.scope_id === "st1")).not.toHaveProperty("scope");
        expect(calls.writes).toHaveLength(0);
    });

    it("saving a type configuration sends only format, width and start value to the type's endpoint", async () => {
        const calls = stub();
        renderPage();
        fireEvent.click(await screen.findByTestId("edit-order-CU"));
        const editor = within(await screen.findByTestId("type-order-CU-editor"));
        fireEvent.click(editor.getByLabelText(/Con guion/));
        fireEvent.change(editor.getByLabelText("Ancho mínimo del consecutivo"), { target: { value: "4" } });
        const save = () => screen.getByTestId("type-order-CU-save") as HTMLButtonElement;
        await waitFor(() => expect(save().disabled).toBe(false), { timeout: 3000 });
        const listsBefore = calls.lists;
        fireEvent.click(save());
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0]).toMatchObject({ method: "PUT", body: { format: HYPHEN, sequence_min_width: 4, start_value: 1 } });
        expect(calls.writes[0].url).toContain("/v1/numbering/type-configs/order/st1");
        await waitFor(() => expect(calls.lists).toBeGreaterThan(listsBefore));  // the table is reloaded
    });

    it("an invalid type format shows the server's reasons and cannot be saved", async () => {
        stub({ previewFor: (b) => (b.format === "{BASE}{SEQ}" ? preview({ valid: false, errors: ["{MM} must appear exactly once"], examples: [], estimate: null }) : preview()) });
        renderPage();
        fireEvent.click(await screen.findByTestId("edit-order-CU"));
        const editor = within(await screen.findByTestId("type-order-CU-editor"));
        fireEvent.change(editor.getByLabelText("Formato"), { target: { value: "{BASE}{SEQ}" } });
        await waitFor(() => expect(screen.getByTestId("type-order-CU-errors").textContent).toContain("{MM}"), { timeout: 3000 });
        expect((screen.getByTestId("type-order-CU-save") as HTMLButtonElement).disabled).toBe(true);
    });

    it("clearing asks for confirmation and then calls DELETE for that type", async () => {
        const calls = stub();
        renderPage();
        fireEvent.click(await screen.findByTestId("clear-order-HI"));
        expect(calls.writes).toHaveLength(0);
        fireEvent.click(await screen.findByRole("button", { name: "Sí, usar la del laboratorio" }));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].method).toBe("DELETE");
        expect(calls.writes[0].url).toContain("/v1/numbering/type-configs/order/st2");
    });

    it("the laboratory card previews the laboratory layer and says when the type has its own numbering", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        await waitFor(() => expect(calls.previews.some((p) => p.entity_kind === "order" && p.layer === "laboratory")).toBe(true), { timeout: 3000 });
        expect(screen.queryByTestId("own-type-note-order")).toBeNull();  // first type (CU) inherits
    });

    it("while monthly numbering is not activated, the type section says configurations wait for activation", async () => {
        stub({ labActive: false });
        renderPage();
        expect((await screen.findByTestId("type-inactive-note-order")).textContent).toContain("se aplican al activarla");
        expect(typeCard("sample").getByTestId("type-inactive-note-sample")).toBeInTheDocument();
    });
});
