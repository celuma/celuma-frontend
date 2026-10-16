/**
 * Céluma 1.4, issue #8 — Configuración → Numeración.
 *
 * The page edits the format / minimum width / manual-code mode of the monthly
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
    entity_kind: kind, format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, mode: "automatic", is_default: true, ...over,
});

const preview = (over: Record<string, unknown> = {}) => ({
    entity_kind: "order", valid: true, errors: [], format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2,
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
    it("shows both entity kinds with the default format and the width-boundary examples", async () => {
        stub();
        renderPage();
        expect(await screen.findByTestId("numbering-card-order")).toBeInTheDocument();
        expect(screen.getByTestId("numbering-card-sample")).toBeInTheDocument();
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

    it("previews the CANDIDATE format with the chosen example type and does not save it", async () => {
        const calls = stub();
        renderPage();
        const input = (await screen.findByTestId("numbering-card-order")) && (card("order").getByLabelText("Formato") as HTMLInputElement);
        fireEvent.change(input, { target: { value: "{BASE}-{SEQ}{MM}{YYYY}" } });
        await waitFor(() => expect(calls.previews.some((p) => p.format === "{BASE}-{SEQ}{MM}{YYYY}")).toBe(true), { timeout: 3000 });
        const sent = calls.previews.find((p) => p.format === "{BASE}-{SEQ}{MM}{YYYY}")!;
        expect(sent).toMatchObject({ entity_kind: "order", sequence_min_width: 2, scope_id: "st1" });
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

    it("saving sends exactly format, width and mode to the kind's endpoint", async () => {
        const calls = stub();
        renderPage();
        const input = (await screen.findByTestId("numbering-card-sample")) && (card("sample").getByLabelText("Formato") as HTMLInputElement);
        fireEvent.change(input, { target: { value: "{BASE}.{SEQ}{MM}{YY}" } });
        fireEvent.click(card("sample").getByLabelText(/Solo automático/));
        await waitFor(() => expect((card("sample").getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
        fireEvent.click(card("sample").getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(calls.puts).toHaveLength(1));
        expect(calls.puts[0].url).toContain("/v1/numbering/config/sample");
        expect(calls.puts[0].body).toEqual({ format: "{BASE}.{SEQ}{MM}{YY}", sequence_min_width: 2, mode: "automatic_only" });
    });

    it("an untouched form cannot be saved", async () => {
        stub();
        renderPage();
        await screen.findByTestId("numbering-card-order");
        expect((card("order").getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
