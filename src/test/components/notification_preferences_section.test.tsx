/**
 * Céluma 1.3, Phase 3, Block D — the Profile page's preferences section.
 *
 * The service is mocked, not the hook: these tests exercise the real hook's
 * dirty/save/reset behaviour through the real component, so a regression in
 * either shows up here. What they must *not* exercise is the Notification
 * Center — a whole `describe` at the bottom asserts this section adds no
 * second polling owner and no delivery-status affordance.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationPreferencesSection from "../../components/ui/notification_preferences_section";
import {
    getNotificationPreferences,
    updateNotificationPreferences,
} from "../../services/notification_preference_service";
import {
    NOTIFICATION_TYPES,
    NOTIFICATION_TYPE_LABELS,
    type NotificationType,
} from "../../models/notification";
import type { NotificationPreferenceItem } from "../../models/notification_preference";

vi.mock("../../services/notification_preference_service", () => ({
    getNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
}));

const successToast = vi.fn();
const errorToast = vi.fn();
vi.mock("../../lib/celuma_feedback", () => ({
    showCelumaSuccess: (...args: unknown[]) => successToast(...args),
    showCelumaApiError: (...args: unknown[]) => errorToast(...args),
    showCelumaWarning: vi.fn(),
    showCelumaPermissionDenied: vi.fn(),
}));

const mockedGet = vi.mocked(getNotificationPreferences);
const mockedUpdate = vi.mocked(updateNotificationPreferences);

function preference(
    notification_type: NotificationType,
    overrides: Partial<NotificationPreferenceItem> = {},
): NotificationPreferenceItem {
    return {
        notification_type,
        in_app_enabled: true,
        email_enabled: true,
        email_supported: true,
        is_explicit: false,
        updated_at: null,
        ...overrides,
    };
}

/** All six types, as the backend always returns them. */
function fullList(
    overrides: Partial<Record<NotificationType, Partial<NotificationPreferenceItem>>> = {},
): NotificationPreferenceItem[] {
    return NOTIFICATION_TYPES.map((type) =>
        preference(type, {
            ...(type === "SAMPLE_STATUS_CHANGED"
                ? { email_supported: false, email_enabled: false }
                : {}),
            ...(overrides[type] ?? {}),
        }),
    );
}

/**
 * Matched by regex rather than by exact name: antd renders its loading
 * spinner as `<span role="img" aria-label="loading">` *inside* the button,
 * so while a save is in flight the accessible name is
 * "loadingGuardar preferencias". That is a pre-existing antd behaviour shared
 * by every `CelumaButton` with `loading`, not something this section
 * introduced, so the test accommodates it rather than the component working
 * around it.
 */
function saveButton() {
    return screen.getByRole("button", { name: /Guardar preferencias/ });
}

function switchFor(type: NotificationType) {
    return screen.getByLabelText(
        `Recibir por correo electrónico: ${NOTIFICATION_TYPE_LABELS[type]}`,
    );
}

async function renderLoaded(list = fullList()) {
    mockedGet.mockResolvedValue({ preferences: list });
    const view = render(<NotificationPreferencesSection />);
    await waitFor(() =>
        expect(screen.getByText(NOTIFICATION_TYPE_LABELS.REPORT_PUBLISHED)).toBeInTheDocument(),
    );
    return view;
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
    mockedGet.mockResolvedValue({ preferences: fullList() });
    mockedUpdate.mockResolvedValue({ preferences: fullList() });
});

afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe("rendering", () => {
    it("shows the section heading and the supporting copy", async () => {
        await renderLoaded();

        expect(screen.getByText("Preferencias de notificaciones")).toBeInTheDocument();
        expect(
            screen.getByText(/Las notificaciones dentro de Céluma permanecerán activas/),
        ).toBeInTheDocument();
    });

    it("lists all six notification types", async () => {
        await renderLoaded();

        for (const type of NOTIFICATION_TYPES) {
            expect(screen.getByText(NOTIFICATION_TYPE_LABELS[type])).toBeInTheDocument();
        }
    });

    it("reuses the shared label map rather than restating the six names", async () => {
        // Asserted by construction: the labels looked up above come from
        // models/notification.ts, so a divergent copy in this component would
        // fail the previous test.
        await renderLoaded();

        expect(screen.getByText("Estado de muestra actualizado")).toBeInTheDocument();
        expect(screen.getByText("PDF oficial listo")).toBeInTheDocument();
    });

    it("renders the loaded values on the switches", async () => {
        await renderLoaded(fullList({ REPORT_PUBLISHED: { email_enabled: false } }));

        expect(switchFor("REPORT_PUBLISHED")).toHaveAttribute("aria-checked", "false");
        expect(switchFor("REPORT_SUBMITTED")).toHaveAttribute("aria-checked", "true");
    });

    it("marks implicit values as the default and explicit ones as not", async () => {
        await renderLoaded(
            fullList({
                REPORT_PUBLISHED: {
                    email_enabled: false,
                    is_explicit: true,
                    updated_at: "2026-08-06T12:00:00",
                },
            }),
        );

        const explicitRow = screen.getByTestId("notification-preference-REPORT_PUBLISHED");
        expect(within(explicitRow).queryByText("Predeterminado")).not.toBeInTheDocument();

        const defaultRow = screen.getByTestId("notification-preference-REPORT_SUBMITTED");
        expect(within(defaultRow).getByText("Predeterminado")).toBeInTheDocument();
    });

    it("shows a loading state before the first response", () => {
        mockedGet.mockReturnValue(new Promise(() => {}));

        const { container } = render(<NotificationPreferencesSection />);

        expect(container.querySelector(".ant-skeleton")).not.toBeNull();
        expect(screen.queryByRole("button", { name: /Guardar preferencias/ })).toBeNull();
    });

    it("shows a Spanish error when the list cannot be loaded", async () => {
        mockedGet.mockRejectedValue(new Error("boom"));

        render(<NotificationPreferencesSection />);

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "No fue posible cargar tus preferencias de notificaciones.",
        );
    });
});

describe("unsupported types", () => {
    it("disables the switch for a type that cannot use email", async () => {
        await renderLoaded();

        expect(switchFor("SAMPLE_STATUS_CHANGED")).toBeDisabled();
    });

    it("keeps it off and explains why", async () => {
        await renderLoaded();

        expect(switchFor("SAMPLE_STATUS_CHANGED")).toHaveAttribute("aria-checked", "false");
        const row = screen.getByTestId("notification-preference-SAMPLE_STATUS_CHANGED");
        expect(
            within(row).getByText("Disponible únicamente dentro de Céluma."),
        ).toBeInTheDocument();
    });

    it("clicking it never produces a request", async () => {
        const user = userEvent.setup();
        await renderLoaded();

        await user.click(switchFor("SAMPLE_STATUS_CHANGED"));

        expect(mockedUpdate).not.toHaveBeenCalled();
        expect(saveButton()).toBeDisabled();
    });
});

describe("saving", () => {
    it("disables Guardar while nothing has changed", async () => {
        await renderLoaded();

        expect(saveButton()).toBeDisabled();
        expect(screen.getByRole("button", { name: "Restablecer" })).toBeDisabled();
    });

    it("enables Guardar once a switch is toggled", async () => {
        const user = userEvent.setup();
        await renderLoaded();

        await user.click(switchFor("REPORT_PUBLISHED"));

        expect(
            saveButton(),
        ).toBeEnabled();
    });

    it("toggling alone sends nothing", async () => {
        const user = userEvent.setup();
        await renderLoaded();

        await user.click(switchFor("REPORT_PUBLISHED"));
        await user.click(switchFor("REPORT_SUBMITTED"));

        expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("sends one batch containing only the changed types", async () => {
        const user = userEvent.setup();
        await renderLoaded();

        await user.click(switchFor("REPORT_PUBLISHED"));
        await user.click(switchFor("REPORT_SUBMITTED"));
        await user.click(saveButton());

        await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
        expect(mockedUpdate.mock.calls[0][0].preferences).toEqual([
            { notification_type: "REPORT_SUBMITTED", email_enabled: false },
            { notification_type: "REPORT_PUBLISHED", email_enabled: false },
        ]);
    });

    it("confirms success in Spanish", async () => {
        const user = userEvent.setup();
        await renderLoaded();

        await user.click(switchFor("REPORT_PUBLISHED"));
        await user.click(saveButton());

        await waitFor(() => expect(successToast).toHaveBeenCalled());
        expect(successToast.mock.calls[0][0]).toBe("Preferencias guardadas");
    });

    it("reports a failure in Spanish and keeps the edits", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockRejectedValue(new Error("boom"));
        await renderLoaded();

        await user.click(switchFor("REPORT_PUBLISHED"));
        await user.click(saveButton());

        await waitFor(() => expect(errorToast).toHaveBeenCalled());
        expect(errorToast.mock.calls[0][1]).toBe(
            "No fue posible guardar tus preferencias de notificaciones.",
        );
        expect(switchFor("REPORT_PUBLISHED")).toHaveAttribute("aria-checked", "false");
        expect(
            saveButton(),
        ).toBeEnabled();
    });

    it("adopts the server's effective response after saving", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({
            preferences: fullList({
                REPORT_PUBLISHED: { email_enabled: false, is_explicit: true },
            }),
        });
        await renderLoaded();

        await user.click(switchFor("REPORT_PUBLISHED"));
        await user.click(saveButton());

        await waitFor(() =>
            expect(
                saveButton(),
            ).toBeDisabled(),
        );
        const row = screen.getByTestId("notification-preference-REPORT_PUBLISHED");
        expect(within(row).queryByText("Predeterminado")).not.toBeInTheDocument();
    });

    it("Restablecer restores the last loaded values", async () => {
        const user = userEvent.setup();
        await renderLoaded(
            fullList({ REPORT_PUBLISHED: { email_enabled: false, is_explicit: true } }),
        );

        await user.click(switchFor("REPORT_PUBLISHED"));
        expect(switchFor("REPORT_PUBLISHED")).toHaveAttribute("aria-checked", "true");

        await user.click(screen.getByRole("button", { name: "Restablecer" }));

        // Back to the stored override — not to the global default.
        expect(switchFor("REPORT_PUBLISHED")).toHaveAttribute("aria-checked", "false");
        expect(mockedUpdate).not.toHaveBeenCalled();
    });
});

describe("accessibility", () => {
    it("gives every switch a distinct accessible name", async () => {
        await renderLoaded();

        const names = NOTIFICATION_TYPES.map(
            (type) => switchFor(type).getAttribute("aria-label") ?? "",
        );
        expect(new Set(names).size).toBe(NOTIFICATION_TYPES.length);
    });

    it("names each switch by its notification type, not by 'Correo'", async () => {
        await renderLoaded();

        expect(switchFor("REPORT_PUBLISHED").getAttribute("aria-label")).toContain(
            "Reporte publicado",
        );
    });

    it("switches are real, focusable controls", async () => {
        await renderLoaded();

        expect(switchFor("REPORT_PUBLISHED").tagName).toBe("BUTTON");
    });
});

describe("scope — what this section deliberately does not offer", () => {
    it("shows no in-app switch", async () => {
        await renderLoaded();

        // Exactly one switch per type: the email one.
        expect(screen.getAllByRole("switch")).toHaveLength(NOTIFICATION_TYPES.length);
        expect(screen.queryByLabelText(/dentro de Céluma:/i)).toBeNull();
        expect(screen.queryByText(/Desactivar notificaciones internas/i)).toBeNull();
    });

    it("shows no delivery status, attempts, error code or resend control", async () => {
        await renderLoaded();

        for (const forbidden of [
            /reenviar/i,
            /pendiente de envío/i,
            /intentos/i,
            /código de error/i,
            /estado de entrega/i,
        ]) {
            expect(screen.queryByText(forbidden)).toBeNull();
        }
        expect(screen.queryByRole("button", { name: /reenviar/i })).toBeNull();
    });

    it("shows no email address", async () => {
        await renderLoaded();

        expect(document.body.textContent).not.toMatch(/@/);
    });

    it("starts no polling interval", async () => {
        // The Block C rule, asserted from the surface a user actually opens.
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
        mockedGet.mockResolvedValue({ preferences: fullList() });

        render(<NotificationPreferencesSection />);
        await waitFor(() => expect(mockedGet).toHaveBeenCalled());

        expect(
            setIntervalSpy.mock.calls.filter(([, delay]) => Number(delay) >= 1000),
        ).toEqual([]);
        setIntervalSpy.mockRestore();
    });

    it("never calls an inbox endpoint", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        await renderLoaded();

        await user.click(switchFor("REPORT_PUBLISHED"));
        await user.click(saveButton());
        await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());

        // Both preference calls are mocked at the service boundary, so any
        // raw fetch here would be a second, unaccounted-for request.
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
