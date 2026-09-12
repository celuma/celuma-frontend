/**
 * Céluma 1.3.1 Block A (A6) — reviewer-only controls in the report editor.
 *
 * Before 1.3.1 the editor gated these on a bare permission, or on nothing at
 * all:
 *
 *   "Aprobar"                 hasPermission("reports:approve")
 *   "Firmar y publicar"       hasPermission("reports:sign")
 *   signature toggles         disabled={isReadOnly}          (no authz)
 *   "Membrete" selector       report state only              (no authz)
 *
 * Which meant every pathologist saw "Aprobar" (the CEL-131-01 defect as the
 * user met it) and superuser saw "Firmar y publicar" — an action the backend
 * has always refused it, because superuser holds the permission but not the
 * `reviewer` role.
 *
 * They are now gated on the reviewer CONTRACT — role AND capability AND
 * assignment — mirrored from `app/services/report_authorization.py` through
 * `useUserProfile().canActAsReviewer`.
 *
 * The frontend is a UX boundary, not a security boundary; the backend
 * enforces the same contract and has its own tests
 * (tests/http/test_block_a_reviewer_authorization.py). What these tests
 * defend is that the editor stops offering actions that are guaranteed to
 * 403, and stops exposing reviewer-only settings to people who are not the
 * reviewer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-0000000000d1";
const ORDER_ID = "00000000-0000-0000-0000-0000000000aa";
const REVIEWER_ID = "00000000-0000-0000-0000-0000000000r1";

const CONTENT = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true,
            label: "Macroscópica",
            type: "richtext",
            content: "<p>Contenido sintético.</p>",
        },
    },
    base_order: ["order_code"],
    section_order: ["section_macroscopic"],
};

/**
 * The four personas the authorization matrix distinguishes. Each is expressed
 * the way the real hook would report it, so a test can never accidentally
 * grant reviewer status through a permission alone.
 */
type Persona = "assignedReviewer" | "pathologist" | "admin" | "superuser";

const PERSONA_PERMISSIONS: Record<Persona, string[]> = {
    // Exactly the seeded reviewer role.
    assignedReviewer: [
        "reports:read",
        "reports:approve",
        "reports:sign",
        "lab:read",
    ],
    // Post-v1_3_1 pathologist: authors reports, approves nothing.
    pathologist: [
        "reports:read",
        "reports:create",
        "reports:edit",
        "reports:submit",
        "reports:retract",
        "lab:read",
    ],
    admin: ["reports:read", "reports:manage_templates", "lab:read"],
    // Superuser holds the entire catalogue — including approve and sign.
    superuser: [
        "reports:read",
        "reports:create",
        "reports:edit",
        "reports:submit",
        "reports:approve",
        "reports:sign",
        "reports:retract",
        "reports:manage_templates",
        "lab:read",
    ],
};

const PERSONA_ROLES: Record<Persona, string[]> = {
    assignedReviewer: ["reviewer"],
    pathologist: ["pathologist"],
    admin: ["admin"],
    superuser: ["superuser"],
};

function asPersona(persona: Persona) {
    const permissions = PERSONA_PERMISSIONS[persona];
    const roles = PERSONA_ROLES[persona];
    // The contract, evaluated exactly as `lib/rbac.canActAsReviewer` does.
    const isReviewer = roles.includes("reviewer");
    mockedUseUserProfile.mockReturnValue({
        profile: { id: REVIEWER_ID } as never,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (p: string) => permissions.includes(p),
        hasRole: (r: string) => roles.includes(r),
        canActAsReviewer: (capability: string) =>
            isReviewer && permissions.includes(capability),
        isAssignedReviewer: () => isReviewer,
        // Block B: the reopen contract is a DIFFERENT predicate — the
        // reviewer contract OR the administrative `reports:manage_templates`.
        // Mirrored here so Block A's personas keep behaving like the real
        // hook now that the editor consumes it.
        canReopenApprovedReport: () =>
            (isReviewer && permissions.includes("reports:approve")) ||
            permissions.includes("reports:manage_templates"),
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockReport(status: ReportStatus) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: {
            id: ORDER_ID,
            order_code: "ORD-1",
            status: "IN_PROGRESS",
            patient_id: "p1",
            tenant_id: "t1",
            branch_id: "b1",
            reviewers: [
                {
                    id: REVIEWER_ID,
                    name: "Dra. Revisora",
                    email: "rev@lab.test",
                    status: "pending",
                },
            ],
        },
        patient: {
            id: "p1",
            tenant_id: "t1",
            branch_id: "b1",
            patient_code: "PAT-1",
        },
        samples: [],
        report: {
            id: REPORT_ID,
            order_id: ORDER_ID,
            tenant_id: "t1",
            branch_id: "b1",
            created_by: "u1",
            version_no: 1,
            status,
            title: "Reporte de prueba",
            published_at: null,
            signed_by: null,
            signed_at: null,
            template: {
                base: CONTENT.base,
                sections: CONTENT.sections,
                base_order: CONTENT.base_order,
                section_order: CONTENT.section_order,
            },
            report: CONTENT,
        },
    } as never);
}

function mockRestOfTheEditor() {
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
        letterheads: [],
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/tenants/") ? { reports_v2_enabled: false } : {};
        return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(body)),
            json: () => Promise.resolve(body),
        } as Response);
    });
}

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes>
                <Route path="/reports/:reportId" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>
    );
}

/** Waits until the editor has finished loading, so an absence assertion is
 * about authorization rather than about a render that has not happened yet. */
async function renderLoaded(persona: Persona, status: ReportStatus) {
    asPersona(persona);
    mockReport(status);
    mockRestOfTheEditor();
    renderEditor();
    // The "Firma" panel renders once the report has loaded, so this is the
    // signal that an absence assertion below is about authorization rather
    // than about a render that has not happened yet.
    await waitFor(() => {
        expect(document.querySelectorAll(".ant-switch").length).toBeGreaterThan(0);
    });
}

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("Block A — the approval action", () => {
    it("the assigned reviewer sees it while the report is IN_REVIEW", async () => {
        await renderLoaded("assignedReviewer", "IN_REVIEW");
        expect(screen.getByText("Aprobar")).toBeTruthy();
    });

    it("a pathologist does not — CEL-131-01 as the user met it", async () => {
        await renderLoaded("pathologist", "IN_REVIEW");
        expect(screen.queryByText("Aprobar")).toBeNull();
        expect(screen.queryByText("Solicitar Cambios")).toBeNull();
    });

    it("an admin does not", async () => {
        await renderLoaded("admin", "IN_REVIEW");
        expect(screen.queryByText("Aprobar")).toBeNull();
    });

    it("a superuser does not, despite holding reports:approve", async () => {
        await renderLoaded("superuser", "IN_REVIEW");
        expect(screen.queryByText("Aprobar")).toBeNull();
    });

    it("is not offered outside IN_REVIEW even to the assigned reviewer", async () => {
        await renderLoaded("assignedReviewer", "DRAFT");
        expect(screen.queryByText("Aprobar")).toBeNull();
    });
});

describe("Block A — sign and publish", () => {
    it("the assigned reviewer sees it while the report is APPROVED", async () => {
        await renderLoaded("assignedReviewer", "APPROVED");
        expect(screen.getByText("Firmar y publicar")).toBeTruthy();
    });

    it("a pathologist does not", async () => {
        await renderLoaded("pathologist", "APPROVED");
        expect(screen.queryByText("Firmar y publicar")).toBeNull();
    });

    it("an admin does not", async () => {
        await renderLoaded("admin", "APPROVED");
        expect(screen.queryByText("Firmar y publicar")).toBeNull();
    });

    it("a superuser does not, despite holding reports:sign", async () => {
        // The pre-1.3.1 gate was `hasPermission(REPORTS_SIGN)`, which this
        // persona passes — so this test fails against the old code and is the
        // frontend half of the superuser finding.
        await renderLoaded("superuser", "APPROVED");
        expect(screen.queryByText("Firmar y publicar")).toBeNull();
    });
});

describe("Block A — signature settings are reviewer-only", () => {
    /** The two switches live in the "Firma" panel, in DOM order. */
    function signatureSwitches() {
        return document.querySelectorAll<HTMLElement>(".ant-switch");
    }

    it("the assigned reviewer can edit them while IN_REVIEW", async () => {
        await renderLoaded("assignedReviewer", "IN_REVIEW");
        await waitFor(() => expect(signatureSwitches().length).toBeGreaterThan(0));
        expect(signatureSwitches()[0].hasAttribute("disabled")).toBe(false);
    });

    it("a pathologist cannot, once the report is under review", async () => {
        await renderLoaded("pathologist", "IN_REVIEW");
        await waitFor(() => expect(signatureSwitches().length).toBeGreaterThan(0));
        expect(signatureSwitches()[0].hasAttribute("disabled")).toBe(true);
    });

    it("an admin cannot", async () => {
        await renderLoaded("admin", "IN_REVIEW");
        await waitFor(() => expect(signatureSwitches().length).toBeGreaterThan(0));
        expect(signatureSwitches()[0].hasAttribute("disabled")).toBe(true);
    });

    it("a superuser cannot", async () => {
        await renderLoaded("superuser", "IN_REVIEW");
        await waitFor(() => expect(signatureSwitches().length).toBeGreaterThan(0));
        expect(signatureSwitches()[0].hasAttribute("disabled")).toBe(true);
    });

    it("the author cannot edit them in DRAFT either", async () => {
        // The corrected A5/A6 contract. DRAFT belongs to the author for
        // clinical CONTENT only: these three fields decide what the final
        // document asserts about who signed it, which is the reviewer's
        // responsibility at every point in the lifecycle. A new report's
        // settings come from the template's defaults, resolved server-side.
        await renderLoaded("pathologist", "DRAFT");
        await waitFor(() => expect(signatureSwitches().length).toBeGreaterThan(0));
        expect(signatureSwitches()[0].hasAttribute("disabled")).toBe(true);
    });

    it("the assigned reviewer cannot edit them in DRAFT either", async () => {
        // The window is IN_REVIEW, not "whenever a reviewer is looking".
        await renderLoaded("assignedReviewer", "DRAFT");
        await waitFor(() => expect(signatureSwitches().length).toBeGreaterThan(0));
        expect(signatureSwitches()[0].hasAttribute("disabled")).toBe(true);
    });

    it("nobody can edit them once the report is APPROVED", async () => {
        await renderLoaded("assignedReviewer", "APPROVED");
        await waitFor(() => expect(signatureSwitches().length).toBeGreaterThan(0));
        expect(signatureSwitches()[0].hasAttribute("disabled")).toBe(true);
    });
});
