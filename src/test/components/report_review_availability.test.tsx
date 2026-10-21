/**
 * Céluma 1.4 — reviewer availability UX around review (synthetic data only).
 *
 * A review row is an assignment, not availability: an assignee that lost the reviewer role cannot
 * act and an administrator is not a reviewer. The UI explains why and routes to the recovery
 * (assign an active reviewer) without ever offering approval controls it cannot back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import ReviewersSection from "../../components/collaboration/ReviewersSection";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { updateOrderReviewers } from "../../services/collaboration_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-0000000000e1";
const ORDER_ID = "00000000-0000-0000-0000-0000000000ea";
const TEMPLATE = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" } },
    sections: { notas: { is_visible: true, label: "Notas", type: "richtext", content: "<p>x</p>" } },
    base_order: ["order_code"], section_order: ["notas"],
};
const STALE = { id: "u-stale", name: "Revisor Antiguo", email: "old@lab.test", status: "approved", eligible: false };
const ACTIVE = { id: "u-active", name: "Revisora Activa", email: "rev@lab.test", status: "pending", eligible: true };

function persona(canAct: boolean) {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false, error: null,
        canManageUsers: false, canManageBranches: false, canManageCatalog: false, canManageTenant: false,
        hasPermission: () => true, hasRole: () => false,
        canActAsReviewer: () => canAct,
        canReopenApprovedReport: () => false,
        isAssignedReviewer: () => canAct,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockReport(status: ReportStatus, reviewers: unknown[]) {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue({
        order: { id: ORDER_ID, order_code: "ORD-1", status: "REVIEW", patient_id: "p1", tenant_id: "t1", branch_id: "b1", reviewers },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1", created_by: "u1", version_no: 2,
            schema_version: 2, status, title: "Reporte", published_at: null, signed_by: null, signed_at: null,
            template: TEMPLATE, report: { ...TEMPLATE, schema_version: 2 },
        },
    } as never);
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes("/tenants/") ? { reports_v2_enabled: true } : {};
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) } as Response);
    });
}

function renderEditor() {
    return render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes><Route path="/reports/:reportId" element={<ReportEditor />} /></Routes>
        </MemoryRouter>,
    );
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

describe("ReportEditor — why review actions are absent", () => {
    it("explains an IN_REVIEW report with no eligible reviewer and routes to the order, without approval controls", async () => {
        persona(false);
        mockReport("IN_REVIEW", [STALE]);
        renderEditor();
        const note = await screen.findByTestId("review-availability-note");
        expect(note.textContent).toContain("ningún revisor asignado puede revisarlo");
        expect(note.textContent).toContain("Un administrador no puede aprobar ni firmar");
        expect(within(note).getByRole("link", { name: "Ir a la orden" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Aprobar/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Solicitar Cambios/ })).toBeNull();
    });

    it("tells a non-assigned user who the eligible reviewers are", async () => {
        persona(false);
        mockReport("IN_REVIEW", [STALE, ACTIVE]);
        renderEditor();
        const note = await screen.findByTestId("review-availability-note");
        expect(note.textContent).toContain("Revisora Activa");
        expect(note.textContent).not.toContain("Revisor Antiguo");
        expect(within(note).queryByRole("link")).toBeNull();
    });

    it("offers the real controls, and no note, to the assigned eligible reviewer", async () => {
        persona(true);
        mockReport("IN_REVIEW", [ACTIVE]);
        renderEditor();
        await screen.findByRole("button", { name: /Aprobar/ });
        expect(screen.getByRole("button", { name: /Solicitar Cambios/ })).toBeTruthy();
        expect(screen.queryByTestId("review-availability-note")).toBeNull();
    });

    it("also explains APPROVED (awaiting the signature) without an eligible reviewer", async () => {
        persona(false);
        mockReport("APPROVED", [STALE]);
        renderEditor();
        expect((await screen.findByTestId("review-availability-note")).textContent).toContain("ningún revisor asignado");
        expect(screen.queryByRole("button", { name: /Firmar y publicar/ })).toBeNull();
    });

    it("shows nothing in DRAFT or PUBLISHED", async () => {
        persona(false);
        mockReport("DRAFT", [STALE]);
        renderEditor();
        await waitFor(() => expect(screen.getByRole("button", { name: /Enviar a Revisión/ })).toBeTruthy());
        expect(screen.queryByTestId("review-availability-note")).toBeNull();
    });
});

describe("ReviewersSection — recovery", () => {
    const users = [
        { id: "u-active", name: "Revisora Activa", email: "rev@lab.test" },
        { id: "u-new", name: "Revisor Nuevo", email: "new@lab.test" },
    ];

    it("flags an assignee who can no longer review and says what to do", () => {
        render(<ReviewersSection reviewers={[STALE] as never} allUsers={users} onUpdate={vi.fn()} orderStatus="REVIEW" />);
        expect(screen.getByTestId("reviewer-ineligible").textContent).toBe("No puede revisar");
        expect(screen.getByTestId("reviewers-none-eligible").textContent).toContain("Usa el selector para asignar un revisor activo");
    });

    it("without manage permission, tells the user to ask for the assignment", () => {
        render(<ReviewersSection reviewers={[STALE] as never} allUsers={users} onUpdate={vi.fn()} disabled />);
        expect(screen.getByTestId("reviewers-none-eligible").textContent).toContain("Pide a quien administra las asignaciones");
    });

    it("does not pre-select the stale assignee, so applying replaces them", async () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        render(<ReviewersSection reviewers={[STALE] as never} allUsers={users} onUpdate={onUpdate} orderStatus="REVIEW" />);
        const user = userEvent.setup();
        await user.click(document.querySelector("button, [role=button]:not([data-testid])") as HTMLElement);
        await user.click(await screen.findByText("Revisor Nuevo"));
        await user.click(screen.getByRole("button", { name: /Aplicar/ }));
        await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(["u-new"]));
    });
});

describe("collaboration service — actionable errors", () => {
    it("surfaces the Spanish {code,message} detail of a refused reviewer update", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: false, status: 409, statusText: "Conflict",
            text: () => Promise.resolve(JSON.stringify({ detail: { code: "review_requires_eligible_reviewer", message: "El reporte está en revisión y esta orden no puede quedarse sin un revisor activo." } })),
        } as Response);
        await expect(updateOrderReviewers("o1", [])).rejects.toThrow("no puede quedarse sin un revisor activo");
    });

    it("keeps string details readable", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: false, status: 422, statusText: "x", text: () => Promise.resolve(JSON.stringify({ detail: "Revisor no puede asignarse" })),
        } as Response);
        await expect(updateOrderReviewers("o1", ["x"])).rejects.toThrow("Revisor no puede asignarse");
    });
});
