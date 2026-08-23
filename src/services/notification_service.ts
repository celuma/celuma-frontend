/**
 * Céluma 1.3, Phase 3, Block C — typed client for the four Block B notification
 * endpoints:
 *
 *   GET  /api/v1/notifications
 *   GET  /api/v1/notifications/unread-count
 *   POST /api/v1/notifications/{recipient_id}/read
 *   POST /api/v1/notifications/read-all
 *
 * Nothing else exists under /notifications — no create, no update, no
 * preferences, no dismiss, no delete, no mark-unread, no delivery status, no
 * admin surface. This file must stay that short.
 *
 * Unlike the older service modules (report_letterhead_service.ts et al., which
 * each re-implement token lookup and error parsing), this one goes through the
 * shared `apiFetch` from lib/api_fetch.ts — the abstraction that file's own
 * header asks every new service to adopt. That matters here beyond tidiness:
 * apiFetch is what turns a **401** into the central session-expiry redirect,
 * while leaving **403** to be surfaced as an ordinary permission error. A
 * notification-local copy of that logic would be a second, divergent logout
 * path.
 */
import { apiFetch } from "../lib/api_fetch";
import { parseFastApiDetail } from "../lib/api_error";
import type {
    NotificationListFilters,
    NotificationListResponse,
    NotificationReadAllFilters,
    NotificationReadAllResponse,
    NotificationReadResponse,
    NotificationUnreadCountResponse,
} from "../models/notification";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

const NOTIFICATIONS_URL = `${base}/v1/notifications`;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Spanish messages per status. Deliberately generic: the backend's `detail` is
 * developer-facing English and can echo internals, so it is never shown.
 *
 * 401 never reaches here — apiFetch intercepts it, clears the session and
 * redirects, throwing its "Session expired" sentinel (which
 * showCelumaApiError already knows to swallow).
 */
function notificationErrorMessage(status: number, fallback: string): string {
    if (status === 400) return "Los parámetros de la consulta no son válidos.";
    if (status === 403) return "No tienes permiso para realizar esta acción.";
    if (status === 404) return "La notificación ya no está disponible.";
    if (status === 422) return "Los filtros seleccionados no son válidos.";
    if (status === 429) return "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.";
    if (status >= 500) return "Error del servidor. Inténtalo de nuevo más tarde.";
    return fallback;
}

/**
 * Carries the HTTP status alongside the Spanish message so callers can react
 * structurally — the provider uses `status === 404` to drop a recipient row that
 * the server says is gone, instead of pattern-matching on prose.
 */
export class NotificationApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "NotificationApiError";
        this.status = status;
    }
}

export function isNotificationApiError(err: unknown): err is NotificationApiError {
    return err instanceof NotificationApiError;
}

/**
 * Issues the request and returns the parsed body, mapping every failure onto a
 * user-safe Spanish message.
 *
 * `apiFetch` already rejects on a network failure (fetch itself throws); that
 * is re-wrapped here so a caller sees one error vocabulary rather than a raw
 * `TypeError: Failed to fetch`. The 401 sentinel is re-thrown untouched so the
 * redirect it triggered is not masked by a toast.
 */
async function requestNotificationJSON<T>(
    url: string,
    init: RequestInit,
    fallbackMessage: string,
): Promise<T> {
    let res: Response;
    try {
        res = await apiFetch(url, init);
    } catch (err) {
        // apiFetch throws "Session expired" on 401 after starting the redirect.
        if (err instanceof Error && err.message === "Session expired") throw err;
        throw new Error("Error de red: no se pudo contactar al servidor. Verifica tu conexión.");
    }

    if (!res.ok) {
        // Read (and discard) the body so the connection is not left dangling;
        // the parsed detail is used only for a dev-console breadcrumb, never
        // shown to the user.
        let detail: string | null = null;
        try {
            detail = parseFastApiDetail(await res.text());
        } catch {
            detail = null;
        }
        if (detail && import.meta.env.DEV) {
            console.warn(`[notifications] ${res.status} ${url}: ${detail}`);
        }
        throw new NotificationApiError(res.status, notificationErrorMessage(res.status, fallbackMessage));
    }

    return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Query construction
// ---------------------------------------------------------------------------

/**
 * Builds the querystring for the list and read-all endpoints.
 *
 * `type` is **repeatable** — `?type=A&type=B` — which is what the API's
 * `list[NotificationType]` parameter expects. A comma-joined single value would
 * be rejected with 422; the contract does not define one.
 */
function buildNotificationQuery(filters: NotificationListFilters): string {
    const params = new URLSearchParams();

    if (filters.cursor) params.set("cursor", filters.cursor);
    if (filters.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters.unreadOnly) params.set("unread_only", "true");
    for (const type of filters.types ?? []) {
        if (type) params.append("type", type);
    }
    if (filters.since) params.set("since", filters.since);
    if (filters.until) params.set("until", filters.until);

    const query = params.toString();
    return query ? `?${query}` : "";
}

/** Exported for the service tests, which assert the exact wire format. */
export const __test__ = { buildNotificationQuery };

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** The caller's own inbox, newest first, cursor-paginated. */
export async function listNotifications(
    filters: NotificationListFilters = {},
): Promise<NotificationListResponse> {
    return requestNotificationJSON<NotificationListResponse>(
        `${NOTIFICATIONS_URL}${buildNotificationQuery(filters)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        "No fue posible cargar las notificaciones.",
    );
}

/**
 * The polling endpoint: a single indexed COUNT(*), the cheapest call in this
 * API. The list endpoint is never polled for badge state.
 */
export async function getUnreadNotificationCount(): Promise<NotificationUnreadCountResponse> {
    return requestNotificationJSON<NotificationUnreadCountResponse>(
        `${NOTIFICATIONS_URL}/unread-count`,
        { method: "GET", headers: { Accept: "application/json" } },
        "No fue posible obtener el número de notificaciones sin leer.",
    );
}

/**
 * Marks one inbox row read. Takes a **`recipient_id`**, never a
 * `notification_id` — the latter returns 404.
 *
 * Idempotent server-side: a repeat returns 200 with the original `read_at`, so
 * this is safe to fire optimistically and safe from two tabs at once.
 */
export async function markNotificationRead(recipientId: string): Promise<NotificationReadResponse> {
    return requestNotificationJSON<NotificationReadResponse>(
        `${NOTIFICATIONS_URL}/${encodeURIComponent(recipientId)}/read`,
        { method: "POST" },
        "No fue posible actualizar la notificación.",
    );
}

/**
 * Marks the caller's unread rows read, narrowed by the same `type`/`since`/
 * `until` filters as the list so the button can mean "everything I am currently
 * looking at".
 *
 * Takes no `unread_only`: the operation targets unread rows by definition, and
 * the API does not accept the parameter.
 */
export async function markAllNotificationsRead(
    filters: NotificationReadAllFilters = {},
): Promise<NotificationReadAllResponse> {
    const query = buildNotificationQuery({
        types: filters.types,
        since: filters.since,
        until: filters.until,
    });
    return requestNotificationJSON<NotificationReadAllResponse>(
        `${NOTIFICATIONS_URL}/read-all${query}`,
        { method: "POST" },
        "No fue posible marcar las notificaciones como leídas.",
    );
}
