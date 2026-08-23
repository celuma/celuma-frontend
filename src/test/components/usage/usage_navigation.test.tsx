/**
 * Céluma 1.3, Phase 4, Block F — the configuration navigation entry.
 *
 * The item and the route must be gated on the same thing. `/config/usage` is
 * behind `admin:manage_tenant` (the permission both usage endpoints enforce),
 * so the menu entry follows the same `canManageTenant` flag the tenant-settings
 * entry already uses — a user who would only be bounced by RequirePermission
 * never sees the link.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SidebarConfig from "../../../components/ui/sidebar_config";
import { useUserProfile } from "../../../hooks/use_user_profile";

vi.mock("../../../hooks/use_user_profile");

function withPermissions(overrides: Partial<ReturnType<typeof useUserProfile>> = {}) {
    vi.mocked(useUserProfile).mockReturnValue({
        profile: null,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: () => false,
        hasRole: () => false,
        ...overrides,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function renderSidebar() {
    render(
        <MemoryRouter initialEntries={["/config/usage"]}>
            <SidebarConfig />
        </MemoryRouter>,
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("the 'Uso y límites' entry", () => {
    it("appears for a user who can manage the tenant", () => {
        withPermissions({ canManageTenant: true });

        renderSidebar();

        expect(screen.getByText("Uso y límites")).toBeInTheDocument();
    });

    it("is hidden from a user who cannot open the page", () => {
        withPermissions({ canManageTenant: false });

        renderSidebar();

        expect(screen.queryByText("Uso y límites")).not.toBeInTheDocument();
    });

    it("avoids commercial wording the product cannot deliver", () => {
        withPermissions({ canManageTenant: true, canManageUsers: true, canManageCatalog: true });

        renderSidebar();

        // No plan catalog, no checkout and no invoicing surface exists in
        // Phase 4, so the entry must not name one.
        expect(screen.queryByText(/facturación|suscripción|plan de pago/i)).not.toBeInTheDocument();
    });
});
