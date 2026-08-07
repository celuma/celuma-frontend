/**
 * Céluma 1.3, Phase 3, Block C — presentation helpers and Spanish UI copy for
 * the Notification Center.
 *
 * Kept in a plain .ts module (not beside the components that use them) for two
 * reasons: the eslint react-refresh rule only tolerates constant exports from a
 * component file, and having every user-facing string of this feature in one
 * place is what makes the UX contract document checkable against the code.
 *
 * Nothing here reconstructs notification content. A notification's `title` and
 * `body` arrive already rendered in Spanish and frozen at creation; these
 * strings are the surrounding chrome only.
 */
import type { NotificationListItem } from "../models/notification";

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

/**
 * The badge label: exact for 1–9, `9+` above that.
 *
 * Callers hide the badge entirely at zero rather than asking this for a label —
 * there is no bare "0" badge anywhere in Céluma.
 */
export function formatUnreadBadge(count: number): string {
    if (count > 9) return "9+";
    return String(count);
}

/**
 * The bell's accessible name. States the count in words, so the information is
 * never carried by the badge's appearance alone.
 */
export function unreadAccessibleLabel(count: number): string {
    if (count <= 0) return "Notificaciones, ninguna sin leer";
    if (count === 1) return "Notificaciones, 1 sin leer";
    return `Notificaciones, ${count} sin leer`;
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

/**
 * Appends a freshly fetched page to the accumulated list, deduplicating on
 * `recipient_id`.
 *
 * The Block B cursor is stable (deterministic secondary sort on the recipient
 * id), so a repeat should not occur — but a row whose state changed between two
 * page fetches can legitimately be re-served, and rendering it twice would mean
 * a React duplicate-key warning and a visibly repeated notification.
 */
export function mergeNotificationPages(
    previous: NotificationListItem[],
    incoming: NotificationListItem[],
): NotificationListItem[] {
    const seen = new Set(previous.map((item) => item.recipient_id));
    return [...previous, ...incoming.filter((item) => !seen.has(item.recipient_id))];
}

// ---------------------------------------------------------------------------
// Spanish copy
// ---------------------------------------------------------------------------

export const NOTIFICATIONS_TITLE = "Notificaciones";
export const NOTIFICATIONS_VIEW_ALL = "Ver todas";
export const NOTIFICATIONS_MARK_ALL = "Marcar todas como leídas";
export const NOTIFICATIONS_CLEAR_FILTERS = "Limpiar filtros";
export const NOTIFICATIONS_LOAD_MORE = "Cargar más";
export const NOTIFICATIONS_LOADING_MORE = "Cargando…";
export const NOTIFICATIONS_UNREAD_ONLY = "Solo sin leer";
export const NOTIFICATIONS_TYPE_FILTER = "Tipo de notificación";
export const NOTIFICATIONS_TYPE_FILTER_PLACEHOLDER = "Todos los tipos";
export const NOTIFICATIONS_RETRY = "Reintentar";

export const NOTIFICATIONS_EMPTY_TITLE = "No tienes notificaciones.";
export const NOTIFICATIONS_EMPTY_DESCRIPTION =
    "Los eventos relevantes de tu trabajo aparecerán aquí.";
export const NOTIFICATIONS_EMPTY_FILTERED_TITLE =
    "No hay notificaciones que coincidan con los filtros seleccionados.";
export const NOTIFICATIONS_EMPTY_FILTERED_DESCRIPTION =
    "Ajusta o limpia los filtros para ver más resultados.";

export const NOTIFICATIONS_ERROR_TITLE = "No fue posible cargar las notificaciones.";
export const NOTIFICATIONS_ERROR_DESCRIPTION = "Revisa tu conexión e inténtalo de nuevo.";
export const NOTIFICATIONS_LOAD_MORE_FAILED = "No fue posible cargar más notificaciones.";
export const MARK_READ_FAILED_MESSAGE = "No fue posible actualizar la notificación.";
export const MARK_ALL_FAILED_MESSAGE = "No fue posible marcar las notificaciones como leídas.";

/**
 * Shown inside the popover when the count poll is failing. Deliberately not a
 * toast: a poll that fails every 30 seconds would otherwise spam the app.
 */
export const COUNT_STALE_MESSAGE =
    "No fue posible actualizar el contador. Mostrando el último valor conocido.";

export function unreadSummaryLabel(count: number): string {
    if (count === 0) return "No tienes notificaciones sin leer.";
    if (count === 1) return "Tienes 1 notificación sin leer.";
    return `Tienes ${count} notificaciones sin leer.`;
}

export function markAllSuccessMessage(updated: number): string {
    return updated === 1
        ? "1 notificación marcada como leída."
        : `${updated} notificaciones marcadas como leídas.`;
}
