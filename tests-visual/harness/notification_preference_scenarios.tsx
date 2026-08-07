/**
 * Céluma 1.3 Phase 3, Block D — notification-preference visual scenarios.
 *
 * A third harness module beside the report fixtures and Block C's
 * `?notifications=<scenario>` mode, following the same pattern rather than
 * extending Block C's file: mixing the preferences section into the
 * Notification Center's scenario switch would put the two features' goldens
 * on one shared code path, and a change to either could then move the other's
 * snapshots.
 *
 * `window.fetch` is stubbed synchronously, before React mounts, exactly as
 * the `?internal_render=1` mode established — so the real component runs its
 * real code path against fixed data with no backend. Nothing here is bundled
 * into the production app: `vite.harness.config.ts` is the only config that
 * serves this directory, and eslint ignores it.
 *
 * Determinism: there is no timestamp on screen (the section renders
 * `is_explicit`, not `updated_at`), and no relative time, so these snapshots
 * do not drift as wall-clock time advances.
 */
import { ConfigProvider } from "antd";
import { MemoryRouter } from "react-router-dom";
import NotificationPreferencesSection from "../../src/components/ui/notification_preferences_section";
import Profile from "../../src/pages/profile";
import type { NotificationPreferenceItem } from "../../src/models/notification_preference";

/** Synthetic. No real user, no clinical content, no address on screen. */
const PROFILE = {
    id: "u1",
    email: "demo@example.test",
    username: "demo",
    full_name: "Usuario de Prueba",
    // Deliberately not a reviewer: the signature card would add a second
    // fetch and a second card to every preference golden.
    roles: ["pathologist"],
    permissions: ["lab:read"],
    tenant_id: "t1",
};

function preference(
    notification_type: string,
    overrides: Partial<NotificationPreferenceItem> = {},
): NotificationPreferenceItem {
    return {
        notification_type: notification_type as NotificationPreferenceItem["notification_type"],
        in_app_enabled: true,
        email_enabled: true,
        email_supported: true,
        is_explicit: false,
        updated_at: null,
        ...overrides,
    };
}

/** Every type at its policy default, and no stored row anywhere. */
const DEFAULTS: NotificationPreferenceItem[] = [
    preference("REPORT_SUBMITTED"),
    preference("REPORT_PDF_READY"),
    preference("REPORT_PUBLISHED"),
    preference("REPORT_RETRACTED"),
    preference("ASSIGNMENT_ADDED"),
    // The one in-app-only type: switch disabled, with its explanation.
    preference("SAMPLE_STATUS_CHANGED", { email_supported: false, email_enabled: false }),
];

/** Two explicit overrides among the defaults, so both badges are visible. */
const MIXED: NotificationPreferenceItem[] = DEFAULTS.map((item) => {
    if (item.notification_type === "REPORT_SUBMITTED") {
        return { ...item, email_enabled: false, is_explicit: true, updated_at: "2026-08-06T12:00:00" };
    }
    if (item.notification_type === "REPORT_PUBLISHED") {
        return { ...item, email_enabled: true, is_explicit: true, updated_at: "2026-08-06T12:00:00" };
    }
    return item;
});

export interface PreferenceScenario {
    preferences: NotificationPreferenceItem[];
    /** `error` answers 500; `loading` never resolves. */
    getBehaviour?: "ok" | "error" | "loading";
    /** `hang` never resolves, so the saving state is screenshot-able. */
    putBehaviour?: "ok" | "hang";
    /** Renders the whole Profile page in its embedded (config-panel) mode. */
    embeddedProfile?: boolean;
}

const SCENARIOS: Record<string, PreferenceScenario> = {
    defaults: { preferences: DEFAULTS },
    mixed: { preferences: MIXED },
    loading: { preferences: [], getBehaviour: "loading" },
    error: { preferences: [], getBehaviour: "error" },
    saving: { preferences: DEFAULTS, putBehaviour: "hang" },
    embedded: { preferences: DEFAULTS, embeddedProfile: true },
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/**
 * Installed during render, not in an effect: the section fires its fetch in
 * its own mount-time effect, which as the child runs before a parent's would.
 */
function installFetchStub(scenario: PreferenceScenario) {
    const w = window as unknown as { __preferenceStubInstalled?: boolean };
    if (w.__preferenceStubInstalled) return;
    w.__preferenceStubInstalled = true;

    // The hook refuses to fetch without a stored token — the same gate the
    // Notification Center's provider uses.
    localStorage.setItem("auth_token", "Bearer harness-fake-token");

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/notification-preferences")) {
            if ((init?.method ?? "GET").toUpperCase() === "PUT") {
                if (scenario.putBehaviour === "hang") return new Promise<Response>(() => {});
                return jsonResponse({ preferences: scenario.preferences });
            }
            if (scenario.getBehaviour === "loading") return new Promise<Response>(() => {});
            if (scenario.getBehaviour === "error") return jsonResponse({ detail: "boom" }, 500);
            return jsonResponse({ preferences: scenario.preferences });
        }

        if (url.includes("/auth/me")) return jsonResponse(PROFILE);

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

export function NotificationPreferenceHarness({ scenarioKey }: { scenarioKey: string }) {
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) {
        return <div data-error="unknown-scenario">Escenario desconocido: {scenarioKey}</div>;
    }
    installFetchStub(scenario);

    return (
        <Themed>
            <MemoryRouter initialEntries={["/config/profile"]}>
                <div
                    id="preference-host"
                    style={{ padding: 24, background: "#fbf6ec", minHeight: "100vh" }}
                >
                    {scenario.embeddedProfile ? (
                        <Profile embedded />
                    ) : (
                        <NotificationPreferencesSection />
                    )}
                </div>
            </MemoryRouter>
        </Themed>
    );
}
