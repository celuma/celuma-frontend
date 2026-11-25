/**
 * Céluma 1.4, issue #8 — Configuración → Numeración (laboratory defaults; layout of 1.5 #64: one tab per
 * kind, common options first, custom format / scope / timezone under «Opciones avanzadas»).
 *
 * The page edits the format / minimum width / scope of the
 * order and sample codes and previews them. The API stays the authority
 * (validation, permission, audit); these tests pin what the screen asks for
 * and shows, in particular that a preview is a read-only request that is
 * labelled as not reserving anything. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NumberingSettings from "../../pages/numbering_settings";

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const cfg = (kind: string, over: Record<string, unknown> = {}) => ({
    entity_kind: kind, active: false, manual_policy: "allowed", format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2,
    start_value: 1, scope: "tenant", timezone: "America/Mexico_City", is_default: true, registration: "automatic", legacy_manual_policy: false, ...over,
});

const preview = (over: Record<string, unknown> = {}) => ({
    entity_kind: "order", valid: true, errors: [], format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, scheme: "monthly", timezone: "America/Mexico_City",
    period_year: 2026, period_month: 10, base_code: "CU",
    examples: [1, 99, 100, 1000].map((n) => ({ sequence: n, code: `CU${String(n).padStart(2, "0")}1026` })),
    estimate: { sequence: 3, code: "CU031026", reserved: false, skipped_occupied: 0 }, notice: "n", ...over,
});

interface Calls {
    previews: Array<Record<string, unknown>>;
    puts: Array<{ url: string; body: Record<string, unknown> }>;
}

function stub(previewFor: (body: Record<string, unknown>) => unknown = () => preview()): Calls {
    const calls: Calls = { previews: [], puts: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/numbering/preview")) {
            const body = JSON.parse(String(init?.body));
            calls.previews.push(body);
            return json(previewFor(body));
        }
        if (url.includes("/numbering/config/") && init?.method === "PUT") {
            const body = JSON.parse(String(init.body));
            calls.puts.push({ url, body });
            return json({ ...cfg(url.endsWith("/order") ? "order" : "sample"), ...body, is_default: false });
        }
        if (url.includes("/numbering/config")) return json({ order: cfg("order"), sample: cfg("sample") });
        if (url.includes("/study-types/")) return json({ study_types: [{ id: "st1", code: "CU", name: "Citología", is_active: true }] });
        if (url.includes("/sample-types/")) return json({ sample_types: [{ id: "sp1", code: "BX", name: "Biopsia", is_active: true }] });
        return json({});
    }));
    return calls;
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

const renderPage = () => render(<MemoryRouter><NumberingSettings embedded /></MemoryRouter>);
const card = (kind: string) => within(screen.getByTestId(`numbering-card-${kind}`));
/** Each kind lives in its own tab; the sample tab is mounted when chosen. */
async function openTab(kind: "order" | "sample") {
    fireEvent.click(await screen.findByTestId(`tab-${kind}`));
    return await screen.findByTestId(`numbering-card-${kind}`);
}
const advanced = (kind: string) => fireEvent.click(card(kind).getByTestId(`advanced-${kind}`));
const formatInput = (kind: string) => card(kind).getByTestId(`format-${kind}`) as HTMLInputElement;
const saveButton = (kind: string) => card(kind).getByTestId(`save-${kind}`).closest("button") as HTMLButtonElement;
const pressed = (kind: string, name: RegExp) =>
    within(card(kind).getByTestId(`separator-${kind}`)).getByRole("button", { name }).getAttribute("aria-pressed");

describe("numbering settings page", () => {
    it("shows each kind in its own tab, NOT activated by default, with the compatibility explanation", async () => {
        stub();
        renderPage();
        expect(await screen.findByTestId("numbering-card-order")).toBeInTheDocument();
        expect(screen.getByTestId("inactive-note-order").textContent).toContain("formato anterior");
        expect(screen.queryByTestId("policy-order")).toBeNull();  // no manual-code policy control any more
        await openTab("sample");
        expect(screen.getByTestId("inactive-note-sample").textContent).toContain("también de forma automática");
        expect((card("sample").getByTestId("active-sample") as HTMLButtonElement).getAttribute("aria-checked")).toBe("false");
    });

    it("the common path shows separator, width and start value; the custom format is under advanced options", async () => {
        stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        expect(pressed("order", /Sin separador/)).toBe("true");
        expect((card("order").getByTestId("width-order") as HTMLInputElement).value).toBe("2");
        expect((card("order").getByTestId("start-order") as HTMLInputElement).value).toBe("1");
        const toggle = card("order").getByTestId("advanced-order");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        advanced("order");
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(formatInput("order").value).toBe("{BASE}{SEQ}{MM}{YY}");
    });

    it("every preview is labelled as a non-reserving estimate next to the controls", async () => {
        stub();
        renderPage();
        await waitFor(() => expect(screen.getByTestId("preview-order-code").textContent).toBe("CU031026"), { timeout: 3000 });
        expect(screen.getByTestId("estimate-order").textContent).toContain("CU031026");
        expect(screen.getByTestId("preview-order-notice").textContent).toMatch(/no reserva ningún número/);
        expect(screen.getByTestId("preview-order").textContent).toContain("CU1001026");  // width grows past 99
    });

    it("offers both separator presets: no separator (CU011026) and hyphen (CU-011026)", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        const group = within(card("order").getByTestId("separator-order"));
        expect(group.getByText("CU011026")).toBeInTheDocument();
        expect(group.getByText("CU-011026")).toBeInTheDocument();
        fireEvent.click(group.getByRole("button", { name: /Con guion/ }));
        expect(pressed("order", /Con guion/)).toBe("true");
        await waitFor(() => expect(calls.previews.some((p) => p.format === "{BASE}-{SEQ}{MM}{YY}")).toBe(true), { timeout: 3000 });
        fireEvent.click(group.getByRole("button", { name: /Sin separador/ }));
        await waitFor(() => expect(calls.previews.at(-1)?.format).toBe("{BASE}{SEQ}{MM}{YY}"), { timeout: 3000 });
    });

    it("typing a custom format switches the separator to 'custom' and previews the candidate without saving", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        advanced("order");
        fireEvent.change(formatInput("order"), { target: { value: "{BASE}.{SEQ}{MM}{YYYY}" } });
        await waitFor(() => expect(calls.previews.some((p) => p.format === "{BASE}.{SEQ}{MM}{YYYY}")).toBe(true), { timeout: 3000 });
        expect(calls.previews.find((p) => p.format === "{BASE}.{SEQ}{MM}{YYYY}")).toMatchObject({ entity_kind: "order", scope_id: "st1", scope: "tenant", layer: "laboratory" });
        expect(pressed("order", /personalizado/i)).toBe("true");
        expect(calls.puts).toHaveLength(0);
    });

    it("an invalid candidate shows the server's reasons and disables saving", async () => {
        stub((body) => (body.format === "{BASE}{SEQ}" ? preview({ valid: false, errors: ["{MM} must appear exactly once"], examples: [], estimate: null }) : preview()));
        renderPage();
        await screen.findByTestId("numbering-card-order");
        advanced("order");
        fireEvent.change(formatInput("order"), { target: { value: "{BASE}{SEQ}" } });
        await waitFor(() => expect(screen.getByTestId("preview-order-errors").textContent).toContain("{MM} must appear exactly once"), { timeout: 3000 });
        expect(saveButton("order").disabled).toBe(true);
    });

    it("an out-of-range width is flagged and blocks preview and save, keeping what was typed", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        await waitFor(() => expect(calls.previews.length).toBeGreaterThan(0), { timeout: 3000 });
        const before = calls.previews.length;
        fireEvent.change(card("order").getByTestId("width-order"), { target: { value: "9" } });
        expect((card("order").getByTestId("width-order") as HTMLInputElement).value).toBe("9");
        expect(saveButton("order").disabled).toBe(true);
        await new Promise((r) => setTimeout(r, 500));
        expect(calls.previews.length).toBe(before);
    });

    it("choosing the branch scope puts {BRANCH} in the format so codes carry the branch", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        advanced("order");
        fireEvent.click(within(card("order").getByTestId("scope-order")).getByRole("button", { name: /Por sucursal/ }));
        await waitFor(() => expect(formatInput("order").value).toBe("{BASE}{BRANCH}{SEQ}{MM}{YY}"));
        await waitFor(() => expect(calls.previews.some((p) => p.scope === "branch" && String(p.format).includes("{BRANCH}"))).toBe(true), { timeout: 3000 });
        fireEvent.click(within(card("order").getByTestId("scope-order")).getByRole("button", { name: /Todo el laboratorio/ }));
        await waitFor(() => expect(formatInput("order").value).toBe("{BASE}{SEQ}{MM}{YY}"));
    });

    it("saving sends activation (never the retired manual policy), format, width, start value and scope to the kind's endpoint", async () => {
        const calls = stub();
        renderPage();
        await openTab("sample");
        fireEvent.click(card("sample").getByTestId("active-sample"));
        fireEvent.click(within(card("sample").getByTestId("separator-sample")).getByRole("button", { name: /Con guion/ }));
        fireEvent.change(card("sample").getByTestId("start-sample"), { target: { value: "500" } });
        await waitFor(() => expect(saveButton("sample").disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(saveButton("sample"));
        await waitFor(() => expect(calls.puts).toHaveLength(1));
        expect(calls.puts[0].url).toContain("/v1/numbering/config/sample");
        expect(calls.puts[0].body).toEqual({
            active: true, format: "{BASE}-{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 500, scope: "tenant", timezone: "America/Mexico_City",
        });
    });

    it("a failed save keeps every typed value and offers a retry", async () => {
        const calls = stub();
        const base = globalThis.fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
        let fail = true;
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/numbering/config/") && init?.method === "PUT" && fail) {
                fail = false;
                // The backend's real refusal (app/api/v1/numbering.py::_guard_type_configs_for_scope): English message + type codes.
                return json({ detail: {
                    code: "numbering_type_config_conflict",
                    message: "These types have their own numbering whose format does not fit the new counter scope; update or clear them first: CU",
                    types: ["CU"],
                } }, 422);
            }
            return base(input, init);
        }));
        renderPage();
        await screen.findByTestId("numbering-card-order");
        fireEvent.change(card("order").getByTestId("start-order"), { target: { value: "40" } });
        await waitFor(() => expect(saveButton("order").disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(saveButton("order"));
        await waitFor(() => expect(screen.getByTestId("save-error-order").textContent).toContain("no es compatible con el nuevo alcance del contador"));
        expect(screen.getByTestId("save-error-order").textContent).toContain("Tipos: CU.");
        expect(screen.getByTestId("save-error-order").textContent).not.toMatch(/These types|counter scope/);
        expect((card("order").getByTestId("start-order") as HTMLInputElement).value).toBe("40");
        expect(saveButton("order").textContent).toContain("Reintentar");
        fireEvent.click(saveButton("order"));
        await waitFor(() => expect(calls.puts).toHaveLength(1));
        expect(calls.puts[0].body.start_value).toBe(40);
    });

    it("shows the numbering timezone, sends it to the preview and explains it defines the laboratory's month", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        advanced("order");
        expect(card("order").getByText(/sin importar qué sucursal registre/)).toBeInTheDocument();
        await waitFor(() => expect(calls.previews.some((p) => p.timezone === "America/Mexico_City")).toBe(true), { timeout: 3000 });
        await waitFor(() => expect(card("order").getAllByText(/Mexico_City/).length).toBeGreaterThan(0));
    });

    it("an untouched form cannot be saved", async () => {
        stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        expect(saveButton("order").disabled).toBe(true);
    });

    it("says registration is automatic and that correcting a sample code is a separate action", async () => {
        stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        expect(card("order").getByTestId("registration-order").textContent).toContain("siempre de forma automática");
        expect(card("order").queryByTestId("legacy-policy-order")).toBeNull();
    });

    it("shows (without changing it) a stored retired 'required' policy", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/numbering/config")) {
                return json({ order: cfg("order", { manual_policy: "required", legacy_manual_policy: true }), sample: cfg("sample") });
            }
            if (url.includes("/numbering/preview")) return json(preview());
            return json({ study_types: [], sample_types: [] });
        }));
        renderPage();
        expect(await screen.findByTestId("legacy-policy-order")).toBeInTheDocument();
        expect(screen.getByTestId("legacy-policy-order").textContent).toContain("Ya no tiene efecto");
    });
});
