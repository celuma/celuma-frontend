/**
 * Céluma 1.5 (#69 review) — Patient and Requesting-physician selectors on Registrar caso and Editar orden.
 *
 * Only the dropdown rows change (full name, code chip, secondary details, constrained popup). These tests pin
 * what must NOT change: the labels, label-based search, API order, the selected text and chips, chip removal,
 * keyboard selection and what the form sends. Synthetic data only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OrderForm from "../../pages/order_form";
import OrderEditForm from "../../pages/order_edit_form";
import { patientOption, physicianOption, physicianOptionCompact } from "../../lib/person_options";

vi.mock("../../components/ui/sidebar_menu", () => ({ default: () => null }));
vi.mock("../../hooks/use_user_profile", () => ({ useUserProfile: () => ({ hasPermission: () => true }) }));

/** Deliberately NOT alphabetical: the API order must be kept. */
const PATIENTS = [
    { id: "pt-3", patient_code: "PAC-003", first_name: "Zoe Sintética", last_name: "Apellidolargo Segundoapellido" },
    { id: "pt-1", patient_code: "PAC-001", first_name: "Ana", last_name: "Ruiz" },
    { id: "pt-2", patient_code: "PAC-002" },
];
const PHYSICIANS = [
    { id: "md-2", physician_code: "MED-02", full_name: "Médica Sintética Con Nombre Muy Largo", specialty: "Dermatología", institution: "Hospital General Sintético" },
    { id: "md-1", physician_code: "MED-01", full_name: "Médico Sintético", specialty: null, institution: null },
    { id: "md-3", physician_code: "MED-03", full_name: "Otra Médica", specialty: null, institution: "Clínica Sintética" },
];

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Writes { url: string; method: string; body: Record<string, unknown> }

function stubApi(selectedPhysicians: string[] = []) {
    const writes: Writes[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method && init.method !== "GET") {
            writes.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
            return json({ id: "o1" });
        }
        if (url.includes("/v1/numbering/")) return json({});
        if (url.includes("/v1/patients/")) return json(PATIENTS);
        if (url.includes("/v1/requesting-physicians/")) return json(PHYSICIANS);
        if (url.includes("/v1/study-types/")) return json({ study_types: [] });
        if (url.includes("/v1/sample-types/")) return json({ sample_types: [] });
        if (url.includes("/v1/reports/templates/")) return json({ templates: [] });
        if (url.includes("/branches")) return json([{ id: "br-1", name: "Sede Central", code: "MAIN" }]);
        if (url.endsWith("/orders/o1/management")) {
            const action = { permitted: true, allowed: true, blockers: [] };
            return json({ edit: action, removal: action, removal_consequences: [], report_template: action });
        }
        if (url.endsWith("/orders/o1/full")) {
            return json({
                order: { id: "o1", order_code: "CU-1", requesting_physicians: selectedPhysicians.map((id) => ({ id })), expediente: null, notes: null, report_template: null },
                patient: { id: "pt-1" },
            });
        }
        return json({});
    }));
    return writes;
}

beforeAll(() => {
    if (!("ResizeObserver" in window)) {
        (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    }
});
beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    localStorage.setItem("tenant_id", "tenant-1");
    localStorage.setItem("branch_id", "br-1");
    localStorage.setItem("user_id", "usr-1");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

function selectByCaption(root: ParentNode, caption: string): HTMLElement {
    const label = Array.from(root.querySelectorAll("label")).find((l) => l.textContent?.trim().startsWith(caption));
    let node: HTMLElement | null = label?.parentElement ?? null;
    while (node && !node.querySelector(".ant-select")) node = node.parentElement;
    const select = node?.querySelector<HTMLElement>(".ant-select");
    expect(select, `select "${caption}" not found`).toBeTruthy();
    return select!;
}
const input = (select: HTMLElement) => select.querySelector<HTMLInputElement>("input")!;
function popup(select: HTMLElement): HTMLElement | null {
    const id = input(select).getAttribute("aria-controls");
    return (id ? document.getElementById(id)?.closest<HTMLElement>(".ant-select-dropdown") : null) ?? null;
}
const options = (select: HTMLElement) => Array.from(popup(select)?.querySelectorAll<HTMLElement>(".ant-select-item-option") ?? []);
const texts = (select: HTMLElement) => options(select).map((o) => o.textContent ?? "");
const key = (select: HTMLElement, k: "ArrowDown" | "Enter") =>
    fireEvent.keyDown(input(select), { key: k, code: k, keyCode: k === "Enter" ? 13 : 40 });
async function open(select: HTMLElement) {
    input(select).focus();
    key(select, "ArrowDown");
    await waitFor(() => expect(options(select).length).toBeGreaterThan(0));
}

describe("person option labels are the pre-existing ones", () => {
    it("builds the same patient and physician labels the forms used", () => {
        expect(PATIENTS.map((p) => patientOption(p).label)).toEqual(["PAC-003 - Zoe Sintética Apellidolargo Segundoapellido", "PAC-001 - Ana Ruiz", "PAC-002"]);
        expect(PHYSICIANS.map((p) => physicianOption(p).label)).toEqual([
            "MED-02 - Médica Sintética Con Nombre Muy Largo · Dermatología · Hospital General Sintético",
            "MED-01 - Médico Sintético",
            "MED-03 - Otra Médica · Clínica Sintética",
        ]);
        expect(PHYSICIANS.map((p) => physicianOptionCompact(p).label)).toEqual(["MED-02 - Médica Sintética Con Nombre Muy Largo", "MED-01 - Médico Sintético", "MED-03 - Otra Médica"]);
        expect(physicianOptionCompact(PHYSICIANS[0]).extraDetail).toBe("Dermatología · Hospital General Sintético");
    });
});

describe("Registrar caso — Paciente and Médicos solicitantes", () => {
    const renderForm = async () => {
        const writes = stubApi();
        const view = render(<MemoryRouter initialEntries={["/orders/register"]}><OrderForm /></MemoryRouter>);
        await waitFor(() => expect(view.container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        return { ...view, writes };
    };

    it("keeps the patient labels in API order, with the code chip and the full name in the row", async () => {
        const { container } = await renderForm();
        const select = selectByCaption(container, "Paciente");
        await open(select);
        expect(texts(select)).toEqual(PATIENTS.map((p) => patientOption(p).label));
        const first = options(select)[0];
        expect(first.querySelector(".ct-option__code")?.textContent).toBe("PAC-003");
        expect(first.querySelector(".ct-option__name")?.textContent).toBe("Zoe Sintética Apellidolargo Segundoapellido");
        expect(popup(select)?.className).toContain("ct-popup");
        // A patient without a name keeps its plain label row.
        expect(options(select)[2].querySelector(".ct-option")).toBeNull();
    });

    it("searches patients on the label exactly as before and selects by keyboard", async () => {
        const { container } = await renderForm();
        const select = selectByCaption(container, "Paciente");
        await open(select);
        fireEvent.change(input(select), { target: { value: "Ruiz" } });
        await waitFor(() => expect(texts(select)).toEqual(["PAC-001 - Ana Ruiz"]));
        fireEvent.change(input(select), { target: { value: "PAC-00" } });
        await waitFor(() => expect(texts(select)).toHaveLength(3));
        // Label substring, as before: accents are not folded and typos are not tolerated.
        fireEvent.change(input(select), { target: { value: "sintetica" } });
        await waitFor(() => expect(texts(select)).toEqual([]));
        fireEvent.change(input(select), { target: { value: "PAC-001" } });
        await waitFor(() => expect(texts(select)).toEqual(["PAC-001 - Ana Ruiz"]));
        key(select, "Enter");
        // Céluma 1.5 (#85 follow-up): the closed field shows the name with the code as a chip, like
        // Tipo de estudio; the code's parentheses are visually hidden, so it reads "Ana Ruiz (PAC-001)".
        await waitFor(() => expect(select.querySelector(".ct-selected__name")?.textContent).toBe("Ana Ruiz"));
        expect(select.querySelector(".ct-selected__code")?.textContent).toBe(" (PAC-001)");
        expect(select.querySelector(".ant-select-selection-item")?.textContent).toBe("Ana Ruiz (PAC-001)");
        expect(select.querySelector(".ct-selected")?.getAttribute("title")).toBe("PAC-001 - Ana Ruiz");
    });

    it("shows the same trailing check on the selected row in Paciente and Médicos solicitantes", async () => {
        const { container } = await renderForm();
        for (const caption of ["Paciente", "Médicos solicitantes"]) {
            const select = selectByCaption(container, caption);
            await open(select);
            key(select, "Enter");
            await open(select);
            await waitFor(() => {
                const selected = options(select).filter((o) => o.classList.contains("ant-select-item-option-selected"));
                expect(selected).toHaveLength(1);
                expect(selected[0].querySelector(".ant-select-item-option-state .anticon-check")).not.toBeNull();
            });
            fireEvent.keyDown(input(select), { key: "Escape" });
        }
    });

    it("shows physician details on their own line, keeps label chips, removes a chip, searches details", async () => {
        const { container } = await renderForm();
        const select = selectByCaption(container, "Médicos solicitantes");
        await open(select);
        expect(texts(select)).toEqual(PHYSICIANS.map((p) => physicianOption(p).label));
        expect(options(select)[0].querySelector(".ct-option__detail")?.textContent).toBe(" · Dermatología · Hospital General Sintético");
        expect(popup(select)?.className).toContain("ct-popup");

        fireEvent.change(input(select), { target: { value: "Dermatología" } });
        await waitFor(() => expect(texts(select)).toHaveLength(1));
        key(select, "Enter");
        fireEvent.change(input(select), { target: { value: "MED-03" } });
        await waitFor(() => expect(texts(select)).toHaveLength(1));
        // A second keyboard pick in multiple mode is checked in the browser (jsdom does not move rc-select's
        // active row after a pick); here the option is clicked.
        fireEvent.click(options(select)[0]);
        const chips = () => Array.from(select.querySelectorAll(".ant-select-selection-item")).map((c) => c.querySelector(".ant-select-selection-item-content")?.textContent);
        await waitFor(() => expect(chips()).toEqual([physicianOption(PHYSICIANS[0]).label, physicianOption(PHYSICIANS[2]).label]));

        fireEvent.click(select.querySelectorAll(".ant-select-selection-item-remove")[0]);
        await waitFor(() => expect(chips()).toEqual([physicianOption(PHYSICIANS[2]).label]));
    });
});

describe("Editar orden — Paciente and Médicos solicitantes", () => {
    it("keeps the saved selection and compact chips, shows details only in the rows, and sends the same ids", async () => {
        const writes = stubApi(["md-1"]);
        const { container, getByText } = render(
            <MemoryRouter initialEntries={["/orders/o1/edit"]}><Routes><Route path="/orders/:orderId/edit" element={<OrderEditForm />} /></Routes></MemoryRouter>,
        );
        const patient = await waitFor(() => selectByCaption(container, "Paciente"));
        await waitFor(() => expect(patient.querySelector(".ant-select-selection-item")?.textContent).toBe("PAC-001 - Ana Ruiz"));
        const physicians = selectByCaption(container, "Médicos solicitantes");
        const chips = () => Array.from(physicians.querySelectorAll(".ant-select-selection-item-content")).map((c) => c.textContent);
        expect(chips()).toEqual(["MED-01 - Médico Sintético"]);

        await open(physicians);
        const rows = options(physicians);
        expect(rows.map((r) => r.querySelector(".ct-option__code")?.textContent)).toEqual(["MED-02", "MED-01", "MED-03"]);
        expect(rows[0].querySelector(".ct-option__detail")?.textContent).toBe("Dermatología · Hospital General Sintético");
        // Search still runs on the compact label only.
        fireEvent.change(input(physicians), { target: { value: "Dermatología" } });
        await waitFor(() => expect(options(physicians)).toHaveLength(0));
        fireEvent.change(input(physicians), { target: { value: "MED-03" } });
        await waitFor(() => expect(options(physicians)).toHaveLength(1));
        key(physicians, "Enter");
        await waitFor(() => expect(chips()).toEqual(["MED-01 - Médico Sintético", "MED-03 - Otra Médica"]));

        fireEvent.click(getByText("Guardar cambios"));
        await waitFor(() => expect(writes.find((w) => w.method !== "GET")?.body.requesting_physician_ids).toEqual(["md-1", "md-3"]));
    });
});
