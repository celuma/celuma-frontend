/**
 * Céluma 1.5 (#66) — returning from an order or sample to the list it was opened from.
 *
 * Contract: celuma-engineering/specs/lists/search-and-pagination.md ("Returning to a list").
 * The view (search, filters, sort, page) is in the list's URL; the scroll position and the
 * opened record are in a per-tab snapshot; on browser Back or "Volver a …" the list asks the
 * API where that record is now (`locate`) and says so when it no longer matches. Synthetic data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import OrdersList from "../../pages/orders_list";
import SamplesList from "../../pages/samples_list";
import Worklist from "../../pages/worklist";
import ListReturnLink from "../../components/lists/list_return_link";
import ReportReturnLink from "../../components/report/report_return_link";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const order = (i: number, status = "RECEIVED") => ({
    id: `o${i}`, order_code: `CU-${String(i).padStart(2, "0")}`, status, tenant_id: "t1",
    branch: { id: "b1", name: "Matriz" }, patient: { id: "p1", full_name: "Paciente Sintético", patient_code: "P-1" },
    requesting_physicians: [], sample_count: 1, has_report: false, has_invoice: false,
});

const ORDER_OPTIONS = { statuses: ["RECEIVED", "PROCESSING", "DIAGNOSIS"], patients: [], requesting_physicians: [], labels: [], assignees: [], has_requester: false };

let located: unknown = null;
function stubOrders() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("filter-options")) return jsonResponse(ORDER_OPTIONS);
        const params = new URL(url, "http://x").searchParams;
        const page = Number(params.get("page") ?? 1);
        const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => order((page - 1) * 10 + n));
        return jsonResponse({ orders: rows, total: 45, page, page_size: 10, ...(params.get("locate") ? { located } : {}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

const listUrls = (fetchMock: ReturnType<typeof vi.fn>, path = "/v1/laboratory/orders/?") =>
    fetchMock.mock.calls.map(([input]) => String(input)).filter((u) => u.includes(path));

// The full suite runs ~120 files in parallel: give async queries more than the 1 s default.
configure({ asyncUtilTimeout: 5000 });

/** Each test renders a list, a record page and the list again; a loaded machine needs more than 5 s. */
const SLOW_TEST_MS = 20_000;

let currentLocation = "";
function LocationProbe() {
    const location = useLocation();
    currentLocation = location.pathname + location.search;
    return null;
}

/** A stand-in record page: the real return link, plus a button that behaves like browser Back. */
function FakeDetail() {
    const navigate = useNavigate();
    return (
        <div>
            <ListReturnLink />
            <button onClick={() => navigate(-1)}>Atrás del navegador</button>
        </div>
    );
}

/** A stand-in report editor: the real report return link, plus a browser-Back button. */
function FakeReport() {
    const navigate = useNavigate();
    return (
        <div>
            <ReportReturnLink orderId="o-77" />
            <button onClick={() => navigate(-1)}>Atrás del navegador</button>
        </div>
    );
}

function renderApp(initial: string) {
    return render(
        <MemoryRouter initialEntries={[initial]}>
            <LocationProbe />
            <Routes>
                <Route path="/orders" element={<OrdersList />} />
                <Route path="/orders/:id" element={<FakeDetail />} />
                <Route path="/samples" element={<SamplesList />} />
                <Route path="/samples/:id" element={<FakeDetail />} />
                <Route path="/worklist" element={<Worklist />} />
                <Route path="/reports/:id" element={<FakeReport />} />
            </Routes>
        </MemoryRouter>,
    );
}

const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
    sessionStorage.clear();
    located = null;
    mockedUseUserProfile.mockReturnValue({ hasPermission: () => true } as unknown as ReturnType<typeof useUserProfile>);
    scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("Orders list — the view lives in the URL", () => {
    it("opens the view the URL describes, page included, and shows it in the headers", async () => {
        const fetchMock = stubOrders();
        renderApp("/orders?q=perez&status=RECEIVED&sort=status&order=desc&page=3");
        expect(await screen.findByText("CU-21")).toBeInTheDocument();
        const first = listUrls(fetchMock)[0];
        expect(first).toContain("page=3&page_size=10&q=perez&sort=status&order=desc&status=RECEIVED");
        expect((screen.getByPlaceholderText("Buscar en órdenes") as HTMLInputElement).value).toBe("perez");
        // The status column shows its active filter and the sort arrow.
        const statusHeader = screen.getAllByText("Estado")[0].closest("th")!;
        expect(statusHeader.getAttribute("aria-sort")).toBe("descending");
        expect(statusHeader.querySelector(".ant-table-filter-trigger.active")).toBeTruthy();
    }, SLOW_TEST_MS);

    it("writes changes back to the URL without adding history entries", async () => {
        stubOrders();
        renderApp("/orders");
        expect(await screen.findByText("CU-01")).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText("Página 2"));
        await waitFor(() => expect(currentLocation).toBe("/orders?page=2"));
        fireEvent.change(screen.getByPlaceholderText("Buscar en órdenes"), { target: { value: "CU-1" } });
        await waitFor(() => expect(currentLocation).toBe("/orders?q=CU-1"));
    }, SLOW_TEST_MS);

    it("keeps the dashboard's ?status=… link working", async () => {
        const fetchMock = stubOrders();
        renderApp("/orders?status=RECEIVED,PROCESSING");
        expect(await screen.findByText("CU-01")).toBeInTheDocument();
        expect(listUrls(fetchMock)[0]).toContain("status=RECEIVED&status=PROCESSING");
    }, SLOW_TEST_MS);
});

describe("Orders list — returning from an order", () => {
    async function openOrderFromPage3() {
        const fetchMock = stubOrders();
        renderApp("/orders?status=RECEIVED&page=3");
        expect(await screen.findByText("CU-27")).toBeInTheDocument();
        Object.defineProperty(window, "scrollY", { value: 640, writable: true, configurable: true });
        window.dispatchEvent(new Event("scroll"));
        fireEvent.click(rowOf("CU-27"));
        expect(await screen.findByText("Volver a Órdenes")).toBeInTheDocument();
        return fetchMock;
    }

    it("browser Back restores search, filters, page and scroll, and highlights the record that still matches", async () => {
        const fetchMock = await openOrderFromPage3();
        located = { id: "o27", matches: true, position: 27, page: 3 };
        fireEvent.click(screen.getByText("Atrás del navegador"));
        expect(await screen.findByText("CU-27")).toBeInTheDocument();
        expect(currentLocation).toBe("/orders?status=RECEIVED&page=3");
        const restoreRequest = listUrls(fetchMock).at(-1)!;
        expect(restoreRequest).toContain("page=3");
        expect(restoreRequest).toContain("status=RECEIVED");
        expect(restoreRequest).toContain("locate=o27");
        await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 640, left: 0, behavior: "auto" }));
        expect(rowOf("CU-27").className).toContain("celuma-row-returned");
        expect(screen.queryByTestId("returned-record-notice")).toBeNull();
    }, SLOW_TEST_MS);

    it("the in-app return does the same and says when the order no longer matches after a status change", async () => {
        await openOrderFromPage3();
        located = { id: "o27", matches: false, position: null, page: null };
        fireEvent.click(screen.getByText("Volver a Órdenes"));
        expect(await screen.findByTestId("returned-record-notice")).toBeInTheDocument();
        expect(currentLocation).toBe("/orders?status=RECEIVED&page=3");
        expect(screen.getByTestId("returned-record-notice").textContent).toContain(
            "La orden CU-27 ya no coincide con la búsqueda y los filtros actuales",
        );
        await waitFor(() => expect(scrollTo).toHaveBeenCalled());
        // The user decides: the kept filters can be cleared from the notice.
        fireEvent.click(screen.getByText("Quitar búsqueda y filtros"));
        await waitFor(() => expect(currentLocation).toBe("/orders"));
        expect(screen.queryByTestId("returned-record-notice")).toBeNull();
    }, SLOW_TEST_MS);

    it("offers the page where the order now is when the ordering moved it", async () => {
        const fetchMock = await openOrderFromPage3();
        located = { id: "o27", matches: true, position: 41, page: 5 };
        fireEvent.click(screen.getByText("Atrás del navegador"));
        expect(await screen.findByText("La orden CU-27 ahora aparece en la página 5 con este orden.")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Ir a la página 5"));
        await waitFor(() => expect(listUrls(fetchMock).at(-1)).toContain("page=5"));
        await waitFor(() => expect(currentLocation).toBe("/orders?status=RECEIVED&page=5"));
    }, SLOW_TEST_MS);

    it("opening the list fresh (sidebar or link) neither restores the scroll nor locates", async () => {
        const fetchMock = await openOrderFromPage3();
        // A new visit to the list, not a return: a PUSH without the restore marker.
        render(
            <MemoryRouter initialEntries={["/orders"]}>
                <Routes><Route path="/orders" element={<OrdersList />} /></Routes>
            </MemoryRouter>,
        );
        await waitFor(() => expect(listUrls(fetchMock).some((u) => u.includes("page=1&page_size=10&sort=order_code"))).toBe(true));
        expect(listUrls(fetchMock).filter((u) => u.includes("page=1&")).some((u) => u.includes("locate="))).toBe(false);
    }, SLOW_TEST_MS);
});

describe("Samples list — returning from a sample", () => {
    it("restores the view and locates the sample", async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("filter-options")) {
                return jsonResponse({ states: ["RECEIVED"], sample_types: [], has_untyped_samples: false, orders: [], patients: [], labels: [], assignees: [] });
            }
            const params = new URL(url, "http://x").searchParams;
            return jsonResponse({
                samples: [{
                    id: "s1", sample_code: "S-01", sample_type: null, state: "RECEIVED", tenant_id: "t1", branch: { id: "b1", name: "M" },
                    order: { id: "o1", order_code: "CU-01", status: "RECEIVED", patient: null },
                }],
                total: 1, page: 1, page_size: 10,
                ...(params.get("locate") ? { located: { id: "s1", matches: false } } : {}),
            });
        });
        vi.stubGlobal("fetch", fetchMock);
        renderApp("/samples?state=RECEIVED");
        fireEvent.click(rowOf(await screen.findByText("S-01").then((el) => el.textContent!)));
        fireEvent.click(await screen.findByText("Volver a Muestras"));
        expect(await screen.findByText(/La muestra S-01 ya no coincide/)).toBeInTheDocument();
        expect(listUrls(fetchMock, "/v1/laboratory/samples/?").at(-1)).toContain("locate=s1");
    }, SLOW_TEST_MS);
});

describe("Worklist — returning from a case", () => {
    // Céluma 1.5 (#85): one snapshot (`scope=all`) whose rows say whether a step falls to the user.
    const item = (id: string, code: string, status: string, pending = true, extra: Record<string, unknown> = {}) => ({
        id, kind: "assignment", item_type: "lab_order", item_id: `o-${id}`, display_id: code, item_status: status,
        entity_status: status, next_step: pending ? "work" : null, waiting_on: null, actionable: pending,
        assigned_at: "2026-11-20T10:00:00Z", patient_id: "p1", patient_name: "Paciente Sintético", patient_code: "P-1",
        order_code: code, tags: [], link: `/orders/o-${id}`, ...extra,
    });

    function stubWorklist(sequence: Array<ReturnType<typeof item>[]>) {
        let call = 0;
        const fetchMock = vi.fn(async () => {
            const items = sequence[Math.min(call++, sequence.length - 1)];
            return jsonResponse({ items, total: items.length, page: 1, page_size: items.length, has_more: false, scope: "all", as_of: "2026-11-20T10:00:00Z" });
        });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    it("opens Pendientes on a bare URL and says when the case left it, with a way to Todas", async () => {
        stubWorklist([
            [item("w1", "CU-01", "PROCESSING"), item("w2", "CU-02", "RECEIVED"), item("w3", "CU-03", "RELEASED", false)],
            [item("w1", "CU-01", "RELEASED", false), item("w2", "CU-02", "RECEIVED"), item("w3", "CU-03", "RELEASED", false)],
        ]);
        renderApp("/worklist");
        expect(await screen.findByText("CU-01")).toBeInTheDocument();
        expect(screen.queryByText("CU-03")).toBeNull(); // nothing pending: only in Todas
        expect(currentLocation).toBe("/worklist"); // no default is written into the URL any more
        fireEvent.click(rowOf("CU-01"));
        fireEvent.click(await screen.findByText("Volver a Lista de trabajo"));
        expect(await screen.findByText("El elemento CU-01 ya no está pendiente (Liberada). Sigue disponible en Todas.")).toBeInTheDocument();
        expect(screen.queryByText("CU-01")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Ver en Todas" }));
        expect(await screen.findByText("CU-01")).toBeInTheDocument();
        await waitFor(() => expect(currentLocation).toBe("/worklist?vista=todas"));
        expect(rowOf("CU-01")).toHaveClass("celuma-row-returned");
    }, SLOW_TEST_MS);

    it("says when the case is no longer in the user's worklist at all", async () => {
        stubWorklist([
            [item("w1", "CU-01", "PROCESSING"), item("w2", "CU-02", "RECEIVED")],
            [item("w2", "CU-02", "RECEIVED")],
        ]);
        renderApp("/worklist");
        fireEvent.click(rowOf(await screen.findByText("CU-01").then((el) => el.textContent!)));
        fireEvent.click(await screen.findByText("Atrás del navegador"));
        expect(await screen.findByText(/El elemento CU-01 ya no está en tu lista de trabajo/)).toBeInTheDocument();
    }, SLOW_TEST_MS);

    it("a pre-1.5 link keeps its status filter: Todas, the same rows, a removable chip", async () => {
        stubWorklist([[
            item("w1", "CU-01", "PROCESSING"), item("w2", "CU-02", "RECEIVED"),
            item("w3", "CU-03", "RELEASED", false), item("w4", "CU-04", "RECEIVED", false, { waiting_on: null }),
        ]]);
        renderApp("/worklist?item_status=PROCESSING&item_status=RECEIVED&page=1");
        expect(await screen.findByText("CU-01")).toBeInTheDocument();
        expect(screen.getByText("CU-02")).toBeInTheDocument();
        expect(screen.getByText("CU-04")).toBeInTheDocument(); // matched the old filter, not pending: still shown
        expect(screen.queryByText("CU-03")).toBeNull();
        expect(screen.getByText("Abrimos esta vista guardada con su filtro de estado anterior.")).toBeInTheDocument();
        await waitFor(() => expect(currentLocation).toBe("/worklist?item_status=PROCESSING&item_status=RECEIVED&vista=todas"));
        fireEvent.click(screen.getByRole("button", { name: "Quitar filtro Estado (vista anterior): En Proceso, Recibida" }));
        expect(await screen.findByText("CU-03")).toBeInTheDocument();
        await waitFor(() => expect(currentLocation).toBe("/worklist?vista=todas"));
    }, SLOW_TEST_MS);

    it("an explicitly cleared pre-1.5 status filter opens Todas unfiltered", async () => {
        stubWorklist([[item("w1", "CU-01", "PROCESSING"), item("w3", "CU-03", "RELEASED", false)]]);
        renderApp("/worklist?item_status=");
        expect(await screen.findByText("CU-03")).toBeInTheDocument();
        expect(screen.getByText("CU-01")).toBeInTheDocument();
        await waitFor(() => expect(currentLocation).toBe("/worklist?vista=todas"));
    }, SLOW_TEST_MS);

    it("a report opened from the worklist offers 'Volver a Lista de trabajo' and restores the view", async () => {
        const report = item("r1", "CU-09", "IN_REVIEW", true, {
            kind: "review", item_type: "report", link: "/reports/rep-1", next_step: "review", review_decision: "PENDING",
        });
        stubWorklist([[report, item("w2", "CU-02", "RECEIVED")]]);
        renderApp("/worklist?q=CU-09");
        fireEvent.click(rowOf(await screen.findByText("CU-09").then((el) => el.textContent!)));
        const back = await screen.findByText("Volver a Lista de trabajo");
        expect(screen.queryByText("Volver a la orden")).toBeNull();
        fireEvent.click(back);
        expect(await screen.findByText("CU-09")).toBeInTheDocument();
        expect(currentLocation).toBe("/worklist?q=CU-09");
        expect(rowOf("CU-09")).toHaveClass("celuma-row-returned");
    }, SLOW_TEST_MS);
});

