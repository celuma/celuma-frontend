/**
 * Céluma 1.3, Phase 3, Block C — the bell, the badge, and the recent surface.
 *
 * The provider is stubbed with an explicit state object so these tests assert
 * presentation and interaction, not polling (which
 * notification_provider.test.tsx owns).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NotificationBell from "../../components/ui/notification_bell";
import { useNotifications } from "../../providers/notification_context";
import type { NotificationState } from "../../providers/notification_context";
import type { NotificationListItem } from "../../models/notification";

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

const refreshRecentItems = vi.fn().mockResolvedValue(undefined);
const markRead = vi.fn().mockResolvedValue(undefined);
const markAllRead = vi.fn().mockResolvedValue(3);
const refreshUnreadCount = vi.fn().mockResolvedValue(undefined);

function withState(overrides: Partial<NotificationState> = {}) {
    mockedUseNotifications.mockReturnValue({
        unreadCount: 0,
        recentItems: [],
        countLoading: false,
        listLoading: false,
        error: null,
        countStale: false,
        refreshUnreadCount,
        refreshRecentItems,
        markRead,
        markAllRead,
        ...overrides,
    });
}

function renderBell(props: { variant?: "sidebar" | "floating" } = {}) {
    return render(
        <MemoryRouter>
            <NotificationBell {...props} />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    withState();
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

describe("badge", () => {
    it("shows no badge at zero", () => {
        withState({ unreadCount: 0 });
        renderBell();

        // No bare "0" badge anywhere in Céluma.
        expect(screen.queryByText("0")).toBeNull();
        expect(screen.getByLabelText("Notificaciones, ninguna sin leer")).toBeTruthy();
    });

    it.each([1, 4, 9])("shows %i exactly", (count) => {
        withState({ unreadCount: count });
        renderBell();

        expect(screen.getByText(String(count))).toBeTruthy();
    });

    it.each([10, 25, 999])("shows 9+ for %i", (count) => {
        withState({ unreadCount: count });
        renderBell();

        expect(screen.getByText("9+")).toBeTruthy();
        expect(screen.queryByText(String(count))).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("accessibility", () => {
    it("names the bell with the exact count, not the capped badge text", () => {
        withState({ unreadCount: 42 });
        renderBell();

        // The badge reads "9+"; the accessible name still says 42.
        expect(screen.getByLabelText("Notificaciones, 42 sin leer")).toBeTruthy();
    });

    it("uses the singular at one", () => {
        withState({ unreadCount: 1 });
        renderBell();

        expect(screen.getByLabelText("Notificaciones, 1 sin leer")).toBeTruthy();
    });

    it("announces the count in a polite live region", () => {
        withState({ unreadCount: 3 });
        const { container } = renderBell();

        const live = container.querySelector('[aria-live="polite"]');
        expect(live?.textContent).toBe("Notificaciones, 3 sin leer");
    });

    it("declares the popup relationship and its expanded state", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 2 });
        renderBell();

        const bell = screen.getByLabelText("Notificaciones, 2 sin leer");
        expect(bell.getAttribute("aria-haspopup")).toBe("dialog");
        expect(bell.getAttribute("aria-expanded")).toBe("false");

        await user.click(bell);
        expect(bell.getAttribute("aria-expanded")).toBe("true");
    });

    it("closes on Escape and returns focus to the bell", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 1, recentItems: [item()] });
        renderBell();

        const bell = screen.getByLabelText("Notificaciones, 1 sin leer");
        await user.click(bell);
        await screen.findByText("Ver todas");

        await user.keyboard("{Escape}");

        await waitFor(() => expect(bell.getAttribute("aria-expanded")).toBe("false"));
        await waitFor(() => expect(document.activeElement).toBe(bell));
    });

    it("gives every row an accessible name carrying the unread state in words", async () => {
        const user = userEvent.setup();
        withState({
            unreadCount: 1,
            recentItems: [item(), item({ recipient_id: "r2", status: "READ", read_at: "x" })],
        });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 1 sin leer"));
        await screen.findByText("Ver todas");

        // Unread must never be signalled by colour alone: the state is the first
        // thing in each row's accessible name.
        expect(screen.getByLabelText(/^Sin leer\./)).toBeTruthy();
        expect(screen.getByLabelText(/^Leída\./)).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Opening the surface
// ---------------------------------------------------------------------------

describe("opening the recent surface", () => {
    it("loads recent items on open", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 2 });
        renderBell();

        expect(refreshRecentItems).not.toHaveBeenCalled();
        await user.click(screen.getByLabelText("Notificaciones, 2 sin leer"));

        expect(refreshRecentItems).toHaveBeenCalledTimes(1);
    });

    it("does NOT mark anything read on open", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 2, recentItems: [item(), item({ recipient_id: "r2" })] });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 2 sin leer"));
        await screen.findByText("Ver todas");

        // Not the top item, not any item — scrolling past a notification is not
        // acknowledging it.
        expect(markRead).not.toHaveBeenCalled();
        expect(markAllRead).not.toHaveBeenCalled();
    });

    it("renders the frozen backend title and body verbatim", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 1, recentItems: [item()] });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 1 sin leer"));

        expect(await screen.findByText("Reporte publicado — Orden ORD-2026-00152")).toBeTruthy();
        expect(
            screen.getByText("El reporte fue publicado y firmado por Dra. Martínez."),
        ).toBeTruthy();
    });

    it("shows the empty state when the inbox is empty", async () => {
        const user = userEvent.setup();
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, ninguna sin leer"));

        expect(await screen.findByText("No tienes notificaciones.")).toBeTruthy();
    });

    it("shows the error state with a retry control", async () => {
        const user = userEvent.setup();
        withState({ error: new Error("boom") });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, ninguna sin leer"));

        expect(await screen.findByText("No fue posible cargar las notificaciones.")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Reintentar" }));
        expect(refreshRecentItems).toHaveBeenCalled();
    });

    it("shows a stale-count notice inside the surface rather than a toast", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 5, countStale: true });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 5 sin leer"));

        expect(await screen.findByRole("status")).toBeTruthy();
        // The last known count is still on screen.
        expect(screen.getByText("5")).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

describe("item interaction", () => {
    it("marks an unread item read and navigates to its resource", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 1, recentItems: [item()] });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 1 sin leer"));
        const row = await screen.findByLabelText(/^Sin leer\. Reporte publicado\./);
        await user.click(row);

        expect(markRead).toHaveBeenCalledWith("r1");
        expect(navigateMock).toHaveBeenCalledWith("/reports/res-1");
    });

    it("does not re-mark an already-read item", async () => {
        const user = userEvent.setup();
        withState({
            unreadCount: 0,
            recentItems: [item({ status: "READ", read_at: "2026-08-04T13:00:00" })],
        });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, ninguna sin leer"));
        await user.click(await screen.findByLabelText(/^Leída\./));

        expect(markRead).not.toHaveBeenCalled();
        expect(navigateMock).toHaveBeenCalledWith("/reports/res-1");
    });

    it("does not navigate for a resource type this build cannot resolve", async () => {
        const user = userEvent.setup();
        withState({
            unreadCount: 1,
            recentItems: [item({ resource_type: "invoice", type: "STORAGE_WARNING_80" })],
        });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 1 sin leer"));
        const row = await screen.findByLabelText(/no se puede abrir/);
        await user.click(row);

        // Marking it read is still a real outcome, so the row is not a dead
        // click — but no route is fabricated.
        expect(markRead).toHaveBeenCalledWith("r1");
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it("navigates to the history page from 'Ver todas'", async () => {
        const user = userEvent.setup();
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, ninguna sin leer"));
        await user.click(await screen.findByRole("button", { name: "Ver todas" }));

        expect(navigateMock).toHaveBeenCalledWith("/notifications");
    });

    it("offers mark-all only when something is unread", async () => {
        const user = userEvent.setup();
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, ninguna sin leer"));
        await screen.findByText("Ver todas");
        expect(screen.queryByRole("button", { name: "Marcar todas como leídas" })).toBeNull();
    });

    it("marks all read from the surface footer", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 3, recentItems: [item()] });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 3 sin leer"));
        await user.click(await screen.findByRole("button", { name: "Marcar todas como leídas" }));

        expect(markAllRead).toHaveBeenCalled();
    });

    it("activates a row from the keyboard", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 1, recentItems: [item()] });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 1 sin leer"));
        const row = await screen.findByLabelText(/^Sin leer\. Reporte publicado\./);
        row.focus();
        await user.keyboard("{Enter}");

        expect(navigateMock).toHaveBeenCalledWith("/reports/res-1");
    });

    it("offers no dismiss, delete, mark-unread or preferences control", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 1, recentItems: [item()] });
        renderBell();

        await user.click(screen.getByLabelText("Notificaciones, 1 sin leer"));
        const panel = (await screen.findByText("Ver todas")).closest("div")!.parentElement!;

        for (const forbidden of [/descartar/i, /eliminar/i, /marcar como no leída/i, /preferencias/i, /correo/i]) {
            expect(within(panel).queryByText(forbidden)).toBeNull();
        }
    });
});

// ---------------------------------------------------------------------------
// Mobile
// ---------------------------------------------------------------------------

describe("mobile variant", () => {
    it("opens a drawer holding the same panel", async () => {
        const user = userEvent.setup();
        withState({ unreadCount: 2, recentItems: [item()] });
        renderBell({ variant: "floating" });

        await user.click(screen.getByLabelText("Notificaciones, 2 sin leer"));

        expect(await screen.findByText("Ver todas")).toBeTruthy();
        expect(screen.getByText("Reporte publicado — Orden ORD-2026-00152")).toBeTruthy();
    });

    it("uses the same single state owner as the desktop variant", () => {
        withState({ unreadCount: 7 });
        renderBell({ variant: "floating" });

        // Both variants read the same context; neither starts its own polling.
        expect(screen.getByLabelText("Notificaciones, 7 sin leer")).toBeTruthy();
        expect(refreshUnreadCount).not.toHaveBeenCalled();
    });
});
