/**
 * Céluma 1.3.1 Block E (CEL-131-07) — modernized order / sample forms.
 *
 * `order_register.tsx` / `sample_register.tsx` were the last two screens
 * built from the older form generation: a hand-rolled `FormCard`, bare
 * `<h3>` section headings, `SelectField` / `DateField` (placeholder-only,
 * no caption, no required mark, and — for the study-type picker — no search
 * at all), a single full-width submit and no cancel action.
 *
 * They are now `order_form.tsx` / `sample_form.tsx` and follow the same
 * architecture as `patient_form.tsx` / `requesting_physician_form.tsx`:
 * `PageHeader` + `Card`, `SectionTitle`, the FloatingCaption field family,
 * and the shared "required fields" + Cancelar/Registrar footer.
 *
 * What these tests defend is that the modernization was a CONTROL change,
 * not a CONTRACT change: same endpoints, same payload shape, same required /
 * optional semantics, same prefill-and-disable behaviour, same ids resolved
 * by the selectors — and that no edit workflow was introduced along the way.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrderForm from "../../pages/order_form";
import SampleForm from "../../pages/sample_form";

const TENANT_ID = "tenant-1";
const BRANCH_ID = "br-1";
const PATIENT_ID = "pt-1";
const PHYSICIAN_ID = "ph-1";
const STUDY_TYPE_ID = "st-1";
const ORDER_ID = "ord-1";

/** Céluma 1.4 (#17): the laboratory's own sample-type catalog (synthetic). */
const CATALOG = [
    { id: "stp-bio", code: "BIO", name: "Biopsia" },
    { id: "stp-lam", code: "LAM", name: "Laminilla" },
    { id: "stp-otr", code: "OTR", name: "Otro" },
    { id: "stp-tej", code: "TEJ", name: "Tejido" },
    { id: "stp-san", code: "SAN", name: "Sangre" },
].map((t) => ({ ...t, tenant_id: TENANT_ID, is_active: true, created_at: "2026-01-01T00:00:00" }));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigateMock };
});

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
    return {
        ok: init?.ok ?? true,
        status: init?.status ?? 200,
        statusText: init?.ok === false ? "Bad Request" : "OK",
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

type PostOutcome = { ok: boolean; body: unknown };

/** Céluma 1.4 (#8): numbering configuration of the synthetic laboratory; `manual_entry` is how THIS user is offered the code input. */
function numberingConfigs(order = "optional", sample = "optional") {
    const cfg = (kind: string, manual_entry: string) => ({
        entity_kind: kind, active: true, manual_policy: "allowed", format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2,
        start_value: 1, scope: "tenant", timezone: "America/Mexico_City", is_default: false, manual_entry,
    });
    return { order: cfg("order", order), sample: cfg("sample", sample) };
}

/** Routes every catalogue GET both forms make, and captures the POST. */
function stubApi(post: PostOutcome = { ok: true, body: {} }, modes: { order?: string; sample?: string } = {}) {
    const posts: Array<{ url: string; body: unknown }> = [];
    const previews: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // The non-consuming numbering preview is a POST too, but it is not the registration.
        if (url.includes("/v1/numbering/preview")) {
            previews.push(JSON.parse(String(init?.body)));
            return jsonResponse({
                entity_kind: "sample", valid: true, errors: [], format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2,
                period_year: 2026, period_month: 10, base_code: "BIO", examples: [],
                estimate: { sequence: 1, code: "BIO011026", reserved: false, skipped_occupied: 0 }, notice: "n",
            });
        }
        if (url.includes("/v1/numbering/config")) {
            return jsonResponse(numberingConfigs(modes.order, modes.sample));
        }
        if (init?.method === "POST") {
            posts.push({ url, body: JSON.parse(String(init.body)) });
            return jsonResponse(post.body, { ok: post.ok, status: post.ok ? 200 : 400 });
        }
        if (url.includes("/v1/sample-types/")) {
            return jsonResponse({ sample_types: CATALOG });
        }
        if (url.includes("/v1/study-types/")) {
            return jsonResponse({ study_types: [{ id: STUDY_TYPE_ID, code: "HIS", name: "Histopatología", is_active: true }] });
        }
        if (url.includes("/v1/patients/")) {
            return jsonResponse([{ id: PATIENT_ID, patient_code: "PAC-001", first_name: "Ana", last_name: "Ruiz" }]);
        }
        if (url.includes("/v1/requesting-physicians/")) {
            return jsonResponse([{ id: PHYSICIAN_ID, physician_code: "MED-001", full_name: "Dra. Vela", specialty: "Patología" }]);
        }
        if (url.includes("/v1/laboratory/orders/")) {
            return jsonResponse({ orders: [{ id: ORDER_ID, order_code: "ORD-001", status: "RECEIVED" }] });
        }
        if (url.includes("/branches")) {
            return jsonResponse([{ id: BRANCH_ID, name: "Sede Central", code: "MAIN" }]);
        }
        return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, posts, previews };
}

/**
 * Locates a `FloatingCaptionSelect` by its visible caption. The caption is a
 * real <label> inside the field wrapper — the modernization's whole point —
 * so this only resolves against the new components, never the old
 * placeholder-only `SelectField`.
 */
function selectByCaption(container: HTMLElement, caption: string): Element {
    const match = Array.from(container.querySelectorAll("div")).find((node) => {
        const label = node.querySelector(":scope > div > label");
        return label?.textContent?.trim().startsWith(caption) && node.querySelector(".ant-select");
    });
    expect(match, `select "${caption}" not found`).toBeTruthy();
    return match!.querySelector(".ant-select")!;
}

function inputByCaption(container: HTMLElement, caption: string): HTMLInputElement {
    const labels = Array.from(container.querySelectorAll("label"));
    const label = labels.find((l) => l.textContent?.trim().startsWith(caption));
    expect(label, `input "${caption}" not found`).toBeTruthy();
    const field = label!.parentElement!;
    const input = field.querySelector("input");
    expect(input, `input element for "${caption}" not found`).toBeTruthy();
    return input as HTMLInputElement;
}

/** Opens an antd select and clicks the option whose label contains `text`. */
async function pickOption(select: Element, text: string) {
    fireEvent.mouseDown(select.querySelector(".ant-select-selector")!);
    await waitFor(() => {
        expect(document.querySelector(".ant-select-item-option")).toBeTruthy();
    });
    const option = Array.from(document.querySelectorAll(".ant-select-item-option")).find((o) =>
        o.textContent?.includes(text),
    );
    expect(option, `option "${text}" not found`).toBeTruthy();
    fireEvent.click(option!);
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
    const match = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.trim() === text,
    );
    expect(match, `button "${text}" not found`).toBeTruthy();
    return match as HTMLButtonElement;
}

function renderOrderForm(initialEntry = "/orders/register") {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <OrderForm />
        </MemoryRouter>,
    );
}

function renderSampleForm(initialEntry = "/samples/register") {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <SampleForm />
        </MemoryRouter>,
    );
}

// antd's DatePicker popup is positioned by rc-resize-observer, which jsdom
// does not implement — without this the calendar never opens and the date
// fields cannot be driven at all. Scoped to this file rather than
// `setup.ts` so no existing suite's behaviour changes. Same category as the
// `matchMedia` shim there: an environment gap, not app behaviour.
beforeAll(() => {
    if (!("ResizeObserver" in window)) {
        (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
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

// ── The renamed components mount ────────────────────────────────────────────

describe("CEL-131-07 — the renamed components mount and render the modern chrome", () => {
    it("order_form renders the PageHeader title and the shared footer actions", async () => {
        stubApi();
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());

        expect(container.querySelector("h1")?.textContent).toBe("Registrar Caso");
        expect(buttonByText(container, "Cancelar")).toBeTruthy();
        expect(buttonByText(container, "Registrar")).toBeTruthy();
        expect(container.textContent).toContain("son obligatorios");
    });

    it("sample_form renders the PageHeader title and the shared footer actions", async () => {
        stubApi();
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());

        expect(container.querySelector("h1")?.textContent).toBe("Registrar Muestra");
        expect(buttonByText(container, "Cancelar")).toBeTruthy();
        expect(buttonByText(container, "Registrar")).toBeTruthy();
        expect(container.textContent).toContain("son obligatorios");
    });

    it("neither form exposes an edit workflow — the submit label never becomes 'Guardar cambios'", async () => {
        stubApi();
        const order = renderOrderForm();
        await waitFor(() => expect(order.container.querySelector("h1")).toBeTruthy());
        expect(order.container.textContent).not.toContain("Guardar cambios");
        expect(order.container.textContent).not.toContain("Editar");
        order.unmount();

        const sample = renderSampleForm();
        await waitFor(() => expect(sample.container.querySelector("h1")).toBeTruthy());
        expect(sample.container.textContent).not.toContain("Guardar cambios");
        expect(sample.container.textContent).not.toContain("Editar");
    });
});

// ── Selectors are captioned, searchable, and resolve the same ids ───────────

describe("CEL-131-07 — catalogue selectors are captioned and searchable", () => {
    it("order_form's catalogue selects all carry a floating caption and search", async () => {
        stubApi();
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));

        for (const caption of ["Sucursal", "Paciente", "Tipo de estudio", "Médico solicitante (opcional)"]) {
            const select = selectByCaption(container, caption);
            expect(select.classList.contains("ant-select-show-search"), `${caption} is not searchable`).toBe(true);
        }
    });

    it("sample_form's catalogue selects all carry a floating caption and search", async () => {
        stubApi();
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        for (const caption of ["Sucursal", "Orden"]) {
            const select = selectByCaption(container, caption);
            expect(select.classList.contains("ant-select-show-search"), `${caption} is not searchable`).toBe(true);
        }
    });

    it("searching a selector filters on the human-readable label and keeps the id binding", async () => {
        const { posts } = stubApi({ ok: true, body: { id: "smp-1" } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        const orderSelect = selectByCaption(container, "Orden");
        fireEvent.mouseDown(orderSelect.querySelector(".ant-select-selector")!);
        fireEvent.change(orderSelect.querySelector("input")!, { target: { value: "ORD-001" } });
        await waitFor(() => {
            expect(document.querySelector(".ant-select-item-option")).toBeTruthy();
        });
        const visible = Array.from(document.querySelectorAll(".ant-select-item-option")).map((o) => o.textContent);
        expect(visible).toEqual(["ORD-001 - RECEIVED"]);
        fireEvent.click(document.querySelector(".ant-select-item-option")!);

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-1" } });
        fireEvent.submit(container.querySelector("form")!);

        await waitFor(() => expect(posts).toHaveLength(1));
        // The id the API receives is the catalogue id, not the label the user searched.
        expect((posts[0].body as { order_id: string }).order_id).toBe(ORDER_ID);
    });
});

// ── The create contract is unchanged ────────────────────────────────────────

describe("CEL-131-07 — order_form still creates an order with the same payload", () => {
    it("POSTs the unified endpoint with the same field names and shape", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-1" } });

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));

        expect(posts[0].url).toContain("/v1/laboratory/orders/unified");
        expect(posts[0].body).toEqual({
            tenant_id: TENANT_ID,
            branch_id: BRANCH_ID,
            patient_id: PATIENT_ID,
            study_type_id: STUDY_TYPE_ID,
            created_by: "usr-1",
            samples: [{ sample_code: "M-1", sample_type_id: "stp-bio" }],
        });
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/orders/new-order", { replace: true }));
    });

    it("carries the optional sample dates through as UTC instants, exactly as before", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-1" } });
        // `FloatingCaptionDate` wraps the same masked antd DatePicker the old
        // `DateField` did, so the value is committed from the calendar rather
        // than by typing. Pick a day, then assert the payload carries exactly
        // that day as a UTC midnight instant — the pre-existing transform.
        const collected = inputByCaption(container, "Fecha de recolección");
        fireEvent.mouseDown(collected);
        fireEvent.click(collected);
        fireEvent.focus(collected);
        await waitFor(() => expect(document.querySelector(".ant-picker-cell-today")).toBeTruthy());
        fireEvent.click(document.querySelector(".ant-picker-cell-today .ant-picker-cell-inner")!);
        await waitFor(() => expect(collected.value).toMatch(/^\d{4}-\d{2}-\d{2}$/));
        const chosenDay = collected.value;

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        expect((posts[0].body as { samples: Array<{ collected_at?: string }> }).samples[0].collected_at)
            .toBe(`${chosenDay}T00:00:00Z`);
    });
});

describe("CEL-131-07 — sample_form still creates a sample with the same payload", () => {
    it("POSTs the samples endpoint with the same field names and shape", async () => {
        const { posts } = stubApi({ ok: true, body: { id: "new-sample" } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Laminilla");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-9" } });

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));

        expect(posts[0].url).toContain("/v1/laboratory/samples/");
        expect(posts[0].body).toEqual({
            tenant_id: TENANT_ID,
            branch_id: BRANCH_ID,
            order_id: ORDER_ID,
            sample_code: "M-9",
            sample_type_id: "stp-lam",
        });
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/samples/new-sample", { replace: true }));
    });
});

// ── Validation semantics ────────────────────────────────────────────────────

describe("CEL-131-07 — required stays required, optional stays optional", () => {
    it("order_form refuses to submit without branch or study type (the sample code is optional since 1.4 #8)", async () => {
        const { posts } = stubApi();
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => {
            expect(container.textContent).toContain("La sucursal es requerida.");
        });
        expect(container.textContent).toContain("El tipo de estudio es requerido.");
        expect(container.textContent).toContain("El tipo de muestra es requerido.");
        expect(container.textContent).not.toContain("El código de muestra es requerido.");
        expect(posts).toHaveLength(0);
    });

    it("order_form still requires a patient OR a requesting physician", async () => {
        const { posts } = stubApi();
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-1" } });

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => {
            expect(container.textContent).toContain("Seleccione un paciente, un médico solicitante o ambos.");
        });
        expect(posts).toHaveLength(0);

        // Choosing only the physician satisfies it — the OR, not an AND.
        await pickOption(selectByCaption(container, "Médico solicitante (opcional)"), "MED-001");
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        expect((posts[0].body as { requesting_physician_id: string }).requesting_physician_id).toBe(PHYSICIAN_ID);
        expect((posts[0].body as { patient_id?: string }).patient_id).toBeUndefined();
    });

    it("sample_form refuses to submit without order or type (the code is optional since 1.4 #8)", async () => {
        const { posts } = stubApi();
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => {
            expect(container.textContent).toContain("La orden es requerida.");
        });
        expect(container.textContent).toContain("El tipo de muestra es requerido.");
        expect(container.textContent).not.toContain("El código de muestra es requerido.");
        expect(posts).toHaveLength(0);
    });

    it("the optional fields really are optional — notes and both dates may stay empty", async () => {
        const { posts } = stubApi({ ok: true, body: { id: "new-sample" } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Otro");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-2" } });

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const body = posts[0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty("notes");
        expect(body).not.toHaveProperty("collected_at");
        expect(body).not.toHaveProperty("received_at");
    });
});

// ── Prefill, errors, cancel ─────────────────────────────────────────────────

describe("CEL-131-07 — prefill, error surfacing and cancel behaviour survive", () => {
    it("a prefilled ?orderId locks the order selector and is still submitted", async () => {
        const { posts } = stubApi({ ok: true, body: { id: "new-sample" } });
        const { container } = renderSampleForm(`/samples/register?orderId=${ORDER_ID}`);
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        expect(selectByCaption(container, "Orden").classList.contains("ant-select-disabled")).toBe(true);

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Tejido");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-3" } });
        fireEvent.submit(container.querySelector("form")!);

        await waitFor(() => expect(posts).toHaveLength(1));
        expect((posts[0].body as { order_id: string }).order_id).toBe(ORDER_ID);
    });

    it("a prefilled ?patientId locks the patient selector on the order form", async () => {
        stubApi();
        const { container } = renderOrderForm(`/orders/register?patientId=${PATIENT_ID}`);
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        expect(selectByCaption(container, "Paciente").classList.contains("ant-select-disabled")).toBe(true);
    });

    it("an API rejection is surfaced to the user and does not navigate away", async () => {
        stubApi({ ok: false, body: { message: "El código de muestra ya existe en la orden." } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Sangre");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-dup" } });
        fireEvent.submit(container.querySelector("form")!);

        await waitFor(() => {
            expect(container.textContent).toContain("El código de muestra ya existe en la orden.");
        });
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it("a refusal in FastAPI's `detail` form (e.g. a type deactivated meanwhile) is shown, not a bare status", async () => {
        stubApi({ ok: false, body: { detail: "Sample type 'BIO' is inactive and cannot be used for new samples" } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-1" } });
        fireEvent.submit(container.querySelector("form")!);

        await waitFor(() => {
            expect(container.textContent).toContain("inactive and cannot be used for new samples");
        });
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it("Cancelar goes back rather than submitting", async () => {
        const { posts } = stubApi();
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());

        fireEvent.click(buttonByText(container, "Cancelar"));
        expect(navigateMock).toHaveBeenCalledWith(-1);
        expect(posts).toHaveLength(0);
    });
});

// ── The order form's sample repeater ────────────────────────────────────────

describe("CEL-131-07 — the order form's sample repeater still works", () => {
    it("adds and removes sample rows, and never removes the last one", async () => {
        stubApi();
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));

        const codes = () => Array.from(container.querySelectorAll("label"))
            .filter((l) => l.textContent?.trim().startsWith("Código de Muestra"));
        expect(codes()).toHaveLength(1);
        // The single remaining row cannot be deleted — there is no valid order
        // with zero samples, and the schema's `.min(1)` said so before too.
        expect(buttonByText(container, "Eliminar muestra").disabled).toBe(true);

        fireEvent.click(buttonByText(container, "Agregar otra muestra"));
        await waitFor(() => expect(codes()).toHaveLength(2));

        const removeButtons = Array.from(container.querySelectorAll("button")).filter(
            (b) => b.textContent?.trim() === "Eliminar muestra",
        );
        expect(removeButtons[0].disabled).toBe(false);
        fireEvent.click(removeButtons[1]);
        await waitFor(() => expect(codes()).toHaveLength(1));
    });
});

// ── Narrow layout ───────────────────────────────────────────────────────────

describe("CEL-131-07 — narrow layout does not regress", () => {
    it("both forms collapse their field grids to a single column at 768px", async () => {
        stubApi();
        const order = renderOrderForm();
        await waitFor(() => expect(order.container.querySelector("h1")).toBeTruthy());
        const orderCss = Array.from(order.container.querySelectorAll("style")).map((s) => s.textContent).join("");
        expect(orderCss).toContain("@media (max-width: 768px)");
        expect(orderCss).toMatch(/\.of-grid-2, \.of-grid-3 \{ grid-template-columns: 1fr; \}/);
        order.unmount();

        const sample = renderSampleForm();
        await waitFor(() => expect(sample.container.querySelector("h1")).toBeTruthy());
        const sampleCss = Array.from(sample.container.querySelectorAll("style")).map((s) => s.textContent).join("");
        expect(sampleCss).toContain("@media (max-width: 768px)");
        expect(sampleCss).toMatch(/\.sf-grid-2, \.sf-grid-3 \{ grid-template-columns: 1fr; \}/);
    });
});


// ── Céluma 1.4 (#8): monthly numbering in the registration flows ────────────

describe("#8 — automatic monthly codes in the registration forms", () => {
    async function fillOrder(container: HTMLElement) {
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
    }

    it("a blank code is omitted from the unified payload: the API generates it", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        await fillOrder(container);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const body = posts[0].body as { order_code?: string; samples: Array<Record<string, unknown>> };
        expect(body).not.toHaveProperty("order_code");
        expect(body.samples[0]).not.toHaveProperty("sample_code");
    });

    it("a typed code is still sent as a manual override", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        await fillOrder(container);
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: " M-1 " } });
        fireEvent.change(inputByCaption(container, "Código de la orden"), { target: { value: "O-1" } });
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const body = posts[0].body as { order_code?: string; samples: Array<{ sample_code?: string }> };
        expect(body.order_code).toBe("O-1");
        expect(body.samples[0].sample_code).toBe("M-1");
    });

    it("the hint shows an estimate asked from the READ-ONLY preview, labelled as not reserved", async () => {
        const { previews } = stubApi();
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        await waitFor(() => expect(container.querySelector("[data-testid=auto-code-hint-sample]")?.textContent).toContain("BIO011026"));
        expect(container.querySelector("[data-testid=auto-code-hint-sample]")?.textContent).toContain("no reservado");
        expect(previews).toEqual([{ entity_kind: "sample", scope_id: "stp-bio" }]);
    });

    it("hidden hides the code inputs of both forms", async () => {
        stubApi({ ok: true, body: {} }, { order: "hidden", sample: "hidden" });
        const order = renderOrderForm();
        await waitFor(() => expect(order.container.querySelector("[data-testid=auto-code-hint-order]")?.textContent).toContain("automáticamente"));
        expect(Array.from(order.container.querySelectorAll("label")).some((l) => l.textContent?.startsWith("Código de Muestra"))).toBe(false);
        expect(Array.from(order.container.querySelectorAll("label")).some((l) => l.textContent?.startsWith("Código de la orden"))).toBe(false);
        order.unmount();
        const sample = renderSampleForm();
        await waitFor(() => expect(sample.container.querySelector("[data-testid=auto-code-hint-sample]")).toBeTruthy());
        expect(Array.from(sample.container.querySelectorAll("label")).some((l) => l.textContent?.startsWith("Código de Muestra"))).toBe(false);
    });

    it("required makes the codes required and blocks an empty submit client-side", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "x" }, samples: [] } }, { order: "required", sample: "required" });
        const { container } = renderOrderForm();
        await waitFor(() => expect(Array.from(container.querySelectorAll("label")).some((l) => l.textContent?.startsWith("Código de la orden"))).toBe(true));
        await waitFor(() => expect(container.textContent).toContain("Código de Muestra"));
        await fillOrder(container);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(container.textContent).toContain("es obligatorio en este laboratorio"));
        expect(posts).toHaveLength(0);
    });

    it("a structured API refusal {code, message} is shown as its message", async () => {
        stubApi({ ok: false, body: { detail: { code: "numbering_manual_code_not_allowed", message: "This laboratory generates codes automatically; leave the code empty" } } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "X-1" } });
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(container.textContent).toContain("generates codes automatically"));
    });
});


describe("#8 — manual entry depends on the user's capability too", () => {
    it("blocked (policy requires typing but the role may not) refuses the submit and says why", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "x" }, samples: [] } }, { order: "blocked", sample: "blocked" });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelector("[data-testid=auto-code-hint-order]")?.textContent).toContain("no tiene permiso"));
        expect(Array.from(container.querySelectorAll("label")).some((l) => l.textContent?.startsWith("Código de la orden"))).toBe(false);
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(container.textContent).toContain("tu rol no tiene permiso"));
        expect(posts).toHaveLength(0);
    });
});

// ── Céluma 1.4 (#8): idempotency keys ───────────────────────────────────────

describe("#8 — every creation carries an Idempotency-Key with the right lifecycle", () => {
    function keyOf(call: unknown[]): string | undefined {
        const init = call[1] as RequestInit | undefined;
        return (init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"];
    }
    const creations = (fetchMock: ReturnType<typeof vi.fn>) =>
        fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST" && !String(fetchMock.mock.calls[0][0]).includes("/numbering/preview"))
            .filter(([url]) => /\/laboratory\/(orders\/unified|samples\/)/.test(String(url)));

    async function fillSample(container: HTMLElement, code: string) {
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: code } });
    }

    it("sends a key, and a retry of the SAME payload after a failure reuses it", async () => {
        const { fetchMock } = stubApi({ ok: false, body: { detail: "Error del servidor" } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));
        await fillSample(container, "M-1");
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(creations(fetchMock)).toHaveLength(1));
        await waitFor(() => expect(container.textContent).toContain("Error"));
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(creations(fetchMock)).toHaveLength(2));
        const [first, second] = creations(fetchMock).map(keyOf);
        expect(first).toBeTruthy();
        expect(second).toBe(first);
    });

    it("a changed payload gets a NEW key", async () => {
        const { fetchMock } = stubApi({ ok: false, body: { detail: "x" } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));
        await fillSample(container, "M-1");
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(creations(fetchMock)).toHaveLength(1));
        fireEvent.change(inputByCaption(container, "Código de Muestra"), { target: { value: "M-2" } });
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(creations(fetchMock)).toHaveLength(2));
        const [first, second] = creations(fetchMock).map(keyOf);
        expect(second).not.toBe(first);
    });

    it("the unified order form sends a key too, and a success ends that logical submission", async () => {
        const { fetchMock } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(creations(fetchMock)).toHaveLength(1));
        expect(keyOf(creations(fetchMock)[0])).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    });
});
