/**
 * Céluma 1.4 (#22) — an unsigned report created in the retired legacy format
 * is shown read-only with an explanation: no content editing, no "Enviar a
 * Revisión", no "Firmar y publicar". A V2 report with the same status keeps
 * every control. The backend refuses these actions regardless (409
 * `legacy_report_authoring_retired`); this covers what the editor offers.
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
const USER_ID = "00000000-0000-0000-0000-0000000000p1";

const CONTENT = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" } },
    sections: {
        section_macroscopic: {
            is_visible: true, label: "Macroscópica", type: "richtext",
            content: "<p>Contenido sintético.</p>",
        },
    },
    base_order: ["order_code"],
    section_order: ["section_macroscopic"],
};

function asAuthorAndReviewer() {
    const permissions = [
        "reports:read", "reports:create", "reports:edit", "reports:submit",
        "reports:approve", "reports:sign", "lab:read",
    ];
    mockedUseUserProfile.mockReturnValue({
        profile: { id: USER_ID } as never,
        loading: false, authStatus: "authenticated", sessionExpired: false, error: null,
        canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (p: string) => permissions.includes(p),
        hasRole: () => true,
        canActAsReviewer: (capability: string) => permissions.includes(capability),
        isAssignedReviewer: () => true,
        canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockReport(status: ReportStatus, schemaVersion: number | undefined) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: {
            id: ORDER_ID, order_code: "ORD-1", status: "IN_PROGRESS", patient_id: "p1",
            tenant_id: "t1", branch_id: "b1",
            reviewers: [{ id: USER_ID, name: "Rev", email: "r@lab.test", status: "pending" }],
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1",
            created_by: USER_ID, version_no: 1, status, title: "Reporte de prueba",
            schema_version: schemaVersion,
            published_at: null, signed_by: null, signed_at: null,
            template: {
                base: CONTENT.base, sections: CONTENT.sections,
                base_order: CONTENT.base_order, section_order: CONTENT.section_order,
            },
            report: CONTENT,
        },
    } as never);
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve({
            ok: true, status: 200,
            text: () => Promise.resolve("{}"), json: () => Promise.resolve({}),
        } as Response)
    );
}

async function open() {
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
    asAuthorAndReviewer();
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("legacy unsigned report (#22)", () => {
    it("explains the block and offers no submit for a legacy DRAFT", async () => {
        mockReport("DRAFT", undefined);
        await open();

        expect(screen.getByText(/formato anterior/i)).toBeTruthy();
        expect(screen.queryByText("Enviar a Revisión")).toBeNull();
        expect(screen.queryByTestId("report-save-top")).toBeNull();
    });

    it("offers no signing for a legacy APPROVED report", async () => {
        mockReport("APPROVED", undefined);
        await open();

        expect(screen.getByText(/formato anterior/i)).toBeTruthy();
        expect(screen.queryByText("Firmar y publicar")).toBeNull();
    });

    it("keeps submit and save for a V2 DRAFT", async () => {
        mockReport("DRAFT", 2);
        await open();

        expect(screen.queryByText(/formato anterior/i)).toBeNull();
        expect(screen.getByText("Enviar a Revisión")).toBeTruthy();
        expect(screen.getByTestId("report-save-top")).toBeTruthy();
    });

    it("does not block a PUBLISHED legacy report (history stays readable)", async () => {
        mockReport("PUBLISHED", undefined);
        await open();

        expect(screen.queryByText(/formato anterior/i)).toBeNull();
    });
});
