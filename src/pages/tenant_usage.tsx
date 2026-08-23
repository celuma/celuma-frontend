import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Layout, Skeleton } from "antd";
import { CloudServerOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import PageHeader from "../components/ui/page_header";
import EmptyState from "../components/ui/empty_state";
import CelumaAlert from "../components/ui/celuma_alert";
import Button from "../components/ui/button";
import StorageUsageCard from "../components/usage/storage_usage_card";
import UserUsageCard from "../components/usage/user_usage_card";
import ReconciliationCard from "../components/usage/reconciliation_card";
import { tokens, cardStyle } from "../components/design/tokens";
import {
    getTenantUsage,
    isTenantUsageApiError,
    isTenantUsageTimeoutError,
    reconcileTenantUsage,
    USAGE_RUNNING_POLL_INTERVAL_MS,
} from "../services/tenant_usage_service";
import type { TenantUsageResponse } from "../models/tenant_usage";
import {
    RECONCILIATION_ALREADY_RUNNING,
    RECONCILIATION_STARTED,
    RECONCILIATION_TIMEOUT,
    USAGE_LOAD_ERROR_DESCRIPTION,
    USAGE_LOAD_ERROR_TITLE,
    USAGE_PAGE_SUBTITLE,
    USAGE_PAGE_TITLE,
    USAGE_REFRESH,
    USAGE_RETRY,
    USAGE_STALE_MESSAGE,
    INTEGRITY_STATUS_UI,
    reconciliationErrorMessage,
} from "../lib/usage_ui";
import {
    showCelumaApiError,
    showCelumaSuccess,
    showCelumaWarning,
} from "../lib/celuma_feedback";

interface TenantUsageProps {
    embedded?: boolean;
}

function isSessionExpired(err: unknown): boolean {
    return err instanceof Error && err.message === "Session expired";
}

/**
 * Céluma 1.3, Phase 4, Block F — the tenant usage dashboard (`/config/usage`).
 *
 * Reads `GET /api/v1/tenant/usage` once on mount and renders it as-is. The page
 * owns all three pieces of state this feature has — the usage query, the manual
 * reconciliation, and the temporary poll while a run is in progress — and
 * nothing else consumes them, so there is no provider and no global usage
 * context. A `UsageProvider` for one page would be state with no second reader.
 *
 * ## Refresh policy
 *
 * One fetch on mount, one manual refresh button, and **no permanent poller**.
 * Storage usage changes on clinical writes, not continuously, so an interval
 * would spend requests to re-read a number that did not move. The single
 * exception is `integrity_status === "RUNNING"`: that is the one value expected
 * to change on its own, so it is polled every ~7 s until the status becomes
 * terminal, pausing while the tab is hidden and catching up immediately when it
 * becomes visible again — the same visibility discipline the Notification
 * Center's poll follows.
 *
 * ## What this page deliberately does not do
 *
 * - **No enforcement, anywhere.** Nothing here disables an upload, a user
 *   creation or a report, and no global "over limit" guard exists. Phase 4
 *   measures; it does not block.
 * - **No threshold notifications.** Rendering 95% in an amber card is
 *   presentation. Deciding that 95% is an event worth telling someone about —
 *   and doing it idempotently — is Block G's, and a toast fired from here would
 *   be a second, competing source of that decision.
 * - **No commercial copy.** No plan names, no prices, no "mejora tu plan": the
 *   limits come from the backend and Phase 4 has no plan catalog to link to.
 */
function TenantUsage({ embedded = false }: TenantUsageProps) {
    const navigate = useNavigate();

    /**
     * `null` until the first response lands — never a zeroed placeholder.
     * Seeding `billable_bytes: 0` would render a real "0 B / 0%" for a moment,
     * which is the exact lie the null-preserving contract exists to prevent;
     * loading is a distinct state from zero, and the skeleton says so.
     */
    const [usage, setUsage] = useState<TenantUsageResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [verifying, setVerifying] = useState(false);

    /** False after unmount — every async continuation checks it before setState. */
    const mountedRef = useRef(true);
    /** How many reads are currently open. Only the poll tick consults it. */
    const openReadsRef = useRef(0);
    /**
     * Monotonic id of the most recently *issued* read.
     *
     * Two reads can legitimately overlap — a slow poll tick and the refresh
     * that follows a reconciliation — and they can resolve out of order. Only
     * the newest issued request may write state, otherwise a stale `RUNNING`
     * body landing last would restart polling for a run that already finished.
     */
    const latestReadRef = useRef(0);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    /**
     * The one read path.
     *
     * `silent` is what the poll and the post-reconciliation refresh use: they
     * must not blank the page into a skeleton, and a transient failure must not
     * replace data already on screen with an error — the last known values are
     * more useful than an empty page, and the next tick will correct them.
     *
     * `skipIfBusy` is for the poll tick **and only the poll tick**: another
     * tick's request is already open, and stacking a second one buys nothing.
     * Every other caller is deliberate — the mount, the refresh button, the
     * retry, and the mandatory re-read after a reconciliation — and must never
     * be dropped because a background poll happened to be mid-flight. Making
     * that guard unconditional was a real defect: it could silently swallow the
     * authoritative refresh that the "always re-read after a completed POST"
     * contract depends on.
     */
    const load = useCallback(async (options: { silent?: boolean; skipIfBusy?: boolean } = {}) => {
        const { silent = false, skipIfBusy = false } = options;
        if (skipIfBusy && openReadsRef.current > 0) return;

        const readId = ++latestReadRef.current;
        openReadsRef.current += 1;
        if (!silent) setLoading(true);
        try {
            const data = await getTenantUsage();
            if (!mountedRef.current || readId !== latestReadRef.current) return;
            setUsage(data);
            setError(null);
        } catch (err) {
            if (!mountedRef.current || isSessionExpired(err)) return;
            if (readId !== latestReadRef.current) return;
            // Never fall back to zeros: with no data at all the page shows a
            // recoverable error, and with data on screen it keeps it.
            setError(err instanceof Error ? err : new Error(USAGE_LOAD_ERROR_TITLE));
        } finally {
            openReadsRef.current = Math.max(0, openReadsRef.current - 1);
            if (mountedRef.current && !silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await load({ silent: true });
        if (mountedRef.current) setRefreshing(false);
    }, [load]);

    /**
     * "Verificar ahora" — the manual reconciliation. Never fired automatically:
     * the run HEADs every billable object, and a page load is not a reason to
     * do that.
     *
     * Whatever happens, the dashboard is re-read afterwards. That is not
     * belt-and-braces: even a run that *failed* may have repaired the storage
     * counter in its accounting half before its verification half broke, so the
     * POST's own body is never patched into local state — the GET is the single
     * authoritative read.
     */
    const handleVerify = useCallback(async () => {
        if (verifying) return;
        setVerifying(true);
        try {
            const run = await reconcileTenantUsage();
            if (run.status === "FAILED") {
                // 200, and the run genuinely happened and failed. Not an HTTP
                // error, so it is reported with the run's own sanitized code
                // rather than a generic request failure.
                showCelumaWarning(INTEGRITY_STATUS_UI.FAILED.label, reconciliationErrorMessage(run.error_code));
            } else {
                showCelumaSuccess(RECONCILIATION_STARTED);
            }
        } catch (err) {
            if (isSessionExpired(err)) return;
            if (isTenantUsageTimeoutError(err)) {
                // The client stopped waiting; the run very likely continues.
                // Reporting "la verificación falló" here would state an outcome
                // nobody observed. The refresh below picks up RUNNING, and the
                // poll takes it from there.
                showCelumaWarning(RECONCILIATION_TIMEOUT);
            } else if (isTenantUsageApiError(err) && err.status === 409) {
                showCelumaWarning(RECONCILIATION_ALREADY_RUNNING);
            } else {
                showCelumaApiError(err);
            }
        } finally {
            if (mountedRef.current) {
                setVerifying(false);
                await load({ silent: true });
            }
        }
    }, [verifying, load]);

    /**
     * The temporary poll.
     *
     * Runs only while the backend reports a reconciliation in progress, and
     * stops as soon as the status is terminal — the effect's dependency is the
     * boolean itself, so a terminal status tears the interval down rather than
     * leaving it to a condition inside the tick.
     *
     * Hidden tabs do not poll: a 7-second request from a background tab buys
     * nothing, and on becoming visible the state is fetched immediately instead
     * of waiting out the remainder of an interval.
     */
    const isRunning = usage?.reconciliation.integrity_status === "RUNNING";

    useEffect(() => {
        if (!isRunning) return;

        let intervalId: ReturnType<typeof setInterval> | null = null;

        const isVisible = () =>
            typeof document === "undefined" || document.visibilityState === "visible";

        const startInterval = () => {
            if (intervalId !== null) return;
            intervalId = setInterval(() => {
                if (!isVisible()) return;
                void load({ silent: true, skipIfBusy: true });
            }, USAGE_RUNNING_POLL_INTERVAL_MS);
        };

        const stopInterval = () => {
            if (intervalId === null) return;
            clearInterval(intervalId);
            intervalId = null;
        };

        const handleVisibilityChange = () => {
            if (isVisible()) {
                void load({ silent: true, skipIfBusy: true });
                startInterval();
            } else {
                stopInterval();
            }
        };

        if (isVisible()) startInterval();
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            stopInterval();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [isRunning, load]);

    const header = (
        <PageHeader
            title={USAGE_PAGE_TITLE}
            subtitle={USAGE_PAGE_SUBTITLE}
            extra={
                <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={handleRefresh}
                    loading={refreshing}
                    disabled={loading}
                >
                    {USAGE_REFRESH}
                </Button>
            }
        />
    );

    let body: React.ReactNode;

    if (loading && !usage) {
        body = (
            <div className="usage-grid-2">
                <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                    <Skeleton active paragraph={{ rows: 3 }} />
                </Card>
                <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                    <Skeleton active paragraph={{ rows: 3 }} />
                </Card>
            </div>
        );
    } else if (!usage && error) {
        // A recoverable page-level failure. The raw fetch/HTTP text never
        // reaches this copy — the service already mapped it to a safe message,
        // and the page states the situation and offers the retry.
        body = (
            <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                <EmptyState
                    icon={<CloudServerOutlined />}
                    title={USAGE_LOAD_ERROR_TITLE}
                    description={USAGE_LOAD_ERROR_DESCRIPTION}
                    color="#ef4444"
                    action={
                        <Button type="primary" size="small" onClick={() => void load()}>
                            {USAGE_RETRY}
                        </Button>
                    }
                />
            </Card>
        );
    } else if (usage) {
        body = (
            <>
                {/* A background read failed but the page still has data. Inline
                    and quiet — not a toast, which a failing poll would repeat
                    every few seconds. */}
                {error && <CelumaAlert type="warning" message={USAGE_STALE_MESSAGE} />}
                <div className="usage-grid-2">
                    <StorageUsageCard
                        storage={usage.storage}
                        onVerify={handleVerify}
                        verifying={verifying}
                        runInProgress={isRunning}
                    />
                    <UserUsageCard users={usage.users} />
                </div>
                <ReconciliationCard
                    reconciliation={usage.reconciliation}
                    onVerify={handleVerify}
                    verifying={verifying}
                />
            </>
        );
    } else {
        // Neither loading, nor data, nor an error — unreachable in practice;
        // rendering nothing beats inventing a state.
        body = null;
    }

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            {/* Storage and users side by side on desktop, stacked below ~760px
                of available width; the verification card is always full width.
                auto-fit rather than a fixed breakpoint because this page also
                renders inside the config layout, where a 220px sidebar has
                already eaten part of the viewport. */}
            <style>{`
              .usage-grid-2 {
                display: grid;
                gap: 16px;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
              }
              @media (max-width: 640px) {
                .usage-grid-2 { grid-template-columns: 1fr; }
              }
            `}</style>
            {header}
            {body}
        </div>
    );

    if (embedded) return content;

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content
                style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}
            >
                <div style={{ maxWidth: 1100, margin: "0 auto" }}>{content}</div>
            </Layout.Content>
        </Layout>
    );
}

export default TenantUsage;
