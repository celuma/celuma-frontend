/**
 * Céluma 1.3 Phase 4, Block F — tenant usage dashboard visual scenarios.
 *
 * Same shape as notification_scenarios.tsx: its own module beside the report
 * harness, stubbing `window.fetch` synchronously before React mounts so the
 * real page runs its real code paths against fixed data with no backend.
 * Nothing here is bundled into the production app — vite.harness.config.ts is
 * the only config that serves this directory, and eslint.config.js ignores it.
 *
 * Why real-browser goldens for this page at all: the states that matter most
 * here are *the absence of things* — no bar when there is no denominator, no
 * fabricated `0 B`, a bar that stops at 100% while the number reads 123% — and
 * jsdom cannot show a width, a colour or a layout that wraps. The unit suites
 * assert the text and the ARIA contract; these protect what the administrator
 * actually sees, including the two-column-to-single-column responsive rule.
 *
 * **Determinism.** Every timestamp is fixed and far in the past, and the spec
 * pins `timezoneId: "UTC"` so the rendered date is machine-independent.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfigProvider } from "antd";
import TenantUsage from "../../src/pages/tenant_usage";
import type { TenantUsageResponse } from "../../src/models/tenant_usage";

const RUN_STARTED = "2020-01-15T09:30:00";
const RUN_COMPLETED = "2020-01-15T09:30:04";

const PROFILE = {
    id: "u1",
    email: "demo@example.test",
    full_name: "Usuario de Prueba",
    roles: ["admin"],
    permissions: ["lab:read", "admin:manage_tenant"],
    tenant_id: "t1",
    branch_ids: [],
};

/** A healthy, comfortably-under-limit tenant. Every scenario varies from this. */
const BASE: TenantUsageResponse = {
    storage: {
        initialized: true,
        billable_bytes: 127_900_000,
        limit_bytes: 1_000_000_000_000,
        unlimited: false,
        usage_ratio: 0.1234,
        usage_percent: 12.34,
    },
    users: {
        registered_users: 21,
        active_internal_users: 8,
        active_physician_portal_users: 14,
        user_limit: 10,
        unlimited: false,
        usage_ratio: 0.8,
        usage_percent: 80,
    },
    reconciliation: {
        has_run: true,
        integrity_status: "HEALTHY",
        status: "SUCCEEDED",
        started_at: RUN_STARTED,
        completed_at: RUN_COMPLETED,
        expected_storage_bytes: 127_900_000,
        actual_storage_bytes: 127_900_000,
        difference_bytes: 0,
        repaired: false,
        objects_checked: 142,
        orphans_found: 0,
        missing_objects_found: 0,
        metadata_mismatches_found: 0,
        error_code: null,
    },
};

export interface UsageScenario {
    usage: TenantUsageResponse;
    /** `error` answers 500; `loading` never resolves, pinning the skeleton. */
    behaviour?: "ok" | "error" | "loading";
}

const SCENARIOS: Record<string, UsageScenario> = {
    healthy: { usage: BASE },

    /** No usage row and no run: the state that must never render "0 B" / "0%". */
    uninitialized: {
        usage: {
            ...BASE,
            storage: {
                initialized: false,
                billable_bytes: null,
                limit_bytes: 1_000_000_000_000,
                unlimited: false,
                usage_ratio: null,
                usage_percent: null,
            },
            reconciliation: {
                ...BASE.reconciliation,
                has_run: false,
                integrity_status: "NOT_RUN",
                status: null,
                started_at: null,
                completed_at: null,
                expected_storage_bytes: null,
                actual_storage_bytes: null,
                difference_bytes: null,
                repaired: null,
                objects_checked: null,
                orphans_found: null,
                missing_objects_found: null,
                metadata_mismatches_found: null,
            },
        },
    },

    /** No limits configured anywhere: absolute numbers, no bars. */
    unlimited: {
        usage: {
            ...BASE,
            storage: {
                ...BASE.storage,
                limit_bytes: null,
                unlimited: true,
                usage_ratio: null,
                usage_percent: null,
            },
            users: {
                ...BASE.users,
                user_limit: null,
                unlimited: true,
                usage_ratio: null,
                usage_percent: null,
            },
        },
    },

    /** Both metrics past their limit, with all three findings present. */
    "over-limit": {
        usage: {
            storage: {
                initialized: true,
                billable_bytes: 1_230_000_000_000,
                limit_bytes: 1_000_000_000_000,
                unlimited: false,
                usage_ratio: 1.23,
                usage_percent: 123,
            },
            users: {
                registered_users: 26,
                active_internal_users: 12,
                active_physician_portal_users: 14,
                user_limit: 10,
                unlimited: false,
                usage_ratio: 1.2,
                usage_percent: 120,
            },
            reconciliation: {
                ...BASE.reconciliation,
                integrity_status: "WARNING",
                orphans_found: 3,
                missing_objects_found: 1,
                metadata_mismatches_found: 2,
            },
        },
    },

    running: {
        usage: {
            ...BASE,
            reconciliation: {
                ...BASE.reconciliation,
                integrity_status: "RUNNING",
                status: "RUNNING",
                completed_at: null,
                repaired: null,
                objects_checked: null,
                orphans_found: null,
                missing_objects_found: null,
                metadata_mismatches_found: null,
            },
        },
    },

    /** Succeeded, but the integrity half never ran — informational, not green. */
    "accounting-only": {
        usage: {
            ...BASE,
            reconciliation: {
                ...BASE.reconciliation,
                integrity_status: "ACCOUNTING_ONLY",
                objects_checked: null,
                orphans_found: null,
                missing_objects_found: null,
                metadata_mismatches_found: null,
            },
        },
    },

    failed: {
        usage: {
            ...BASE,
            reconciliation: {
                ...BASE.reconciliation,
                integrity_status: "FAILED",
                status: "FAILED",
                objects_checked: null,
                orphans_found: null,
                missing_objects_found: null,
                metadata_mismatches_found: null,
                error_code: "s3_access_denied",
            },
        },
    },

    loading: { usage: BASE, behaviour: "loading" },
    error: { usage: BASE, behaviour: "error" },
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/**
 * Installs the stub during render (not in an effect), for the same reason the
 * notification harness does: the page fires its own mount-time fetch before a
 * parent's effect would run.
 */
function installFetchStub(scenario: UsageScenario) {
    const w = window as unknown as { __usageStubInstalled?: boolean };
    if (w.__usageStubInstalled) return;
    w.__usageStubInstalled = true;

    localStorage.setItem("auth_token", "Bearer harness-fake-token");

    window.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/auth/me")) return jsonResponse(PROFILE);

        if (url.includes("/tenant/usage")) {
            if (scenario.behaviour === "loading") return new Promise<Response>(() => {});
            if (scenario.behaviour === "error") return jsonResponse({ detail: "boom" }, 500);
            return jsonResponse(scenario.usage);
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

export function UsageHarness({ scenarioKey }: { scenarioKey: string }) {
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) {
        return <div data-error="unknown-scenario">Escenario desconocido: {scenarioKey}</div>;
    }
    installFetchStub(scenario);

    return (
        <Themed>
            <MemoryRouter initialEntries={["/config/usage"]}>
                <div id="usage-host" style={{ minHeight: "100vh", background: "#fbf6ec" }}>
                    <Routes>
                        <Route path="/config/usage" element={<TenantUsage embedded />} />
                    </Routes>
                </div>
            </MemoryRouter>
        </Themed>
    );
}
