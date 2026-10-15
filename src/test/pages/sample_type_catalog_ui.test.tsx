/**
 * Céluma 1.4, issue #17 — sample-type catalog in the UI: the samples list and
 * its "Sin tipo" filter, the mandatory active type in both registration forms,
 * and the empty-catalog guidance.
 *
 * Contract: celuma-engineering/specs/laboratory/sample-types.md. The API stays
 * the authority (it rejects a missing, inactive or foreign type); these tests
 * pin what the screens offer and send. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SamplesList from "../../pages/samples_list";
import SampleForm from "../../pages/sample_form";
import OrderForm from "../../pages/order_form";
import { SampleTypeBadge, getSampleTypeConfig, sampleTypeLabel } from "../../components/ui/table_helpers";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigateMock };
});

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const type = (id: string, name: string, is_active = true) => ({
    id, code: id.toUpperCase(), name, is_active, tenant_id: "t1", created_at: "2026-01-01T00:00:00",
});

const sample = (id: string, code: string, sample_type: unknown) => ({
    id, sample_code: code, sample_type, state: "RECEIVED", tenant_id: "t1",
    branch: { id: "b1", name: "Matriz" },
    order: { id: "o1", order_code: "CU-1", status: "RECEIVED", requested_by: null, patient: null },
    labels: null, assignees: null,
});

function grant(...permissions: string[]) {
    mockedUseUserProfile.mockReturnValue({
        hasPermission: (p: string) => permissions.includes(p),
        profile: { permissions },
    } as unknown as ReturnType<typeof useUserProfile>);
}

beforeEach(() => {
    navigateMock.mockReset();
    grant("lab:read", "lab:create_sample", "lab:create_order");
});
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

describe("sample type presentation", () => {
    it("labels a missing type 'Sin tipo' and marks a deactivated one", () => {
        expect(sampleTypeLabel(null)).toBe("Sin tipo");
        expect(sampleTypeLabel(undefined)).toBe("Sin tipo");
        expect(sampleTypeLabel({ id: "x", code: "X", name: "Tejido", is_active: true })).toBe("Tejido");
        expect(sampleTypeLabel({ id: "x", code: "X", name: "Tejido", is_active: false })).toBe("Tejido (inactivo)");
    });

    it("styles by the catalog name, ignoring accents, with a neutral default for unknown names", () => {
        expect(getSampleTypeConfig("Citología").color).toBe(getSampleTypeConfig("CITOLOGIA").color);
        expect(getSampleTypeConfig("Algo nuevo").label).toBe("Muestra");
        expect(getSampleTypeConfig("").label).toBe("Muestra");
    });

    it("renders the badge from the catalog entry, never from the retired enum", () => {
        render(<SampleTypeBadge sampleType={{ id: "a", code: "A", name: "Mi tipo propio", is_active: true }} />);
        expect(screen.getByText("Mi tipo propio")).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Samples list
// ---------------------------------------------------------------------------

describe("samples list — catalog type", () => {
    function stub(options: Record<string, unknown>, rows = [
        sample("s1", "CU000001", { id: "stp-bio", code: "BIO", name: "Biopsia", is_active: true }),
        sample("s2", "CU000002", null),
        sample("s3", "CU000003", { id: "stp-old", code: "OLD", name: "Tipo retirado", is_active: false }),
    ]) {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("filter-options")) {
                return json({ states: ["RECEIVED"], orders: [], patients: [], labels: [], assignees: [], ...options });
            }
            return json({ samples: rows, total: rows.length, page: 1, page_size: 10 });
        });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    it("shows the catalog name, 'Sin tipo' for legacy rows and '(inactivo)' for a retired type", async () => {
        stub({ sample_types: [], has_untyped_samples: true });
        render(<MemoryRouter><SamplesList /></MemoryRouter>);
        expect(await screen.findByText("CU000001")).toBeInTheDocument();
        expect(screen.getByText("Biopsia")).toBeInTheDocument();
        expect(screen.getByText("Sin tipo")).toBeInTheDocument();
        expect(screen.getByText("Tipo retirado (inactivo)")).toBeInTheDocument();
    });

    async function openTypeFilter() {
        const header = (await screen.findAllByRole("columnheader")).find((h) => h.textContent?.startsWith("Tipo"))!;
        fireEvent.click(header.querySelector(".ant-table-filter-trigger")!);
    }

    it("offers the catalog types plus 'Sin tipo' only when legacy samples exist", async () => {
        stub({ sample_types: [{ value: "stp-bio", text: "Biopsia" }], has_untyped_samples: true });
        render(<MemoryRouter><SamplesList /></MemoryRouter>);
        await screen.findByText("CU000001");
        await openTypeFilter();
        const menu = await waitFor(() => {
            const el = document.querySelector(".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu");
            expect(el).toBeTruthy();
            return el as HTMLElement;
        });
        expect(within(menu).getByText("Biopsia")).toBeInTheDocument();
        expect(within(menu).getByText("Sin tipo")).toBeInTheDocument();
    });

    it("does not offer 'Sin tipo' when every sample has a type", async () => {
        stub({ sample_types: [{ value: "stp-bio", text: "Biopsia" }], has_untyped_samples: false });
        render(<MemoryRouter><SamplesList /></MemoryRouter>);
        await screen.findByText("CU000001");
        await openTypeFilter();
        await waitFor(() => expect(document.querySelector(".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu")).toBeTruthy());
        expect(document.querySelector(".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu")!.textContent).not.toContain("Sin tipo");
    });

    it("sends the chosen catalog identity (or 'none') as sample_type_id, never the retired 'type'", async () => {
        const fetchMock = stub({ sample_types: [{ value: "stp-bio", text: "Biopsia" }], has_untyped_samples: true });
        render(<MemoryRouter><SamplesList /></MemoryRouter>);
        await screen.findByText("CU000001");
        await openTypeFilter();
        const menu = await waitFor(() => {
            const el = document.querySelector(".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu");
            expect(el).toBeTruthy();
            return el as HTMLElement;
        });
        fireEvent.click(within(menu).getByText("Sin tipo"));
        const ok = Array.from(document.querySelectorAll(".ant-table-filter-dropdown button")).find((b) => /Aceptar|OK|Filtrar/i.test(b.textContent ?? ""));
        fireEvent.click(ok!);
        await waitFor(() => {
            const urls = fetchMock.mock.calls.map(([i]) => String(i)).filter((u) => u.includes("/laboratory/samples/?"));
            expect(urls.some((u) => u.includes("sample_type_id=none"))).toBe(true);
            expect(urls.some((u) => /[?&]type=/.test(u))).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// Registration: a type is mandatory and comes from the laboratory's catalog
// ---------------------------------------------------------------------------

function stubRegistration(catalog: unknown[], post?: (url: string, body: unknown) => Response) {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
            const body = JSON.parse(String(init.body));
            posts.push({ url, body });
            return post ? post(url, body) : json({ id: "new", order: { id: "o9" }, samples: [] });
        }
        if (url.includes("/v1/sample-types/")) return json({ sample_types: catalog });
        if (url.includes("/v1/study-types/")) return json({ study_types: [{ id: "st-1", code: "HIS", name: "Histopatología", is_active: true }] });
        if (url.includes("/v1/patients/")) return json([{ id: "pt-1", patient_code: "PAC-1", first_name: "Ana", last_name: "Ruiz" }]);
        if (url.includes("/v1/requesting-physicians/")) return json([]);
        if (url.includes("/v1/laboratory/orders/")) return json({ orders: [{ id: "ord-1", order_code: "ORD-1", status: "RECEIVED" }] });
        if (url.includes("/branches")) return json([{ id: "br-1", name: "Sede", code: "MAIN" }]);
        return json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, posts };
}

const submit = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Registrar") as HTMLButtonElement;

describe("registration requires a catalog type", () => {
    it("asks the API only for ACTIVE sample types", async () => {
        const { fetchMock } = stubRegistration([type("bio", "Biopsia")]);
        render(<MemoryRouter><SampleForm /></MemoryRouter>);
        await waitFor(() => expect(fetchMock.mock.calls.some(([i]) => String(i).includes("/v1/sample-types/?active_only=true"))).toBe(true));
    });

    it.each([
        ["with catalog permission", ["lab:read", "lab:create_sample", "admin:manage_catalog"], /Configurar tipos de muestra/],
        ["without it", ["lab:read", "lab:create_sample"], /Pide a un administrador/],
    ])("blocks registration and guides setup when the catalog is empty (%s)", async (_label, perms, expected) => {
        grant(...perms);
        stubRegistration([]);
        const { container } = render(<MemoryRouter><SampleForm /></MemoryRouter>);
        const notice = await screen.findByTestId("sample-type-empty");
        expect(notice.textContent).toMatch(expected);
        expect(submit(container).disabled).toBe(true);
        if (perms.includes("admin:manage_catalog")) {
            fireEvent.click(within(notice).getByRole("button", { name: "Configurar tipos de muestra" }));
            expect(navigateMock).toHaveBeenCalledWith("/config/sample-types");
        } else {
            expect(within(notice).queryByRole("button")).toBeNull();
        }
    });

    it("the same guidance protects unified order registration", async () => {
        stubRegistration([]);
        const { container } = render(<MemoryRouter><OrderForm /></MemoryRouter>);
        expect(await screen.findByTestId("sample-type-empty")).toBeInTheDocument();
        expect(submit(container).disabled).toBe(true);
    });

    it("the sample form does not submit without a type and shows the requirement", async () => {
        const { container } = (() => {
            const stub = stubRegistration([type("bio", "Biopsia")]);
            return { container: render(<MemoryRouter><SampleForm /></MemoryRouter>).container, ...stub };
        })();
        await screen.findByText("Tipo de muestra");
        fireEvent.click(submit(container));
        await waitFor(() => expect(screen.getByText("El tipo de muestra es requerido.")).toBeInTheDocument());
        expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    });

    it("the order form requires a type on EVERY sample row", async () => {
        const { posts } = stubRegistration([type("bio", "Biopsia")]);
        const { container } = render(<MemoryRouter><OrderForm /></MemoryRouter>);
        await screen.findAllByText("Tipo de muestra");
        fireEvent.click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Agregar otra muestra")!);
        fireEvent.click(submit(container));
        await waitFor(() => expect(screen.getAllByText("El tipo de muestra es requerido.").length).toBe(2));
        expect(posts).toEqual([]);
    });
});
