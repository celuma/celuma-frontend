/**
 * Céluma 1.3.1 Block E (CEL-131-08) — permission-driven actions in the sample UI.
 *
 * Before 1.3.1 the sample screens rendered every action unconditionally. The
 * defect as the customer met it: a pathologist saw "Registrar Muestra", and
 * `v1_3_1` aside, `lab:create_sample` was never theirs — the seed grants it to
 * `superuser`, `admin`, `lab_tech` and `assistant` only. Clicking it landed on
 * the access-denied screen, because `/samples/register` is itself gated on
 * that permission in `main.tsx`.
 *
 * Notably the sample screens had NO role-name comparisons to remove: the
 * defect was the absence of any check, not a brittle one. So the fix is to
 * add checks through the capability helper the rest of the app already uses
 * (`useUserProfile().hasPermission` over `lib/rbac.PERMS`), never a role
 * literal — which is what "an authorized non-hardcoded role still receives
 * the action" below asserts.
 *
 * Each action is gated on exactly the permission
 * `celuma-backend/app/api/v1/laboratory.py` enforces on the route it calls:
 *
 *   Registrar / Agregar Muestra   POST   /samples/            lab:create_sample
 *   Estado (state picker)         PATCH  /samples/{id}/state  lab:update_sample
 *   Descripción (notes)           PATCH  /samples/{id}/notes  lab:update_sample
 *   Asignados                     PUT    /samples/{id}/assignees  lab:manage_assignees
 *   Etiquetas                     PUT    /samples/{id}/labels     lab:manage_labels
 *   Subir imagen                  POST   /samples/{id}/images     lab:upload_images
 *   Eliminar imagen               DELETE /samples/{id}/images/{i} lab:delete_images
 *
 * The frontend is a UX boundary, not a security boundary — the backend stays
 * authoritative and refuses regardless. What these tests defend is that the
 * UI stops offering actions guaranteed to fail, and that it never withholds
 * one from someone whose capabilities allow it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SamplesList from "../../pages/samples_list";
import SampleDetailPage from "../../pages/sample_detail";
import { useUserProfile } from "../../hooks/use_user_profile";
import { PERMS } from "../../lib/rbac";
// Read as text so the "no RBAC logic in a component" check below inspects the
// real sources. Static specifiers — a template literal would make Vite emit a
// dynamic-import-vars warning.
import samplesListSource from "../../pages/samples_list.tsx?raw";
import sampleDetailSource from "../../pages/sample_detail.tsx?raw";
import sampleFormSource from "../../pages/sample_form.tsx?raw";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

vi.mock("../../services/collaboration_service", () => ({
    getLabels: vi.fn(async () => []),
    getLabUsers: vi.fn(async () => []),
    updateSampleAssignees: vi.fn(async () => ({})),
    updateSampleLabels: vi.fn(async () => ({})),
}));

const SAMPLE_ID = "00000000-0000-0000-0000-0000000000s1";

/**
 * The seeded permission sets, straight from `ROLES_Y_PERMISOS.md` §Matriz
 * resumen. `pathologist` is the persona in the ticket; `lab_tech` is the
 * counter-persona that proves an authorized role is not blocked. `reviewer`
 * holds `lab:read` and none of the sample-mutating capabilities, so it is the
 * strictest case.
 */
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
    reviewer: ["lab:read", "lab:manage_reviewers", "reports:read", "reports:approve", "reports:sign"],
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

const SAMPLE_DETAIL = {
    id: SAMPLE_ID,
    sample_code: "M-001",
    type: "BIOPSIA",
    state: "RECEIVED",
    notes: "Nota existente.",
    received_at: "2026-05-01T10:00:00Z",
    patient: { id: "pt-1", full_name: "Ana Ruiz", patient_code: "PAC-001" },
    order: { id: "ord-1", order_code: "ORD-001" },
    branch: { id: "br-1", code: "MAIN", name: "Sede Central" },
    assignees: [],
    labels: [],
};

const SAMPLE_IMAGES = {
    images: [
        {
            id: "img-1",
            is_primary: true,
            created_at: "2026-05-01T10:00:00Z",
            label: "Corte 1",
            urls: { thumbnail: "https://cdn.example.invalid/t.png", processed: "https://cdn.example.invalid/p.png" },
        },
    ],
};

function stubApi() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/images")) return jsonResponse(SAMPLE_IMAGES);
        if (url.includes("/events")) return jsonResponse({ events: [] });
        if (url.includes(`/samples/${SAMPLE_ID}`)) return jsonResponse(SAMPLE_DETAIL);
        if (url.includes("/samples/")) return jsonResponse({ samples: [] });
        return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderSamplesList() {
    return render(
        <MemoryRouter initialEntries={["/samples"]}>
            <SamplesList />
        </MemoryRouter>,
    );
}

function renderSampleDetail() {
    return render(
        <MemoryRouter initialEntries={[`/samples/${SAMPLE_ID}`]}>
            <Routes>
                <Route path="/samples/:sampleId" element={<SampleDetailPage />} />
            </Routes>
        </MemoryRouter>,
    );
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
}

/** The three rail pickers share one trigger component (`RailConfigButton`). */
function railTriggers(container: HTMLElement): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('button[aria-label="Configurar"]'));
}

/** The gallery is the second tab and is not mounted until it is selected. */
async function openGallery(container: HTMLElement) {
    const tab = Array.from(container.querySelectorAll('[role="tab"]')).find((t) =>
        t.textContent?.includes("Galería de Imágenes"),
    );
    expect(tab, "gallery tab not found").toBeTruthy();
    fireEvent.click(tab!);
    await waitFor(() => {
        expect(container.querySelector(".ant-tabs-tabpane-active")?.textContent ?? "").not.toBe("");
    });
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    localStorage.setItem("tenant_id", "tenant-1");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
});

// ── "Registrar Muestra" — the ticket's own defect ───────────────────────────

describe("CEL-131-08 — the Create sample action follows lab:create_sample", () => {
    it("a pathologist no longer sees 'Registrar Muestra' on the samples list", async () => {
        stubApi();
        asPersona("pathologist");
        const { container } = renderSamplesList();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());

        expect(PERSONA_PERMISSIONS.pathologist).not.toContain(PERMS.CREATE_SAMPLE);
        expect(buttonByText(container, "Registrar Muestra")).toBeUndefined();
    });

    it("a lab technician still sees it", async () => {
        stubApi();
        asPersona("lab_tech");
        const { container } = renderSamplesList();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Registrar Muestra")).toBeTruthy();
    });

    it("an assistant — a role no component names anywhere — still sees it", async () => {
        stubApi();
        asPersona("assistant");
        const { container } = renderSamplesList();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Registrar Muestra")).toBeTruthy();
    });

    it("the capability alone decides — an unknown role code with the permission is served", async () => {
        stubApi();
        // A role the seed does not contain and no component mentions. If the
        // gate were a role-name comparison this would fail; it is a capability
        // check, so the action appears.
        asPersona({ roles: ["histotecnologo_2027"], permissions: ["lab:read", "lab:create_sample"] });
        const { container } = renderSamplesList();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Registrar Muestra")).toBeTruthy();
    });

    it("and a role name alone never grants it — 'admin' without the capability is refused", async () => {
        stubApi();
        asPersona({ roles: ["admin", "superuser"], permissions: ["lab:read"] });
        const { container } = renderSamplesList();
        await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
        expect(buttonByText(container, "Registrar Muestra")).toBeUndefined();
    });
});

// ── The sample detail screen's mutating actions ─────────────────────────────

describe("CEL-131-08 — sample detail actions follow their own capabilities", () => {
    it("a viewer gets a fully read-only sample: no rail trigger, no notes pencil, no upload, no delete", async () => {
        stubApi();
        asPersona("viewer");
        const { container } = renderSampleDetail();
        await waitFor(() => expect(container.textContent).toContain("M-001"));

        // Every rail trigger present is inert.
        expect(railTriggers(container).every((b) => b.disabled)).toBe(true);
        // The notes editor cannot be opened.
        expect(container.querySelector(".anticon-edit")).toBeNull();
        // …but the content itself is still readable.
        expect(container.textContent).toContain("Nota existente.");
        expect(container.textContent).toContain("Ana Ruiz");

        await openGallery(container);
        // The upload tile is not rendered at all.
        expect(container.textContent).not.toContain("Clic o arrastra");
        // The image delete affordance is not rendered.
        expect(container.querySelector(".anticon-delete")).toBeNull();
        // The empty-state copy no longer points at a tile that is not there.
        expect(container.textContent).not.toContain("Usa el área de arriba para subir");
    });

    it("a lab technician gets every sample action", async () => {
        stubApi();
        asPersona("lab_tech");
        const { container } = renderSampleDetail();
        await waitFor(() => expect(container.textContent).toContain("M-001"));

        expect(railTriggers(container).length).toBeGreaterThan(0);
        expect(railTriggers(container).some((b) => !b.disabled)).toBe(true);
        expect(container.querySelector(".anticon-edit")).toBeTruthy();

        await openGallery(container);
        expect(container.textContent).toContain("Clic o arrastra");
        expect(container.querySelector(".anticon-delete")).toBeTruthy();
    });

    it("a pathologist keeps state/notes/assignees/labels but not image upload or deletion", async () => {
        stubApi();
        asPersona("pathologist");
        const { container } = renderSampleDetail();
        await waitFor(() => expect(container.textContent).toContain("M-001"));

        // Holds lab:update_sample, lab:manage_assignees, lab:manage_labels…
        expect(container.querySelector(".anticon-edit")).toBeTruthy();
        expect(railTriggers(container).some((b) => !b.disabled)).toBe(true);
        // …but not lab:upload_images / lab:delete_images.
        expect(PERSONA_PERMISSIONS.pathologist).not.toContain(PERMS.UPLOAD_IMAGES);
        await openGallery(container);
        expect(container.textContent).not.toContain("Clic o arrastra");
        expect(container.querySelector(".anticon-delete")).toBeNull();
    });

    it("a reviewer — every clinical report capability, none of the sample ones — gets none of them", async () => {
        stubApi();
        asPersona("reviewer");
        const { container } = renderSampleDetail();
        await waitFor(() => expect(container.textContent).toContain("M-001"));

        expect(railTriggers(container).every((b) => b.disabled)).toBe(true);
        expect(container.querySelector(".anticon-edit")).toBeNull();
        await openGallery(container);
        expect(container.textContent).not.toContain("Clic o arrastra");
        expect(container.querySelector(".anticon-delete")).toBeNull();
    });

    it("image upload and deletion are two separate capabilities, gated separately", async () => {
        stubApi();
        asPersona({ roles: ["lab_tech"], permissions: ["lab:read", "lab:upload_images"] });
        const { container } = renderSampleDetail();
        await waitFor(() => expect(container.textContent).toContain("M-001"));

        await openGallery(container);
        expect(container.textContent).toContain("Clic o arrastra");
        expect(container.querySelector(".anticon-delete")).toBeNull();
    });
});

// ── No component re-implements RBAC ─────────────────────────────────────────

describe("CEL-131-08 — the sample UI carries no RBAC logic of its own", () => {
    it("no sample component compares a role name", () => {
        const files: Array<readonly [string, string]> = [
            ["samples_list.tsx", samplesListSource],
            ["sample_detail.tsx", sampleDetailSource],
            ["sample_form.tsx", sampleFormSource],
        ];
        for (const [name, source] of files) {
            // `hasRole(...)`, `roles.includes(...)` and `role === "…"` are all
            // ways of hardcoding the role matrix into a component. The gate
            // belongs in lib/rbac.ts, consumed as a capability.
            expect(source, `${name} calls hasRole`).not.toMatch(/hasRole\s*\(/);
            expect(source, `${name} inspects roles directly`).not.toMatch(/roles\s*\.\s*includes/);
            expect(source, `${name} compares a role name`).not.toMatch(/role\s*===\s*["']/);
            // …and no permission code is spelled as a bare string either.
            expect(source, `${name} spells a permission literal`).not.toMatch(/hasPermission\(\s*["']lab:/);
        }
    });
});
