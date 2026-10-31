/**
 * Céluma 1.4 (#9, #10, #11) — order/sample edit pages and the erroneous-capture removal alert.
 * The API is the authority (lifecycle window, evidence, capability); these tests pin what the UI asks for
 * and what it explains. Synthetic data only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RemoveCaptureDialog from "../../components/management/remove_capture_dialog";
import OrderEditForm from "../../pages/order_edit_form";
import SampleEditForm from "../../pages/sample_edit_form";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => navigateMock }));
vi.mock("../../components/ui/sidebar_menu", () => ({ default: () => null }));
vi.mock("../../hooks/use_user_profile", () => ({ useUserProfile: () => ({ hasPermission: () => true }) }));

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const action = (over: Record<string, unknown> = {}) => ({ permitted: true, allowed: true, blockers: [], ...over });

interface Calls { writes: Array<{ url: string; method: string; body: Record<string, unknown> }> }

function stub(over: { orderEdit?: unknown; sampleCorrection?: unknown; followsMonth?: boolean; datesWrite?: unknown } = {}): Calls {
    const calls: Calls = { writes: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method && init.method !== "GET") {
            calls.writes.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
            if (url.endsWith("/dates")) return json(over.datesWrite ?? { sample_id: "s1", sample_code: "BX-1", old_code: null, unchanged: false });
            return json({});
        }
        if (url.endsWith("/orders/o1/management")) return json({ edit: over.orderEdit ?? action(), removal: action(), removal_consequences: [] });
        if (url.endsWith("/samples/s1/management")) return json({
            correction: over.sampleCorrection ?? action(), dates: over.sampleCorrection ?? action(), removal: action(),
            removal_consequences: [], code_follows_receipt_month: over.followsMonth ?? false,
        });
        if (url.endsWith("/orders/o1/full")) return json({ order: { id: "o1", order_code: "CU-1", requesting_physicians: [{ id: "p1" }], expediente: "000731", notes: "n" }, patient: { id: "pt1" } });
        if (url.endsWith("/samples/s1")) return json({ id: "s1", sample_code: "BX-1", notes: "desc", received_at: "2026-10-05T00:00:00", collected_at: null, order: { id: "o1" } });
        if (url.endsWith("/v1/patients/")) return json([{ id: "pt1", patient_code: "PAC-1", first_name: "Ana", last_name: "Uno" }]);
        if (url.includes("/requesting-physicians/")) return json([{ id: "p1", physician_code: "MED-1", full_name: "Dra. Vela" }]);
        return json({});
    }));
    return calls;
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    navigateMock.mockReset();
});
afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

// antd's DatePicker popup needs ResizeObserver, which jsdom lacks (same shim as block_e_order_sample_forms).
beforeAll(() => {
    if (!("ResizeObserver" in window)) {
        (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    }
});

/** The masked antd picker commits from the calendar: freeze the clock on the day and click its cell. */
async function pickDate(container: HTMLElement, caption: string, value: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    const [year, month, day] = value.split("-").map(Number);
    vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
    const label = Array.from(container.querySelectorAll("label")).find((l) => l.textContent?.trim().startsWith(caption))!;
    const input = label.parentElement!.querySelector("input") as HTMLInputElement;
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    fireEvent.focus(input);
    const cell = () => Array.from(document.querySelectorAll(".ant-picker-dropdown")).at(-1)
        ?.querySelector(`td[title="${value}"] .ant-picker-cell-inner`) ?? null;
    await waitFor(() => expect(cell()).toBeTruthy());
    fireEvent.click(cell()!);
    await waitFor(() => expect(input.value).toBe(value));
    vi.useRealTimers();
}

const at = (path: string, route: string, el: React.ReactElement) =>
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

describe("remove capture dialog", () => {
    const dialog = (onConfirm = vi.fn(), error: string | null = null) =>
        render(
            <RemoveCaptureDialog open title="Retirar orden" consequences={["The code is never reused."]} confirmText="Retirar orden"
                loading={false} error={error} testId="order-remove-dialog" onConfirm={onConfirm} onCancel={vi.fn()} />,
        );

    it("needs a reason, shows the consequences, and confirms with the trimmed reason", () => {
        const onConfirm = vi.fn();
        dialog(onConfirm);
        expect(screen.getByTestId("order-remove-dialog").textContent).toContain("The code is never reused.");
        const confirm = screen.getByText("Retirar orden", { selector: "button span, button" }).closest("button")!;
        expect(confirm.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("Motivo del retiro"), { target: { value: "  orden en el paciente equivocado " } });
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);
        expect(onConfirm).toHaveBeenCalledWith("orden en el paciente equivocado");
    });

    it("shows an API refusal inside the alert", () => {
        dialog(vi.fn(), "This order can no longer be changed directly");
        expect(screen.getByTestId("order-remove-dialog").textContent).toContain("can no longer be changed directly");
    });
});

describe("order edit page", () => {
    it("loads the registered patient into the form", async () => {
        stub();
        at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        expect(await screen.findByText("PAC-1 - Ana Uno")).toBeTruthy();
    });

    it("saves ONLY the allowlisted fields, verbatim expediente included, then returns to the order", async () => {
        const calls = stub();
        at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        fireEvent.click(await screen.findByText("Guardar cambios"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].method).toBe("PATCH");
        expect(calls.writes[0].url).toMatch(/\/v1\/laboratory\/orders\/o1$/);
        expect(calls.writes[0].body).toEqual({ patient_id: "pt1", requesting_physician_ids: ["p1"], expediente: "000731", notes: "n" });
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/orders/o1", { replace: true }));
    });

    it("explains a closed window and disables saving", async () => {
        stub({ orderEdit: action({ allowed: false, blockers: [{ code: "order_phase", message: "The order is in REVIEW" }] }) });
        at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        expect((await screen.findByTestId("order-edit-blockers")).textContent).toContain("The order is in REVIEW");
        expect((screen.getByText("Guardar cambios").closest("button") as HTMLButtonElement).disabled).toBe(true);
    });
});

describe("sample edit page", () => {
    it("an unchanged code only updates the description", async () => {
        const calls = stub();
        at("/samples/s1/edit", "/samples/:sampleId/edit", <SampleEditForm />);
        const notes = await screen.findByLabelText("Descripción");
        fireEvent.change(notes, { target: { value: "nueva descripción" } });
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].url).toMatch(/\/samples\/s1\/notes$/);
        expect(calls.writes[0].body).toEqual({ notes: "nueva descripción" });
    });

    it("a corrected code needs a reason and posts only the code and reason", async () => {
        const calls = stub();
        at("/samples/s1/edit", "/samples/:sampleId/edit", <SampleEditForm />);
        fireEvent.change(await screen.findByDisplayValue("BX-1"), { target: { value: "LAB.7-A" } });
        fireEvent.click(screen.getByText("Guardar cambios"));
        await screen.findByText("El motivo de la corrección es obligatorio.");
        expect(calls.writes).toHaveLength(0);
        fireEvent.change(screen.getByLabelText("Motivo de la corrección"), { target: { value: "rotulada mal" } });
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].url).toMatch(/\/samples\/s1\/code-correction$/);
        expect(calls.writes[0].body).toEqual({ sample_code: "LAB.7-A", reason: "rotulada mal" });
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/samples/s1", { replace: true }));
    });

    it("moving the dates needs a reason and sends only what changed, to the dates endpoint", async () => {
        const calls = stub();
        const { container } = at("/samples/s1/edit", "/samples/:sampleId/edit", <SampleEditForm />);
        await screen.findByDisplayValue("BX-1");
        await pickDate(container, "Fecha de recepción", "2026-10-07");
        await screen.findByLabelText("Motivo de la corrección");
        fireEvent.change(screen.getByLabelText("Motivo de la corrección"), { target: { value: "fecha mal capturada" } });
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].method).toBe("PATCH");
        expect(calls.writes[0].url).toMatch(/\/samples\/s1\/dates$/);
        expect(calls.writes[0].body).toEqual({ received_at: "2026-10-07", reason: "fecha mal capturada" });
    });

    it("warns that a new receipt month regenerates a monthly-generated code", async () => {
        const calls = stub({ followsMonth: true, datesWrite: { sample_id: "s1", sample_code: "BX010926", old_code: "BX-1", unchanged: false } });
        const { container } = at("/samples/s1/edit", "/samples/:sampleId/edit", <SampleEditForm />);
        await screen.findByDisplayValue("BX-1");
        expect(screen.queryByTestId("sample-code-regenerates")).toBeNull();
        await pickDate(container, "Fecha de recepción", "2026-09-28");
        expect((await screen.findByTestId("sample-code-regenerates")).textContent).toContain("BX-1");
        fireEvent.change(screen.getByLabelText("Motivo de la corrección"), { target: { value: "llegó en septiembre" } });
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].body).toEqual({ received_at: "2026-09-28", reason: "llegó en septiembre" });
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/samples/s1", { replace: true }));
    });

    it("outside the edit window only the description is offered", async () => {
        const calls = stub({ sampleCorrection: action({ allowed: false, blockers: [{ code: "order_phase", message: "The order is in REVIEW" }] }) });
        at("/samples/s1/edit", "/samples/:sampleId/edit", <SampleEditForm />);
        expect((await screen.findByTestId("sample-blockers")).textContent).toContain("The order is in REVIEW");
        expect(screen.queryByText("Fecha de recepción")).toBeNull();
        expect(screen.queryByDisplayValue("BX-1")).toBeNull();
        fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "nota tardía" } });
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].url).toMatch(/\/samples\/s1\/notes$/);
    });

    it("rejects characters outside the code alphabet", async () => {
        const calls = stub();
        at("/samples/s1/edit", "/samples/:sampleId/edit", <SampleEditForm />);
        fireEvent.change(await screen.findByDisplayValue("BX-1"), { target: { value: "con espacio" } });
        fireEvent.click(screen.getByText("Guardar cambios"));
        await screen.findByText(/Solo letras, números/);
        expect(calls.writes).toHaveLength(0);
    });
});
