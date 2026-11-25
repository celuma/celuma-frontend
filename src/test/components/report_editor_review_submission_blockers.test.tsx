/**
 * Céluma 1.5 (#65): actionable blockers before "Enviar a revisión".
 *
 *   - A draft shows what still stands between it and review, from the rules
 *     the backend applies on submission (here: the reviewers of the order).
 *   - A requirement the editor can already see stops the submission before
 *     it is sent; a warning (no reviewers: the laboratory default may still be
 *     assigned) does not.
 *   - A refused submission names the affected section, in Spanish, moves focus
 *     there, and the next attempt can succeed (blocked → successful).
 *
 * The backend is authoritative for all of it; these defend the UX half.
 * Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { message } from "antd";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";
import { reviewSubmissionRejection } from "../../lib/review_submission";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-0000000006a1";
const ORDER_ID = "00000000-0000-0000-0000-0000000006b1";
const AUTHOR_ID = "00000000-0000-0000-0000-0000000006c1";

const CONTENT = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-65" } },
    sections: {
        section_macroscopic: { is_visible: true, label: "Macroscópica", type: "richtext", content: "<p>Contenido sintético.</p>" },
    },
    base_order: ["order_code"],
    section_order: ["section_macroscopic"],
};

type Reviewer = { id: string; name: string; email: string; status: string; eligible?: boolean };

const ACTIVE_REVIEWER: Reviewer = { id: "r1", name: "Dra. Revisora Sintética", email: "r1@lab.test", status: "pending", eligible: true };
const FORMER_REVIEWER: Reviewer = { id: "r2", name: "Dr. Exrevisor", email: "r2@lab.test", status: "pending", eligible: false };

function asAuthor() {
    const permissions = ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"];
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

function fullResponse(status: ReportStatus, reviewers: Reviewer[], versionNo = 1) {
    return {
        order: { id: ORDER_ID, order_code: "ORD-65", status: "IN_PROGRESS", patient_id: "p1", tenant_id: "t1", branch_id: "b1", reviewers },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-65" },
        samples: [],
        report: {
            id: REPORT_ID,
            order_id: ORDER_ID,
            tenant_id: "t1",
            branch_id: "b1",
            created_by: AUTHOR_ID,
            version_no: versionNo,
            schema_version: 2,
            status,
            title: "Reporte de prueba",
            published_at: null,
            signed_by: null,
            signed_at: null,
            template: { base: CONTENT.base, sections: CONTENT.sections, base_order: CONTENT.base_order, section_order: CONTENT.section_order },
            report: CONTENT,
        },
    } as never;
}

function mockRestOfTheEditor() {
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
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

async function loaded(reviewers: Reviewer[]) {
    asAuthor();
    const getFull = vi.spyOn(reportService, "getReportFull").mockResolvedValue(fullResponse("DRAFT", reviewers));
    mockRestOfTheEditor();
    render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes>
                <Route path="/reports/:reportId" element={<ReportEditor />} />
                <Route path="/orders/:orderId" element={<div data-testid="order-page">Orden</div>} />
            </Routes>
        </MemoryRouter>
    );
    await waitFor(() => expect(screen.getAllByDisplayValue("Reporte de prueba").length).toBeGreaterThan(0));
    return { getFull };
}

const blockers = () => screen.queryByTestId("review-submission-blockers");
const submitButton = () => screen.getByText("Enviar a Revisión");

/** A refusal exactly as `submitReport` throws it for a raw server body. */
function refusal(status: number, detail: unknown) {
    return new reportService.ReportSubmitError(status, reviewSubmissionRejection(status, JSON.stringify({ detail })));
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

describe("#65 — requirements shown before submitting", () => {
    it("a draft that meets every rule shows no list", async () => {
        await loaded([ACTIVE_REVIEWER]);
        expect(blockers()).toBeNull();
    });

    it("no assigned reviewer is a warning that still lets the server decide", async () => {
        await loaded([]);
        expect(within(blockers()!).getByTestId("review-blocker-reviewers_missing").textContent)
            .toContain("La orden no tiene revisores asignados");
        const submit = vi.spyOn(reportService, "submitReport").mockResolvedValue({ id: REPORT_ID, status: "IN_REVIEW", message: "Report submitted for review" });

        fireEvent.click(submitButton());

        await waitFor(() => expect(submit).toHaveBeenCalledWith(REPORT_ID));
    });

    it("reviewers that none can act block the submission before it is sent", async () => {
        await loaded([FORMER_REVIEWER]);
        const submit = vi.spyOn(reportService, "submitReport");

        fireEvent.click(submitButton());

        expect(within(blockers()!).getByTestId("review-blocker-reviewers_unavailable").textContent)
            .toContain("Ningún revisor asignado puede revisar");
        expect(submit).not.toHaveBeenCalled();
    });

    it("the reviewers requirement takes the user to the order", async () => {
        await loaded([FORMER_REVIEWER]);
        fireEvent.click(screen.getByRole("button", { name: "Ir a la orden" }));
        expect(await screen.findByTestId("order-page")).toBeTruthy();
    });

    it("the list disappears once the report is in review", async () => {
        await loaded([]);
        vi.spyOn(reportService, "submitReport").mockResolvedValue({ id: REPORT_ID, status: "IN_REVIEW", message: "Report submitted for review" });
        expect(blockers()).not.toBeNull();

        fireEvent.click(submitButton());

        await waitFor(() => expect(screen.queryByText("Enviar a Revisión")).toBeNull());
        expect(blockers()).toBeNull();
    });
});

describe("#65 — a refused submission, then a successful one", () => {
    const STALE = {
        code: "report_sample_codes_stale",
        message: "Los códigos de muestra de la orden cambiaron desde el último guardado (M-1 → M-2). Guarda el reporte y vuelve a enviarlo a revisión.",
    };

    it("names the affected section in Spanish, never the raw body, and focuses the fix", async () => {
        await loaded([ACTIVE_REVIEWER]);
        vi.spyOn(reportService, "submitReport").mockRejectedValue(refusal(409, STALE));

        fireEvent.click(submitButton());

        const item = await screen.findByTestId("review-blocker-report_sample_codes_stale");
        expect(item.getAttribute("data-section")).toBe("samples");
        expect(item.textContent).toContain("Los códigos de muestra cambiaron");
        expect(item.textContent).toContain("(M-1 → M-2)");
        expect(blockers()!.textContent).not.toMatch(/409|\{|report_sample_codes_stale/);
        // The fix is saving: focus lands on the save control.
        await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("report-save-top")));
        // Still a draft: nothing switched to the review affordances.
        expect(submitButton()).toBeTruthy();
    });

    it("translates an English refusal and routes it to its section", async () => {
        await loaded([ACTIVE_REVIEWER]);
        vi.spyOn(reportService, "submitReport").mockRejectedValue(
            refusal(400, "Cannot submit report for review without reviewers assigned"),
        );

        fireEvent.click(submitButton());

        const item = await screen.findByTestId("review-blocker-reviewers_missing");
        expect(item.getAttribute("data-section")).toBe("reviewers");
        expect(item.textContent).not.toContain("Cannot submit");
    });

    it("a blocked submission can be retried and succeed, with a Spanish notice", async () => {
        const { getFull } = await loaded([ACTIVE_REVIEWER]);
        const success = vi.spyOn(message, "success");
        const submit = vi.spyOn(reportService, "submitReport")
            .mockRejectedValueOnce(refusal(409, STALE))
            .mockResolvedValueOnce({ id: REPORT_ID, status: "IN_REVIEW", message: "Report submitted for review" });
        getFull.mockResolvedValue(fullResponse("IN_REVIEW", [ACTIVE_REVIEWER], 2));

        fireEvent.click(submitButton());
        await screen.findByTestId("review-blocker-report_sample_codes_stale");

        fireEvent.click(submitButton());

        await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByText("Enviar a Revisión")).toBeNull());
        expect(success).toHaveBeenCalledWith("Reporte enviado a revisión.");
        expect(blockers()).toBeNull();
    });

    it("each attempt replaces the previous refusal instead of piling them up", async () => {
        await loaded([ACTIVE_REVIEWER]);
        vi.spyOn(reportService, "submitReport")
            .mockRejectedValueOnce(refusal(409, STALE))
            .mockRejectedValueOnce(refusal(409, {
                code: "report_sample_images_stale",
                message: "El reporte contiene imágenes retiradas de la orden. Guarda el borrador actualizado y vuelve a enviarlo a revisión.",
            }));

        fireEvent.click(submitButton());
        await screen.findByTestId("review-blocker-report_sample_codes_stale");
        fireEvent.click(submitButton());

        const item = await screen.findByTestId("review-blocker-report_sample_images_stale");
        expect(item.getAttribute("data-section")).toBe("images");
        expect(screen.queryByTestId("review-blocker-report_sample_codes_stale")).toBeNull();
    });
});
