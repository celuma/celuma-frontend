/**
 * Céluma 1.5 (#80) — "Códigos de muestra" in the orders list.
 *
 * Contract: celuma-engineering/specs/lists/search-and-pagination.md. Each order
 * stays one row whose cell shows the codes the API returns in `sample_codes`;
 * a code typed in the search goes to the server search (`q`) like any other
 * term — the page never filters, expands or re-requests rows per order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrdersList from "../../pages/orders_list";
import { renderSampleCodes } from "../../components/ui/table_helpers";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const order = (id: string, order_code: string, sample_codes: string[]) => ({
    id, order_code, status: "RECEIVED", tenant_id: "t1", branch: { id: "b1", name: "Matriz" },
    patient: { id: `p-${id}`, full_name: `Paciente ${id}`, patient_code: `P-${id}` },
    requesting_physicians: [], sample_count: sample_codes.length, sample_codes,
    has_report: false, has_invoice: false,
});

const OPTIONS = { statuses: ["RECEIVED"], patients: [], requesting_physicians: [], labels: [], assignees: [], has_requester: false };
const ALL = [
    order("o1", "ORD-01", ["CU276262"]),
    order("o2", "ORD-02", ["BX276262", "IHQ276262", "TJ-55-01"]),
    order("o3", "ORD-03", ["CU276263"]),
    order("o4", "ORD-04", []),
];

beforeEach(() => {
    mockedUseUserProfile.mockReturnValue({ hasPermission: () => true } as unknown as ReturnType<typeof useUserProfile>);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

/** A fake API: `q=IHQ276262` answers ORD-02 only, as the server search does. */
function stubApi() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://celuma.test");
        if (url.pathname.endsWith("filter-options")) return jsonResponse(OPTIONS);
        const q = url.searchParams.get("q");
        const orders = q === "IHQ276262" ? [ALL[1]] : ALL;
        return jsonResponse({ orders, total: orders.length, page: 1, page_size: 10 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

const rowOf = (orderCode: string) => screen.getByText(orderCode).closest("tr") as HTMLElement;

describe("Orders list — Códigos de muestra", () => {
    it("shows every code of an order in its own row, and an empty state without samples", async () => {
        stubApi();
        render(<MemoryRouter initialEntries={["/orders"]}><OrdersList /></MemoryRouter>);

        expect(await screen.findByText("ORD-02")).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: /Códigos de muestra/ })).toBeInTheDocument();
        expect(within(rowOf("ORD-01")).getByText("CU276262")).toBeInTheDocument();
        const several = within(rowOf("ORD-02")).getByRole("list", { name: "Códigos de muestra" });
        expect(within(several).getAllByRole("listitem").map((li) => li.textContent))
            .toEqual(["BX276262", "IHQ276262", "TJ-55-01"]);
        expect(within(rowOf("ORD-04")).getByText("Sin muestras")).toBeInTheDocument();
        // One row per order (header row + four orders).
        expect(screen.getAllByRole("row")).toHaveLength(5);
    });

    it("sends a sample code to the server search and shows the one parent row it returns", async () => {
        const fetchMock = stubApi();
        render(<MemoryRouter initialEntries={["/orders"]}><OrdersList /></MemoryRouter>);
        await screen.findByText("ORD-02");

        fireEvent.change(screen.getByPlaceholderText("Buscar en órdenes"), { target: { value: "IHQ276262" } });

        await waitFor(() => expect(screen.queryByText("ORD-01")).not.toBeInTheDocument());
        expect(within(rowOf("ORD-02")).getByText("IHQ276262")).toBeInTheDocument();
        expect(screen.getAllByRole("row")).toHaveLength(2);
        const urls = fetchMock.mock.calls.map(([input]) => String(input));
        expect(urls.some((u) => u.includes("/v1/laboratory/orders/?") && u.includes("q=IHQ276262"))).toBe(true);
        // Only list pages and the filter catalog: no per-order sample requests.
        expect(urls.every((u) => u.includes("/v1/laboratory/orders/?") || u.endsWith("/v1/laboratory/orders/filter-options")))
            .toBe(true);
    });
});

describe("renderSampleCodes", () => {
    it("keeps repeated codes (one entry per sample) and tolerates a response without the field", () => {
        const { unmount } = render(<>{renderSampleCodes(["DUP-1", "DUP-1"])}</>);
        expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["DUP-1", "DUP-1"]);
        unmount();
        render(<>{renderSampleCodes(undefined)}</>);
        expect(screen.getByText("Sin muestras")).toBeInTheDocument();
    });
});
