/**
 * Céluma 1.4 (issues #5/#6/#7) — list pages on the server-paginated contract.
 *
 * Contract: celuma-engineering/specs/lists/search-and-pagination.md. What the
 * pages must do, as measured on the synthetic large tenant: request one page
 * (never the whole collection), stop downloading the orders list just to repeat
 * data the samples response already carries, keep column filters and optional
 * columns fed by the whole collection, and — for the per-user worklist — load
 * every item before searching it in the browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SamplesList from "../../pages/samples_list";
import OrdersList from "../../pages/orders_list";
import Worklist from "../../pages/worklist";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const SAMPLE = {
    id: "s1",
    sample_code: "CU276262",
    type: "BIOPSIA",
    state: "RECEIVED",
    tenant_id: "t1",
    branch: { id: "b1", name: "Matriz" },
    order: {
        id: "o1", order_code: "CU-1", status: "RECEIVED", requested_by: null,
        patient: { id: "p1", full_name: "Lorena Muñóz", patient_code: "P-1" },
    },
    labels: null,
    assignees: null,
};

beforeEach(() => {
    mockedUseUserProfile.mockReturnValue({
        hasPermission: () => true,
    } as unknown as ReturnType<typeof useUserProfile>);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => unknown) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => jsonResponse(handler(String(input))));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

describe("Samples list — server pagination", () => {
    it("requests one sorted page and never downloads the orders list", async () => {
        const fetchMock = stubFetch((url) =>
            url.includes("filter-options")
                ? { states: ["RECEIVED"], types: ["BIOPSIA"], orders: [], patients: [], labels: [], assignees: [] }
                : { samples: [SAMPLE], total: 1, page: 1, page_size: 10 },
        );
        render(<MemoryRouter><SamplesList /></MemoryRouter>);

        expect(await screen.findByText("CU276262")).toBeInTheDocument();
        const urls = fetchMock.mock.calls.map(([input]) => String(input));
        expect(urls.some((u) => u.includes("/v1/laboratory/orders/"))).toBe(false);
        const listUrl = urls.find((u) => u.includes("/v1/laboratory/samples/?"));
        expect(listUrl).toContain("page=1&page_size=10&sort=sample_code&order=asc");
        expect(urls.some((u) => u.endsWith("/v1/laboratory/samples/filter-options"))).toBe(true);
        // Patient comes from the samples response itself.
        expect(screen.getByText("Lorena Muñóz")).toBeInTheDocument();
    });

    it("shows the label column when any sample of the tenant is labelled, even if this page is not", async () => {
        stubFetch((url) =>
            url.includes("filter-options")
                ? {
                    states: ["RECEIVED"], types: ["BIOPSIA"], orders: [], patients: [],
                    labels: [{ value: "l1", text: "Urgente", color: "#F98D84" }], assignees: [],
                }
                : { samples: [SAMPLE], total: 40, page: 1, page_size: 10 },
        );
        render(<MemoryRouter><SamplesList /></MemoryRouter>);

        expect(await screen.findByText("Etiquetas")).toBeInTheDocument();
        // 40 matches → four pages, although the page holds one row.
        expect(screen.getByRole("button", { name: "Página 4" })).toBeInTheDocument();
    });
});

describe("Orders list — server pagination", () => {
    it("seeds the status filter from the dashboard link into the request", async () => {
        const fetchMock = stubFetch((url) =>
            url.includes("filter-options")
                ? { statuses: ["RECEIVED", "PROCESSING"], patients: [], requesting_physicians: [], labels: [], assignees: [], has_requester: false }
                : { orders: [], total: 0, page: 1, page_size: 10 },
        );
        render(<MemoryRouter initialEntries={["/orders?status=RECEIVED,PROCESSING"]}><OrdersList /></MemoryRouter>);

        await waitFor(() => expect(fetchMock.mock.calls.map(([i]) => String(i)).some(
            (u) => u.includes("/v1/laboratory/orders/?") && u.includes("status=RECEIVED&status=PROCESSING"),
        )).toBe(true));
    });
});

describe("Worklist — loads the whole per-user list", () => {
    it("follows has_more until every item is loaded", async () => {
        const item = (n: number) => ({
            id: `a${n}`, kind: "assignment", item_type: "sample", item_id: `s${n}`, display_id: `CU27${n}`,
            item_status: "RECEIVED", assigned_at: "2026-10-01T10:00:00Z", link: `/samples/s${n}`,
        });
        const fetchMock = stubFetch((url) => {
            const page = Number(new URL(url, "http://x").searchParams.get("page"));
            return page === 1
                ? { items: Array.from({ length: 100 }, (_, i) => item(i)), total: 101, page: 1, page_size: 100, has_more: true }
                : { items: [item(100)], total: 101, page: 2, page_size: 100, has_more: false };
        });
        render(<MemoryRouter><Worklist /></MemoryRouter>);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const urls = fetchMock.mock.calls.map(([input]) => String(input));
        expect(urls[0]).toContain("page=1&page_size=100");
        expect(urls[1]).toContain("page=2&page_size=100");
        // 101 items at 20 per page → six pages in the table.
        expect(await screen.findByRole("button", { name: "Página 6" })).toBeInTheDocument();
    });
});
