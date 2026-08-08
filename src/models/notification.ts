/**
 * Céluma 1.3, Phase 3, Block C — frontend contract for the Notification Center.
 *
 * Mirrors the four Block B endpoints documented in
 * docs/celuma-1.3/phase-3-block-b/notification-api-contract.md. Identifiers stay
 * in English (they are API values); every user-facing string lives in the
 * Spanish label maps at the bottom of this file, following the existing
 * `Record<code, label>` convention used by rbac.ts and status_configs.tsx.
 *
 * Two ids, never interchangeable:
 *   recipient_id     the caller's own inbox row — what mark-read takes, and the
 *                    React list key.
 *   notification_id  the shared event — grouping/deduplication only.
 * Sending a notification_id to the read endpoint returns 404.
 */

import { DEFAULT_LOCALE, resolveLocale, type Locale } from "../lib/locale";

// ---------------------------------------------------------------------------
// Enums (API values — never displayed directly)
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
    "REPORT_SUBMITTED",
    "REPORT_PDF_READY",
    "REPORT_PUBLISHED",
    "REPORT_RETRACTED",
    "ASSIGNMENT_ADDED",
    "SAMPLE_STATUS_CHANGED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ["INFO", "WARNING", "ACTION_REQUIRED"] as const;

/**
 * Only INFO is produced today (Block B §1). WARNING/ACTION_REQUIRED are modeled
 * so a future event needs no contract change — there is deliberately no
 * severity filter and no severity-driven behaviour.
 */
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_RECIPIENT_STATUSES = ["UNREAD", "READ", "DISMISSED"] as const;

/** DISMISSED is modeled but unreachable — no endpoint produces it. */
export type NotificationRecipientStatus = (typeof NOTIFICATION_RECIPIENT_STATUSES)[number];

export const NOTIFICATION_RESOURCE_TYPES = ["report", "order", "sample"] as const;

export type NotificationResourceType = (typeof NOTIFICATION_RESOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * One row of the caller's inbox.
 *
 * `type`, `severity`, `status` and `resource_type` are typed as their unions
 * *widened with `string`*: the compatibility policy (see
 * notification-frontend-contract.md §7) is that one unrecognised enum value
 * must degrade that single item, never reject the inbox. The narrowing helpers
 * below are how a consumer moves from the wide type to the narrow one.
 */
export interface NotificationListItem {
    recipient_id: string;
    notification_id: string;
    type: NotificationType | (string & {});
    severity: NotificationSeverity | (string & {});
    /** Frozen Spanish, rendered by the backend at creation time. Render as-is. */
    title: string;
    /** Frozen Spanish. Nullable for title-only notification types. */
    body: string | null;
    resource_type: NotificationResourceType | (string & {});
    resource_id: string;
    status: NotificationRecipientStatus | (string & {});
    /** Naive UTC ISO string, no timezone suffix — see lib/notification_dates.ts. */
    created_at: string;
    /** Naive UTC ISO string, or null while unread. */
    read_at: string | null;
}

export interface NotificationListResponse {
    items: NotificationListItem[];
    /** Opaque. Pass back as `cursor`; `null` means this was the last page. */
    next_cursor: string | null;
}

export interface NotificationUnreadCountResponse {
    unread_count: number;
}

export interface NotificationReadResponse {
    recipient_id: string;
    status: "READ";
    read_at: string;
}

export interface NotificationReadAllResponse {
    updated_count: number;
}

// ---------------------------------------------------------------------------
// Request filters
// ---------------------------------------------------------------------------

/**
 * Query parameters accepted by `GET /api/v1/notifications`.
 *
 * There is deliberately no `severity`, no `sort`, no `tenant_id` and no
 * `user_id`: the API accepts none of them, and scope comes from the token.
 */
export interface NotificationListFilters {
    /** Opaque cursor from a previous response's `next_cursor`. Never parsed. */
    cursor?: string | null;
    /** 1–100; the API defaults to 20 and answers 400 outside the range. */
    limit?: number;
    unreadOnly?: boolean;
    /** Repeatable — several values are an OR. An unknown value answers 422. */
    types?: readonly string[];
    /** Inclusive ISO 8601 lower bound on `created_at`. */
    since?: string;
    /** Inclusive ISO 8601 upper bound. `since > until` answers 400. */
    until?: string;
}

/**
 * `POST /api/v1/notifications/read-all` accepts the same narrowing filters as
 * the list endpoint, minus `unread_only` — it targets unread rows by
 * definition. That is why this is a distinct type rather than a Partial.
 */
export type NotificationReadAllFilters = Pick<NotificationListFilters, "types" | "since" | "until">;

// ---------------------------------------------------------------------------
// Spanish presentation maps
// ---------------------------------------------------------------------------

/**
 * Labels for the notification *type* chip, per locale.
 *
 * Céluma 1.3, Phase 3, Block F — localization readiness. One locale, `es-MX`,
 * with exactly the strings Block C shipped: this restructures the lookup, not
 * the copy, which is why every visual golden stays byte-identical.
 *
 * These are UI chrome only. The notification's own `title`/`body` arrive
 * already rendered from the backend, frozen at creation, in the locale
 * recorded on `Notification.locale` — and are never reconstructed from these.
 */
export const NOTIFICATION_TYPE_LABELS_BY_LOCALE: Record<
    Locale,
    Record<NotificationType, string>
> = {
    "es-MX": {
        REPORT_SUBMITTED: "Enviado a revisión",
        REPORT_PDF_READY: "PDF oficial listo",
        REPORT_PUBLISHED: "Reporte publicado",
        REPORT_RETRACTED: "Reporte retractado",
        ASSIGNMENT_ADDED: "Nueva asignación",
        SAMPLE_STATUS_CHANGED: "Estado de muestra actualizado",
    },
};

/**
 * The default-locale labels.
 *
 * Kept under its Block C name and shape — it is the natural way to ask "what
 * does this type read as", which is what every consumer wants, and it keeps
 * the Block C/D tests that index it working unchanged.
 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> =
    NOTIFICATION_TYPE_LABELS_BY_LOCALE[DEFAULT_LOCALE];

export const NOTIFICATION_STATUS_LABELS: Record<NotificationRecipientStatus, string> = {
    UNREAD: "Sin leer",
    READ: "Leída",
    DISMISSED: "Descartada",
};

/** Neutral fallback for a type this build does not know about yet. */
export const UNKNOWN_NOTIFICATION_TYPE_LABEL = "Notificación";

/**
 * Type chip colours, following the design system's soft-pastel-plus-ink status
 * palette (CELUMA_DESIGN_SYSTEM.md §3) rather than solid blocks.
 */
export const NOTIFICATION_TYPE_CHIP: Record<NotificationType, { color: string; bg: string }> = {
    REPORT_SUBMITTED: { color: "#3b82f6", bg: "#eff6ff" },
    REPORT_PDF_READY: { color: "#8b5cf6", bg: "#f5f3ff" },
    REPORT_PUBLISHED: { color: "#10b981", bg: "#ecfdf5" },
    REPORT_RETRACTED: { color: "#ef4444", bg: "#fef2f2" },
    ASSIGNMENT_ADDED: { color: "#f59e0b", bg: "#fffbeb" },
    SAMPLE_STATUS_CHANGED: { color: "#06b6d4", bg: "#ecfeff" },
};

export const UNKNOWN_NOTIFICATION_TYPE_CHIP = { color: "#6b7280", bg: "#f3f4f6" };

/**
 * Severity accents. Defined for all three so a future WARNING/ACTION_REQUIRED
 * needs no code change, but nothing in Block C *behaves* differently per
 * severity: there is no severity filter and no severity-driven affordance,
 * because only INFO is produced.
 */
export const NOTIFICATION_SEVERITY_ACCENT: Record<NotificationSeverity, string | null> = {
    INFO: null,
    WARNING: "#f59e0b",
    ACTION_REQUIRED: "#ef4444",
};

// ---------------------------------------------------------------------------
// Narrowing helpers — the enum compatibility policy, in one place
// ---------------------------------------------------------------------------

export function isKnownNotificationType(value: string): value is NotificationType {
    return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isKnownNotificationResourceType(value: string): value is NotificationResourceType {
    return (NOTIFICATION_RESOURCE_TYPES as readonly string[]).includes(value);
}

export function isKnownNotificationSeverity(value: string): value is NotificationSeverity {
    return (NOTIFICATION_SEVERITIES as readonly string[]).includes(value);
}

/**
 * Label for a type in `locale`, falling back to a neutral noun for a type this
 * build does not know about.
 *
 * Two independent fallbacks, and they answer different questions.
 * `resolveLocale` handles "Céluma has no copy in that language"; the
 * `isKnownNotificationType` check handles "the backend sent a type this build
 * predates" — the enum-compatibility policy, which must degrade one item
 * rather than reject the inbox.
 */
export function notificationTypeLabel(value: string, locale: string = DEFAULT_LOCALE): string {
    if (!isKnownNotificationType(value)) return UNKNOWN_NOTIFICATION_TYPE_LABEL;
    return NOTIFICATION_TYPE_LABELS_BY_LOCALE[resolveLocale(locale)][value];
}

export function notificationTypeChip(value: string): { color: string; bg: string } {
    return isKnownNotificationType(value)
        ? NOTIFICATION_TYPE_CHIP[value]
        : UNKNOWN_NOTIFICATION_TYPE_CHIP;
}

export function notificationSeverityAccent(value: string): string | null {
    return isKnownNotificationSeverity(value) ? NOTIFICATION_SEVERITY_ACCENT[value] : null;
}

/**
 * An item counts as unread for badge/highlight purposes only when its status is
 * exactly UNREAD. An unrecognised status is treated as *not* unread: over-
 * counting the badge is the worse failure, and DISMISSED (the only other
 * modeled value) is not unread either.
 */
export function isUnread(item: NotificationListItem): boolean {
    return item.status === "UNREAD";
}
