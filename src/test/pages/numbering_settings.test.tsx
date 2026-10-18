/**
 * Céluma 1.4, issue #8 — Configuración → Numeración.
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

describe("numbering settings page", () => {
    it("shows both kinds, NOT activated by default, with the compatibility explanation", async () => {
        stub();
        renderPage();
        expect(await screen.findByTestId("numbering-card-order")).toBeInTheDocument();
        expect(screen.getByTestId("numbering-card-sample")).toBeInTheDocument();
        expect(screen.getByTestId("inactive-note-order").textContent).toContain("formato anterior");
        expect(screen.getByTestId("inactive-note-sample").textContent).toContain("también de forma automática");
        expect(screen.queryByTestId("policy-sample")).toBeNull();  // no manual-code policy control any more
        expect((card("order").getByLabelText("Formato") as HTMLInputElement).value).toBe("{BASE}{SEQ}{MM}{YY}");
        await waitFor(() => expect(screen.getAllByText("CU991026").length).toBeGreaterThan(0), { timeout: 3000 });
        expect(screen.getAllByText("CU1001026").length).toBeGreaterThan(0);  // width grows past 99
    });

    it("every preview is labelled as non-reserving and the estimate is shown as an estimate", async () => {
        stub();
        renderPage();
        await waitFor(() => expect(screen.getByTestId("estimate-order").textContent).toContain("CU031026"), { timeout: 3000 });
        for (const kind of ["order", "sample"]) {
            expect(screen.getByTestId(`notice-${kind}`).textContent).toMatch(/no reserva ni consume/);
        }
    });

    it("offers both separator presets: no separator (CU011026) and hyphen (CU-011026)", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        const radios = within(card("order").getByTestId("separator-order"));
        expect(radios.getByText("CU011026")).toBeInTheDocument();
        expect(radios.getByText("CU-011026")).toBeInTheDocument();
        fireEvent.click(radios.getByLabelText(/Con guion/));
        await waitFor(() => expect((card("order").getByLabelText("Formato") as HTMLInputElement).value).toBe("{BASE}-{SEQ}{MM}{YY}"));
        await waitFor(() => expect(calls.previews.some((p) => p.format === "{BASE}-{SEQ}{MM}{YY}")).toBe(true), { timeout: 3000 });
        fireEvent.click(radios.getByLabelText(/Sin separador/));
        await waitFor(() => expect((card("order").getByLabelText("Formato") as HTMLInputElement).value).toBe("{BASE}{SEQ}{MM}{YY}"));
    });

    it("typing a custom format switches the separator to 'custom' and previews the candidate without saving", async () => {
        const calls = stub();
        renderPage();
        const input = (await screen.findByTestId("numbering-card-order")) && (card("order").getByLabelText("Formato") as HTMLInputElement);
        fireEvent.change(input, { target: { value: "{BASE}.{SEQ}{MM}{YYYY}" } });
        await waitFor(() => expect(calls.previews.some((p) => p.format === "{BASE}.{SEQ}{MM}{YYYY}")).toBe(true), { timeout: 3000 });
        expect(calls.previews.find((p) => p.format === "{BASE}.{SEQ}{MM}{YYYY}")).toMatchObject({ entity_kind: "order", scope_id: "st1", scope: "tenant" });
        const custom = () => within(card("order").getByTestId("separator-order")).getByRole("radio", { name: /Personalizado/ }) as HTMLInputElement;
        await waitFor(() => expect(custom().closest('label')?.className).toContain('ant-radio-wrapper-checked'));
        expect(calls.puts).toHaveLength(0);
    });

    it("an invalid candidate shows the server's reasons and disables saving", async () => {
        stub((body) => (body.format === "{BASE}{SEQ}" ? preview({ valid: false, errors: ["{MM} must appear exactly once"], examples: [], estimate: null }) : preview()));
        renderPage();
        const input = (await screen.findByTestId("numbering-card-order")) && (card("order").getByLabelText("Formato") as HTMLInputElement);
        fireEvent.change(input, { target: { value: "{BASE}{SEQ}" } });
        await waitFor(() => expect(screen.getByTestId("errors-order").textContent).toContain("{MM} must appear exactly once"), { timeout: 3000 });
        expect((card("order").getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("choosing the branch scope puts {BRANCH} in the format so codes carry the branch", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        fireEvent.click(within(card("order").getByTestId("scope-order")).getByLabelText(/Por sucursal/));
        await waitFor(() => expect((card("order").getByLabelText("Formato") as HTMLInputElement).value).toBe("{BASE}{BRANCH}{SEQ}{MM}{YY}"));
        await waitFor(() => expect(calls.previews.some((p) => p.scope === "branch" && String(p.format).includes("{BRANCH}"))).toBe(true), { timeout: 3000 });
        fireEvent.click(within(card("order").getByTestId("scope-order")).getByLabelText(/Todo el laboratorio/));
        await waitFor(() => expect((card("order").getByLabelText("Formato") as HTMLInputElement).value).toBe("{BASE}{SEQ}{MM}{YY}"));
    });

    it("saving sends activation (never the retired manual policy), format, width, start value and scope to the kind's endpoint", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-sample");
        fireEvent.click(card("sample").getByTestId("active-sample"));
        fireEvent.click(within(card("sample").getByTestId("separator-sample")).getByLabelText(/Con guion/));
        fireEvent.change(card("sample").getByLabelText("Valor inicial"), { target: { value: "500" } });
        await waitFor(() => expect((card("sample").getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(card("sample").getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(calls.puts).toHaveLength(1));
        expect(calls.puts[0].url).toContain("/v1/numbering/config/sample");
        expect(calls.puts[0].body).toEqual({
            active: true, format: "{BASE}-{SEQ}{MM}{YY}", sequence_min_width: 2, start_value: 500, scope: "tenant", timezone: "America/Mexico_City",
        });
    });

    it("shows the numbering timezone, sends it to the preview and explains it defines the laboratory's month", async () => {
        const calls = stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        expect(card("order").getByText(/sin importar qué sucursal registre/)).toBeInTheDocument();
        await waitFor(() => expect(calls.previews.some((p) => p.timezone === "America/Mexico_City")).toBe(true), { timeout: 3000 });
        await waitFor(() => expect(card("order").getAllByText(/Mexico_City/).length).toBeGreaterThan(0));
    });

    it("an untouched form cannot be saved", async () => {
        stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        expect((card("order").getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
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
        expect(card("order").getByTestId("legacy-policy-order").textContent).toContain("Ya no tiene efecto");
    });
});
