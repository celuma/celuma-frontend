/**
 * Céluma 1.4 (#22) — the per-laboratory "Reportes V2" toggle is retired. The
 * settings page neither shows it nor reads/sends `reports_v2_enabled`; the
 * remaining tenant settings still load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TenantSettings from "../../pages/tenant_settings";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

beforeEach(() => {
    mockedUseUserProfile.mockReturnValue({
        profile: null, loading: false, authStatus: "authenticated", sessionExpired: false,
        error: null, canManageUsers: false, canManageBranches: false, canManageCatalog: false,
        canManageTenant: true, hasPermission: () => true, hasRole: () => false,
        canActAsReviewer: () => false, isAssignedReviewer: () => false,
        canReopenApprovedReport: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
    localStorage.setItem("tenant_id", "t1");
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("TenantSettings — Reports V2 toggle retired (#22)", () => {
    it("shows no Reports V2 section and makes no template-version requests", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            const body = url.includes("/v1/tenants/t1")
                ? { id: "t1", name: "Laboratorio Sintético", reports_v2_enabled: false }
                : url.includes("/users/reviewers")
                    ? { reviewers: [] }
                    : {};
            return Promise.resolve({
                ok: true, status: 200,
                text: () => Promise.resolve(JSON.stringify(body)),
                json: () => Promise.resolve(body),
            } as Response);
        });

        render(
            <MemoryRouter>
                <TenantSettings />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue("Laboratorio Sintético")).toBeTruthy();
        });
        // A stored `false` must not surface any control.
        expect(screen.queryByText(/habilitar creación de reportes v2/i)).toBeNull();
        expect(screen.queryByRole("switch")).toBeNull();
        expect(screen.getAllByText(/revisor predeterminado/i).length).toBeGreaterThan(0);
        expect(
            fetchSpy.mock.calls.some(([input]) => String(input).includes("/templates"))
        ).toBe(false);
    });
});
