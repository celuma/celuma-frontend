/**
 * Céluma 1.3 Phase 3, Block C — Notification Center visual scenarios.
 *
 * Kept in its own module beside the report harness rather than folded into
 * main.tsx: the two share only the Vite entry point, and mixing an
 * authenticated-app scenario into the report-fixture switch would make the
 * report goldens harder to reason about.
 *
 * The pattern is the one main.tsx's `?internal_render=1` mode already
 * established — stub `window.fetch` synchronously, before React mounts, so the
 * real components run their real code paths against fixed data with no backend.
 * Nothing here is bundled into the production app: vite.harness.config.ts is the
 * only config that serves this directory, and eslint.config.js ignores it.
 *
 * **Determinism.** Every fixture timestamp is far enough in the past that
 * formatNotificationRelativeTime falls through to the absolute date, so a
 * snapshot does not change as wall-clock time advances. The spec pins
 * `timezoneId: "UTC"` so the absolute rendering is machine-independent.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfigProvider } from "antd";
import SidebarCeluma from "../../src/components/ui/sidebar_menu";
import NotificationsPage from "../../src/pages/notifications";
import { NotificationProvider } from "../../src/providers/notification_provider";
import type { NotificationListItem } from "../../src/models/notification";

const OLD = "2020-01-15T09:30:00";
const OLDER = "2020-01-14T17:05:00";

/** Synthetic. No real patient name, no diagnosis, no clinical content. */
const FIXTURE_ITEMS: NotificationListItem[] = [
    {
        recipient_id: "r1",
        notification_id: "n1",
        type: "REPORT_PUBLISHED",
        severity: "INFO",
        title: "Reporte publicado — Orden ORD-2026-00152",
        body: "El reporte fue publicado y firmado por Dra. Ejemplo.",
        resource_type: "report",
        resource_id: "res-1",
        status: "UNREAD",
        created_at: OLD,
        read_at: null,
    },
    {
        recipient_id: "r2",
        notification_id: "n2",
        type: "REPORT_SUBMITTED",
        severity: "INFO",
        title: "Reporte listo para revisión — Orden ORD-2026-00151",
        body: "El reporte fue enviado a revisión por Dr. Ejemplo.",
        resource_type: "report",
        resource_id: "res-2",
        status: "UNREAD",
        created_at: OLD,
        read_at: null,
    },
    {
        recipient_id: "r3",
        notification_id: "n3",
        type: "ASSIGNMENT_ADDED",
        severity: "INFO",
        title: "Nueva asignación — Orden ORD-2026-00150",
        body: "Dr. Ejemplo te asignó a esta orden.",
        resource_type: "order",
        resource_id: "res-3",
        status: "READ",
        created_at: OLDER,
        read_at: OLDER,
    },
    {
        recipient_id: "r4",
        notification_id: "n4",
        type: "SAMPLE_STATUS_CHANGED",
        severity: "INFO",
        title: "Muestra actualizada — Orden ORD-2026-00149",
        body: "La muestra MTR-0031 cambió a estado Lista.",
        resource_type: "sample",
        resource_id: "res-4",
        status: "READ",
        created_at: OLDER,
        read_at: OLDER,
    },
    {
        recipient_id: "r5",
        notification_id: "n5",
        type: "REPORT_PDF_READY",
        severity: "INFO",
        title: "PDF oficial listo — Orden ORD-2026-00148",
        body: null,
        resource_type: "report",
        resource_id: "res-5",
        status: "READ",
        created_at: OLDER,
        read_at: OLDER,
    },
];

const PROFILE = {
    id: "u1",
    email: "demo@example.test",
    full_name: "Usuario de Prueba",
    roles: ["pathologist"],
    permissions: ["lab:read", "reports:read"],
    tenant_id: "t1",
    branch_ids: [],
};

export interface NotificationScenario {
    unreadCount: number;
    items: NotificationListItem[];
    /** `error` answers 500; `loading` never resolves. */
    listBehaviour?: "ok" | "error" | "loading";
}

const SCENARIOS: Record<string, NotificationScenario> = {
    "bell-zero": { unreadCount: 0, items: [] },
    "bell-nine-plus": { unreadCount: 12, items: FIXTURE_ITEMS },
    "popover-mixed": { unreadCount: 2, items: FIXTURE_ITEMS },
    "history-populated": { unreadCount: 2, items: FIXTURE_ITEMS },
    "history-empty": { unreadCount: 0, items: [] },
    "history-loading": { unreadCount: 2, items: [], listBehaviour: "loading" },
    "history-error": { unreadCount: 2, items: [], listBehaviour: "error" },
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/**
 * Installs the stub. Called during render (not in an effect) for the same
 * reason InternalRenderHarness does: child components fire their own mount-time
 * fetches before a parent's effect would run.
 */
function installFetchStub(scenario: NotificationScenario) {
    const w = window as unknown as { __notificationStubInstalled?: boolean };
    if (w.__notificationStubInstalled) return;
    w.__notificationStubInstalled = true;

    // useUserProfile short-circuits to "unauthenticated" when no token is
    // stored, and the provider only polls once auth resolves to
    // "authenticated" — so without this the badge would always render zero.
    localStorage.setItem("auth_token", "Bearer harness-fake-token");

    window.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/auth/me")) return jsonResponse(PROFILE);

        if (url.includes("/notifications/unread-count")) {
            return jsonResponse({ unread_count: scenario.unreadCount });
        }

        if (url.includes("/notifications")) {
            if (scenario.listBehaviour === "loading") return new Promise<Response>(() => {});
            if (scenario.listBehaviour === "error") {
                return jsonResponse({ detail: "boom" }, 500);
            }
            return jsonResponse({ items: scenario.items, next_cursor: null });
        }

        return jsonResponse({});
    }) as typeof window.fetch;
}

/** The same antd theme main.tsx applies, so the harness is not off-brand. */
function Themed({ children }: { children: React.ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: "#49b6ad",
                    colorLink: "#49b6ad",
                    colorLinkHover: "#3da8a0",
                    borderRadius: 8,
                },
                components: {
                    Button: { borderRadius: 8 },
                    Menu: { darkItemBg: "transparent", darkItemSelectedBg: "rgba(255,255,255,0.22)" },
                },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function NotificationHarness({ scenarioKey }: { scenarioKey: string }) {
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) {
        return <div data-error="unknown-scenario">Escenario desconocido: {scenarioKey}</div>;
    }
    installFetchStub(scenario);

    const historyScenario = scenarioKey.startsWith("history-");

    return (
        <Themed>
            <MemoryRouter initialEntries={["/notifications"]}>
                <NotificationProvider>
                    <div id="notification-host" style={{ display: "flex", minHeight: "100vh" }}>
                        {historyScenario ? (
                            <Routes>
                                <Route path="/notifications" element={<NotificationsPage />} />
                            </Routes>
                        ) : (
                            <SidebarCeluma logoSrc={undefined} />
                        )}
                    </div>
                </NotificationProvider>
            </MemoryRouter>
        </Themed>
    );
}
