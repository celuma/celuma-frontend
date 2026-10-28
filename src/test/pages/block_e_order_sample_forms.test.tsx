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

/** Céluma 1.4 (#8): numbering configuration of the synthetic laboratory. Registration is always automatic. */
function numberingConfigs() {
    const cfg = (kind: string) => ({
        entity_kind: kind, active: true, manual_policy: "allowed", format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2,
        start_value: 1, scope: "tenant", timezone: "America/Mexico_City", is_default: false,
        registration: "automatic", legacy_manual_policy: false,
    });
    return { order: cfg("order"), sample: cfg("sample") };
}

/** Routes every catalogue GET both forms make, and captures the POST. */
function stubApi(post: PostOutcome = { ok: true, body: {} }) {
    const posts: Array<{ url: string; body: unknown }> = [];
    const previews: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // The non-consuming numbering preview is a POST too, but it is not the registration.
        if (url.includes("/v1/numbering/preview")) {
            const request = JSON.parse(String(init?.body)) as { reference_date?: string };
            previews.push(request);
            // Mirrors the API (#33): a sample preview given a receipt date reports THAT period.
            const ref = request.reference_date;
            const [year, month] = ref ? [Number(ref.slice(0, 4)), Number(ref.slice(5, 7))] : [2026, 10];
            return jsonResponse({
                entity_kind: "sample", valid: true, errors: [], format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2,
                scheme: "monthly", timezone: "America/Mexico_City", period_year: year, period_month: month,
                date_basis: ref ? "receipt_date" : "allocation_instant", base_code: "BIO", examples: [],
                estimate: { sequence: 1, code: `BIO01${String(month).padStart(2, "0")}${String(year).slice(2)}`, reserved: false, skipped_occupied: 0 },
                notice: "n",
            });
        }
        if (url.includes("/v1/numbering/config")) {
            return jsonResponse(numberingConfigs());
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
function selectByCaption(container: HTMLElement, caption: string, index = 0): Element {
    const label = Array.from(container.querySelectorAll("label")).filter((l) => l.textContent?.trim().startsWith(caption))[index];
    let node: HTMLElement | null = label?.parentElement ?? null;
    while (node && node !== container && !node.querySelector(".ant-select")) node = node.parentElement;
    const select = node?.querySelector(".ant-select");
    expect(select, `select "${caption}" not found`).toBeTruthy();
    return select!;
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
    // Only the OPEN dropdown: a select opened earlier keeps its (hidden) dropdown mounted, which matters on
    // the sample repeater where several selects offer the same catalogue.
    const options = () => {
        const open = Array.from(document.querySelectorAll(".ant-select-dropdown:not(.ant-select-dropdown-hidden)"));
        return Array.from(open.at(-1)?.querySelectorAll(".ant-select-item-option") ?? []);
    };
    await waitFor(() => {
        expect(options().length).toBeGreaterThan(0);
    });
    const option = options().find((o) => o.textContent?.includes(text));
    expect(option, `option "${text}" not found`).toBeTruthy();
    fireEvent.click(option!);
}

/**
 * Céluma 1.4 (#33): the receipt date is required. The masked antd picker commits from the calendar, not from
 * typing, so the helper freezes the clock on the wanted day (the calendar opens on that month) and clicks the
 * cell whose `title` is that day.
 */
const RECEIVED = "2026-09-30";

async function setDate(container: HTMLElement, caption: string, value: string, index = 0) {
    vi.useFakeTimers({ toFake: ["Date"] });
    const [year, month, day] = value.split("-").map(Number);
    vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
    const labels = Array.from(container.querySelectorAll("label")).filter((l) => l.textContent?.trim().startsWith(caption));
    const input = labels[index].parentElement!.querySelector("input") as HTMLInputElement;
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    fireEvent.focus(input);
    // The popup just opened is the LAST one mounted; earlier pickers keep theirs in the DOM (closed or fading).
    const cell = () => {
        const popup = Array.from(document.querySelectorAll(".ant-picker-dropdown")).at(-1);
        return popup?.querySelector(`td[title="${value}"] .ant-picker-cell-inner`) ?? null;
    };
    await waitFor(() => expect(cell()).toBeTruthy());
    fireEvent.click(cell()!);
    await waitFor(() => expect(input.value).toBe(value));
    vi.useRealTimers();
}

const setReceived = (container: HTMLElement, value = RECEIVED, index = 0) => setDate(container, "Fecha de recepción", value, index);

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

        for (const caption of ["Sucursal", "Paciente", "Tipo de estudio", "Médicos solicitantes (opcional)"]) {
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
        await setReceived(container);
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
        await setReceived(container);

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));

        expect(posts[0].url).toContain("/v1/laboratory/orders/unified");
        expect(posts[0].body).toEqual({
            tenant_id: TENANT_ID,
            branch_id: BRANCH_ID,
            patient_id: PATIENT_ID,
            study_type_id: STUDY_TYPE_ID,
            created_by: "usr-1",
            samples: [{ sample_type_id: "stp-bio", received_at: RECEIVED }],
        });
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/orders/new-order", { replace: true }));
    });

    it("sends the sample dates as DATE-ONLY values, never as UTC instants (#33)", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        // A UTC-midnight instant (`2026-10-01T00:00:00Z`) is Sep 30, 18:00 in Mexico City, so the first day
        // of a month would be numbered in the PREVIOUS month. The calendar date travels untouched instead.
        await setDate(container, "Fecha de recolección", "2026-09-29");
        await setReceived(container, "2026-10-01");

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const sent = (posts[0].body as { samples: Array<{ collected_at?: string; received_at?: string }> }).samples[0];
        expect(sent.collected_at).toBe("2026-09-29");
        expect(sent.received_at).toBe("2026-10-01");
        expect(JSON.stringify(posts[0].body)).not.toMatch(/T\d{2}:\d{2}|Z"/);
    });

    it("numbers each sample by ITS OWN receipt date and refuses a missing one without calling the API (#33)", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        fireEvent.click(buttonByText(container, "Agregar otra muestra"));
        await waitFor(() => expect(Array.from(container.querySelectorAll("label")).filter((l) => l.textContent?.trim().startsWith("Tipo de muestra"))).toHaveLength(2));
        await pickOption(selectByCaption(container, "Tipo de muestra", 0), "Biopsia");
        await pickOption(selectByCaption(container, "Tipo de muestra", 1), "Laminilla");
        await setReceived(container, "2026-09-30", 0);

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(container.textContent).toContain("La fecha de recepción es requerida."));
        expect(posts).toHaveLength(0);

        await setReceived(container, "2026-10-01", 1);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const sent = (posts[0].body as { samples: Array<{ received_at?: string }> }).samples;
        expect(sent.map((x) => x.received_at)).toEqual(["2026-09-30", "2026-10-01"]);
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
        await setReceived(container);

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));

        expect(posts[0].url).toContain("/v1/laboratory/samples/");
        expect(posts[0].body).toEqual({
            tenant_id: TENANT_ID,
            branch_id: BRANCH_ID,
            order_id: ORDER_ID,
            sample_type_id: "stp-lam",
            received_at: RECEIVED,
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
        expect(container.textContent).toContain("La fecha de recepción es requerida.");
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

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => {
            expect(container.textContent).toContain("Seleccione un paciente, al menos un médico solicitante o ambos.");
        });
        expect(posts).toHaveLength(0);

        // Choosing only the physician satisfies it — the OR, not an AND.
        await pickOption(selectByCaption(container, "Médicos solicitantes (opcional)"), "MED-001");
        await setReceived(container);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        expect((posts[0].body as { requesting_physician_ids: string[] }).requesting_physician_ids).toEqual([PHYSICIAN_ID]);
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
        expect(container.textContent).toContain("La fecha de recepción es requerida.");
        expect(container.textContent).not.toContain("El código de muestra es requerido.");
        expect(posts).toHaveLength(0);
    });

    it("the optional fields really are optional — notes and the collection date may stay empty", async () => {
        const { posts } = stubApi({ ok: true, body: { id: "new-sample" } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));

        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Otro");
        await setReceived(container);

        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const body = posts[0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty("notes");
        expect(body).not.toHaveProperty("collected_at");
        expect(body.received_at).toBe(RECEIVED); // required since #33; collection stays optional
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
        await setReceived(container);
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
        await setReceived(container);
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
        await setReceived(container);
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
            .filter((l) => l.textContent?.trim().startsWith("Tipo de muestra"));
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

describe("#8 — registration forms have no code inputs (codes are always generated)", () => {
    async function fillOrder(container: HTMLElement) {
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Paciente"), "PAC-001");
        await pickOption(selectByCaption(container, "Tipo de estudio"), "Histopatología");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        await setReceived(container);
    }
    const codeLabels = (container: HTMLElement) =>
        Array.from(container.querySelectorAll("label")).filter((l) => /^Código de (la orden|Muestra)/.test(l.textContent?.trim() ?? ""));

    it("neither form renders an editable order or sample code field", async () => {
        stubApi();
        const order = renderOrderForm();
        await waitFor(() => expect(order.container.querySelector("[data-testid=auto-code-hint-order]")?.textContent).toContain("automáticamente"));
        expect(codeLabels(order.container)).toHaveLength(0);
        fireEvent.click(buttonByText(order.container, "Agregar otra muestra"));
        await waitFor(() => expect(order.container.querySelectorAll("[data-testid=auto-code-hint-sample]")).toHaveLength(2));
        expect(codeLabels(order.container)).toHaveLength(0);
        order.unmount();
        const sample = renderSampleForm();
        await waitFor(() => expect(sample.container.querySelector("[data-testid=auto-code-hint-sample]")).toBeTruthy());
        expect(codeLabels(sample.container)).toHaveLength(0);
        expect(sample.container.querySelectorAll("input[name*=code]")).toHaveLength(0);
    });

    it("no code is ever in the unified or standalone payload", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        await fillOrder(container);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const body = posts[0].body as Record<string, unknown> & { samples: Array<Record<string, unknown>> };
        expect(body).not.toHaveProperty("order_code");
        expect(body.samples[0]).not.toHaveProperty("sample_code");
    });

    it("several requesting physicians and the expediente are sent as a set and verbatim (leading zeroes kept)", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        await fillOrder(container);
        await pickOption(selectByCaption(container, "Médicos solicitantes (opcional)"), "MED-001");
        fireEvent.change(inputByCaption(container, "Expediente (opcional)"), { target: { value: " 000731 " } });
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const body = posts[0].body as { requesting_physician_ids: string[]; expediente: string };
        expect(body.requesting_physician_ids).toEqual([PHYSICIAN_ID]);
        expect(body.expediente).toBe("000731");
        expect(body).not.toHaveProperty("requesting_physician_id");
    });

    it("an expediente alone is enough next to a patient: no physician is invented", async () => {
        const { posts } = stubApi({ ok: true, body: { order: { id: "new-order" }, samples: [] } });
        const { container } = renderOrderForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(3));
        await fillOrder(container);
        fireEvent.change(inputByCaption(container, "Expediente (opcional)"), { target: { value: "0042" } });
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(posts).toHaveLength(1));
        const body = posts[0].body as Record<string, unknown>;
        expect(body.expediente).toBe("0042");
        expect(body).not.toHaveProperty("requesting_physician_ids");
    });

    it("the hint shows an estimate asked from the READ-ONLY preview, labelled as not reserved", async () => {
        const { previews } = stubApi();
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        // #33: a sample is numbered by its receipt date, so no estimate is asked or shown until there is a valid one.
        await new Promise((r) => setTimeout(r, 50));
        expect(previews).toEqual([]);
        expect(container.querySelector("[data-testid=auto-code-hint-sample]")?.textContent).not.toContain("Ejemplo");
        await setReceived(container, "2026-09-30");
        await waitFor(() => expect(container.querySelector("[data-testid=auto-code-hint-sample]")?.textContent).toContain("BIO010926"));
        const hint = container.querySelector("[data-testid=auto-code-hint-sample]")?.textContent ?? "";
        expect(hint).toContain("no reservado");
        expect(hint).toContain("septiembre 2026, según la fecha de recepción");
        expect(previews).toEqual([{ entity_kind: "sample", scope_id: "stp-bio", reference_date: "2026-09-30" }]);
    });

    it("a structured API refusal {code, message} is shown as its message", async () => {
        stubApi({ ok: false, body: { detail: { code: "numbering_exhausted", message: "Could not find a free code after 10000 attempts" } } });
        const { container } = renderSampleForm();
        await waitFor(() => expect(container.querySelectorAll(".ant-select").length).toBeGreaterThan(2));
        await pickOption(selectByCaption(container, "Sucursal"), "MAIN");
        await pickOption(selectByCaption(container, "Orden"), "ORD-001");
        await pickOption(selectByCaption(container, "Tipo de muestra"), "Biopsia");
        await setReceived(container);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(container.textContent).toContain("Could not find a free code"));
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
        await setReceived(container);
        void code; // sample codes are generated; nothing to type
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
        fireEvent.change(inputByCaption(container, "Descripción (opcional)"), { target: { value: "otra" } });
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
        await setReceived(container);
        fireEvent.submit(container.querySelector("form")!);
        await waitFor(() => expect(creations(fetchMock)).toHaveLength(1));
        expect(keyOf(creations(fetchMock)[0])).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    });
});
