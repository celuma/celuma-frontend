/**
 * Céluma 1.4 (#9, #10, #11, #16) — order edit/removal and sample-code correction/removal panels.
 * The API is the authority (lifecycle window, evidence, capability); these tests pin what the UI asks for,
 * what it explains, and that a hidden/disabled control is never the only guard. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrderManagementPanel from "../../components/management/order_management_panel";
import SampleManagementPanel from "../../components/management/sample_management_panel";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => navigateMock }));

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const action = (over: Record<string, unknown> = {}) => ({ permitted: true, allowed: true, blockers: [], ...over });
const orderState = (over: Record<string, unknown> = {}) => ({
    order_id: "o1", order_code: "CU-1", status: "RECEIVED", edit: action(), removal: action(),
    editable_fields: ["requesting_physician_ids", "expediente", "notes"], sample_count: 2, has_report: false,
    removal_consequences: ["The order and its code are retained as an auditable record.", "The code is never reused."], ...over,
});
const sampleState = (over: Record<string, unknown> = {}) => ({
    sample_id: "s1", sample_code: "BX-1", order_id: "o1", order_code: "CU-1",
    correction: action(), removal: action(), removal_consequences: ["The code is never reused."], ...over,
});

interface Calls { writes: Array<{ url: string; method: string; body: Record<string, unknown> }> }

function stub(routes: { order?: unknown; sample?: unknown; writeStatus?: number; writeBody?: unknown }): Calls {
    const calls: Calls = { writes: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method && init.method !== "GET") {
            calls.writes.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
            return json(routes.writeBody ?? { already_removed: false, code: "X", sample_code: "NEW1", old_code: "BX-1" }, routes.writeStatus ?? 200);
        }
        if (url.includes("/orders/") && url.endsWith("/management")) return json(routes.order);
        if (url.includes("/samples/") && url.endsWith("/management")) return json(routes.sample);
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

const orderPanel = (over: Partial<React.ComponentProps<typeof OrderManagementPanel>> = {}) =>
    render(
        <MemoryRouter>
            <OrderManagementPanel orderId="o1" physicianIds={[]} expediente={null} notes={null} canEdit canRemove onChanged={vi.fn()} {...over} />
        </MemoryRouter>,
    );
const samplePanel = (over: Partial<React.ComponentProps<typeof SampleManagementPanel>> = {}) =>
    render(
        <MemoryRouter>
            <SampleManagementPanel sampleId="s1" sampleCode="BX-1" orderId="o1" canCorrect canRemove onChanged={vi.fn()} {...over} />
        </MemoryRouter>,
    );

describe("order management panel", () => {
    it("offers edit and removal inside the window", async () => {
        stub({ order: orderState() });
        orderPanel();
        expect((await screen.findByTestId("order-edit-button")).closest("button")!.disabled).toBe(false);
        expect(screen.getByTestId("order-remove-button").closest("button")!.disabled).toBe(false);
        expect(screen.queryByTestId("order-edit-blockers")).toBeNull();
    });

    it("explains why direct changes are closed and disables both actions", async () => {
        stub({
            order: orderState({
                status: "REVIEW",
                edit: action({ allowed: false, blockers: [{ code: "order_phase", message: "The order is in REVIEW" }] }),
                removal: action({ allowed: false, blockers: [{ code: "order_phase", message: "The order is in REVIEW" }] }),
            }),
        });
        orderPanel();
        expect((await screen.findByTestId("order-edit-blockers")).textContent).toContain("The order is in REVIEW");
        expect(screen.getByTestId("order-edit-button").closest("button")!.disabled).toBe(true);
        expect(screen.getByTestId("order-remove-button").closest("button")!.disabled).toBe(true);
    });

    it("renders nothing for a user with neither capability (and the API still enforces them)", async () => {
        stub({ order: orderState() });
        const { container } = orderPanel({ canEdit: false, canRemove: false });
        await new Promise((r) => setTimeout(r, 50));
        expect(container.querySelector("[data-testid=order-management]")).toBeNull();
    });

    it("saves ONLY the allowlisted fields, verbatim expediente included", async () => {
        const calls = stub({ order: orderState() });
        orderPanel({ physicianIds: ["p1"], expediente: "000731", notes: "n" });
        fireEvent.click(await screen.findByTestId("order-edit-button"));
        await screen.findByText("Guardar");
        fireEvent.click(screen.getByText("Guardar"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].method).toBe("PATCH");
        expect(calls.writes[0].url).toMatch(/\/v1\/laboratory\/orders\/o1$/);
        expect(calls.writes[0].body).toEqual({ requesting_physician_ids: ["p1"], expediente: "000731", notes: "n" });
    });

    it("removal needs a reason, shows the consequences, then goes back to the list", async () => {
        const calls = stub({ order: orderState(), writeBody: { kind: "order", id: "o1", code: "CU-1", already_removed: false } });
        orderPanel();
        fireEvent.click(await screen.findByTestId("order-remove-button"));
        const dialog = await screen.findByTestId("order-remove-dialog");
        expect(dialog.textContent).toContain("The code is never reused.");
        const confirm = screen.getByTestId("order-remove-confirm").closest("button")!;
        expect(confirm.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("Motivo del retiro"), { target: { value: "orden en el paciente equivocado" } });
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].url).toMatch(/\/orders\/o1\/removal$/);
        expect(calls.writes[0].body).toEqual({ reason: "orden en el paciente equivocado" });
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/orders", { replace: true }));
    });

    it("a refusal from the API is shown and nothing navigates", async () => {
        stub({
            order: orderState(), writeStatus: 409,
            writeBody: { detail: { code: "order_not_directly_modifiable", message: "This order can no longer be changed directly" } },
        });
        orderPanel();
        fireEvent.click(await screen.findByTestId("order-remove-button"));
        fireEvent.change(await screen.findByLabelText("Motivo del retiro"), { target: { value: "motivo valido" } });
        fireEvent.click(screen.getByTestId("order-remove-confirm"));
        await waitFor(() => expect(document.body.textContent).toContain("can no longer be changed directly"), { timeout: 4000 });
        expect(navigateMock).not.toHaveBeenCalled();
    });
});

describe("sample management panel", () => {
    it("corrects only the code, validating the alphabet and requiring a reason", async () => {
        const calls = stub({ sample: sampleState() });
        samplePanel();
        fireEvent.click(await screen.findByTestId("sample-correct-button"));
        await screen.findByTestId("sample-correct-dialog");
        const confirm = screen.getByTestId("sample-correct-confirm").closest("button")!;
        const codeInput = screen.getByDisplayValue("BX-1");
        fireEvent.change(codeInput, { target: { value: "con espacio" } });
        fireEvent.change(screen.getByLabelText("Motivo de la corrección"), { target: { value: "rotulada mal" } });
        expect(confirm.disabled).toBe(true);
        fireEvent.change(codeInput, { target: { value: "LAB.7-A" } });
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].url).toMatch(/\/samples\/s1\/code-correction$/);
        expect(calls.writes[0].body).toEqual({ sample_code: "LAB.7-A", reason: "rotulada mal" });
    });

    it("an unchanged code cannot be submitted", async () => {
        stub({ sample: sampleState() });
        samplePanel();
        fireEvent.click(await screen.findByTestId("sample-correct-button"));
        fireEvent.change(await screen.findByLabelText("Motivo de la corrección"), { target: { value: "algo" } });
        expect(screen.getByTestId("sample-correct-confirm").closest("button")!.disabled).toBe(true);
    });

    it("explains a closed window and disables correction", async () => {
        stub({
            sample: sampleState({
                correction: action({ allowed: false, blockers: [{ code: "report_review_history", message: "A related report was already submitted for review" }] }),
                removal: action({ allowed: false }),
            }),
        });
        samplePanel();
        expect((await screen.findByTestId("sample-blockers")).textContent).toContain("already submitted for review");
        expect(screen.getByTestId("sample-correct-button").closest("button")!.disabled).toBe(true);
    });

    it("the last sample of an order cannot be removed and the reason is shown", async () => {
        stub({ sample: sampleState({ removal: action({ allowed: false, blockers: [{ code: "last_sample", message: "This is the order's only sample" }] }) }) });
        samplePanel();
        expect((await screen.findByTestId("sample-blockers")).textContent).toContain("only sample");
        expect(screen.getByTestId("sample-remove-button").closest("button")!.disabled).toBe(true);
    });

    it("removal posts the reason and returns to the order", async () => {
        const calls = stub({ sample: sampleState() });
        samplePanel();
        fireEvent.click(await screen.findByTestId("sample-remove-button"));
        fireEvent.change(await screen.findByLabelText("Motivo del retiro"), { target: { value: "muestra duplicada" } });
        fireEvent.click(screen.getByTestId("sample-remove-confirm"));
        await waitFor(() => expect(calls.writes).toHaveLength(1));
        expect(calls.writes[0].url).toMatch(/\/samples\/s1\/removal$/);
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/orders/o1", { replace: true }));
    });

    it("renders nothing without either capability", async () => {
        stub({ sample: sampleState() });
        const { container } = samplePanel({ canCorrect: false, canRemove: false });
        await new Promise((r) => setTimeout(r, 50));
        expect(container.querySelector("[data-testid=sample-management]")).toBeNull();
    });
});
