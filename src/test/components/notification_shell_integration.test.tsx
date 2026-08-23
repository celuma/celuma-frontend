/**
 * Céluma 1.3, Phase 3, Block C — shell integration.
 *
 * Two things this file exists to prevent:
 *  1. a second polling owner appearing because the bell was mounted twice
 *     (desktop + mobile, or once per page), and
 *  2. the /notifications route quietly acquiring a permission gate the API does
 *     not enforce.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SidebarCeluma from "../../components/ui/sidebar_menu";
import RequireAuth from "../../components/auth/require_auth";
import NotificationsPage from "../../pages/notifications";
import { NotificationProvider } from "../../providers/notification_provider";
import * as notificationService from "../../services/notification_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { AuthStatus } from "../../hooks/use_user_profile";
import { AUTH_TOKEN_KEY } from "../../lib/auth_session";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

/**
 * `permissions` is empty on purpose: the inbox must need none of them.
 *
 * Two things are set here because two different consumers read auth: the route
 * guard and SidebarCeluma go through useUserProfile, while NotificationProvider
 * gates on the stored session token.
 */
function withAuth(authStatus: AuthStatus, permissions: string[] = []) {
    if (authStatus === "authenticated") {
        localStorage.setItem(AUTH_TOKEN_KEY, "Bearer test-token");
    } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
    mockedUseUserProfile.mockReturnValue({
        profile: { id: "u1", permissions } as never,
        loading: authStatus === "loading",
        authStatus,
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: (code: string) => permissions.includes(code),
        hasRole: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

/** Drives the 767px breakpoint SidebarCeluma uses to pick which bell to mount. */
function withViewport(mobile: boolean) {
    window.matchMedia = ((query: string) => ({
        matches: query.includes("767") ? mobile : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

let countSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    withAuth("authenticated");
    withViewport(false);
    countSpy = vi
        .spyOn(notificationService, "getUnreadNotificationCount")
        .mockResolvedValue({ unread_count: 3 });
    vi.spyOn(notificationService, "listNotifications").mockResolvedValue({
        items: [],
        next_cursor: null,
    });
});

afterEach(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    vi.restoreAllMocks();
});

describe("bell placement in the shell", () => {
    it("mounts exactly one bell on the desktop viewport", async () => {
        render(
            <MemoryRouter>
                <NotificationProvider>
                    <SidebarCeluma />
                </NotificationProvider>
            </MemoryRouter>,
        );
        await act(async () => {});

        expect(screen.getAllByLabelText(/^Notificaciones,/)).toHaveLength(1);
    });

    it("mounts exactly one bell on the mobile viewport", async () => {
        withViewport(true);

        render(
            <MemoryRouter>
                <NotificationProvider>
                    <SidebarCeluma />
                </NotificationProvider>
            </MemoryRouter>,
        );
        await act(async () => {});

        // A CSS-hidden second trigger would still be in the DOM and in the
        // accessibility tree — hence the JS breakpoint.
        expect(screen.getAllByLabelText(/^Notificaciones,/)).toHaveLength(1);
    });

    it("renders the count from the shared provider", async () => {
        render(
            <MemoryRouter>
                <NotificationProvider>
                    <SidebarCeluma />
                </NotificationProvider>
            </MemoryRouter>,
        );
        await act(async () => {});

        expect(screen.getByLabelText("Notificaciones, 3 sin leer")).toBeTruthy();
    });

    it("keeps one polling owner even with several sidebars under one provider", async () => {
        vi.useFakeTimers();

        render(
            <MemoryRouter>
                <NotificationProvider>
                    <SidebarCeluma />
                    <SidebarCeluma />
                    <SidebarCeluma />
                </NotificationProvider>
            </MemoryRouter>,
        );
        await act(async () => {});

        // Three bells, one interval: the count is fetched once, not per bell.
        expect(screen.getAllByLabelText(/^Notificaciones,/)).toHaveLength(3);
        expect(countSpy).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it("renders inertly, with no request, when no provider is above it", async () => {
        render(
            <MemoryRouter>
                <SidebarCeluma />
            </MemoryRouter>,
        );
        await act(async () => {});

        expect(screen.getByLabelText("Notificaciones, ninguna sin leer")).toBeTruthy();
        expect(countSpy).not.toHaveBeenCalled();
    });
});

describe("the /notifications route guard", () => {
    /**
     * Real routes, not a bare guard: RequireAuth redirects with <Navigate>,
     * which needs a route to resolve into. Rendered without one it re-navigates
     * on every render.
     */
    function renderRoute() {
        return render(
            <MemoryRouter initialEntries={["/notifications"]}>
                <NotificationProvider>
                    <Routes>
                        <Route
                            path="/notifications"
                            element={
                                <RequireAuth>
                                    <NotificationsPage />
                                </RequireAuth>
                            }
                        />
                        <Route path="/login" element={<div>Iniciar sesión</div>} />
                    </Routes>
                </NotificationProvider>
            </MemoryRouter>,
        );
    }

    it("renders for an authenticated user holding no permission at all", async () => {
        withAuth("authenticated", []);

        renderRoute();
        await act(async () => {});

        // The API enforces no permission — every query is self-scoped to the
        // caller. Requiring lab:read here would produce a user who receives
        // notifications but cannot open their own inbox.
        expect(screen.getByText("Notificaciones")).toBeTruthy();
        expect(screen.queryByText("Iniciar sesión")).toBeNull();
    });

    it("still renders for a user who does hold lab:read", async () => {
        withAuth("authenticated", ["lab:read"]);

        renderRoute();
        await act(async () => {});

        expect(screen.getByText("Notificaciones")).toBeTruthy();
    });

    it("redirects an unauthenticated visitor to login", async () => {
        withAuth("unauthenticated");

        renderRoute();
        await act(async () => {});

        expect(screen.queryByText("Notificaciones")).toBeNull();
        expect(screen.getByText("Iniciar sesión")).toBeTruthy();
    });

    it("shows a spinner rather than the page while auth is still resolving", async () => {
        withAuth("loading");

        const { container } = renderRoute();
        await act(async () => {});

        expect(screen.queryByText("Notificaciones")).toBeNull();
        expect(container.querySelector(".ant-spin")).toBeTruthy();
    });
});
