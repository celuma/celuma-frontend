/**
 * Smoke tests for the letterheads admin list page — post-Fase-2
 * remediation, R8/R16: empty state, loaded state with the "Predeterminado"
 * badge, and read-only permission gating.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    it("renders a letterhead row with the Predeterminado badge", async () => {
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
