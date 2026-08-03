/**
 * Smoke tests for the letterheads admin list page — post-Phase-2
 * remediation, R8/R16: empty state, loaded state with the "default"
 * badge, and read-only permission gating.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportLetterheads from "../../pages/report_letterheads";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

function withPermission(canManage: boolean) {
    mockedUseUserProfile.mockReturnValue({
        profile: null,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: () => canManage,
        hasRole: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/config/report-letterheads"]}>
            <ReportLetterheads embedded />
        </MemoryRouter>
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ReportLetterheads — empty state", () => {
    it("shows an empty-state message when the tenant has no letterheads", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/aún no hay membretes/i)).toBeTruthy();
        });
    });
});

describe("ReportLetterheads — loaded state", () => {
    it("renders a letterhead row with the default badge", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [
                {
                    id: "lh1", tenant_id: "t1", name: "Membrete General",
                    description: "Uso general", is_default: true, is_active: true,
                    created_at: "2026-01-01",
                },
            ],
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText("Membrete General")).toBeTruthy();
            expect(screen.getByText("Predeterminado")).toBeTruthy();
        });
    });
});

describe("ReportLetterheads — read-only gating", () => {
    it("disables mutating actions without reports:manage_templates", async () => {
        withPermission(false);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/solo lectura/i)).toBeTruthy();
        });
        const newButton = screen.getByRole("button", { name: /nuevo membrete/i });
        expect(newButton).toBeDisabled();
    });
});

/**
 * Third post-Phase 2 remediation — issue D: until now the single action
 * was "delete", which actually disabled, and the actual deletion was
 * blocked for any letterhead with versions (i.e. for all).
 * The now menu distinguishes "delete" (only when the backend has already confirmed
 * which is safe) of "deactivate"/"Reactivate".
 */
async function openActionsMenu() {
    await userEvent.click(screen.getByRole("button", { name: /Más acciones/i }));
}

describe("ReportLetterheads — delete vs deactivate", () => {
    const baseRow = {
        id: "lh1", tenant_id: "t1", name: "Membrete General",
        description: null, is_default: false, is_active: true,
        created_at: "2026-01-01", has_active_version: true,
    };

    it("offers deletion when the letterhead has no references", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{ ...baseRow, can_hard_delete: true, blocking_references: [] }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => {
            expect(screen.getByText("Eliminar")).toBeTruthy();
            expect(screen.getByText("Desactivar")).toBeTruthy();
        });
    });

    it("hides «delete» when something references the letterhead", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow,
                can_hard_delete: false,
                blocking_references: ["lo usan 3 reporte(s) ya creados"],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => expect(screen.getByText("Desactivar")).toBeTruthy());
        // The destructive action is not even offered: the backend does it
        // would reject with 409, so showing it only produces failed clicks.
        expect(screen.queryByText("Eliminar")).toBeNull();
    });

    it("does not allow deactivating the default letterhead", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow, is_default: true, can_hard_delete: false,
                blocking_references: ["es el membrete predeterminado del laboratorio"],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => {
            const item = screen.getByText("Desactivar").closest("li");
            expect(item?.className).toContain("disabled");
        });
    });

    it("offers “Reactivate” on a deactivated letterhead", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow, is_active: false, can_hard_delete: true, blocking_references: [],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => expect(screen.getByText("Reactivar")).toBeTruthy());
        expect(screen.queryByText("Desactivar")).toBeNull();
    });

    it("Do not set the letterhead without saved configuration as default", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...baseRow, has_active_version: false, can_hard_delete: true,
                blocking_references: [],
            }],
        });

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete General")).toBeTruthy());
        await openActionsMenu();

        await waitFor(() => {
            const item = screen.getByText("Marcar como predeterminado").closest("li");
            expect(item?.className).toContain("disabled");
        });
    });

    it("lists deactivated letterheads so reactivation remains available", async () => {
        withPermission(true);
        const listSpy = vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [],
        });

        renderPage();
        await waitFor(() => expect(listSpy).toHaveBeenCalled());
        expect(listSpy).toHaveBeenCalledWith(false);
    });
});

/**
 * Specific regression of issue D found in manual verification:
 * the commit used the static API `Modal.confirm` from antd v5, which in
 * React 19 (the version of this project) does not mount anything. The click on
 * "delete" did not open a dialog or call the backend — "the UI does not allow
 * delete Letterheads" despite the endpoint existing. These tests affirm
 * about the real dialogue and about the call to the service.
 */
describe("ReportLetterheads — the commit is mounted and runs for real", () => {
    const deletableRow = {
        id: "lh1", tenant_id: "t1", name: "Membrete Borrable",
        description: null, is_default: false, is_active: true,
        created_at: "2026-01-01", has_active_version: true,
        can_hard_delete: true, blocking_references: [] as string[],
    };

    it("open dialog and delete true (hard_delete=true)", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [deletableRow],
        });
        const deleteSpy = vi
            .spyOn(letterheadService, "deleteReportLetterhead")
            .mockResolvedValue(undefined);

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete Borrable")).toBeTruthy());
        await openActionsMenu();
        await userEvent.click(await screen.findByText("Eliminar"));

        // The dialog actually has to exist in DOM.
        await waitFor(() => expect(screen.getByText(/no se puede deshacer/i)).toBeTruthy());
        await userEvent.click(screen.getByRole("button", { name: /Sí, eliminar/i }));

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("lh1", true));
    });

    it("deactivate it with hard_delete=false and explain what blocks it", async () => {
        withPermission(true);
        vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
            letterheads: [{
                ...deletableRow,
                can_hard_delete: false,
                blocking_references: ["lo usan 2 reporte(s) ya creados"],
            }],
        });
        const deleteSpy = vi
            .spyOn(letterheadService, "deleteReportLetterhead")
            .mockResolvedValue(undefined);

        renderPage();
        await waitFor(() => expect(screen.getByText("Membrete Borrable")).toBeTruthy());
        await openActionsMenu();
        await userEvent.click(await screen.findByText("Desactivar"));

        await waitFor(() =>
            expect(screen.getByText(/lo usan 2 reporte\(s\) ya creados/i)).toBeTruthy()
        );
        await userEvent.click(screen.getByRole("button", { name: /Sí, desactivar/i }));

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("lh1", false));
    });
});
