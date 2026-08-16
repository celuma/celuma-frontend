/**
 * Céluma 1.3, Phase 5 Block C closure — study-type selector ordering (C-003).
 *
 * `Céluma1.3-Phase1.md` §Sorting requires, in the same list:
 *
 *   - "Studies and price lists appear in alphabetical order when appropriate."
 *   - "Catalogs used in selectors and autocomplete use the same criteria."
 *
 * Phase 1's UX validation covered the first bullet — the studies *table* and
 * the price-list *table* both sort with `localeCompare`. The second bullet was
 * never validated: the two study-type combo boxes rendered whatever order the
 * API happened to return, because `GET /v1/study-types/` has no `ORDER BY`.
 *
 * These tests feed a deliberately unsorted catalogue and assert the rendered
 * option order. They fail against the pre-fix pages.
 *
 * Note the two screens compose their visible label differently — "name (code)"
 * when registering an order, "code - name" when adding a price — so the
 * *expected* order differs between them. That is the point: each dropdown is
 * alphabetical by the string the user actually scans, not by some hidden key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrderRegister from "../../pages/order_register";
import PriceCatalog from "../../pages/price_catalog";

/**
 * Deliberately unsorted, and deliberately built so that sorting by `name` and
 * sorting by `code` disagree — `Zeta` carries code `AAA`, `anatomía` carries
 * `MMM`. A test that passed under both orderings would not prove which key the
 * fix uses.
 *
 * It also mixes casing and accents on purpose: `anatomía` is lowercase while
 * `Citología` and `Zeta` are capitalised, and `ecografía`/`Épsilon` differ only
 * after the accented first letter. A naive code-point sort puts every
 * uppercase name before every lowercase one, which would place `Zeta` first —
 * locale-aware comparison does not.
 */
const UNSORTED_STUDY_TYPES = [
    { id: "st-cit", code: "ZZZ", name: "Citología Urinaria", is_active: true },
    { id: "st-zet", code: "AAA", name: "Zeta Histológica", is_active: true },
    { id: "st-ana", code: "MMM", name: "anatomía patológica", is_active: true },
    { id: "st-eps", code: "BBB", name: "Épsilon Dérmico", is_active: true },
    { id: "st-eco", code: "NNN", name: "ecografía mamaria", is_active: true },
];

/** "{name} ({code})" — what `order_register.tsx` shows. */
const EXPECTED_BY_NAME = [
    "anatomía patológica (MMM)",
    "Citología Urinaria (ZZZ)",
    "ecografía mamaria (NNN)",
    "Épsilon Dérmico (BBB)",
    "Zeta Histológica (AAA)",
];

/** "{code} - {name}" — what `price_catalog.tsx` shows. */
const EXPECTED_BY_CODE = [
    "AAA - Zeta Histológica",
    "BBB - Épsilon Dérmico",
    "MMM - anatomía patológica",
    "NNN - ecografía mamaria",
    "ZZZ - Citología Urinaria",
];

function jsonResponse(body: unknown) {
    return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

/** Routes every `fetch` both pages make; unknown GETs resolve empty. */
function stubApi(overrides: Record<string, unknown> = {}) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/v1/study-types/")) {
            return jsonResponse({ study_types: UNSORTED_STUDY_TYPES });
        }
        if (url.includes("/v1/price-catalog/")) {
            return jsonResponse(overrides["price-catalog"] ?? { prices: [] });
        }
        if (url.includes("/v1/patients/") || url.includes("/v1/requesting-physicians/")) {
            return jsonResponse([]);
        }
        if (url.includes("/branches")) {
            return jsonResponse([{ id: "br-1", name: "Sede Central", code: "MAIN" }]);
        }
        return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, calls };
}

/** The repository's established way to read an antd `<Select>`'s options. */
async function openSelectAndReadOptions(selector: Element): Promise<string[]> {
    fireEvent.mouseDown(selector.querySelector(".ant-select-selector")!);
    await waitFor(() => {
        expect(document.querySelector(".ant-select-item-option")).toBeTruthy();
    });
    return Array.from(document.querySelectorAll(".ant-select-item-option")).map((option) =>
        (option.textContent ?? "").trim()
    );
}

function studySelect(container: HTMLElement): Element {
    // Both pages render the study picker with this placeholder; it is user-facing
    // copy, not a test hook, and is asserted by the tests below through the
    // options it opens.
    const match = Array.from(container.querySelectorAll(".ant-select")).find((node) =>
        node.textContent?.includes("Seleccionar tipo de estudio")
    );
    expect(match, "study-type select not found").toBeTruthy();
    return match!;
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

describe("C-003 — register order: study options are alphabetical", () => {
    it("sorts by the visible label even though the API returns them unsorted", async () => {
        stubApi();
        const { container } = render(
            <MemoryRouter initialEntries={["/orders/register"]}>
                <OrderRegister />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(container.querySelector(".ant-select")).toBeTruthy();
        });

        const options = await openSelectAndReadOptions(studySelect(container));

        expect(options).toEqual(EXPECTED_BY_NAME);
        // Guard against the assertion accidentally matching the fixture order.
        expect(options).not.toEqual(
            UNSORTED_STUDY_TYPES.map((st) => `${st.name} (${st.code})`)
        );
    });

    it("keeps each label bound to its own study id after sorting", async () => {
        stubApi();
        const { container } = render(
            <MemoryRouter initialEntries={["/orders/register"]}>
                <OrderRegister />
            </MemoryRouter>
        );
        await waitFor(() => {
            expect(container.querySelector(".ant-select")).toBeTruthy();
        });

        const select = studySelect(container);
        await openSelectAndReadOptions(select);
        const target = Array.from(document.querySelectorAll(".ant-select-item-option")).find(
            (option) => option.textContent?.includes("anatomía patológica")
        );
        fireEvent.click(target!);

        // The selection is retained and shows the label the user clicked —
        // sorting reordered the options, it did not re-pair label and value.
        await waitFor(() => {
            expect(select.textContent).toContain("anatomía patológica (MMM)");
        });
    });
});

describe("C-003 — add price: study options are alphabetical", () => {
    it("sorts by the visible label even though the API returns them unsorted", async () => {
        stubApi();
        const { container, getByText } = render(
            <MemoryRouter initialEntries={["/catalog"]}>
                <PriceCatalog />
            </MemoryRouter>
        );

        await waitFor(() => expect(getByText("Nuevo Precio")).toBeTruthy());
        fireEvent.click(getByText("Nuevo Precio"));

        await waitFor(() => {
            expect(document.querySelector(".ant-select")).toBeTruthy();
        });

        const options = await openSelectAndReadOptions(studySelect(document.body));

        expect(options).toEqual(EXPECTED_BY_CODE);
        expect(options).not.toEqual(
            UNSORTED_STUDY_TYPES.map((st) => `${st.code} - ${st.name}`)
        );
        expect(container).toBeTruthy();
    });

    it("submits the id of the study the user picked, not the one at that position before sorting", async () => {
        const { calls } = stubApi();
        const { getByText } = render(
            <MemoryRouter initialEntries={["/catalog"]}>
                <PriceCatalog />
            </MemoryRouter>
        );

        await waitFor(() => expect(getByText("Nuevo Precio")).toBeTruthy());
        fireEvent.click(getByText("Nuevo Precio"));
        await waitFor(() => expect(document.querySelector(".ant-select")).toBeTruthy());

        await openSelectAndReadOptions(studySelect(document.body));
        const target = Array.from(document.querySelectorAll(".ant-select-item-option")).find(
            (option) => option.textContent?.includes("MMM - anatomía patológica")
        );
        fireEvent.click(target!);

        const priceInput = Array.from(
            document.querySelectorAll<HTMLInputElement>("input")
        ).find((input) => input.getAttribute("name") === "unit_price");
        expect(priceInput, "unit_price input not found").toBeTruthy();
        fireEvent.change(priceInput!, { target: { value: "1500" } });
        fireEvent.blur(priceInput!);

        // `ModalFormFooter` labels the create action "Crear" (it becomes
        // "Guardar cambios" only when editing an existing price).
        fireEvent.click(getByText("Crear"));

        await waitFor(() => {
            const post = calls.find(
                (call) => call.init?.method === "POST" && call.url.includes("/v1/price-catalog/")
            );
            expect(post, "no POST to /v1/price-catalog/ was made").toBeTruthy();
            expect(JSON.parse(String(post!.init!.body)).study_type_id).toBe("st-ana");
        });
    });
});
