/**
 * Céluma 1.3.1 Block B (CEL-131-03) — "Reabrir reporte" in the report editor.
 *
 * The action returns an APPROVED, unsigned report to DRAFT so it can be
 * corrected and re-reviewed. Two things make its authorization different from
 * every other report action, and both are tested here:
 *
 *   1. **Administrators may reopen.** The predicate is
 *      `canReopenApprovedReport`, not `canActAsReviewer` — admin and
 *      superuser qualify through `reports:manage_templates`. Widening
 *      `canActAsReviewer` to admit them would also hand them approval,
 *      signing and the presentation settings, which is the bypass CEL-131-01
 *      removed.
 *
 *   2. **Reopening confers nothing else.** An admin who sees "Reabrir
 *      reporte" must still not see "Firmar y publicar" or "Aprobar".
 *
 * The frontend is a UX boundary; the backend is authoritative and has its own
 * suite (tests/http/test_block_b_report_reopen.py). What these tests defend is
 * that the button appears for exactly the right actors and states, and that a
 * successful reopen leaves the editor behaving like a DRAFT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const USER_ID = "00000000-0000-0000-0000-0000000000r1";
const REOPEN_LABEL = "Reabrir reporte";

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
 * The five personas the reopen matrix distinguishes. `unassignedReviewer`
 * holds the reviewer role and its capabilities but is absent from the order's
 * reviewer list — the case a role-only check would wrongly admit.
 */
type Persona =
    | "assignedReviewer"
    | "unassignedReviewer"
    | "pathologist"
    | "admin"
    | "superuser";

const PERSONA_PERMISSIONS: Record<Persona, string[]> = {
    assignedReviewer: ["reports:read", "reports:approve", "reports:sign", "lab:read"],
    unassignedReviewer: ["reports:read", "reports:approve", "reports:sign", "lab:read"],
    // Post-v1_3_1 pathologist: authors reports, approves nothing, and holds no
    // administrative capability either.
    pathologist: [
        "reports:read",
        "reports:create",
        "reports:edit",
        "reports:submit",
        "reports:retract",
        "lab:read",
    ],
    admin: ["reports:read", "reports:manage_templates", "lab:read"],
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
    unassignedReviewer: ["reviewer"],
    pathologist: ["pathologist"],
    admin: ["admin"],
    superuser: ["superuser"],
};

function asPersona(persona: Persona) {
    const permissions = PERSONA_PERMISSIONS[persona];
    const roles = PERSONA_ROLES[persona];
    // Evaluated exactly as `lib/rbac` does, so a test can never grant reviewer
    // status through a permission alone, nor reopen rights through the role.
    const assigned = persona === "assignedReviewer";
    const reviewerContract = (capability: string) =>
        roles.includes("reviewer") && permissions.includes(capability) && assigned;
    mockedUseUserProfile.mockReturnValue({
        profile: { id: USER_ID } as never,
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
        canActAsReviewer: (capability: string) => reviewerContract(capability),
        isAssignedReviewer: () => assigned,
        canReopenApprovedReport: () =>
            reviewerContract("reports:approve") ||
            permissions.includes("reports:manage_templates"),
    } as unknown as ReturnType<typeof useUserProfile>);
}

function reportPayload(status: ReportStatus) {
    return {
        order: {
            id: ORDER_ID,
            order_code: "ORD-1",
            status: "IN_PROGRESS",
            patient_id: "p1",
            tenant_id: "t1",
            branch_id: "b1",
            reviewers: [
                {
                    id: USER_ID,
                    name: "Dra. Revisora",
                    email: "rev@lab.test",
                    status: "approved",
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
    };
}

function mockReport(status: ReportStatus) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue(
        reportPayload(status) as never
    );
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
    // Céluma 1.3.1 manual-validation remediation (R5): the "Firma" panel —
    // and therefore any `.ant-switch` — is no longer rendered for a user
    // without reviewer authority, so waiting for one would hang for the
    // admin/superuser/pathologist personas this module is largely about. The
    // report title renders for every persona.
    await waitFor(() => {
        expect(screen.getAllByDisplayValue("Reporte de prueba").length).toBeGreaterThan(0);
    });
}

/** Clicks the confirm button INSIDE the dialog.
 *
 * Scoped deliberately: the toolbar trigger and the dialog's confirm button
 * carry the same label, and only the icon on the trigger keeps an unscoped
 * `getByRole` from matching both. Relying on that would make the test pass or
 * fail on an icon choice. */
async function confirmReopen() {
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: REOPEN_LABEL }));
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

describe("Block B — who sees «Reabrir reporte»", () => {
    it("the assigned reviewer does, while the report is APPROVED", async () => {
        await renderLoaded("assignedReviewer", "APPROVED");
        expect(screen.getByText(REOPEN_LABEL)).toBeTruthy();
    });

    it("an admin does", async () => {
        await renderLoaded("admin", "APPROVED");
        expect(screen.getByText(REOPEN_LABEL)).toBeTruthy();
    });

    it("a superuser does", async () => {
        await renderLoaded("superuser", "APPROVED");
        expect(screen.getByText(REOPEN_LABEL)).toBeTruthy();
    });

    it("a non-reviewer pathologist does not", async () => {
        await renderLoaded("pathologist", "APPROVED");
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
    });

    it("a reviewer who is not assigned to this order does not", async () => {
        await renderLoaded("unassignedReviewer", "APPROVED");
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
    });
});

describe("Block B — the action is APPROVED-only", () => {
    it("is not offered in DRAFT", async () => {
        await renderLoaded("assignedReviewer", "DRAFT");
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
    });

    it("is not offered in IN_REVIEW", async () => {
        await renderLoaded("assignedReviewer", "IN_REVIEW");
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
    });

    it("is not offered once the report is PUBLISHED — signed work is final", async () => {
        await renderLoaded("assignedReviewer", "PUBLISHED");
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
    });

    it("is not offered for a RETRACTED report", async () => {
        await renderLoaded("assignedReviewer", "RETRACTED");
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
    });

    it("is not offered to an admin outside APPROVED either", async () => {
        await renderLoaded("admin", "PUBLISHED");
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
    });
});

describe("Block B — reopening confers no reviewer authority", () => {
    it("the reviewer still sees «Firmar y publicar» alongside it", async () => {
        await renderLoaded("assignedReviewer", "APPROVED");
        expect(screen.getByText(REOPEN_LABEL)).toBeTruthy();
        expect(screen.getByText("Firmar y publicar")).toBeTruthy();
    });

    it("an admin sees reopen and nothing else", async () => {
        await renderLoaded("admin", "APPROVED");
        expect(screen.getByText(REOPEN_LABEL)).toBeTruthy();
        expect(screen.queryByText("Firmar y publicar")).toBeNull();
        expect(screen.queryByText("Aprobar")).toBeNull();
        expect(screen.queryByText("Solicitar Cambios")).toBeNull();
    });

    it("a superuser sees reopen and nothing else, despite holding every permission", async () => {
        await renderLoaded("superuser", "APPROVED");
        expect(screen.getByText(REOPEN_LABEL)).toBeTruthy();
        expect(screen.queryByText("Firmar y publicar")).toBeNull();
        expect(screen.queryByText("Aprobar")).toBeNull();
    });

    it("an admin does not gain the presentation controls", async () => {
        await renderLoaded("admin", "APPROVED");
        // Manual-validation remediation (R5): the controls are ABSENT for an
        // actor with no reviewer authority, where they used to render as
        // permanently greyed-out switches. Strictly stronger than the
        // previous `disabled` assertion, and the same conclusion: reopening
        // confers no presentation authority.
        expect(document.querySelectorAll(".ant-switch")).toHaveLength(0);
        expect(screen.queryByText("Firma")).toBeNull();
    });
});

describe("Block B — content editing stays hidden after approval (B-3)", () => {
    /**
     * The backend now refuses `POST /{id}/new_version` on an APPROVED report
     * (finding B-3). These assert the editor never asks it to — the reason
     * the bypass survived to production is that the UI already hid it, so
     * nothing exercised the API directly. They exist to keep that true, not
     * as the boundary itself: the backend is authoritative.
     */
    it("the author's save action is absent once the report is APPROVED", async () => {
        await renderLoaded("pathologist", "APPROVED");
        expect(screen.queryAllByText("Guardar reporte")).toHaveLength(0);
        expect(screen.queryAllByText("Guardar configuración")).toHaveLength(0);
    });

    it("it is absent for the assigned reviewer in APPROVED too", async () => {
        await renderLoaded("assignedReviewer", "APPROVED");
        expect(screen.queryAllByText("Guardar reporte")).toHaveLength(0);
        expect(screen.queryAllByText("Guardar configuración")).toHaveLength(0);
    });

    it("it is present in DRAFT, where authoring is valid", async () => {
        await renderLoaded("pathologist", "DRAFT");
        // R7: one save operation, two affordances — both present.
        expect(screen.getAllByText("Guardar reporte")).toHaveLength(2);
    });

    it("reopening brings the save action back", async () => {
        // The persona here is the assigned REVIEWER, who performs the reopen.
        // Their save is the narrow presentation route, not the content path —
        // the `reviewer` role has no `reports:edit` and must never be given
        // it — so the label that returns is "Guardar configuración". Since
        // the manual-validation remediation R1 opened DRAFT to the reviewer,
        // that is now true in DRAFT as well as IN_REVIEW.
        //
        // The AUTHOR's own content save returning in DRAFT is asserted by
        // "it is present in DRAFT, where authoring is valid" above, with the
        // pathologist persona. What matters here is Block B's point: an
        // APPROVED report offers no save at all, and the reopen is what
        // brings one back.
        vi.spyOn(reportService, "reopenReport").mockResolvedValue({
            id: REPORT_ID,
            status: "DRAFT",
            message: "Reporte reabierto.",
        });
        await renderLoaded("assignedReviewer", "APPROVED");
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            reportPayload("DRAFT") as never
        );

        expect(screen.queryAllByText("Guardar reporte")).toHaveLength(0);
        expect(screen.queryAllByText("Guardar configuración")).toHaveLength(0);

        await userEvent.click(screen.getByText(REOPEN_LABEL));
        await confirmReopen();

        await waitFor(() => {
            // R7: one save operation, two affordances — both present.
            expect(screen.getAllByText("Guardar configuración")).toHaveLength(2);
        });
    });
});

describe("Block B — running the action", () => {
    it("confirms first, and does not call the API if the user cancels", async () => {
        const reopen = vi
            .spyOn(reportService, "reopenReport")
            .mockResolvedValue({ id: REPORT_ID, status: "DRAFT", message: "ok" });
        await renderLoaded("assignedReviewer", "APPROVED");

        await userEvent.click(screen.getByText(REOPEN_LABEL));
        expect(await screen.findByText("¿Reabrir este reporte?")).toBeTruthy();

        await userEvent.click(screen.getByText("Cancelar"));
        expect(reopen).not.toHaveBeenCalled();
        expect(screen.getByText(REOPEN_LABEL)).toBeTruthy();
    });

    it("warns that the report returns to draft and must be approved again", async () => {
        await renderLoaded("assignedReviewer", "APPROVED");
        await userEvent.click(screen.getByText(REOPEN_LABEL));

        const description = await screen.findByText(/volverá a borrador/i);
        expect(description.textContent).toMatch(/aprobarse de nuevo/i);
    });

    it("reopens, and the editor immediately behaves like a DRAFT", async () => {
        const reopen = vi
            .spyOn(reportService, "reopenReport")
            .mockResolvedValue({ id: REPORT_ID, status: "DRAFT", message: "Reporte reabierto." });
        await renderLoaded("assignedReviewer", "APPROVED");
        // The refresh that follows the transition returns the new state.
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            reportPayload("DRAFT") as never
        );

        await userEvent.click(screen.getByText(REOPEN_LABEL));
        await confirmReopen();

        await waitFor(() => expect(reopen).toHaveBeenCalledWith(REPORT_ID));
        // The APPROVED-only actions are gone…
        await waitFor(() => {
            expect(screen.queryByText("Firmar y publicar")).toBeNull();
        });
        expect(screen.queryByText(REOPEN_LABEL)).toBeNull();
        // …and the DRAFT action is offered instead.
        expect(screen.getByText("Enviar a Revisión")).toBeTruthy();
    });

    it("keeps the APPROVED state when the API fails, and surfaces the error", async () => {
        const reopen = vi
            .spyOn(reportService, "reopenReport")
            .mockRejectedValue(new Error("Error al reabrir reporte: 409 - signed"));
        await renderLoaded("assignedReviewer", "APPROVED");

        await userEvent.click(screen.getByText(REOPEN_LABEL));
        await confirmReopen();

        await waitFor(() => expect(reopen).toHaveBeenCalled());
        // The report is still APPROVED: both of its actions remain available,
        // and nothing has switched to the DRAFT affordances.
        await waitFor(() => {
            expect(screen.getByText("Firmar y publicar")).toBeTruthy();
        });
        expect(screen.queryByText("Enviar a Revisión")).toBeNull();
    });

    it("still shows DRAFT behaviour when the post-reopen refresh fails", async () => {
        vi.spyOn(reportService, "reopenReport").mockResolvedValue({
            id: REPORT_ID,
            status: "DRAFT",
            message: "Reporte reabierto.",
        });
        await renderLoaded("assignedReviewer", "APPROVED");
        vi.spyOn(reportService, "getReportFull").mockRejectedValue(
            new Error("network")
        );

        await userEvent.click(screen.getByText(REOPEN_LABEL));
        await confirmReopen();

        // The transition already succeeded — a failed refresh must not restore
        // the approved actions.
        await waitFor(() => {
            expect(screen.queryByText("Firmar y publicar")).toBeNull();
        });
        expect(screen.getByText("Enviar a Revisión")).toBeTruthy();
    });
});
