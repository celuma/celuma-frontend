/**
 * Céluma 1.5 (#69) — long study-type and sample-type catalogs in reception and configuration.
 *
 * Every selector of those catalogs uses the shared options (`src/lib/catalog_type_options.ts`): stable
 * alphabetical order, search by name or code, complete names with the code. These tests drive each flow
 * with a long synthetic catalog of near-identical names, keyboard only, and check that an ineligible
 * (inactive) entry is still not offered. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrderForm from "../../pages/order_form";
import SampleForm from "../../pages/sample_form";
import PriceCatalog from "../../pages/price_catalog";
import NumberingSettings from "../../pages/numbering_settings";
import { compareLabels } from "../../lib/sort";

vi.mock("../../components/ui/sidebar_menu", () => ({ default: () => null }));
vi.mock("../../hooks/use_user_profile", () => ({ useUserProfile: () => ({ hasPermission: () => true }) }));

const SITES = [
    "región cervical derecha", "región cervical izquierda", "región dorsal superior", "región dorsal inferior",
    "región lumbar derecha", "región lumbar izquierda", "antebrazo derecho, cara anterior", "antebrazo derecho, cara posterior",
    "antebrazo izquierdo, cara anterior", "antebrazo izquierdo, cara posterior", "muslo derecho", "muslo izquierdo",
    "pierna derecha", "pierna izquierda", "cuero cabelludo, región occipital", "cuero cabelludo, región parietal",
    "Región pectoral derecha", "región pectoral izquierda", "región escapular derecha", "región escapular izquierda",
    "pie derecho, cara dorsal", "pie izquierdo, cara dorsal", "mano derecha, dorso", "mano izquierda, dorso",
];

/** Long names that differ only at the end; codes deliberately run against the names' order. */
const SAMPLE_TYPES = SITES.map((site, i) => ({
    id: `smp-${i}`,
    code: `BPC-${String(SITES.length - i).padStart(2, "0")}`,
    name: `Biopsia de piel por sacabocado, ${site}`,
    is_active: true,
    tenant_id: "tenant-1",
    created_at: "2026-01-01T00:00:00",
    default_template: null,
    default_report_template_id: null,
}));
const INACTIVE_SAMPLE = { ...SAMPLE_TYPES[0], id: "smp-old", code: "BPC-99", name: "Biopsia de piel por sacabocado, región dada de baja", is_active: false };

const STUDY_TYPES = [
    ...SITES.map((site, i) => ({
        id: `st-${i}`,
        code: `HIS-${String(i + 1).padStart(2, "0")}`,
        name: `Estudio histopatológico de biopsia de piel, ${site}`,
        is_active: true,
        default_template: null,
    })),
    { id: "st-old", code: "OLD-01", name: "Estudio histopatológico de biopsia de piel, retirado", is_active: false, default_template: null },
];
const ACTIVE_STUDY_TYPES = STUDY_TYPES.filter((st) => st.is_active);

const byName = <T extends { name: string; code: string }>(items: T[]) =>
    [...items].sort((a, b) => compareLabels(a.name, b.name) || compareLabels(a.code, b.code)).map((t) => `${t.name} (${t.code})`);

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Calls { urls: string[]; writes: Array<{ url: string; method: string; body: Record<string, unknown> }> }

function stubApi(prices: unknown[] = []): Calls {
    const calls: Calls = { urls: [], writes: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.urls.push(url);
        // The numbering preview is a read-only POST: answer it before the generic write echo, or the
        // component gets a preview without `valid`/`errors` once its 350 ms debounce fires (PR #128 CI).
        if (url.includes("/v1/numbering/preview")) {
            return json({
                entity_kind: "sample", valid: true, errors: [], format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, scheme: "monthly",
                timezone: "America/Mexico_City", period_year: 2026, period_month: 11, base_code: "BPC",
                examples: [{ sequence: 1, code: "BPC011126" }], estimate: { sequence: 1, code: "BPC011126", reserved: false, skipped_occupied: 0 }, notice: "n",
            });
        }
        if (init?.method && init.method !== "GET") {
            const body = init.body ? JSON.parse(String(init.body)) : {};
            calls.writes.push({ url, method: init.method, body });
            return json({ id: "x", ...body });
        }
        if (url.includes("/v1/numbering/config")) {
            const cfg = (kind: string) => ({
                entity_kind: kind, active: false, manual_policy: "allowed", format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2,
                start_value: 1, scope: "tenant", timezone: "America/Mexico_City", is_default: true, registration: "automatic", legacy_manual_policy: false,
            });
            return json({ order: cfg("order"), sample: cfg("sample") });
        }
        if (url.includes("/v1/numbering/")) return json({});
        if (url.includes("/v1/sample-types/")) {
            // Mirrors the API: `active_only=true` (registration) leaves inactive types out.
            const activeOnly = !url.includes("active_only=false");
            return json({ sample_types: activeOnly ? SAMPLE_TYPES : [...SAMPLE_TYPES, INACTIVE_SAMPLE] });
        }
        if (url.includes("/v1/study-types/")) {
            const activeOnly = url.includes("active_only=true");
            return json({ study_types: activeOnly ? ACTIVE_STUDY_TYPES : STUDY_TYPES });
        }
        if (url.includes("/v1/price-catalog/")) return json({ prices });
        if (url.includes("/v1/reports/templates/")) return json({ templates: [] });
        if (url.includes("/branches")) return json([{ id: "br-1", name: "Sede Central", code: "MAIN" }]);
        if (url.includes("/v1/patients/") || url.includes("/v1/requesting-physicians/") || url.includes("/orders")) return json([]);
        return json({});
    }));
    return calls;
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    localStorage.setItem("tenant_id", "tenant-1");
    localStorage.setItem("branch_id", "br-1");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

function selectByCaption(root: ParentNode, caption: string, index = 0): HTMLElement {
    const label = Array.from(root.querySelectorAll("label")).filter((l) => l.textContent?.trim().startsWith(caption))[index];
    let node: HTMLElement | null = label?.parentElement ?? null;
    while (node && !node.querySelector(".ant-select")) node = node.parentElement;
    const select = node?.querySelector<HTMLElement>(".ant-select");
    expect(select, `select "${caption}" not found`).toBeTruthy();
    return select!;
}

const searchInput = (select: HTMLElement) => select.querySelector<HTMLInputElement>("input")!;

/** The options of the select's own popup (`aria-controls` names it), as their text. */
function shownOptions(select: HTMLElement): HTMLElement[] {
    const listId = searchInput(select).getAttribute("aria-controls");
    const list = listId ? document.getElementById(listId) : null;
    const popup = list?.closest(".ant-select-dropdown") ?? null;
    return Array.from(popup?.querySelectorAll<HTMLElement>(".ant-select-item-option") ?? []);
}
const optionTexts = (select: HTMLElement) => shownOptions(select).map((o) => o.textContent?.trim() ?? "");
const selectedText = (select: HTMLElement) => select.querySelector(".ant-select-selection-item")?.textContent?.trim() ?? null;

/** Keyboard only: focus, type the query, arrow down `steps` times, Enter. */
async function chooseByKeyboard(select: HTMLElement, query: string, steps = 0) {
    const input = searchInput(select);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
    fireEvent.change(input, { target: { value: query } });
    await waitFor(() => expect(shownOptions(select).length).toBeGreaterThan(0));
    for (let i = 0; i < steps; i++) fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 13 });
}

async function typeQuery(select: HTMLElement, query: string) {
    const input = searchInput(select);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
    fireEvent.change(input, { target: { value: query } });
}

describe("reception — Registrar caso (order form)", () => {
    const renderForm = async () => {
        const calls = stubApi();
        const view = render(<MemoryRouter initialEntries={["/orders/register"]}><OrderForm /></MemoryRouter>);
        await waitFor(() => expect(view.container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        return { ...view, calls };
    };

    it("offers every active study type in stable alphabetical order, with complete names and codes", async () => {
        const { container } = await renderForm();
        const select = selectByCaption(container, "Tipo de estudio");
        fireEvent.mouseDown(select.querySelector(".ant-select-selector")!);
        await waitFor(() => expect(shownOptions(select)).toHaveLength(ACTIVE_STUDY_TYPES.length));
        expect(optionTexts(select)).toEqual(byName(ACTIVE_STUDY_TYPES));
    });

    it("selects a study type by its code alone, keyboard only", async () => {
        const { container } = await renderForm();
        const select = selectByCaption(container, "Tipo de estudio");
        await typeQuery(select, "his-14");
        await waitFor(() => expect(optionTexts(select)).toEqual(["Estudio histopatológico de biopsia de piel, pierna izquierda (HIS-14)"]));
        fireEvent.keyDown(searchInput(select), { key: "Enter", code: "Enter", keyCode: 13 });
        await waitFor(() => expect(selectedText(select)).toBe("Estudio histopatológico de biopsia de piel, pierna izquierda (HIS-14)"));
    });

    it("never offers an inactive study type, not even by its exact code", async () => {
        const { container } = await renderForm();
        const select = selectByCaption(container, "Tipo de estudio");
        await typeQuery(select, "OLD-01");
        await waitFor(() => expect(container.ownerDocument.body.textContent).toContain("No data"));
        expect(optionTexts(select)).toEqual([]);
        await typeQuery(select, "retirado");
        expect(optionTexts(select)).toEqual([]);
    });

    it("narrows near-identical sample types by words, keeps them alphabetical, and selects with the arrows", async () => {
        const { container, calls } = await renderForm();
        expect(calls.urls.some((u) => u.includes("/v1/sample-types/?active_only=true"))).toBe(true);
        const select = selectByCaption(container, "Tipo de muestra");
        await typeQuery(select, "sacabocado antebrazo derecho");
        await waitFor(() => expect(optionTexts(select)).toEqual([
            "Biopsia de piel por sacabocado, antebrazo derecho, cara anterior (BPC-18)",
            "Biopsia de piel por sacabocado, antebrazo derecho, cara posterior (BPC-17)",
        ]));
        fireEvent.keyDown(searchInput(select), { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
        fireEvent.keyDown(searchInput(select), { key: "Enter", code: "Enter", keyCode: 13 });
        await waitFor(() => expect(selectedText(select)).toBe("Biopsia de piel por sacabocado, antebrazo derecho, cara posterior (BPC-17)"));
    });

    it("selects a sample type by its code alone, and an inactive code finds nothing", async () => {
        const { container } = await renderForm();
        const select = selectByCaption(container, "Tipo de muestra");
        await typeQuery(select, "BPC-99");
        await waitFor(() => expect(container.ownerDocument.body.textContent).toContain("No data"));
        expect(optionTexts(select)).toEqual([]);
        await chooseByKeyboard(select, "bpc03");
        await waitFor(() => expect(selectedText(select)).toBe("Biopsia de piel por sacabocado, pie izquierdo, cara dorsal (BPC-03)"));
    });
});

describe("reception — Registrar muestra (sample form)", () => {
    it("offers only active sample types, alphabetical, searchable by code and selectable by keyboard", async () => {
        const calls = stubApi();
        const { container } = render(<MemoryRouter initialEntries={["/samples/register"]}><SampleForm /></MemoryRouter>);
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(1));
        expect(calls.urls.some((u) => u.includes("/v1/sample-types/?active_only=true"))).toBe(true);
        const select = selectByCaption(container, "Tipo de muestra");
        await waitFor(() => expect(select.className).not.toContain("ant-select-disabled"));
        fireEvent.mouseDown(select.querySelector(".ant-select-selector")!);
        await waitFor(() => expect(shownOptions(select)).toHaveLength(SAMPLE_TYPES.length));
        expect(optionTexts(select)).toEqual(byName(SAMPLE_TYPES));
        await chooseByKeyboard(select, "BPC-23");
        await waitFor(() => expect(selectedText(select)).toBe("Biopsia de piel por sacabocado, región cervical izquierda (BPC-23)"));
    });
});

describe("configuration — Catálogo de precios", () => {
    it("searches study types by code and submits the id picked by keyboard", async () => {
        const calls = stubApi();
        render(<MemoryRouter initialEntries={["/catalog"]}><PriceCatalog /></MemoryRouter>);
        fireEvent.click(await screen.findByText("Nuevo Precio"));
        const select = await waitFor(() => selectByCaption(document.body, "Tipo de estudio"));
        await chooseByKeyboard(select, "HIS-02");
        await waitFor(() => expect(selectedText(select)).toBe("Estudio histopatológico de biopsia de piel, región cervical izquierda (HIS-02)"));
        const price = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((i) => i.getAttribute("name") === "unit_price")!;
        fireEvent.change(price, { target: { value: "900" } });
        fireEvent.blur(price);
        fireEvent.click(screen.getByText("Crear"));
        await waitFor(() => expect(calls.writes.find((w) => w.method === "POST")?.body.study_type_id).toBe("st-1"));
    });

    it("keeps an edited price's inactive study type readable, but not selectable again", async () => {
        const old = STUDY_TYPES.find((st) => st.id === "st-old")!;
        stubApi([{
            id: "price-1", study_type_id: old.id, unit_price: 500, currency: "MXN", is_active: true, created_at: "2026-01-01T00:00:00",
            study_type: { id: old.id, code: old.code, name: old.name },
        }]);
        render(<MemoryRouter initialEntries={["/catalog"]}><PriceCatalog /></MemoryRouter>);
        const row = (await screen.findByText("OLD-01")).closest("tr")!;
        fireEvent.click(within(row).getAllByRole("button")[0]);
        const select = await waitFor(() => selectByCaption(document.body, "Tipo de estudio"));
        await waitFor(() => expect(selectedText(select)).toBe(`${old.name} (OLD-01)`));
        await typeQuery(select, "OLD-01");
        await waitFor(() => expect(optionTexts(select)).toEqual([`${old.name} (OLD-01) — inactivo`]));
        expect(shownOptions(select)[0].className).toContain("ant-select-item-option-disabled");
    });
});

describe("configuration — Numeración (preview type)", () => {
    it("orders the preview's study and sample types alphabetically and finds them by code", async () => {
        stubApi();
        render(<MemoryRouter><NumberingSettings embedded /></MemoryRouter>);
        fireEvent.click(await screen.findByTestId("tab-sample"));  // #64: each kind has its own tab
        const select = (await screen.findByTestId("preview-type-sample")) as HTMLElement;
        // #64: the preview selector is now a FloatingCaptionSelect (test id on its wrapper).
        const root = select.classList.contains("ant-select")
            ? select
            : (select.closest<HTMLElement>(".ant-select") ?? select.querySelector<HTMLElement>(".ant-select")!);
        fireEvent.mouseDown(root.querySelector(".ant-select-selector")!);
        await waitFor(() => expect(shownOptions(root)).toHaveLength(SAMPLE_TYPES.length));
        expect(optionTexts(root)).toEqual(byName(SAMPLE_TYPES));
        await chooseByKeyboard(root, "BPC-09");
        await waitFor(() => expect(selectedText(root)).toBe("Biopsia de piel por sacabocado, cuero cabelludo, región parietal (BPC-09)"));
    });
});
