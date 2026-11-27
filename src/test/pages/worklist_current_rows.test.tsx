/**
 * Céluma 1.5 (#85) — Mi Lista de Trabajo keeps its pending rows, count and pages current.
 *
 * Contract: celuma-engineering/specs/lists/search-and-pagination.md ("Mi Lista de Trabajo").
 * The page reads one snapshot (`scope=all`) and derives membership, count, range and page from
 * it. Actions happen on the record's page; coming back (Back or "Volver a Lista de trabajo")
 * reloads the snapshot. Synthetic rows only; the API is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Worklist from "../../pages/worklist";
import ListReturnLink from "../../components/lists/list_return_link";
import ReportReturnLink from "../../components/report/report_return_link";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { WorklistItem } from "../../services/worklist_service";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);
configure({ asyncUtilTimeout: 8000 });
const SLOW = 30_000;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const snapshot = (items: WorklistItem[]) =>
    json({ items, total: items.length, page: 1, page_size: items.length, has_more: false, scope: "all", as_of: "2026-11-20T16:42:00Z" });

const T = Date.UTC(2026, 10, 20, 12);
const pending = (n: number, over: Partial<WorklistItem> = {}): WorklistItem => ({
    id: `w${String(n).padStart(3, "0")}`, kind: "review", item_type: "report", item_id: `r${n}`,
    display_id: `Reporte ${n}`, item_status: "PENDING", review_decision: "PENDING", entity_status: "IN_REVIEW",
    next_step: "review", waiting_on: null, actionable: true,
    assigned_at: new Date(T - n * 60_000).toISOString(), patient_id: "p1", patient_name: "Paciente Sintético",
    patient_code: "PAC-EJ-1", order_code: `CU-${String(n).padStart(3, "0")}`, tags: [], link: `/reports/r${n}`, ...over,
});
const decided = (item: WorklistItem, over: Partial<WorklistItem> = {}): WorklistItem => ({
    ...item, review_decision: "REJECTED", item_status: "REJECTED", entity_status: "DRAFT",
    next_step: null, actionable: false, ...over,
});

let loc = "";
function Probe() { const l = useLocation(); loc = l.pathname + l.search; return null; }
function FakeRecord() {
    const navigate = useNavigate();
    return <div><ListReturnLink /><button onClick={() => navigate(-1)}>Atrás del navegador</button></div>;
}
function FakeReport() {
    const navigate = useNavigate();
    return <div><ReportReturnLink orderId="o-1" /><button onClick={() => navigate(-1)}>Atrás del navegador</button></div>;
}
function renderAt(url: string, state?: unknown) {
    return render(
        <MemoryRouter initialEntries={[state ? { pathname: url, state } : url]}>
            <Probe />
            <Routes>
                <Route path="/worklist" element={<Worklist />} />
                <Route path="/orders/:id" element={<FakeRecord />} />
                <Route path="/reports/:id" element={<FakeReport />} />
            </Routes>
        </MemoryRouter>,
    );
}
/** Each worklist request answers with the next entry (a Response, an items list, or a Promise of either). */
function stub(sequence: Array<WorklistItem[] | Response | Promise<Response>>) {
    let call = 0;
    const fn = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => {
        const next = sequence[Math.min(call++, sequence.length - 1)];
        if (Array.isArray(next)) return snapshot(next);
        return next;
    });
    vi.stubGlobal("fetch", fn);
    return fn;
}
const summary = () => screen.getByTestId("worklist-summary").textContent;
const codeLink = (code: string) => screen.getByRole("link", { name: code });
const back = async () => fireEvent.click(await screen.findByText("Atrás del navegador"));
const pageButton = (n: number) => screen.getByRole("button", { name: `Página ${n}` });

beforeEach(() => {
    sessionStorage.clear();
    mockedUseUserProfile.mockReturnValue({ hasPermission: () => true } as unknown as ReturnType<typeof useUserProfile>);
    vi.stubGlobal("scrollTo", vi.fn());
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("one snapshot, one source for count, range and page", () => {
    it("20 and 21 pending rows; the view toggle counts both views", async () => {
        const rows = Array.from({ length: 21 }, (_, i) => pending(i + 1));
        stub([[...rows, decided(pending(99))]]);
        renderAt("/worklist");
        await screen.findByText("CU-001");
        expect(summary()).toBe("21 pendientes · 1–20 · Página 1 de 2");
        expect(screen.getByRole("button", { name: "Pendientes · 21", pressed: true })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Todas · 22", pressed: false })).toBeInTheDocument();
        fireEvent.click(pageButton(2));
        await screen.findByText("CU-021");
        expect(summary()).toBe("21 pendientes · 21–21 · Página 2 de 2");
        expect(loc).toBe("/worklist?page=2");
        fireEvent.click(screen.getByRole("button", { name: "Todas · 22" }));
        await waitFor(() => expect(summary()).toBe("22 tareas · 1–20 · Página 1 de 2"));
        expect(loc).toBe("/worklist?vista=todas");
    }, SLOW);

    it("asks for the whole list once and refuses an incomplete answer instead of showing it as complete", async () => {
        const fn = stub([json({ items: [pending(1)], total: 30, page: 1, page_size: 20, has_more: true })]);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        renderAt("/worklist");
        expect(await screen.findByText("No se pudo cargar la lista de trabajo")).toBeInTheDocument();
        expect(screen.queryByText("CU-001")).toBeNull();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(String(fn.mock.calls[0][0])).toContain("/v1/me/worklist?scope=all");
    }, SLOW);
});

describe("after an action on the record's page", () => {
    it("acting on the last row of the last page: it leaves Pendientes, the page clamps, count and range agree", async () => {
        const rows = Array.from({ length: 21 }, (_, i) => pending(i + 1));
        stub([rows, rows.map((r) => (r.id === "w021" ? decided(r) : r))]);
        renderAt("/worklist?page=2");
        fireEvent.click(await screen.findByRole("link", { name: "CU-021" }));
        await back();
        await screen.findByText("CU-001");
        await waitFor(() => expect(summary()).toBe("20 pendientes · 1–20 · Página 1 de 1"));
        await waitFor(() => expect(loc).toBe("/worklist"));
        expect(screen.getByText("El elemento CU-021 ya no está pendiente (Borrador). Sigue disponible en Todas.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Todas · 21" })).toBeInTheDocument();
    }, SLOW);

    it("repeated actions: each return reloads, and rows leave one at a time", async () => {
        const rows = Array.from({ length: 3 }, (_, i) => pending(i + 1));
        const after1 = rows.map((r) => (r.id === "w001" ? decided(r) : r));
        const after2 = after1.map((r) => (r.id === "w002" ? decided(r, { review_decision: "APPROVED", entity_status: "APPROVED", next_step: "sign", actionable: true }) : r));
        const fn = stub([rows, after1, after2]);
        renderAt("/worklist");
        fireEvent.click(await screen.findByRole("link", { name: "CU-001" }));
        await back();
        await waitFor(() => expect(summary()).toBe("2 pendientes · 1–2 · Página 1 de 1"));
        fireEvent.click(codeLink("CU-002"));
        await back();
        // Approved, signing still open: it stays pending, now as "Por firmar"; the review state is separate.
        const row = (await screen.findByText("CU-002")).closest("tr")!;
        await waitFor(() => expect(within(row).getByText("Por firmar")).toBeInTheDocument());
        expect(within(row).getByText("Aprobado")).toBeInTheDocument();
        expect(summary()).toBe("2 pendientes · 1–2 · Página 1 de 1");
        expect(fn).toHaveBeenCalledTimes(3);
    }, SLOW);

    it("a failed action changes nothing: the row is still pending after the return", async () => {
        const rows = [pending(1), pending(2)];
        stub([rows, rows]); // the decision was refused, so the snapshot is unchanged
        renderAt("/worklist");
        fireEvent.click(await screen.findByRole("link", { name: "CU-001" }));
        await back();
        await screen.findByText("CU-001");
        expect(summary()).toBe("2 pendientes · 1–2 · Página 1 de 1");
        expect(screen.queryByTestId("returned-record-notice")).toBeNull(); // still here: highlighted, no notice
        expect(screen.getByText("CU-001").closest("tr")).toHaveClass("celuma-row-returned");
    }, SLOW);

    it("an unassigned row leaves both views", async () => {
        stub([[pending(1), pending(2)], [pending(2)]]);
        renderAt("/worklist?vista=todas");
        fireEvent.click(await screen.findByRole("link", { name: "CU-001" }));
        await back();
        expect(await screen.findByText(/El elemento CU-001 ya no está en tu lista de trabajo/)).toBeInTheDocument();
        expect(summary()).toBe("1 tarea · 1–1 · Página 1 de 1");
    }, SLOW);
});

describe("load and refresh failures", () => {
    it("a failed first load says so and retries", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        stub([json({ detail: "x" }, 503), [pending(1)]]);
        renderAt("/worklist");
        expect(await screen.findByText("No se pudo cargar la lista de trabajo")).toBeInTheDocument();
        expect(screen.queryByText("No tienes pendientes")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
        expect(await screen.findByText("CU-001")).toBeInTheDocument();
    }, SLOW);

    it("a failed refresh keeps the rows on screen and offers a retry", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        stub([[pending(1), pending(2)], json({ detail: "x" }, 500), [pending(2)]]);
        renderAt("/worklist");
        await screen.findByText("CU-001");
        fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
        const alert = await screen.findByTestId("worklist-refresh-error");
        expect(alert).toHaveTextContent("No se pudo actualizar la lista de trabajo.");
        expect(alert).toHaveTextContent(/Se muestran los datos de las \d{2}:\d{2}/);
        expect(screen.getByText("CU-001")).toBeInTheDocument();
        expect(summary()).toBe("2 pendientes · 1–2 · Página 1 de 1");
        fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
        await waitFor(() => expect(screen.queryByText("CU-001")).toBeNull());
        expect(screen.queryByTestId("worklist-refresh-error")).toBeNull();
    }, SLOW);

    it("a late answer to an older request never replaces a newer one", async () => {
        let releaseOld!: (r: Response) => void;
        const old = new Promise<Response>((resolve) => { releaseOld = resolve; });
        const fn = stub([[pending(1)], old, [pending(3)]]);
        renderAt("/worklist");
        await screen.findByText("CU-001");
        fireEvent.click(screen.getByRole("button", { name: "Actualizar" })); // request 2: slow
        fireEvent.click(screen.getByRole("button", { name: "Actualizar" })); // request 3 supersedes it
        expect(await screen.findByText("CU-003")).toBeInTheDocument();
        releaseOld(snapshot([pending(2)])); // request 2 answers last
        await new Promise((r) => setTimeout(r, 50));
        expect(screen.queryByText("CU-002")).toBeNull();
        expect(screen.getByText("CU-003")).toBeInTheDocument();
        expect(fn).toHaveBeenCalledTimes(3);
    }, SLOW);
});

describe("empty states, search and keyboard", () => {
    it("tells an empty queue from no matches", async () => {
        stub([[decided(pending(1))]]);
        renderAt("/worklist");
        expect(await screen.findByText("No tienes pendientes")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
        expect(await screen.findByText("CU-001")).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText("Buscar por paciente o código"), { target: { value: "ZZ-999" } });
        expect(await screen.findByText("Ningún elemento coincide con la búsqueda y los filtros")).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole("button", { name: "Limpiar búsqueda y filtros" })[0]);
        expect(await screen.findByText("CU-001")).toBeInTheDocument();
    }, SLOW);

    it("the record code is a real link; a modified click is left to the browser", async () => {
        stub([[pending(1)]]);
        renderAt("/worklist");
        const link = await screen.findByRole("link", { name: "CU-001" });
        expect(link).toHaveAttribute("href", "/reports/r1");
        fireEvent.click(link, { ctrlKey: true });
        expect(loc).toBe("/worklist");
        fireEvent.click(link);
        expect(await screen.findByText("Volver a Lista de trabajo")).toBeInTheDocument();
    }, SLOW);

    it("shows the record's state and the step separately, and waits for others in Todas", async () => {
        stub([[
            pending(1),
            pending(2, { kind: "assignment", item_type: "report", review_decision: null, item_status: "IN_REVIEW", entity_status: "IN_REVIEW", next_step: null, waiting_on: "review", actionable: false }),
            pending(3, { kind: "assignment", item_type: "report", review_decision: null, item_status: "APPROVED", entity_status: "APPROVED", next_step: null, waiting_on: "signature", actionable: false }),
        ]]);
        renderAt("/worklist?vista=todas");
        const r1 = (await screen.findByText("CU-001")).closest("tr")!;
        expect(within(r1).getByText("Por revisar")).toBeInTheDocument();
        expect(within(r1).getByText("En Revisión")).toBeInTheDocument();
        expect(within(r1).getByText("Revisión de reporte")).toBeInTheDocument();
        expect(within(screen.getByText("CU-002").closest("tr")!).getByText("En espera de revisión")).toBeInTheDocument();
        expect(within(screen.getByText("CU-003").closest("tr")!).getByText("En espera de firma")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Pendientes · 1" }));
        await waitFor(() => expect(screen.queryByText("CU-002")).toBeNull());
    }, SLOW);

    it("filter chips are removable and 'Limpiar filtros' keeps the view", async () => {
        stub([[pending(1), pending(2, { kind: "assignment", item_type: "lab_order", entity_status: "RECEIVED", next_step: "work" })]]);
        renderAt("/worklist?vista=todas&kind=review");
        await screen.findByText("CU-001");
        expect(screen.queryByText("CU-002")).toBeNull();
        expect(summary()).toBe("1 tarea · 1–1 · Página 1 de 1");
        fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
        expect(await screen.findByText("CU-002")).toBeInTheDocument();
        expect(loc).toBe("/worklist?vista=todas");
    }, SLOW);
});

describe("report return link", () => {
    it("keeps 'Volver a Reportes' and 'Volver a la orden' for every other origin", async () => {
        stub([[pending(1)]]);
        const { unmount } = renderAt("/reports/r1", { reportReturn: { url: "/reports?q=x" } });
        expect(await screen.findByText("Volver a Reportes")).toBeInTheDocument();
        unmount();
        renderAt("/reports/r1");
        expect(await screen.findByText("Volver a la orden")).toBeInTheDocument();
        expect(screen.queryByText("Volver a Lista de trabajo")).toBeNull();
    }, SLOW);
});
