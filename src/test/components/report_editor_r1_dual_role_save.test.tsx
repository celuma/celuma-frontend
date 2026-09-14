/**
 * Céluma 1.3.1 manual-validation remediation — R1 (CEL-131-02), the
 * interaction it introduces.
 *
 * Before R1 the two audiences could never overlap. Presentation was
 * `IN_REVIEW`-only and the editor treats every non-DRAFT report as read-only,
 * so a save in DRAFT was always the AUTHOR's (content route) and a save in
 * IN_REVIEW was always the REVIEWER's (narrow presentation route). Opening
 * DRAFT to the reviewer removes that coincidence: a user holding **both**
 * `pathologist` and `reviewer` — a real configuration in a small laboratory,
 * and the one `test_h0c_author_reviewer_bootstrap.py` exists for — is now
 * inside the reviewer's presentation window while still authoring a draft.
 *
 * Choosing the save path by the WINDOW would have sent their content save
 * down the presentation route, which is allowlisted to three fields, and
 * silently dropped their clinical edits. So the path is chosen by
 * CAPABILITY: `reports:edit` means the content route, its absence means the
 * presentation route, and a user with both gets both.
 *
 * **Order matters, and the backend is why.** `author_requested_letterhead_change`
 * compares the submitted `letterhead_version_id` against the one on the
 * CURRENT VERSION and rejects a difference with 403. Saving presentation
 * first updates that stored value, so the content save that follows sends a
 * matching id and is accepted; the reverse order would either 403 on the
 * letterhead or have the content save's carried-forward presentation
 * overwrite what the reviewer had just set
 * (`enforce_author_presentation_boundary`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const USER_ID = "00000000-0000-0000-0000-0000000000u1";

const CONTENT = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" },
    },
    sections: {
        section_macroscopic: {
            is_visible: true,
            label: "Macroscópica",
            type: "richtext",
            content: "<p>Contenido.</p>",
        },
    },
    base_order: ["order_code"],
    section_order: ["section_macroscopic"],
};

/** `pathologist` + `reviewer`, assigned to this order. Holds `reports:edit`
 *  AND the reviewer contract — the combination R1 makes newly reachable. */
function asAuthorAndReviewer() {
    const permissions = [
        "reports:read", "reports:create", "reports:edit", "reports:submit",
        "reports:retract", "reports:approve", "reports:sign", "lab:read",
    ];
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
        hasRole: (r: string) => ["pathologist", "reviewer"].includes(r),
        canActAsReviewer: (capability: string) => permissions.includes(capability),
        isAssignedReviewer: () => true,
        canReopenApprovedReport: () => true,
    } as unknown as ReturnType<typeof useUserProfile>);
}

/** Reviewer only — no `reports:edit`. The counter-persona. */
function asReviewerOnly() {
    const permissions = ["reports:read", "reports:approve", "reports:sign", "lab:read"];
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
        hasRole: (r: string) => r === "reviewer",
        canActAsReviewer: (capability: string) => permissions.includes(capability),
        isAssignedReviewer: () => true,
        canReopenApprovedReport: () => true,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockReport(status: ReportStatus) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: {
            id: ORDER_ID, order_code: "ORD-1", status: "IN_PROGRESS",
            patient_id: "p1", tenant_id: "t1", branch_id: "b1",
            reviewers: [
                { id: USER_ID, name: "Dra. Autora y Revisora", email: "ar@lab.test", status: "pending" },
            ],
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1",
            created_by: USER_ID, version_no: 1, status,
            title: "Reporte de prueba", published_at: null,
            signed_by: null, signed_at: null,
            template: {
                base: CONTENT.base, sections: CONTENT.sections,
                base_order: CONTENT.base_order, section_order: CONTENT.section_order,
            },
            report: CONTENT,
        },
    } as never);
}

function mockRestOfTheEditor() {
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/tenants/") ? { reports_v2_enabled: false } : {};
        return Promise.resolve({
            ok: true, status: 200,
            text: () => Promise.resolve(JSON.stringify(body)),
            json: () => Promise.resolve(body),
        } as Response);
    });
}

async function loaded(persona: () => void, status: ReportStatus) {
    persona();
    mockReport(status);
    mockRestOfTheEditor();
    render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes>
                <Route path="/reports/:reportId" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>
    );
    await waitFor(() => {
        expect(screen.getAllByDisplayValue("Reporte de prueba").length).toBeGreaterThan(0);
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

describe("R1 — a user who is BOTH the author and the assigned reviewer", () => {
    it("saves clinical content, not only presentation", async () => {
        // The regression this module exists for. If the save path were chosen
        // by the reviewer WINDOW rather than by capability, this user's
        // clinical edits would never reach `saveReportVersion`.
        await loaded(asAuthorAndReviewer, "DRAFT");
        const content = vi
            .spyOn(reportService, "saveReportVersion")
            .mockResolvedValue({} as never);
        const presentation = vi
            .spyOn(reportService, "updateReportPresentation")
            .mockResolvedValue({} as never);

        fireEvent.click(screen.getByTestId("report-save-top"));

        await waitFor(() => expect(content).toHaveBeenCalledTimes(1));
        expect(presentation).toHaveBeenCalledTimes(1);
    });

    it("writes presentation BEFORE content", async () => {
        // Order is load-bearing: the content route carries the PERSISTED
        // presentation forward, and its letterhead guard compares against the
        // stored value. Presentation last would be overwritten; presentation
        // first is carried.
        await loaded(asAuthorAndReviewer, "DRAFT");
        const calls: string[] = [];
        vi.spyOn(reportService, "updateReportPresentation").mockImplementation(
            async () => { calls.push("presentation"); return {} as never; }
        );
        vi.spyOn(reportService, "saveReportVersion").mockImplementation(
            async () => { calls.push("content"); return {} as never; }
        );

        fireEvent.click(screen.getByTestId("report-save-top"));

        await waitFor(() => expect(calls).toHaveLength(2));
        expect(calls).toEqual(["presentation", "content"]);
    });

    it("labels the button for the content save, not the configuration save", async () => {
        // "Guardar configuración" would understate what the click does for
        // this user — it saves their clinical content too.
        await loaded(asAuthorAndReviewer, "DRAFT");
        expect(screen.getByTestId("report-save-top").textContent).toContain(
            "Guardar reporte"
        );
    });

    it("still offers them the reviewer's presentation controls in DRAFT", async () => {
        await loaded(asAuthorAndReviewer, "DRAFT");
        const switches = document.querySelectorAll<HTMLElement>(".ant-switch");
        expect(switches.length).toBeGreaterThan(0);
        expect(switches[0].hasAttribute("disabled")).toBe(false);
    });
});

describe("R1 — a reviewer WITHOUT reports:edit is unchanged", () => {
    it("saves only presentation, never content", async () => {
        // The `reviewer` role deliberately has no `reports:edit` and must
        // never be given it (Block A §7). The content route would 403.
        await loaded(asReviewerOnly, "DRAFT");
        const content = vi
            .spyOn(reportService, "saveReportVersion")
            .mockResolvedValue({} as never);
        const presentation = vi
            .spyOn(reportService, "updateReportPresentation")
            .mockResolvedValue({} as never);

        fireEvent.click(screen.getByTestId("report-save-top"));

        await waitFor(() => expect(presentation).toHaveBeenCalledTimes(1));
        expect(content).not.toHaveBeenCalled();
    });

    it("labels the button as the configuration save", async () => {
        await loaded(asReviewerOnly, "DRAFT");
        expect(screen.getByTestId("report-save-top").textContent).toContain(
            "Guardar configuración"
        );
    });
});
