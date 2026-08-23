/**
 * Céluma 1.3, Phase 3, Block D — the preferences section *as mounted by the
 * Profile page*.
 *
 * `notification_preferences_section.test.tsx` owns the section's own
 * behaviour. This file owns the one thing only the page can answer: that the
 * section renders identically at `/profile` and at `/config/profile`, and
 * that the page's `embedded` mode does not cause a second load.
 *
 * `/config/profile` sits inside `/config`, which is guarded by
 * `RequirePermission permission="lab:read"`, while `/profile` needs only
 * authentication. The section is deliberately unconditional in both: the
 * preference endpoints enforce no permission, so a user who can receive a
 * notification can always manage how they receive it — the same reasoning
 * that made `/notifications` `RequireAuth` in Block C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Profile from "../../pages/profile";
import { getNotificationPreferences } from "../../services/notification_preference_service";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from "../../models/notification";
import type { NotificationPreferenceItem } from "../../models/notification_preference";

vi.mock("../../services/notification_preference_service", () => ({
    getNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
}));

vi.mock("../../services/signature_service", () => ({
    uploadSignature: vi.fn(),
    getSignature: vi.fn().mockResolvedValue(null),
    deleteSignature: vi.fn(),
    NO_SIGNATURE_TITLE: "Sin firma",
    NO_SIGNATURE_DESCRIPTION: "…",
    isSignatureMissingError: () => true,
}));

vi.mock("../../lib/celuma_feedback", () => ({
    showCelumaSuccess: vi.fn(),
    showCelumaApiError: vi.fn(),
    showCelumaWarning: vi.fn(),
    showCelumaPermissionDenied: vi.fn(),
}));

const mockedGet = vi.mocked(getNotificationPreferences);

const PROFILE = {
    id: "u1",
    email: "demo@example.test",
    username: "demo",
    full_name: "Usuario de Prueba",
    // Not a reviewer, so the signature card (and its fetch) stays out of the way.
    roles: ["pathologist"],
    permissions: ["lab:read"],
    tenant_id: "t1",
};

function preferences(): NotificationPreferenceItem[] {
    return NOTIFICATION_TYPES.map((type) => ({
        notification_type: type,
        in_app_enabled: true,
        email_enabled: type !== "SAMPLE_STATUS_CHANGED",
        email_supported: type !== "SAMPLE_STATUS_CHANGED",
        is_explicit: false,
        updated_at: null,
    }));
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    mockedGet.mockResolvedValue({ preferences: preferences() });
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).includes("/v1/auth/me")) {
                return new Response(JSON.stringify(PROFILE), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response("{}", { status: 200 });
        }),
    );
});

afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

function renderProfile(embedded = false) {
    return render(
        <MemoryRouter initialEntries={[embedded ? "/config/profile" : "/profile"]}>
            <Profile embedded={embedded} />
        </MemoryRouter>,
    );
}

describe("standalone /profile", () => {
    it("renders the preferences section", async () => {
        renderProfile();

        expect(
            await screen.findByText("Preferencias de notificaciones"),
        ).toBeInTheDocument();
        for (const type of NOTIFICATION_TYPES) {
            expect(screen.getByText(NOTIFICATION_TYPE_LABELS[type])).toBeInTheDocument();
        }
    });

    it("loads preferences exactly once", async () => {
        renderProfile();

        await waitFor(() => expect(mockedGet).toHaveBeenCalled());
        expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("adds no polling interval to the page", async () => {
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

        renderProfile();
        await waitFor(() => expect(mockedGet).toHaveBeenCalled());

        expect(
            setIntervalSpy.mock.calls.filter(([, delay]) => Number(delay) >= 1000),
        ).toEqual([]);
        setIntervalSpy.mockRestore();
    });
});

describe("embedded /config/profile", () => {
    it("renders the same preferences section", async () => {
        renderProfile(true);

        expect(
            await screen.findByText("Preferencias de notificaciones"),
        ).toBeInTheDocument();
        expect(screen.getAllByRole("switch")).toHaveLength(NOTIFICATION_TYPES.length);
    });

    it("loads preferences exactly once", async () => {
        renderProfile(true);

        await waitFor(() => expect(mockedGet).toHaveBeenCalled());
        expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("shows the same effective values as the standalone page", async () => {
        renderProfile(true);
        await screen.findByText("Preferencias de notificaciones");

        expect(
            screen.getByLabelText(
                `Recibir por correo electrónico: ${NOTIFICATION_TYPE_LABELS.REPORT_PUBLISHED}`,
            ),
        ).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByLabelText(
                `Recibir por correo electrónico: ${NOTIFICATION_TYPE_LABELS.SAMPLE_STATUS_CHANGED}`,
            ),
        ).toBeDisabled();
    });
});

describe("the section does not disturb the rest of the page", () => {
    it("leaves the existing profile cards intact", async () => {
        renderProfile();

        expect(await screen.findByText("Editar Información")).toBeInTheDocument();
        // "Cambiar Contraseña" is both the section heading and its submit
        // button, so the heading is addressed by role.
        expect(
            screen.getByRole("heading", { name: /Cambiar Contraseña/ }),
        ).toBeInTheDocument();
    });

    it("adds no /auth/me request of its own", async () => {
        // Asserted in embedded mode, where the page renders no SidebarCeluma.
        // The standalone page makes a second `/auth/me` call through the
        // sidebar's own `useUserProfile()` — pre-existing behaviour, flagged
        // in Block A's current-state assessment §14 as an un-cached hook, and
        // not something this block introduced or is scoped to fix.
        renderProfile(true);
        await waitFor(() => expect(mockedGet).toHaveBeenCalled());

        const authCalls = vi
            .mocked(globalThis.fetch)
            .mock.calls.filter(([input]) => String(input).includes("/v1/auth/me"));
        expect(authCalls).toHaveLength(1);
    });
});
