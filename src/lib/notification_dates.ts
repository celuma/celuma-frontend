/**
 * Céluma 1.3, Phase 3, Block C — timestamp handling for the Notification
 * Center.
 *
 * The notifications API returns `created_at`/`read_at` as **naive UTC** ISO
 * strings with no timezone suffix (`datetime.utcnow()`, matching the rest of
 * this API — see block-c-dependencies.md §3). `new Date("2026-08-04T12:00:00")`
 * is parsed by the browser as *local* time, which silently shifts every
 * notification by the viewer's UTC offset. Everything here goes through
 * parseBackendUtcDate so that never happens.
 *
 * The same `endsWith("Z")` guard already exists in
 * components/comments/comment_utils.tsx's formatLocalDateTime. It is
 * re-implemented here rather than imported so the Notification Center does not
 * depend on a comments-domain module for its date semantics, and so the
 * behaviour is pinned by its own tests.
 */

/** Matches an ISO 8601 string that already carries a zone: `Z`, `+HH:MM`, `-HHMM`. */
const HAS_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses a backend timestamp as UTC.
 *
 * A string without a timezone designator gets an explicit `Z` appended; one
 * that already carries a zone is respected as-is. Returns `null` for empty,
 * malformed or unparseable input so callers can fall back rather than render
 * "Invalid Date".
 */
export function parseBackendUtcDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = HAS_TIMEZONE.test(trimmed) ? trimmed : `${trimmed}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Placeholder rendered wherever a timestamp could not be parsed. */
export const UNKNOWN_DATE_LABEL = "Fecha no disponible";

/**
 * Absolute local date and time, `dd/mm/yyyy, hh:mm` — the format the
 * conversation thread already uses, so the two surfaces read the same.
 */
export function formatNotificationDateTime(value: string | null | undefined): string {
    const date = parseBackendUtcDate(value);
    if (!date) return UNKNOWN_DATE_LABEL;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact Spanish relative time for the popover and list rows: "Hace 5
 * minutos", "Hace 2 horas", "Hace 3 días". Falls back to the absolute date
 * beyond a week, and for anything in the future (clock skew), where "hace" would
 * be wrong.
 *
 * `now` is injectable so tests do not depend on wall-clock time.
 */
export function formatNotificationRelativeTime(
    value: string | null | undefined,
    now: Date = new Date(),
): string {
    const date = parseBackendUtcDate(value);
    if (!date) return UNKNOWN_DATE_LABEL;

    const elapsed = now.getTime() - date.getTime();
    if (elapsed < 0) return formatNotificationDateTime(value);
    if (elapsed < MINUTE) return "Hace un momento";

    if (elapsed < HOUR) {
        const minutes = Math.floor(elapsed / MINUTE);
        return minutes === 1 ? "Hace 1 minuto" : `Hace ${minutes} minutos`;
    }
    if (elapsed < DAY) {
        const hours = Math.floor(elapsed / HOUR);
        return hours === 1 ? "Hace 1 hora" : `Hace ${hours} horas`;
    }
    if (elapsed < 7 * DAY) {
        const days = Math.floor(elapsed / DAY);
        return days === 1 ? "Hace 1 día" : `Hace ${days} días`;
    }

    return formatNotificationDateTime(value);
}
