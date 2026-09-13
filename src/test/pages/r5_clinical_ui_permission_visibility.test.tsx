/**
 * Céluma 1.3.1 manual-validation remediation — R5 (CEL-131-08, extended).
 *
 * **The finding.** CEL-131-08 was applied correctly to the SAMPLE screens and
 * nowhere else. A pathologist — who holds neither `lab:create_order` nor
 * `lab:create_patient` — still saw "Nueva Orden" and "Registrar Paciente",
 * and clicking either landed on the access-denied screen.
 *
 * **Why the existing suite allowed it through.** `block_e_sample_permissions`
 * covers the sample screens exhaustively and nothing else. The audit that
 * produced Block E was scoped to the ticket's literal example ("Create
 * sample"), so the orders, patients and requesting-physician screens, and the
 * order detail's own rail, were never examined. Nothing regressed — the checks
 * were simply never written.
 *
 * **The product rule these encode.**
 *
 *     lacks the AUTHORIZATION           -> the control is not rendered
 *     has it, but the object's current
 *     LIFECYCLE blocks it               -> visible and disabled
 *
 * Disabled UI is never a substitute for permission enforcement; the backend
 * stays authoritative and refuses regardless. Every gate below is the exact
 * permission the route it calls enforces:
 *
 *   Nueva Orden / Registrar Orden      POST  /laboratory/orders/        lab:create_order
 *   Registrar Paciente                 POST  /patients/                 lab:create_patient
 *   Registrar / Editar Médico          POST  /requesting-physicians/    lab:create_order
 *   Revisores (order rail)             PUT   /orders/{id}/reviewers     lab:manage_reviewers
 *   Asignados (order rail)             PUT   /orders/{id}/assignees     lab:manage_assignees
 *   Etiquetas (order rail)             PUT   /orders/{id}/labels        lab:manage_labels
 *   Descripción (order notes)          PATCH /orders/{id}/notes         lab:update_order
 *
 * Capabilities decide, never role names — asserted directly by the synthetic
 * persona that holds a capability under no role the app knows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OrdersList from "../../pages/orders_list";
import PatientsList from "../../pages/patients_list";
import RequestingPhysiciansList from "../../pages/requesting_physicians_list";
import { useUserProfile } from "../../hooks/use_user_profile";
import ordersListSource from "../../pages/orders_list.tsx?raw";
import patientsListSource from "../../pages/patients_list.tsx?raw";
import physiciansListSource from "../../pages/requesting_physicians_list.tsx?raw";
import orderDetailSource from "../../pages/order_detail.tsx?raw";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

/** Seeded permission sets, from `ROLES_Y_PERMISOS.md` §Matriz resumen. */
const PERSONA_PERMISSIONS = {
    pathologist: [
        "lab:read", "lab:update_order", "lab:update_sample",
        "lab:manage_assignees", "lab:manage_reviewers",
        "lab:manage_labels", "lab:manage_comments",
        "reports:read", "reports:create", "reports:edit",
        "reports:submit", "reports:retract", "audit:read_events",
    ],
    lab_tech: [
        "lab:read", "lab:create_sample", "lab:update_sample",
        "lab:upload_images", "lab:delete_images",
        "lab:manage_assignees", "lab:manage_labels", "lab:manage_comments",
        "reports:read", "audit:read_events",
    ],
    assistant: [
        "lab:read", "lab:create_patient", "lab:create_order", "lab:create_sample",
        "lab:manage_labels", "lab:manage_comments", "reports:read", "billing:read",
    ],
    reviewer: [
        "lab:read", "lab:manage_reviewers", "reports:read",
        "reports:approve", "reports:sign",
    ],
    admin: [
        "admin:manage_branches", "admin:manage_catalog", "admin:manage_invitations",
        "admin:manage_tenant", "admin:manage_users", "audit:read_events",
        "billing:create_invoice", "billing:edit_items", "billing:read",
        "billing:register_payment", "lab:create_order", "lab:create_patient",
        "lab:create_sample", "lab:delete_images", "lab:manage_assignees",
        "lab:manage_comments", "lab:manage_labels", "lab:manage_reviewers",
        "lab:read", "lab:update_order", "lab:update_sample", "lab:upload_images",
        "reports:manage_templates", "reports:read",
    ],
    viewer: ["lab:read", "reports:read", "audit:read_events"],
} as const;

type Persona = keyof typeof PERSONA_PERMISSIONS;

function asPersona(persona: Persona | { permissions: string[]; roles?: string[] }) {
    const permissions = Array.isArray((persona as { permissions?: string[] }).permissions)
        ? (persona as { permissions: string[] }).permissions
        : [...PERSONA_PERMISSIONS[persona as Persona]];
    const roles = typeof persona === "string"
        ? [persona]
        : ((persona as { roles?: string[] }).roles ?? []);
    mockedUseUserProfile.mockReturnValue({
        profile: { id: "usr-1", roles, permissions } as never,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (code: string) => permissions.includes(code),
        hasRole: (code: string) => roles.includes(code),
        canActAsReviewer: () => false,
        isAssignedReviewer: () => false,
        canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function jsonResponse(body: unknown) {
    return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

function stubApi() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // Each page's own loader shape: orders is an envelope, the other two
        // return bare arrays.
        if (url.includes("/laboratory/orders/")) return jsonResponse({ orders: [] });
        if (url.includes("/requesting-physicians")) return jsonResponse([]);
        if (url.includes("/patients")) return jsonResponse([]);
        return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === text
    );
}

function renderPage(path: string, element: React.ReactNode) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path={path} element={element} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    stubApi();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

// ── Create CTAs ─────────────────────────────────────────────────────────────

describe("R5 — Nueva Orden follows lab:create_order", () => {
    it.each<Persona>(["pathologist", "reviewer", "lab_tech", "viewer"])(
        "is absent for %s",
        async (persona) => {
            asPersona(persona);
            const { container } = renderPage("/orders", <OrdersList />);
            await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
            expect(buttonByText(container, "Nueva Orden")).toBeUndefined();
        }
    );

    it.each<Persona>(["assistant", "admin"])("is present for %s", async (persona) => {
        asPersona(persona);
        const { container } = renderPage("/orders", <OrdersList />);
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Nueva Orden")).toBeTruthy();
    });

    it("follows the capability, not the role name", async () => {
        // A role this build has never heard of, holding exactly the capability.
        // If the gate were a role comparison, this would fail.
        asPersona({ roles: ["recepcion_externa"], permissions: ["lab:read", "lab:create_order"] });
        const { container } = renderPage("/orders", <OrdersList />);
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Nueva Orden")).toBeTruthy();
    });

    it("is absent for an administrator stripped of the capability", async () => {
        // Administrative breadth is not a clinical capability. `admin` holds
        // `lab:create_order` in the seed, so this asserts the CHECK rather
        // than the seed.
        asPersona({ roles: ["admin", "superuser"], permissions: ["lab:read"] });
        const { container } = renderPage("/orders", <OrdersList />);
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Nueva Orden")).toBeUndefined();
    });
});

describe("R5 — Registrar Paciente follows lab:create_patient", () => {
    it.each<Persona>(["pathologist", "reviewer", "lab_tech", "viewer"])(
        "is absent for %s",
        async (persona) => {
            asPersona(persona);
            const { container } = renderPage("/patients", <PatientsList />);
            await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
            expect(buttonByText(container, "Registrar Paciente")).toBeUndefined();
        }
    );

    it.each<Persona>(["assistant", "admin"])("is present for %s", async (persona) => {
        asPersona(persona);
        const { container } = renderPage("/patients", <PatientsList />);
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Registrar Paciente")).toBeTruthy();
    });

    it("follows the capability, not the role name", async () => {
        asPersona({ roles: ["front_desk"], permissions: ["lab:read", "lab:create_patient"] });
        const { container } = renderPage("/patients", <PatientsList />);
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Registrar Paciente")).toBeTruthy();
    });
});

describe("R5 — Registrar Médico follows lab:create_order", () => {
    // The requesting-physician catalogue is WRITTEN under `lab:create_order`
    // (`requesting_physicians.py` `_require(..., "lab:create_order")` on every
    // mutating route) and READ under `lab:read`. The list itself therefore
    // stays visible to everyone; only the write action is gated.
    it.each<Persona>(["pathologist", "reviewer", "viewer"])(
        "is absent for %s, who can still read the list",
        async (persona) => {
            asPersona(persona);
            const { container } = renderPage(
                "/requesting-physicians",
                <RequestingPhysiciansList />
            );
            await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
            expect(buttonByText(container, "Registrar Médico")).toBeUndefined();
            expect(container.textContent).toContain("Médicos Solicitantes");
        }
    );

    it.each<Persona>(["assistant", "admin"])("is present for %s", async (persona) => {
        asPersona(persona);
        const { container } = renderPage(
            "/requesting-physicians",
            <RequestingPhysiciansList />
        );
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Registrar Médico")).toBeTruthy();
    });
});

// ── The checks are capability-based, in the source ──────────────────────────

describe("R5 — no role-name comparisons were introduced", () => {
    const SOURCES: [string, string][] = [
        ["orders_list", ordersListSource],
        ["patients_list", patientsListSource],
        ["requesting_physicians_list", physiciansListSource],
        ["order_detail", orderDetailSource],
    ];

    it.each(SOURCES)("%s gates on hasPermission, never on a role literal", (_n, source) => {
        expect(source).toContain("hasPermission");
        // `hasRole("pathologist")`, `roles.includes("admin")` and friends. The
        // existing sample-permission suite makes the same check for the sample
        // screens; this extends it to the surfaces R5 touched.
        expect(source).not.toMatch(/hasRole\(\s*["'`]/);
        expect(source).not.toMatch(/roles\.includes\(\s*["'`]/);
        expect(source).not.toMatch(/===\s*["'`](pathologist|reviewer|admin|superuser|lab_tech|assistant|viewer)["'`]/);
    });

    it("order_detail passes a permission-derived disabled flag to all three rail sections", () => {
        // The R5 defect on this page was passing NOTHING: `sample_detail`
        // already gated its rail, `order_detail` did not, so every viewer of
        // an order saw all three gears.
        expect(orderDetailSource).toContain("disabled={!canManageReviewers}");
        expect(orderDetailSource).toContain("disabled={!canManageAssignees}");
        expect(orderDetailSource).toContain("disabled={!canManageLabels}");
        expect(orderDetailSource).toContain("!editingNotes && canUpdateOrder");
    });
});
