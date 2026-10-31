/**
 * Céluma 1.4.1 — the order's report template on the unified registration form, the dedicated order edit
 * form and the sample-type catalog. The API resolves and enforces (precedence, tenant, window, lock); these
 * tests pin what the UI suggests, what it preserves and exactly what it sends. Synthetic data only.
 *
 * Contract: `celuma-engineering/specs/laboratory/order-report-template.md`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OrderForm from "../../pages/order_form";
import OrderEditForm from "../../pages/order_edit_form";
import SampleTypes from "../../pages/sample_types";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => navigateMock }));
vi.mock("../../components/ui/sidebar_menu", () => ({ default: () => null }));
vi.mock("../../hooks/use_user_profile", () => ({ useUserProfile: () => ({ hasPermission: () => true }) }));

const TENANT_ID = "tenant-1";
const BRANCH_ID = "br-1";
const PATIENT_ID = "pt-1";
const STUDY_ID = "st-1";
const RECEIVED = "2026-09-30";

const T = {
    bio: { id: "t-bio", name: "Plantilla Biopsia" },
    tej: { id: "t-tej", name: "Plantilla Tejido" },
    cit: { id: "t-cit", name: "Plantilla Citología" },
    est: { id: "t-est", name: "Plantilla Estudio" },
};
const SAMPLE_TYPES = [
    { id: "stp-bio", code: "BIO", name: "Biopsia", default_template: T.bio, default_report_template_id: T.bio.id },
    { id: "stp-tej", code: "TEJ", name: "Tejido", default_template: T.tej, default_report_template_id: T.tej.id },
    { id: "stp-lam", code: "LAM", name: "Laminilla", default_template: null, default_report_template_id: null },
].map((t) => ({ ...t, tenant_id: TENANT_ID, is_active: true, created_at: "2026-01-01T00:00:00" }));

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const action = (over: Record<string, unknown> = {}) => ({ permitted: true, allowed: true, blockers: [], ...over });

interface Writes { url: string; method: string; body: Record<string, unknown> }

function stub(over: { studyDefault?: unknown; selection?: unknown; templateAction?: unknown } = {}) {
    const writes: Writes[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/numbering/")) return json({});
        if (init?.method && init.method !== "GET") {
            writes.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
            if (url.endsWith("/orders/unified")) return json({ order: { id: "new-order" }, samples: [] });
            return json({ id: "x", ...JSON.parse(String(init.body)) });
        }
        if (url.includes("/v1/reports/templates/")) return json({ templates: Object.values(T) });
        if (url.includes("/v1/sample-types/")) return json({ sample_types: SAMPLE_TYPES });
        if (url.includes("/v1/study-types/")) {
            return json({ study_types: [{ id: STUDY_ID, code: "HIS", name: "Histopatología", is_active: true, default_template: over.studyDefault ?? null }] });
        }
        if (url.endsWith("/v1/patients/")) return json([{ id: PATIENT_ID, patient_code: "PAC-001", first_name: "Ana", last_name: "Ruiz" }]);
        if (url.includes("/v1/requesting-physicians/")) return json([]);
        if (url.includes("/branches")) return json([{ id: BRANCH_ID, name: "Sede Central", code: "MAIN" }]);
        if (url.endsWith("/orders/o1/management")) {
            return json({ edit: action(), removal: action(), removal_consequences: [], report_template: over.templateAction ?? action() });
        }
        if (url.endsWith("/orders/o1/full")) {
            return json({
                order: { id: "o1", order_code: "CU-1", requesting_physicians: [], expediente: null, notes: null, report_template: over.selection ?? null },
                patient: { id: PATIENT_ID },
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
    localStorage.setItem("tenant_id", TENANT_ID);
    localStorage.setItem("branch_id", BRANCH_ID);
    localStorage.setItem("user_id", "usr-1");
    navigateMock.mockReset();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
});

function selectByCaption(container: HTMLElement, caption: string, index = 0): Element {
    const label = Array.from(container.querySelectorAll("label")).filter((l) => l.textContent?.trim().startsWith(caption))[index];
    let node: HTMLElement | null = label?.parentElement ?? null;
    while (node && node !== container && !node.querySelector(".ant-select")) node = node.parentElement;
    const select = node?.querySelector(".ant-select");
    expect(select, `select "${caption}" not found`).toBeTruthy();
    return select!;
}

/** Opens an antd select and clicks the option whose label is EXACTLY `text`. A dropdown opened earlier may
 *  still be mounted while it fades out, and template names contain sample-type names ("Plantilla Tejido"),
 *  so a substring match on the last dropdown could click another select's option. */
async function pickOption(select: Element, text: string) {
    fireEvent.mouseDown(select.querySelector(".ant-select-selector")!);
    const match = () => {
        const open = Array.from(document.querySelectorAll(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")).reverse();
        for (const dropdown of open) {
            const option = Array.from(dropdown.querySelectorAll(".ant-select-item-option"))
                .find((o) => o.textContent?.trim() === text);
            if (option) return option;
        }
        return null;
    };
    await waitFor(() => expect(match(), `option "${text}" not found`).toBeTruthy());
    fireEvent.click(match()!);
}

function inputByCaption(caption: string): HTMLInputElement {
    const label = Array.from(document.querySelectorAll("label")).find((l) => l.textContent?.trim().startsWith(caption));
    const input = label?.parentElement?.querySelector("input");
    expect(input, `input "${caption}" not found`).toBeTruthy();
    return input as HTMLInputElement;
}

async function setReceived(container: HTMLElement, index = 0) {
    vi.useFakeTimers({ toFake: ["Date"] });
    const [year, month, day] = RECEIVED.split("-").map(Number);
    vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
    const labels = Array.from(container.querySelectorAll("label")).filter((l) => l.textContent?.trim().startsWith("Fecha de recepción"));
    const input = labels[index].parentElement!.querySelector("input") as HTMLInputElement;
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    fireEvent.focus(input);
    const cell = () => Array.from(document.querySelectorAll(".ant-picker-dropdown")).at(-1)
        ?.querySelector(`td[title="${RECEIVED}"] .ant-picker-cell-inner`) ?? null;
    await waitFor(() => expect(cell()).toBeTruthy());
    fireEvent.click(cell()!);
    await waitFor(() => expect(input.value).toBe(RECEIVED));
    vi.useRealTimers();
}

const shownTemplate = (container: HTMLElement) =>
    selectByCaption(container, "Plantilla del reporte").querySelector(".ant-select-selection-item")?.textContent ?? null;
const help = () => screen.getByTestId("report-template-help").textContent ?? "";

async function fillOrder(container: HTMLElement, sampleTypes: string[]) {
    await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(4));
    await pickOption(selectByCaption(container, "Sucursal"), "MAIN Sede Central");
    await pickOption(selectByCaption(container, "Paciente"), "PAC-001 - Ana Ruiz");
    await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología (HIS)");
    for (const [i, name] of sampleTypes.entries()) {
        if (i > 0) fireEvent.click(screen.getByText("Agregar otra muestra"));
        await pickOption(selectByCaption(container, "Tipo de muestra", i), name);
        await setReceived(container, i);
    }
}

const renderOrderForm = () => render(<MemoryRouter initialEntries={["/orders/register"]}><OrderForm /></MemoryRouter>);
const unifiedPosts = (writes: Writes[]) => writes.filter((w) => w.url.endsWith("/orders/unified"));

describe("unified registration — report template", () => {
    it("suggests the sample type's template and sends no explicit choice when the user keeps it", async () => {
        const writes = stub({ studyDefault: T.est });
        const { container } = renderOrderForm();
        await fillOrder(container, ["Biopsia"]);
        await waitFor(() => expect(shownTemplate(container)).toBe(T.bio.name));
        expect(help()).toMatch(/Sugerida por el tipo de muestra/);

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(unifiedPosts(writes)).toHaveLength(1));
        expect(unifiedPosts(writes)[0].body).not.toHaveProperty("report_template_id");
    });

    it("an explicit choice is sent and survives later sample and study changes", async () => {
        const writes = stub({ studyDefault: T.est });
        const { container } = renderOrderForm();
        await fillOrder(container, ["Biopsia"]);
        await pickOption(selectByCaption(container, "Plantilla del reporte"), T.cit.name);
        expect(help()).toMatch(/Elegida para esta orden/);
        // The sample type changes (another default): the deliberate choice is not overwritten.
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Tejido");
        expect(shownTemplate(container)).toBe(T.cit.name);
        expect(help()).toMatch(/Sin esta elección se usaría Plantilla Tejido \(sugerida por el tipo de muestra\)/);

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(unifiedPosts(writes)).toHaveLength(1));
        expect(unifiedPosts(writes)[0].body.report_template_id).toBe(T.cit.id);
    });

    it("the reset link returns to the live suggestion and nothing explicit is sent", async () => {
        const writes = stub();
        const { container } = renderOrderForm();
        await fillOrder(container, ["Biopsia"]);
        await pickOption(selectByCaption(container, "Plantilla del reporte"), T.cit.name);
        fireEvent.click(screen.getByTestId("report-template-reset"));
        expect(shownTemplate(container)).toBe(T.bio.name);

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(unifiedPosts(writes)).toHaveLength(1));
        expect(unifiedPosts(writes)[0].body).not.toHaveProperty("report_template_id");
    });

    it("samples with different templates require an explicit choice before registering", async () => {
        const writes = stub({ studyDefault: T.est });
        const { container } = renderOrderForm();
        await fillOrder(container, ["Tejido", "Biopsia"]);
        const alert = await screen.findByTestId("report-template-ambiguous");
        // Listed by name, not by sample order; nothing is preselected and the study default does not decide.
        expect(alert.textContent).toContain("Plantilla Biopsia, Plantilla Tejido");
        expect(shownTemplate(container)).toBeNull();

        fireEvent.submit(container.querySelector("form")!);
        expect(await screen.findByText(/Elige la plantilla del reporte: las muestras sugieren plantillas distintas/)).toBeTruthy();
        expect(unifiedPosts(writes)).toHaveLength(0);

        await pickOption(selectByCaption(container, "Plantilla del reporte"), T.tej.name);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(unifiedPosts(writes)).toHaveLength(1));
        expect(unifiedPosts(writes)[0].body.report_template_id).toBe(T.tej.id);
    });

    it("falls back to the study type's optional template, and registers without any template", async () => {
        stub({ studyDefault: T.est });
        const first = renderOrderForm();
        await fillOrder(first.container, ["Laminilla"]);
        await waitFor(() => expect(shownTemplate(first.container)).toBe(T.est.name));
        expect(help()).toMatch(/Sugerida por el tipo de estudio/);
        first.unmount();

        const writes = stub();
        const { container } = renderOrderForm();
        await fillOrder(container, ["Laminilla"]);
        expect(help()).toMatch(/Ni los tipos de muestra ni el tipo de estudio sugieren una plantilla/);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(unifiedPosts(writes)).toHaveLength(1));
        expect(unifiedPosts(writes)[0].body).not.toHaveProperty("report_template_id");
    });
});

const at = (path: string, route: string, el: React.ReactElement) =>
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

const selection = (over: Record<string, unknown> = {}) => ({
    report_template_id: null, status: "RESOLVED", source: "SAMPLE_TYPE", template: T.bio, candidates: [],
    default_status: "RESOLVED", default_source: "SAMPLE_TYPE", default_template: T.bio, ...over,
});
const patches = (writes: Writes[]) => writes.filter((w) => w.method === "PATCH");

describe("order edit — report template", () => {
    it("shows the default, sends nothing when untouched", async () => {
        const writes = stub({ selection: selection() });
        const { container } = at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        await waitFor(() => expect(shownTemplate(container)).toBe(T.bio.name));
        expect(help()).toMatch(/Sugerida por el tipo de muestra/);
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(patches(writes)).toHaveLength(1));
        expect(patches(writes)[0].body).not.toHaveProperty("report_template_id");
    });

    it("sends a new explicit choice", async () => {
        const writes = stub({ selection: selection() });
        const { container } = at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        await waitFor(() => expect(shownTemplate(container)).toBe(T.bio.name));
        await pickOption(selectByCaption(container, "Plantilla del reporte"), T.cit.name);
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(patches(writes)).toHaveLength(1));
        expect(patches(writes)[0].body.report_template_id).toBe(T.cit.id);
    });

    it("resetting a stored choice sends null (reset to default), not an omitted field", async () => {
        const writes = stub({ selection: selection({ report_template_id: T.cit.id, source: "ORDER", template: T.cit }) });
        const { container } = at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        await waitFor(() => expect(shownTemplate(container)).toBe(T.cit.name));
        expect(help()).toMatch(/Sin esta elección se usaría Plantilla Biopsia/);
        fireEvent.click(screen.getByTestId("report-template-reset"));
        expect(shownTemplate(container)).toBe(T.bio.name);
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(patches(writes)).toHaveLength(1));
        expect(patches(writes)[0].body).toHaveProperty("report_template_id", null);
    });

    it("an existing report locks the template (explained, disabled) while other fields stay editable", async () => {
        const writes = stub({
            selection: selection({ report_template_id: T.cit.id, source: "ORDER", template: T.cit }),
            templateAction: action({ allowed: false, blockers: [{ code: "report_template_locked", message: "La orden ya tiene un reporte; su plantilla quedó fijada al crearlo." }] }),
        });
        const { container } = at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        expect((await screen.findByTestId("order-edit-template-blockers")).textContent).toContain("quedó fijada");
        await waitFor(() => expect(selectByCaption(container, "Plantilla del reporte").className).toContain("ant-select-disabled"));
        expect(screen.queryByTestId("report-template-reset")).toBeNull();
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(patches(writes)).toHaveLength(1));
        expect(patches(writes)[0].body).not.toHaveProperty("report_template_id");
    });

    it("an ambiguous order without a choice says so", async () => {
        stub({ selection: selection({ status: "AMBIGUOUS", source: null, template: null, candidates: [T.bio, T.tej],
                                      default_status: "AMBIGUOUS", default_source: null, default_template: null }) });
        at("/orders/o1/edit", "/orders/:orderId/edit", <OrderEditForm />);
        expect((await screen.findByTestId("report-template-ambiguous")).textContent).toContain("Plantilla Biopsia, Plantilla Tejido");
    });
});

describe("sample-type catalog — report template link", () => {
    const modalSelect = () => document.querySelector('[data-testid="sample-type-template-select"]')?.closest(".ant-select")
        ?? selectByCaption(document.body, "Plantilla de reporte (opcional)");

    it("lists the linked template and creates, changes and clears the link with explicit values", async () => {
        const writes = stub();
        render(<MemoryRouter><SampleTypes embedded /></MemoryRouter>);
        expect(await screen.findByText(T.tej.name)).toBeTruthy(); // the table column

        fireEvent.click(screen.getByText("Nuevo Tipo de Muestra"));
        await waitFor(() => inputByCaption("Código"));
        fireEvent.change(inputByCaption("Código"), { target: { value: "CIT" } });
        fireEvent.change(inputByCaption("Nombre"), { target: { value: "Citología" } });
        await pickOption(modalSelect(), T.cit.name);
        fireEvent.click(screen.getByText("Crear"));
        await waitFor(() => expect(writes.filter((w) => w.method === "POST")).toHaveLength(1));
        expect(writes[0].body.default_report_template_id).toBe(T.cit.id);

        // Editing an existing type and clearing its template sends null (omitting it would keep the old one).
        fireEvent.click(screen.getAllByTitle("Editar")[0]);
        await waitFor(() => expect(modalSelect().querySelector(".ant-select-selection-item")).toBeTruthy());
        fireEvent.mouseDown(modalSelect().querySelector(".ant-select-selector")!);
        fireEvent.mouseDown(modalSelect().querySelector(".ant-select-clear")!);
        fireEvent.click(screen.getByText("Guardar cambios"));
        await waitFor(() => expect(writes.filter((w) => w.method === "PUT")).toHaveLength(1));
        expect(writes.find((w) => w.method === "PUT")!.body).toHaveProperty("default_report_template_id", null);
    });
});
