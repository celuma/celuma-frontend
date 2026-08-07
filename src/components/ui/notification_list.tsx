/**
 * Céluma 1.3, Phase 3, Block C — the notification row and list, shared by the
 * bell popover/drawer and the /notifications history page.
 *
 * One component for both surfaces so a change to how a notification reads
 * cannot drift between them; `compact` is the only difference (the popover
 * clamps the body to two lines and hides the absolute date, the page shows
 * both).
 *
 * Content rules, from the Block B contract:
 *  - `title`/`body` arrive already rendered in Spanish and frozen at creation.
 *    They are printed verbatim — never re-templated from `type`, never
 *    translated, never semantically shortened. The clamp in compact mode is
 *    pure CSS, and the full string stays reachable through the row's `title`
 *    attribute and the history page.
 *  - unread is never signalled by colour alone: there is a dot, a heavier
 *    weight, a tinted row *and* the words "Sin leer" in the accessible name.
 */
import React from "react";
import { Skeleton } from "antd";
import { BellOutlined, InboxOutlined, WarningOutlined } from "@ant-design/icons";
import EmptyState from "./empty_state";
import CelumaButton from "./button";
import { tokens } from "../design/tokens";
import {
    isUnread,
    notificationTypeChip,
    notificationTypeLabel,
    notificationSeverityAccent,
    NOTIFICATION_STATUS_LABELS,
    type NotificationListItem,
} from "../../models/notification";
import {
    isNotificationNavigable,
    UNSUPPORTED_RESOURCE_MESSAGE,
} from "../../lib/notification_navigation";
import {
    formatNotificationDateTime,
    formatNotificationRelativeTime,
} from "../../lib/notification_dates";
import {
    NOTIFICATIONS_EMPTY_DESCRIPTION,
    NOTIFICATIONS_EMPTY_FILTERED_DESCRIPTION,
    NOTIFICATIONS_EMPTY_FILTERED_TITLE,
    NOTIFICATIONS_EMPTY_TITLE,
    NOTIFICATIONS_ERROR_DESCRIPTION,
    NOTIFICATIONS_ERROR_TITLE,
    NOTIFICATIONS_RETRY,
} from "../../lib/notification_ui";

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

export interface NotificationRowProps {
    item: NotificationListItem;
    /** Popover density: clamped body, relative time only. */
    compact?: boolean;
    onSelect: (item: NotificationListItem) => void;
}

/**
 * A single notification.
 *
 * Always a real <button>, even when the resource cannot be opened: activating it
 * still marks the notification read, which is a genuine outcome rather than a
 * dead click, and the accessible name says the destination is unavailable. That
 * keeps an unknown future `resource_type` readable and acknowledgeable without
 * ever fabricating a route.
 */
export function NotificationRow({ item, compact = false, onSelect }: NotificationRowProps) {
    const unread = isUnread(item);
    const chip = notificationTypeChip(item.type);
    const typeLabel = notificationTypeLabel(item.type);
    const navigable = isNotificationNavigable(item.resource_type, item.resource_id);
    const accent = notificationSeverityAccent(item.severity);
    const relative = formatNotificationRelativeTime(item.created_at);
    const absolute = formatNotificationDateTime(item.created_at);

    // Screen-reader name: status in words, then the type, the frozen title and
    // the time. Colour and weight are decoration on top of this.
    const accessibleName = [
        unread ? NOTIFICATION_STATUS_LABELS.UNREAD : NOTIFICATION_STATUS_LABELS.READ,
        typeLabel,
        item.title,
        absolute,
        navigable ? null : UNSUPPORTED_RESOURCE_MESSAGE,
    ]
        .filter(Boolean)
        .join(". ");

    return (
        <li style={{ listStyle: "none" }}>
            <button
                type="button"
                onClick={() => onSelect(item)}
                aria-label={accessibleName}
                data-unread={unread ? "true" : "false"}
                data-navigable={navigable ? "true" : "false"}
                className="celuma-notification-row"
                style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: compact ? "10px 12px" : "14px 16px",
                    // 44px min target on touch, per the accessibility checklist.
                    minHeight: 44,
                    border: "none",
                    borderLeft: accent ? `3px solid ${accent}` : "3px solid transparent",
                    borderRadius: 10,
                    background: unread ? "#f3fbfa" : "transparent",
                    cursor: "pointer",
                    fontFamily: tokens.textFont,
                }}
            >
                {/* Unread dot — redundant with the tint, the weight and the label. */}
                <span
                    aria-hidden="true"
                    style={{
                        width: 8,
                        height: 8,
                        marginTop: 7,
                        borderRadius: "50%",
                        background: unread ? tokens.primary : "transparent",
                        flexShrink: 0,
                    }}
                />

                <span style={{ minWidth: 0, display: "grid", gap: 4 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: chip.color,
                                background: chip.bg,
                                borderRadius: 100,
                                padding: "2px 8px",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {typeLabel}
                        </span>
                        <span style={{ fontSize: 12, color: tokens.textSecondary }} title={absolute}>
                            {relative}
                        </span>
                    </span>

                    <span
                        title={item.title}
                        style={{
                            fontSize: 14,
                            fontWeight: unread ? 700 : 500,
                            color: tokens.textPrimary,
                            lineHeight: 1.35,
                            ...(compact ? CLAMP_2 : {}),
                        }}
                    >
                        {item.title}
                    </span>

                    {item.body && (
                        <span
                            title={item.body}
                            style={{
                                fontSize: 13,
                                color: tokens.textSecondary,
                                lineHeight: 1.4,
                                ...(compact ? CLAMP_2 : {}),
                            }}
                        >
                            {item.body}
                        </span>
                    )}

                    {/* The exact date, on the roomier history surface. Skipped
                        when the relative formatter has already fallen back to
                        the very same string (anything older than a week), which
                        would otherwise print the date twice. */}
                    {!compact && absolute !== relative && (
                        <span style={{ fontSize: 12, color: tokens.textSecondary }}>{absolute}</span>
                    )}

                    {!navigable && (
                        <span style={{ fontSize: 12, color: tokens.textSecondary, fontStyle: "italic" }}>
                            {UNSUPPORTED_RESOURCE_MESSAGE}
                        </span>
                    )}
                </span>
            </button>
        </li>
    );
}

/** Two-line CSS clamp. Layout only — the full string stays in `title`. */
const CLAMP_2: React.CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
};

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/** Skeleton rows — used for the first load, never over already-visible results. */
export function NotificationListSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div data-testid="notification-list-skeleton" aria-hidden="true" style={{ display: "grid", gap: 12, padding: 12 }}>
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} active paragraph={{ rows: 1 }} title={{ width: "45%" }} />
            ))}
        </div>
    );
}

export function NotificationErrorState({ onRetry }: { onRetry: () => void }) {
    return (
        <EmptyState
            icon={<WarningOutlined />}
            color="#ef4444"
            title={NOTIFICATIONS_ERROR_TITLE}
            description={NOTIFICATIONS_ERROR_DESCRIPTION}
            action={
                <CelumaButton size="small" type="primary" onClick={onRetry}>
                    {NOTIFICATIONS_RETRY}
                </CelumaButton>
            }
        />
    );
}

export function NotificationEmptyState({ filtered = false }: { filtered?: boolean }) {
    if (filtered) {
        return (
            <EmptyState
                icon={<InboxOutlined />}
                title={NOTIFICATIONS_EMPTY_FILTERED_TITLE}
                description={NOTIFICATIONS_EMPTY_FILTERED_DESCRIPTION}
            />
        );
    }
    return (
        <EmptyState
            icon={<BellOutlined />}
            title={NOTIFICATIONS_EMPTY_TITLE}
            description={NOTIFICATIONS_EMPTY_DESCRIPTION}
        />
    );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface NotificationListProps {
    items: NotificationListItem[];
    loading: boolean;
    error: Error | null;
    compact?: boolean;
    /** Distinguishes "your inbox is empty" from "these filters matched nothing". */
    filtered?: boolean;
    onSelect: (item: NotificationListItem) => void;
    onRetry: () => void;
    /** Accessible name for the list region. */
    label?: string;
}

export default function NotificationList({
    items,
    loading,
    error,
    compact = false,
    filtered = false,
    onSelect,
    onRetry,
    label = "Notificaciones",
}: NotificationListProps) {
    // Error wins only when there is nothing to show; otherwise the visible list
    // stays put and the surface's own banner reports the failure.
    if (error && items.length === 0) return <NotificationErrorState onRetry={onRetry} />;

    // A spinner replaces the list only on the first load. Once results exist, a
    // refresh must not blank them out.
    if (loading && items.length === 0) return <NotificationListSkeleton rows={compact ? 3 : 5} />;

    if (items.length === 0) return <NotificationEmptyState filtered={filtered} />;

    return (
        <ul
            aria-label={label}
            style={{ listStyle: "none", margin: 0, padding: compact ? 4 : 8, display: "grid", gap: 2 }}
        >
            {items.map((item) => (
                <NotificationRow
                    key={item.recipient_id}
                    item={item}
                    compact={compact}
                    onSelect={onSelect}
                />
            ))}
        </ul>
    );
}
