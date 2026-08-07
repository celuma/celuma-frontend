/**
 * Céluma 1.3, Phase 3, Block C — the /notifications history page.
 *
 * Filters, cursor paging, deduplication, mark-one, mark-all-with-filters, and
 * the empty/loading/error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NotificationsPage from "../../pages/notifications";
import * as notificationService from "../../services/notification_service";
import { useNotifications } from "../../providers/notification_context";
import type { NotificationState } from "../../providers/notification_context";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { NotificationListItem, NotificationListResponse } from "../../models/notification";

vi.mock("../../hooks/use_user_profile");
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
    hasPermission: () => true,
    hasRole: () => false,
} as unknown as ReturnType<typeof useUserProfile>);

vi.mock("../../providers/notification_context", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../providers/notification_context")>();
    return { ...actual, useNotifications: vi.fn() };
});
const mockedUseNotifications = vi.mocked(useNotifications);

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-router-dom")>();
    return { ...actual, useNavigate: () => navigateMock };
});

const showApiError = vi.fn();
const showSuccess = vi.fn();
vi.mock("../../lib/celuma_feedback", () => ({
    showCelumaApiError: (...args: unknown[]) => showApiError(...args),
    showCelumaSuccess: (...args: unknown[]) => showSuccess(...args),
    showCelumaWarning: vi.fn(),
    showCelumaPermissionDenied: vi.fn(),
    registerCelumaNotification: vi.fn(),
}));

function item(overrides: Partial<NotificationListItem> = {}): NotificationListItem {
    return {
        recipient_id: "r1",
        notification_id: "n1",
        type: "REPORT_PUBLISHED",
        severity: "INFO",
        title: "Reporte publicado — Orden ORD-2026-00152",
        body: "El reporte fue publicado y firmado por Dra. Martínez.",
        resource_type: "report",
        resource_id: "res-1",
        status: "UNREAD",
        created_at: "2026-08-04T12:00:00",
        read_at: null,
        ...overrides,
    };
}

const markRead = vi.fn().mockResolvedValue(undefined);
const markAllRead = vi.fn().mockResolvedValue(4);
const refreshRecentItems = vi.fn().mockResolvedValue(undefined);

function withProviderState(overrides: Partial<NotificationState> = {}) {
    mockedUseNotifications.mockReturnValue({
        unreadCount: 4,
        recentItems: [],
        countLoading: false,
        listLoading: false,
        error: null,
        countStale: false,
        refreshUnreadCount: vi.fn().mockResolvedValue(undefined),
        refreshRecentItems,
        markRead,
        markAllRead,
        ...overrides,
    });
}

let listSpy: ReturnType<typeof vi.spyOn>;

function page(response: NotificationListResponse): NotificationListResponse {
    return response;
}

/**
 * Picks a type in the multi-select. The floating caption itself carries
 * `pointer-events: none` (it is decoration that slides over the field), so the
 * combobox has to be opened directly.
 */
async function selectType(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByTitle(label));
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/notifications"]}>
            <NotificationsPage />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    withProviderState();
    listSpy = vi
        .spyOn(notificationService, "listNotifications")
        .mockResolvedValue(page({ items: [item()], next_cursor: null }));
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

describe("initial load", () => {
    it("fetches the first page and renders it", async () => {
        renderPage();

        expect(await screen.findByText("Reporte publicado — Orden ORD-2026-00152")).toBeTruthy();
        expect(listSpy).toHaveBeenCalledWith(
            expect.objectContaining({ cursor: null, limit: 20, unreadOnly: false, types: [] }),
        );
    });

    it("shows a loading skeleton before the first page arrives", async () => {
        listSpy.mockReturnValue(new Promise(() => {}));

        renderPage();

        expect(await screen.findByTestId("notification-list-skeleton")).toBeTruthy();
    });

    it("summarises the unread count from the shared provider", async () => {
        renderPage();

        expect(await screen.findByText("Tienes 4 notificaciones sin leer.")).toBeTruthy();
    });

    it("does not start its own polling — it consumes the one provider", async () => {
        vi.useFakeTimers();
        renderPage();
        await vi.advanceTimersByTimeAsync(120_000);
        vi.useRealTimers();

        // One initial fetch only; the page never sets an interval.
        expect(listSpy).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("filters", () => {
    it("re-queries with unread_only when the toggle is turned on", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        await user.click(screen.getByLabelText("Solo sin leer"));

        await waitFor(() =>
            expect(listSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({ unreadOnly: true, cursor: null }),
            ),
        );
    });

    it("re-queries with the selected types", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        await selectType(user, "Reporte publicado");

        await waitFor(() =>
            expect(listSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({ types: ["REPORT_PUBLISHED"], cursor: null }),
            ),
        );
    });

    it("clears accumulated items and the cursor when a filter changes", async () => {
        const user = userEvent.setup();
        listSpy.mockResolvedValueOnce(
            page({ items: [item({ recipient_id: "old", title: "Antigua" })], next_cursor: "C1" }),
        );
        renderPage();
        await screen.findByText("Antigua");

        listSpy.mockResolvedValue(page({ items: [item({ recipient_id: "new", title: "Nueva" })], next_cursor: null }));
        await user.click(screen.getByLabelText("Solo sin leer"));

        await screen.findByText("Nueva");
        // Paging into a differently filtered result set is exactly the bug the
        // reset prevents.
        expect(screen.queryByText("Antigua")).toBeNull();
        expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null }));
    });

    it("resets both filters from 'Limpiar filtros'", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        await user.click(screen.getByLabelText("Solo sin leer"));
        await screen.findByRole("button", { name: "Limpiar filtros" });
        await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

        await waitFor(() =>
            expect(listSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({ unreadOnly: false, types: [] }),
            ),
        );
    });

    it("offers no severity filter and no sort control", async () => {
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        expect(screen.queryByText(/severidad/i)).toBeNull();
        expect(screen.queryByText(/ordenar/i)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

describe("cursor paging", () => {
    it("shows 'Cargar más' only while a next cursor exists", async () => {
        listSpy.mockResolvedValueOnce(page({ items: [item()], next_cursor: "C1" }));
        renderPage();

        expect(await screen.findByRole("button", { name: "Cargar más" })).toBeTruthy();
    });

    it("hides 'Cargar más' on the last page", async () => {
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
    });

    it("passes the opaque cursor back verbatim and appends the page", async () => {
        const user = userEvent.setup();
        listSpy.mockResolvedValueOnce(
            page({ items: [item({ recipient_id: "a", title: "Primera" })], next_cursor: "OPAQUE==" }),
        );
        renderPage();
        await screen.findByText("Primera");

        listSpy.mockResolvedValueOnce(
            page({ items: [item({ recipient_id: "b", title: "Segunda" })], next_cursor: null }),
        );
        await user.click(screen.getByRole("button", { name: "Cargar más" }));

        expect(await screen.findByText("Segunda")).toBeTruthy();
        expect(screen.getByText("Primera")).toBeTruthy();
        expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "OPAQUE==" }));
    });

    it("does not render a row twice when a page repeats one", async () => {
        const user = userEvent.setup();
        listSpy.mockResolvedValueOnce(
            page({ items: [item({ recipient_id: "a", title: "Repetida" })], next_cursor: "C1" }),
        );
        renderPage();
        await screen.findByText("Repetida");

        listSpy.mockResolvedValueOnce(
            page({
                items: [
                    item({ recipient_id: "a", title: "Repetida" }),
                    item({ recipient_id: "b", title: "Nueva" }),
                ],
                next_cursor: null,
            }),
        );
        await user.click(screen.getByRole("button", { name: "Cargar más" }));

        await screen.findByText("Nueva");
        expect(screen.getAllByText("Repetida")).toHaveLength(1);
    });

    it("keeps visible results and reports the failure when loading more fails", async () => {
        const user = userEvent.setup();
        listSpy.mockResolvedValueOnce(
            page({ items: [item({ title: "Visible" })], next_cursor: "C1" }),
        );
        renderPage();
        await screen.findByText("Visible");

        listSpy.mockRejectedValueOnce(new Error("boom"));
        await user.click(screen.getByRole("button", { name: "Cargar más" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "No fue posible cargar más notificaciones.",
        );
        // The list is not blanked out by a failed "load more".
        expect(screen.getByText("Visible")).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Read actions
// ---------------------------------------------------------------------------

describe("mark one read", () => {
    it("marks an unread row read, telling the provider it counted toward the badge", async () => {
        const user = userEvent.setup();
        renderPage();
        const row = await screen.findByLabelText(/^Sin leer\./);

        await user.click(row);

        // The explicit `true` matters: this page's rows are a filtered set the
        // provider never loaded and cannot derive the flag from.
        expect(markRead).toHaveBeenCalledWith("r1", true);
        expect(navigateMock).toHaveBeenCalledWith("/reports/res-1");
    });

    it("updates the row optimistically", async () => {
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByLabelText(/^Sin leer\./));

        expect(await screen.findByLabelText(/^Leída\./)).toBeTruthy();
    });

    it("restores the row and reports the failure when mark-read fails", async () => {
        const user = userEvent.setup();
        markRead.mockRejectedValueOnce(new Error("No fue posible actualizar la notificación."));
        renderPage();

        await user.click(await screen.findByLabelText(/^Sin leer\./));

        await waitFor(() => expect(showApiError).toHaveBeenCalled());
        expect(await screen.findByLabelText(/^Sin leer\./)).toBeTruthy();
    });

    it("does not navigate for an unsupported resource type", async () => {
        const user = userEvent.setup();
        listSpy.mockResolvedValue(
            page({ items: [item({ resource_type: "invoice" })], next_cursor: null }),
        );
        renderPage();

        await user.click(await screen.findByLabelText(/no se puede abrir/));

        expect(navigateMock).not.toHaveBeenCalled();
    });

    it("renders an unknown notification type with a neutral label, keeping the backend copy", async () => {
        listSpy.mockResolvedValue(
            page({
                items: [item({ type: "STORAGE_WARNING_80", title: "Aviso de almacenamiento" })],
                next_cursor: null,
            }),
        );
        renderPage();

        // The whole list still renders; only the chip degrades.
        expect(await screen.findByText("Aviso de almacenamiento")).toBeTruthy();
        expect(screen.getByText("Notificación")).toBeTruthy();
    });
});

describe("mark all read", () => {
    it("narrows to the active type filters and never sends unread_only", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        await selectType(user, "Reporte publicado");
        await waitFor(() =>
            expect(listSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({ types: ["REPORT_PUBLISHED"] }),
            ),
        );

        await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));

        expect(markAllRead).toHaveBeenCalledWith({ types: ["REPORT_PUBLISHED"] });
        expect(markAllRead.mock.calls[0][0]).not.toHaveProperty("unreadOnly");
    });

    it("passes no type filter when none is selected", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));

        expect(markAllRead).toHaveBeenCalledWith({ types: undefined });
    });

    it("reports success in Spanish and preserves the current filters", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));

        await waitFor(() =>
            expect(showSuccess).toHaveBeenCalledWith("4 notificaciones marcadas como leídas."),
        );
        expect(screen.getByLabelText("Solo sin leer")).toBeTruthy();
    });

    it("updates the visible rows to read", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByLabelText(/^Sin leer\./);

        await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));

        expect(await screen.findByLabelText(/^Leída\./)).toBeTruthy();
    });

    it("is hidden when nothing is unread", async () => {
        withProviderState({ unreadCount: 0 });
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        expect(screen.queryByRole("button", { name: "Marcar todas como leídas" })).toBeNull();
        expect(screen.getByText("No tienes notificaciones sin leer.")).toBeTruthy();
    });

    it("reports a failure without a confirmation dialog blocking it", async () => {
        const user = userEvent.setup();
        markAllRead.mockRejectedValueOnce(new Error("boom"));
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        // Non-destructive bulk action: no confirm step, matching how Céluma
        // reserves confirmation for destructive operations.
        await user.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));

        await waitFor(() => expect(showApiError).toHaveBeenCalled());
    });
});

// ---------------------------------------------------------------------------
// Empty and error states
// ---------------------------------------------------------------------------

describe("empty and error states", () => {
    it("shows the plain empty state with no filters applied", async () => {
        listSpy.mockResolvedValue(page({ items: [], next_cursor: null }));
        renderPage();

        expect(await screen.findByText("No tienes notificaciones.")).toBeTruthy();
        expect(
            screen.getByText("Los eventos relevantes de tu trabajo aparecerán aquí."),
        ).toBeTruthy();
    });

    it("shows a distinct message when filters matched nothing", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByText("Reporte publicado — Orden ORD-2026-00152");

        listSpy.mockResolvedValue(page({ items: [], next_cursor: null }));
        await user.click(screen.getByLabelText("Solo sin leer"));

        expect(
            await screen.findByText(
                "No hay notificaciones que coincidan con los filtros seleccionados.",
            ),
        ).toBeTruthy();
        expect(screen.queryByText("No tienes notificaciones.")).toBeNull();
    });

    it("shows the error state with a working retry", async () => {
        const user = userEvent.setup();
        listSpy.mockRejectedValueOnce(new Error("boom"));
        renderPage();

        expect(await screen.findByText("No fue posible cargar las notificaciones.")).toBeTruthy();

        listSpy.mockResolvedValue(page({ items: [item({ title: "Recuperada" })], next_cursor: null }));
        await user.click(screen.getByRole("button", { name: "Reintentar" }));

        expect(await screen.findByText("Recuperada")).toBeTruthy();
    });

    it("shows no error for the session-expired sentinel — apiFetch already redirected", async () => {
        listSpy.mockRejectedValueOnce(new Error("Session expired"));
        renderPage();

        await waitFor(() => expect(listSpy).toHaveBeenCalled());
        expect(screen.queryByText("No fue posible cargar las notificaciones.")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Deferred controls
// ---------------------------------------------------------------------------

describe("deferred controls are absent", () => {
    it("offers no dismiss, delete, mark-unread, preferences or email affordance", async () => {
        renderPage();
        const main = await screen.findByText("Reporte publicado — Orden ORD-2026-00152");
        const scope = main.closest("main") ?? document.body;

        for (const forbidden of [
            /descartar/i,
            /eliminar/i,
            /marcar como no leída/i,
            /preferencias/i,
            /correo electrónico/i,
            /reenviar/i,
        ]) {
            expect(within(scope).queryByText(forbidden)).toBeNull();
        }
    });
});
