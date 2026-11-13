/**
 * Céluma 1.4.4 (issue #73) — "Retirar de revisión" in the report editor.
 *
 * The API decides who may withdraw (`review_withdrawal` on `/reports/{id}/full`: the author of the current,
 * undecided submission, with `reports:submit`). The editor shows the action only when the server says so, sends
 * back the submission id it saw, and on any refusal re-reads the report so a stale action disappears.
 * Synthetic data only.
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
const AUTHOR_ID = "00000000-0000-0000-0000-0000000000p1";
const SUBMISSION_ID = "00000000-0000-0000-0000-0000000000e1";

const CONTENT = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" } },
    sections: { section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Sintético.</p>" } },
    base_order: ["order_code"],
    section_order: ["section_macroscopic"],
};

function asSubmitter(permissions = ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"]) {
    mockedUseUserProfile.mockReturnValue({
        profile: { id: AUTHOR_ID } as never,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (p: string) => permissions.includes(p),
        hasRole: (r: string) => r === "pathologist",
        canActAsReviewer: () => false,
        isAssignedReviewer: () => false,
        canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function fullResponse(status: ReportStatus, withdrawal: Record<string, unknown> | undefined) {
    return {
        order: { id: ORDER_ID, order_code: "ORD-1", status: "REVIEW", patient_id: "p1", tenant_id: "t1", branch_id: "b1", reviewers: [] },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1", created_by: AUTHOR_ID, version_no: 1,
            schema_version: 2, status, title: "Reporte de prueba", published_at: null, signed_by: null, signed_at: null,
            template: { base: CONTENT.base, sections: CONTENT.sections, base_order: CONTENT.base_order, section_order: CONTENT.section_order },
            report: CONTENT,
        },
        review_withdrawal: withdrawal,
    } as never;
}

function mockRestOfTheEditor() {
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes("/tenants/") ? { reports_v2_enabled: false } : {};
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) } as Response);
    });
}

async function loaded() {
    render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes><Route path="/reports/:reportId" element={<ReportEditor />} /></Routes>
        </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByDisplayValue("Reporte de prueba").length).toBeGreaterThan(0));
}

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    mockRestOfTheEditor();
    asSubmitter();
});
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("Retirar de revisión", () => {
    it("is offered only when the server allows it for the caller", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(fullResponse("IN_REVIEW", { allowed: true, submission_id: SUBMISSION_ID }));
        await loaded();
        expect(await screen.findByTestId("report-withdraw-review")).toBeTruthy();
    });

    it.each([
        ["someone else's request", { allowed: false, submission_id: SUBMISSION_ID, reason_code: "review_withdraw_not_submitter" }],
        ["an API that does not know the action", undefined],
    ])("is not offered for %s", async (_label, withdrawal) => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(fullResponse("IN_REVIEW", withdrawal));
        await loaded();
        expect(screen.queryByTestId("report-withdraw-review")).toBeNull();
    });

    it("is not offered outside review even if a stale flag says so", async () => {
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(fullResponse("DRAFT", { allowed: true, submission_id: SUBMISSION_ID }));
        await loaded();
        expect(screen.queryByTestId("report-withdraw-review")).toBeNull();
    });

    it("sends the submission it saw, returns the report to draft and offers resubmission", async () => {
        const getFull = vi.spyOn(reportService, "getReportFull")
            .mockResolvedValueOnce(fullResponse("IN_REVIEW", { allowed: true, submission_id: SUBMISSION_ID }))
            .mockResolvedValue(fullResponse("DRAFT", { allowed: false }));
        const withdraw = vi.spyOn(reportService, "withdrawReportFromReview")
            .mockResolvedValue({ id: REPORT_ID, status: "DRAFT", message: "Report withdrawn from review" });
        await loaded();
        fireEvent.click(await screen.findByTestId("report-withdraw-review"));
        await waitFor(() => expect(withdraw).toHaveBeenCalledWith(REPORT_ID, SUBMISSION_ID));
        await waitFor(() => expect(screen.queryByTestId("report-withdraw-review")).toBeNull());
        expect(await screen.findByText("Enviar a Revisión")).toBeTruthy();
        expect(getFull).toHaveBeenCalledTimes(2);
    });

    it("on a refusal (a decision or a newer submission won) it re-reads the report and the action disappears", async () => {
        const getFull = vi.spyOn(reportService, "getReportFull")
            .mockResolvedValueOnce(fullResponse("IN_REVIEW", { allowed: true, submission_id: SUBMISSION_ID }))
            .mockResolvedValue(fullResponse("APPROVED", { allowed: false, reason_code: "review_withdraw_not_pending" }));
        vi.spyOn(reportService, "withdrawReportFromReview").mockRejectedValue(
            new reportService.ReviewWithdrawalError("The report is APPROVED, not in review", 409, "review_withdraw_not_pending"));
        await loaded();
        fireEvent.click(await screen.findByTestId("report-withdraw-review"));
        await waitFor(() => expect(getFull).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByTestId("report-withdraw-review")).toBeNull());
    });
});
