/**
 * Céluma 1.3, Phase 3, Block C — the notification bell, its unread badge, and
 * the recent-notifications surface hanging off it.
 *
 * Self-contained on purpose (Block A UX proposal §1): it reads its state from
 * the NotificationProvider context and knows nothing about SidebarCeluma's
 * internals beyond being rendered inside it, so it lifts into a future shared
 * AppShell unchanged.
 *
 * It owns **no** polling. Every number it shows comes from the one provider.
 *
 * Surface, per the Block A decision and the existing component vocabulary:
 *   desktop (`variant="sidebar"`)  → Popover, the shape comment_input.tsx's
 *                                    mention picker already uses for a short
 *                                    anchored list.
 *   mobile  (`variant="floating"`) → Drawer, matching how the sidebar itself
 *                                    degrades on small viewports.
 * Both render the same NotificationPanel, so the content cannot drift.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Drawer, Popover } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import NotificationList from "./notification_list";
import CelumaButton from "./button";
import { tokens } from "../design/tokens";
import { useNotifications } from "../../providers/notification_context";
import { isUnread, type NotificationListItem } from "../../models/notification";
import { resolveNotificationRoute } from "../../lib/notification_navigation";
import { showCelumaApiError } from "../../lib/celuma_feedback";
import {
    COUNT_STALE_MESSAGE,
    formatUnreadBadge,
    MARK_ALL_FAILED_MESSAGE,
    MARK_READ_FAILED_MESSAGE,
    NOTIFICATIONS_MARK_ALL,
    NOTIFICATIONS_TITLE,
    NOTIFICATIONS_VIEW_ALL,
    unreadAccessibleLabel,
} from "../../lib/notification_ui";

// ---------------------------------------------------------------------------
// Panel (shared by the popover and the drawer)
// ---------------------------------------------------------------------------

/**
 * `hideTitle` is set by the mobile variant: the antd Drawer already renders
 * "Notificaciones" as its own dialog title, and a second heading immediately
 * below it reads as a duplicate to sighted and screen-reader users alike.
 */
function NotificationPanel({
    onNavigate,
    hideTitle = false,
}: {
    onNavigate: () => void;
    hideTitle?: boolean;
}) {
    const {
        recentItems,
        listLoading,
        error,
        countStale,
        unreadCount,
        refreshRecentItems,
        markRead,
        markAllRead,
    } = useNotifications();
    const navigate = useNavigate();
    const [markingAll, setMarkingAll] = useState(false);

    /**
     * Explicit activation is the only thing that marks a notification read —
     * opening this panel never does, and neither does scrolling past an item.
     *
     * Ordering: the optimistic local update inside markRead is synchronous, so
     * navigation fires immediately and is never blocked by the network. A failed
     * mark-read rolls its own state back and re-syncs from the server; the user
     * still lands on the resource, which is what they asked for. If the resource
     * type is one this build cannot resolve, activation still marks the row read
     * and simply does not navigate — no fabricated route.
     */
    const handleSelect = useCallback(
        (item: NotificationListItem) => {
            const route = resolveNotificationRoute(item.resource_type, item.resource_id);

            if (isUnread(item)) {
                void markRead(item.recipient_id).catch((err) => {
                    showCelumaApiError(err, MARK_READ_FAILED_MESSAGE);
                });
            }

            if (route) {
                onNavigate();
                navigate(route);
            }
        },
        [markRead, navigate, onNavigate],
    );

    const handleMarkAll = useCallback(async () => {
        setMarkingAll(true);
        try {
            await markAllRead();
        } catch (err) {
            showCelumaApiError(err, MARK_ALL_FAILED_MESSAGE);
        } finally {
            setMarkingAll(false);
        }
    }, [markAllRead]);

    return (
        <div style={{ width: "100%", maxWidth: 380, fontFamily: tokens.textFont }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "4px 8px 8px 8px",
                    borderBottom: "1px solid #eef1f0",
                }}
            >
                {hideTitle ? (
                    <span />
                ) : (
                    <h2
                        style={{
                            margin: 0,
                            fontFamily: tokens.titleFont,
                            fontSize: 16,
                            fontWeight: 800,
                            color: tokens.textPrimary,
                        }}
                    >
                        {NOTIFICATIONS_TITLE}
                    </h2>
                )}
                {unreadCount > 0 && (
                    <CelumaButton size="xsmall" onClick={handleMarkAll} disabled={markingAll}>
                        {NOTIFICATIONS_MARK_ALL}
                    </CelumaButton>
                )}
            </div>

            {/* Recoverable and non-blocking: the count is stale but the last
                known value is still on screen. Shown here rather than as a toast
                so a failing poll cannot spam the app every 30 seconds. */}
            {countStale && (
                <p
                    role="status"
                    style={{ margin: 0, padding: "8px 12px 0", fontSize: 12, color: tokens.textSecondary }}
                >
                    {COUNT_STALE_MESSAGE}
                </p>
            )}

            <div style={{ maxHeight: 380, overflowY: "auto" }}>
                <NotificationList
                    items={recentItems}
                    loading={listLoading}
                    error={error}
                    compact
                    onSelect={handleSelect}
                    onRetry={() => void refreshRecentItems()}
                    label="Notificaciones recientes"
                />
            </div>

            <div style={{ padding: 8, borderTop: "1px solid #eef1f0", textAlign: "center" }}>
                <CelumaButton
                    size="small"
                    fullWidth
                    onClick={() => {
                        onNavigate();
                        navigate("/notifications");
                    }}
                >
                    {NOTIFICATIONS_VIEW_ALL}
                </CelumaButton>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Bell
// ---------------------------------------------------------------------------

export interface NotificationBellProps {
    /**
     * `sidebar` — inside the desktop Sider header, white-on-teal, opens a Popover.
     * `floating` — the fixed mobile control mirroring the hamburger, opens a Drawer.
     *
     * SidebarCeluma mounts exactly one of these per viewport, so there is never
     * a second trigger (and never a duplicated accessible name) in the tree.
     */
    variant?: "sidebar" | "floating";
}

export default function NotificationBell({ variant = "sidebar" }: NotificationBellProps) {
    const { unreadCount, refreshRecentItems } = useNotifications();
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    /** Opening loads the recent list. It does not mark anything read. */
    const handleOpenChange = useCallback(
        (next: boolean) => {
            setOpen(next);
            if (next) void refreshRecentItems();
        },
        [refreshRecentItems],
    );

    const close = useCallback(() => setOpen(false), []);

    // Focus returns to the bell when the surface closes, so a keyboard user is
    // not dropped at the top of the document.
    const wasOpenRef = useRef(false);
    useEffect(() => {
        if (wasOpenRef.current && !open) triggerRef.current?.focus();
        wasOpenRef.current = open;
    }, [open]);

    // Escape closes. antd's Popover does not do this for a click trigger.
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    const floating = variant === "floating";

    const trigger = (
        <button
            ref={triggerRef}
            type="button"
            aria-label={unreadAccessibleLabel(unreadCount)}
            aria-haspopup="dialog"
            aria-expanded={open}
            // Only the floating variant handles its own click. antd's Popover
            // clones this element and merges its own onClick onto it, so a
            // handler here as well would toggle twice — firing a second,
            // wasted recent-items fetch on every open.
            onClick={floating ? () => handleOpenChange(!open) : undefined}
            className={floating ? "celuma-mobile-bell" : "celuma-sidebar-bell"}
            style={
                floating
                    ? {
                          position: "fixed",
                          top: 12,
                          right: 12,
                          zIndex: 1000,
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: tokens.primary,
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                      }
                    : {
                          width: 32,
                          height: 32,
                          minWidth: 32,
                          borderRadius: 6,
                          background: "transparent",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          color: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                      }
            }
        >
            <Badge
                // Formatted here rather than via antd's `overflowCount` so the
                // 1–9 / "9+" / hidden-at-zero rule lives in one tested function.
                // `null` is what hides the badge: there is no bare "0" badge
                // anywhere in this app.
                count={unreadCount > 0 ? formatUnreadBadge(unreadCount) : null}
                size="small"
                // Soft pastel + saturated ink, per the design system's status
                // palette — not a harsh solid-red dot.
                color={tokens.secondary}
                style={{ boxShadow: "none" }}
            >
                <BellOutlined style={{ fontSize: floating ? 20 : 16, color: "#fff" }} />
            </Badge>
        </button>
    );

    // Announced only when the number actually changes, so a 30 s poll returning
    // the same value stays silent.
    const liveRegion = (
        <span
            aria-live="polite"
            style={{
                position: "absolute",
                width: 1,
                height: 1,
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
                whiteSpace: "nowrap",
            }}
        >
            {unreadAccessibleLabel(unreadCount)}
        </span>
    );

    if (floating) {
        return (
            <>
                {trigger}
                {liveRegion}
                <Drawer
                    open={open}
                    onClose={close}
                    placement="right"
                    width="100%"
                    title={NOTIFICATIONS_TITLE}
                    styles={{ body: { padding: 8 } }}
                >
                    <NotificationPanel onNavigate={close} hideTitle />
                </Drawer>
            </>
        );
    }

    return (
        <>
            <Popover
                open={open}
                onOpenChange={handleOpenChange}
                trigger="click"
                placement="rightTop"
                arrow={false}
                styles={{ body: { padding: 8, width: 380 } }}
                content={<NotificationPanel onNavigate={close} />}
            >
                {trigger}
            </Popover>
            {liveRegion}
        </>
    );
}
