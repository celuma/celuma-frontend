/**
 * Céluma 1.3, Phase 3, Block C — the full notification history at
 * /notifications.
 *
 * Route protection is **authentication only** (RequireAuth in main.tsx), not
 * `lab:read`. The API itself requires no permission — every query is
 * self-scoped to the caller's own user and tenant — so gating the inbox on a
 * permission the endpoints do not enforce would create a user who can *receive*
 * notifications but cannot *open* them. This is a deliberate departure from the
 * Block A UX proposal §4, which predates the as-built API; the reasoning is in
 * phase-3-block-c-architecture-decision.md §2.
 *
 * Paging is its own local state, not the provider's: this page shows a
 * filtered, accumulating view that the bell has no use for. It still consumes
 * the provider for the unread count and the mark-read/mark-all actions, so
 * there remains exactly one writer of unread state and exactly one poller.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Layout } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma, { type CelumaKey } from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import CelumaSwitch from "../components/ui/celuma_switch";
import FloatingCaptionMultiSelect from "../components/ui/floating_caption_multiselect";
import NotificationList from "../components/ui/notification_list";
import { usePageTitle } from "../hooks/use_page_title";
import { useNotifications } from "../providers/notification_context";
import { listNotifications } from "../services/notification_service";
import {
    isUnread,
    NOTIFICATION_TYPE_LABELS,
    NOTIFICATION_TYPES,
    type NotificationListItem,
} from "../models/notification";
import { resolveNotificationRoute } from "../lib/notification_navigation";
import { showCelumaApiError, showCelumaSuccess } from "../lib/celuma_feedback";
import {
    markAllSuccessMessage,
    mergeNotificationPages,
    MARK_ALL_FAILED_MESSAGE,
    MARK_READ_FAILED_MESSAGE,
    NOTIFICATIONS_CLEAR_FILTERS,
    NOTIFICATIONS_LOAD_MORE,
    NOTIFICATIONS_LOAD_MORE_FAILED,
    NOTIFICATIONS_LOADING_MORE,
    NOTIFICATIONS_MARK_ALL,
    NOTIFICATIONS_TITLE,
    NOTIFICATIONS_TYPE_FILTER,
    NOTIFICATIONS_TYPE_FILTER_PLACEHOLDER,
    NOTIFICATIONS_UNREAD_ONLY,
    unreadSummaryLabel,
} from "../lib/notification_ui";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";

const PAGE_SIZE = 20;

const TYPE_OPTIONS = NOTIFICATION_TYPES.map((value) => ({
    value,
    label: NOTIFICATION_TYPE_LABELS[value],
}));

export default function NotificationsPage() {
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { unreadCount, markRead, markAllRead, refreshRecentItems } = useNotifications();

    // ── Filters ────────────────────────────────────────────────────────────
    // No severity control and no sort control: the API accepts neither, and
    // ordering is fixed newest-first.
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

    // ── Page state ─────────────────────────────────────────────────────────
    const [items, setItems] = useState<NotificationListItem[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [markingAll, setMarkingAll] = useState(false);

    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    /** Only the fetch started most recently is allowed to write state. */
    const requestIdRef = useRef(0);

    const filtersKey = useMemo(
        () => JSON.stringify({ unreadOnly, types: [...selectedTypes].sort() }),
        [unreadOnly, selectedTypes],
    );

    const fetchPage = useCallback(
        async (nextCursor: string | null) => {
            const first = nextCursor === null;
            const requestId = ++requestIdRef.current;

            if (first) setLoading(true);
            else setLoadingMore(true);

            try {
                const response = await listNotifications({
                    cursor: nextCursor,
                    limit: PAGE_SIZE,
                    unreadOnly,
                    types: selectedTypes,
                });
                if (!mountedRef.current || requestId !== requestIdRef.current) return;

                setItems((prev) =>
                    first ? response.items : mergeNotificationPages(prev, response.items),
                );
                setCursor(response.next_cursor);
                setError(null);
            } catch (err) {
                if (!mountedRef.current || requestId !== requestIdRef.current) return;
                // apiFetch already redirected on 401; do not also render an error.
                if (err instanceof Error && err.message === "Session expired") return;
                setError(err instanceof Error ? err : new Error("Ocurrió un error inesperado."));
            } finally {
                if (mountedRef.current && requestId === requestIdRef.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [unreadOnly, selectedTypes],
    );

    /**
     * A filter change resets everything: accumulated items, the old cursor and
     * any error. Keeping the cursor would page into a differently filtered
     * result set.
     */
    useEffect(() => {
        setItems([]);
        setCursor(null);
        setError(null);
        void fetchPage(null);
        // filtersKey is the intentional trigger; fetchPage is recreated with it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtersKey]);

    const hasActiveFilters = unreadOnly || selectedTypes.length > 0;

    const handleSelect = useCallback(
        (item: NotificationListItem) => {
            const route = resolveNotificationRoute(item.resource_type, item.resource_id);

            if (isUnread(item)) {
                // Optimistic locally, so the row updates before the round trip.
                setItems((prev) =>
                    prev.map((row) =>
                        row.recipient_id === item.recipient_id
                            ? { ...row, status: "READ", read_at: new Date().toISOString() }
                            : row,
                    ),
                );
                // `true` is passed explicitly: this page's rows are a filtered,
                // paginated set the provider never loaded, so it cannot derive
                // whether this one counted toward the badge.
                void markRead(item.recipient_id, true).catch((err) => {
                    if (err instanceof Error && err.message === "Session expired") return;
                    // The provider already rolled its own state back and re-synced.
                    setItems((prev) =>
                        prev.map((row) =>
                            row.recipient_id === item.recipient_id
                                ? { ...row, status: item.status, read_at: item.read_at }
                                : row,
                        ),
                    );
                    showCelumaApiError(err, MARK_READ_FAILED_MESSAGE);
                });
            }

            if (route) navigate(route);
        },
        [markRead, navigate],
    );

    /**
     * Mark-all honours the *currently active* filters, so the button means
     * "everything I am looking at". `unread_only` is deliberately not forwarded:
     * the endpoint targets unread rows by definition and rejects the parameter.
     *
     * No confirmation dialog — this is a non-destructive bulk action, and
     * Céluma reserves confirm_dialog for destructive ones (delete, retract).
     */
    const handleMarkAll = useCallback(async () => {
        setMarkingAll(true);
        try {
            const updated = await markAllRead({
                types: selectedTypes.length > 0 ? selectedTypes : undefined,
            });
            if (!mountedRef.current) return;
            setItems((prev) =>
                prev.map((row) =>
                    isUnread(row) ? { ...row, status: "READ", read_at: new Date().toISOString() } : row,
                ),
            );
            showCelumaSuccess(markAllSuccessMessage(updated));
            // The unread-only view no longer matches these rows; re-fetch so the
            // list agrees with the filter. Filters themselves are preserved.
            if (unreadOnly) void fetchPage(null);
            void refreshRecentItems();
        } catch (err) {
            if (err instanceof Error && err.message === "Session expired") return;
            showCelumaApiError(err, MARK_ALL_FAILED_MESSAGE);
        } finally {
            if (mountedRef.current) setMarkingAll(false);
        }
    }, [markAllRead, selectedTypes, unreadOnly, fetchPage, refreshRecentItems]);

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />

            <Layout.Content
                style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}
            >
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <PageHeader
                        title={NOTIFICATIONS_TITLE}
                        subtitle={unreadSummaryLabel(unreadCount)}
                        extra={
                            unreadCount > 0 ? (
                                <CelumaButton
                                    size="small"
                                    type="primary"
                                    onClick={handleMarkAll}
                                    disabled={markingAll}
                                >
                                    {NOTIFICATIONS_MARK_ALL}
                                </CelumaButton>
                            ) : undefined
                        }
                    />

                    <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                        <div
                            style={{
                                display: "flex",
                                gap: 16,
                                alignItems: "center",
                                flexWrap: "wrap",
                                marginBottom: 12,
                            }}
                        >
                            <div style={{ minWidth: 280, flex: "1 1 280px" }}>
                                <FloatingCaptionMultiSelect
                                    label={NOTIFICATIONS_TYPE_FILTER}
                                    value={selectedTypes}
                                    onChange={setSelectedTypes}
                                    options={TYPE_OPTIONS}
                                    placeholder={NOTIFICATIONS_TYPE_FILTER_PLACEHOLDER}
                                />
                            </div>
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    fontSize: 14,
                                    color: tokens.textPrimary,
                                    cursor: "pointer",
                                }}
                            >
                                <CelumaSwitch
                                    checked={unreadOnly}
                                    onChange={setUnreadOnly}
                                    aria-label={NOTIFICATIONS_UNREAD_ONLY}
                                />
                                {NOTIFICATIONS_UNREAD_ONLY}
                            </label>
                            {hasActiveFilters && (
                                <CelumaButton
                                    size="xsmall"
                                    onClick={() => {
                                        setUnreadOnly(false);
                                        setSelectedTypes([]);
                                    }}
                                >
                                    {NOTIFICATIONS_CLEAR_FILTERS}
                                </CelumaButton>
                            )}
                        </div>

                        {/* A failure while older results are already on screen is
                            reported here instead of blanking the list. */}
                        {error && items.length > 0 && (
                            <p role="alert" style={{ color: tokens.errorText, fontSize: 13, margin: "0 0 8px" }}>
                                {NOTIFICATIONS_LOAD_MORE_FAILED}
                            </p>
                        )}

                        <NotificationList
                            items={items}
                            loading={loading}
                            error={items.length === 0 ? error : null}
                            filtered={hasActiveFilters}
                            onSelect={handleSelect}
                            onRetry={() => void fetchPage(null)}
                            label="Historial de notificaciones"
                        />

                        {cursor && (
                            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
                                <CelumaButton
                                    size="small"
                                    onClick={() => void fetchPage(cursor)}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? NOTIFICATIONS_LOADING_MORE : NOTIFICATIONS_LOAD_MORE}
                                </CelumaButton>
                            </div>
                        )}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
