/**
 * Céluma 1.5 (#68): the report editor shows the state of its manual save
 * (unsaved / saving / saved / failed), keeps the author's edits after a failed
 * save with a retry, stays in the editor after saving, and warns before
 * in-app navigation would discard unsaved edits. Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import ReportEditor from "../../components/report/report_editor";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { ReportStatus } from "../../models/report";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const REPORT_ID = "00000000-0000-0000-0000-0000000068d1";
const ORDER_ID = "00000000-0000-0000-0000-0000000068aa";
const AUTHOR_ID = "00000000-0000-0000-0000-0000000068p1";
const TITLE = "Reporte sintético 68";

const CONTENT = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-68" } },
    sections: {
        section_notes: { is_visible: true, label: "Notas", type: "text", content: "Texto sintético." },
    },
    base_order: ["order_code"],
    section_order: ["section_notes"],
};

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

function fullResponse(status: ReportStatus) {
    return {
        order: {
            id: ORDER_ID, order_code: "ORD-68", status: "IN_PROGRESS", patient_id: "p1",
            tenant_id: "t1", branch_id: "b1", reviewers: [],
        },
        patient: { id: "p1", tenant_id: "t1", branch_id: "b1", patient_code: "PAT-68" },
        samples: [],
        report: {
            id: REPORT_ID, order_id: ORDER_ID, tenant_id: "t1", branch_id: "b1",
            created_by: AUTHOR_ID, version_no: 1, schema_version: 2, status,
            title: TITLE, published_at: null, signed_by: null, signed_at: null,
            template: {
                base: CONTENT.base, sections: CONTENT.sections,
                base_order: CONTENT.base_order, section_order: CONTENT.section_order,
            },
            report: CONTENT,
        },
    } as never;
}

function mockEditor(status: ReportStatus = "DRAFT") {
    vi.spyOn(reportService, "getReportFull").mockResolvedValue(fullResponse(status));
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes("/tenants/") ? { reports_v2_enabled: false } : {};
        return Promise.resolve({
            ok: true, status: 200,
            text: () => Promise.resolve(JSON.stringify(body)),
            json: () => Promise.resolve(body),
        } as Response);
    });
}

async function loadedInMemoryRouter() {
    render(
        <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
            <Routes>
                <Route path="/reports/:reportId" element={<ReportEditor />} />
            </Routes>
        </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByDisplayValue(TITLE).length).toBeGreaterThan(0));
}

// The indicator is rendered beside both Save buttons; they always agree.
const status = () => screen.queryAllByTestId("report-save-status")[0]?.getAttribute("data-status") ?? "clean";
const editTitle = (value: string) =>
    fireEvent.change(screen.getAllByDisplayValue(/Reporte sintético 68/)[0], { target: { value } });

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
    asAuthor();
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("#68 save status", () => {
    it("opening is clean; edits are unsaved; an edit during a save stays unsaved", async () => {
        mockEditor();
        let resolveSave: () => void = () => {};
        const save = vi.spyOn(reportService, "saveReportVersion")
            .mockImplementationOnce(() => new Promise<void>((r) => { resolveSave = r; }))
            .mockResolvedValue(undefined);
        await loadedInMemoryRouter();
        expect(status()).toBe("clean");

        editTitle(`${TITLE} A`);
        expect(status()).toBe("unsaved");

        fireEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(status()).toBe("saving"));
        editTitle(`${TITLE} AB`);
        await act(async () => { resolveSave(); });
        await waitFor(() => expect(status()).toBe("unsaved"));

        fireEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(status()).toBe("saved"));
        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1][0].title).toBe(`${TITLE} AB`);
        // Stays in the editor after saving.
        expect(screen.getAllByDisplayValue(`${TITLE} AB`).length).toBeGreaterThan(0);
    });

    it("a server rejection keeps the edits and offers a retry", async () => {
        mockEditor();
        const save = vi.spyOn(reportService, "saveReportVersion")
            .mockRejectedValueOnce(new Error("Error al guardar nueva versión del reporte: 422 - inválido"))
            .mockResolvedValue(undefined);
        await loadedInMemoryRouter();
        editTitle(`${TITLE} B`);
        fireEvent.click(screen.getByTestId("report-save-top"));

        await waitFor(() => expect(status()).toBe("failed"));
        expect(screen.getAllByDisplayValue(`${TITLE} B`).length).toBeGreaterThan(0);

        fireEvent.click(screen.getAllByTestId("report-save-retry")[0]);
        await waitFor(() => expect(status()).toBe("saved"));
        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1][0].title).toBe(`${TITLE} B`);
    });

    it("a network failure is reported as such", async () => {
        mockEditor();
        vi.spyOn(reportService, "saveReportVersion").mockRejectedValue(new TypeError("Failed to fetch"));
        await loadedInMemoryRouter();
        editTitle(`${TITLE} C`);
        fireEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(status()).toBe("failed"));
        expect(screen.getAllByTestId("report-save-status")[0].textContent).toContain("sin conexión");
        expect(screen.getAllByDisplayValue(`${TITLE} C`).length).toBeGreaterThan(0);
    });

    it("a read-only report shows no save status", async () => {
        mockEditor("PUBLISHED");
        await loadedInMemoryRouter();
        expect(screen.queryByTestId("report-save-status")).toBeNull();
        expect(screen.queryByTestId("report-save-top")).toBeNull();
    });
});

describe("#68 leaving with unsaved edits", () => {
    it("blocks in-app navigation until saved; staying keeps the edits", async () => {
        mockEditor();
        vi.spyOn(reportService, "saveReportVersion").mockResolvedValue(undefined);
        const router = createMemoryRouter(
            [
                { path: "/reports/:reportId", element: <ReportEditor /> },
                { path: "/orders/:orderId", element: <div data-testid="order-page">Orden</div> },
            ],
            { initialEntries: [`/reports/${REPORT_ID}`] },
        );
        render(<RouterProvider router={router} />);
        await waitFor(() => expect(screen.getAllByDisplayValue(TITLE).length).toBeGreaterThan(0));

        editTitle(`${TITLE} D`);
        await act(async () => { await router.navigate(`/orders/${ORDER_ID}`); });
        expect(await screen.findByTestId("unsaved-stay")).toBeTruthy();
        fireEvent.click(screen.getByTestId("unsaved-stay"));
        expect(router.state.location.pathname).toBe(`/reports/${REPORT_ID}`);
        expect(screen.getAllByDisplayValue(`${TITLE} D`).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByTestId("report-save-top"));
        await waitFor(() => expect(status()).toBe("saved"));
        await act(async () => { await router.navigate(`/orders/${ORDER_ID}`); });
        expect(await screen.findByTestId("order-page")).toBeTruthy();
    });
});
