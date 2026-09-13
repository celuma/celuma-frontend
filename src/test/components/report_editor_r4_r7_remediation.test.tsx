/**
 * Céluma 1.3.1 manual-validation remediation — R4 (CEL-131-06) and R7.
 *
 * ── R4, the default reviewer "not being applied" ────────────────────────────
 *
 * Reproduction against the real backend showed the fallback works end to end:
 * `POST /reports/{id}/submit` materializes exactly one PENDING `ReportReview`
 * for the tenant's configured default when the order has none, and the
 * assignment comes back on both `/orders/{id}/full` and `/reports/{id}/full`
 * (asserted in `tests/http/test_r4_default_reviewer_visible_after_submit.py`).
 *
 * The defect was here: `handleSubmit` applied the status from the response and
 * never re-read `/full`, so the submitting session kept the snapshot it had
 * taken BEFORE the row existed — `order.reviewers: []` — and every
 * reviewer-contract flag in the editor stayed false until the page was
 * reloaded by hand. To the release owner that is indistinguishable from "the
 * configured default reviewer is not applied".
 *
 * Why the existing suite allowed it through: nothing asserted what the editor
 * READS after a transition, only what it sends. This is the read model, which
 * is where the whole defect lived.
 *
 * ── R7, the bottom Save ─────────────────────────────────────────────────────
 *
 * A long report put the header's "Guardar" a full scroll away. The second
 * affordance must be the SAME control, not a second implementation: one save
 * operation, two ways to invoke it.
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
const DEFAULT_REVIEWER_ID = "00000000-0000-0000-0000-0000000000r9";

const CONTENT = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "ORD-1" },
        diagnosis: {
            is_visible: true,
            label: "Diagnóstico",
            is_custom: true,
            type: "text",
            value: "Hallazgo sintético",
        },
    },
    sections: {
        section_macroscopic: {
            is_visible: true,
            label: "Macroscópica",
            type: "richtext",
            content: "<p>Contenido sintético.</p>",
        },
    },
    base_order: ["order_code", "diagnosis"],
    section_order: ["section_macroscopic"],
};

type Reviewer = { id: string; name: string; email: string; status: string };

function asAuthor({ assignedReviewers = [] as string[] } = {}) {
    const permissions = [
        "reports:read", "reports:create", "reports:edit",
        "reports:submit", "reports:retract", "lab:read",
    ];
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
        isAssignedReviewer: () => assignedReviewers.includes(AUTHOR_ID),
        canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function fullResponse(status: ReportStatus, reviewers: Reviewer[]) {
    return {
        order: {
            id: ORDER_ID,
            order_code: "ORD-1",
            status: "IN_PROGRESS",
            patient_id: "p1",
            tenant_id: "t1",
            branch_id: "b1",
            reviewers,
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-1" },
        samples: [],
        report: {
            id: REPORT_ID,
            order_id: ORDER_ID,
            tenant_id: "t1",
            branch_id: "b1",
            created_by: AUTHOR_ID,
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
    } as never;
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

async function loaded() {
    renderEditor();
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

// ---------------------------------------------------------------------------
// R4 — the read model after submit
// ---------------------------------------------------------------------------

describe("R4 — the editor re-reads the report after submitting for review", () => {
    const FALLBACK_REVIEWER: Reviewer = {
        id: DEFAULT_REVIEWER_ID,
        name: "Dra. Arisbeth Villanueva",
        email: "arisbeth@lab.test",
        status: "pending",
    };

    function mockSubmitFlow() {
        // Before submission the order genuinely has no reviewer — the
        // zero-explicit-reviewer scenario the tenant default exists for.
        const getFull = vi
            .spyOn(reportService, "getReportFull")
            .mockResolvedValueOnce(fullResponse("DRAFT", []))
            // The server materialized the fallback during submit, so the
            // second read — the one the fix performs — carries it.
            .mockResolvedValue(fullResponse("IN_REVIEW", [FALLBACK_REVIEWER]));
        const submit = vi
            .spyOn(reportService, "submitReport")
            .mockResolvedValue({
                id: REPORT_ID,
                status: "IN_REVIEW",
                message: "Report submitted for review",
            } as never);
        return { getFull, submit };
    }

    it("re-reads /full so the materialized reviewer is in the editor's state", async () => {
        asAuthor();
        const { getFull, submit } = mockSubmitFlow();
        mockRestOfTheEditor();
        await loaded();

        expect(getFull).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText("Enviar a Revisión"));

        await waitFor(() => expect(submit).toHaveBeenCalledWith(REPORT_ID));
        // The defect: this second read never happened, so the session kept
        // believing `order.reviewers` was empty until a manual page reload.
        await waitFor(() => expect(getFull).toHaveBeenCalledTimes(2));
    });

    it("shows the report as IN_REVIEW even if the refresh read fails", async () => {
        // Ordering rule, shared with `handleReopen` and the publication flow:
        // the status from the transition's own response is applied FIRST and
        // the refresh may only enrich it. A failed refresh must never make a
        // submitted report look unsubmitted.
        asAuthor();
        vi.spyOn(reportService, "getReportFull")
            .mockResolvedValueOnce(fullResponse("DRAFT", []))
            .mockRejectedValue(new Error("network"));
        vi.spyOn(reportService, "submitReport").mockResolvedValue({
            id: REPORT_ID,
            status: "IN_REVIEW",
            message: "Report submitted for review",
        } as never);
        mockRestOfTheEditor();
        await loaded();

        fireEvent.click(screen.getByText("Enviar a Revisión"));

        await waitFor(() => {
            // "Enviar a Revisión" only renders for a DRAFT, so its
            // disappearance is the status having advanced.
            expect(screen.queryByText("Enviar a Revisión")).toBeNull();
        });
    });

    it("does not re-read when the submission itself fails", async () => {
        asAuthor();
        const getFull = vi
            .spyOn(reportService, "getReportFull")
            .mockResolvedValue(fullResponse("DRAFT", []));
        vi.spyOn(reportService, "submitReport").mockRejectedValue(
            new Error("Cannot submit report for review without reviewers assigned")
        );
        mockRestOfTheEditor();
        await loaded();

        fireEvent.click(screen.getByText("Enviar a Revisión"));

        await waitFor(() => expect(screen.getByText("Enviar a Revisión")).toBeTruthy());
        expect(getFull).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// R7 — two affordances, one save
// ---------------------------------------------------------------------------

describe("R7 — the bottom Save is the same control as the top one", () => {
    function bothSaveButtons() {
        return {
            top: screen.queryByTestId("report-save-top"),
            bottom: screen.queryByTestId("report-save-bottom"),
        };
    }

    async function loadedDraft() {
        asAuthor();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            fullResponse("DRAFT", [])
        );
        mockRestOfTheEditor();
        await loaded();
    }

    it("renders both affordances on an editable report", async () => {
        await loadedDraft();
        const { top, bottom } = bothSaveButtons();
        expect(top).toBeTruthy();
        expect(bottom).toBeTruthy();
        expect(top!.textContent).toBe(bottom!.textContent);
    });

    it.each(["report-save-top", "report-save-bottom"])(
        "%s invokes the same save path",
        async (testId) => {
            await loadedDraft();
            const save = vi
                .spyOn(reportService, "saveReportVersion")
                .mockResolvedValue({} as never);

            fireEvent.click(screen.getByTestId(testId));

            await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        }
    );

    it("clicking both in quick succession produces exactly one request", async () => {
        await loadedDraft();
        let resolve!: () => void;
        const save = vi
            .spyOn(reportService, "saveReportVersion")
            .mockImplementation(
                () => new Promise<never>((r) => { resolve = () => r({} as never); })
            );

        fireEvent.click(screen.getByTestId("report-save-top"));
        fireEvent.click(screen.getByTestId("report-save-bottom"));
        fireEvent.click(screen.getByTestId("report-save-top"));

        expect(save).toHaveBeenCalledTimes(1);
        resolve();
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    });

    it("an in-flight save disables both buttons, not just the one clicked", async () => {
        await loadedDraft();
        let resolve!: () => void;
        vi.spyOn(reportService, "saveReportVersion").mockImplementation(
            () => new Promise<never>((r) => { resolve = () => r({} as never); })
        );

        fireEvent.click(screen.getByTestId("report-save-bottom"));

        await waitFor(() => {
            const { top, bottom } = bothSaveButtons();
            expect((top as HTMLButtonElement).disabled).toBe(true);
            expect((bottom as HTMLButtonElement).disabled).toBe(true);
        });
        resolve();
    });

    it("both disappear together when the user may not save", async () => {
        // Authorization parity: a user with no content-editing authority and
        // no reviewer window gets neither affordance. The bottom one must not
        // become a way around the top one's condition.
        asAuthor();
        vi.spyOn(reportService, "getReportFull").mockResolvedValue(
            fullResponse("PUBLISHED", [])
        );
        mockRestOfTheEditor();
        await loaded();

        const { top, bottom } = bothSaveButtons();
        expect(top).toBeNull();
        expect(bottom).toBeNull();
    });

    it("both disappear together in every lifecycle-frozen state", async () => {
        for (const status of ["IN_REVIEW", "APPROVED", "RETRACTED"] as ReportStatus[]) {
            asAuthor();
            vi.spyOn(reportService, "getReportFull").mockResolvedValue(
                fullResponse(status, [])
            );
            mockRestOfTheEditor();
            const view = renderEditor();
            await waitFor(() => {
                expect(
                    screen.getAllByDisplayValue("Reporte de prueba").length
                ).toBeGreaterThan(0);
            });
            const { top, bottom } = bothSaveButtons();
            expect(top, `top save should be absent in ${status}`).toBeNull();
            expect(bottom, `bottom save should be absent in ${status}`).toBeNull();
            view.unmount();
            vi.restoreAllMocks();
        }
    });
});
