/**
 * Céluma 1.3, Phase 3, Block D — typed client for the two preference
 * endpoints:
 *
 *   GET /api/v1/notification-preferences
 *   PUT /api/v1/notification-preferences
 *
 * Nothing else exists under that path. There is no per-type endpoint, no
 * admin endpoint, no tenant-default endpoint and no delivery endpoint, and
 * this file must stay that short.
 *
 * Written to the same conventions as `services/notification_service.ts`
 * (Block C), which is the pattern for every new service module — not the
 * older ones that each re-implement token lookup and error parsing:
 *
 *   - every call goes through `apiFetch`, so the 401 session-expiry redirect
 *     lives in one place and a 403 stays an ordinary permission error;
 *   - the backend's `detail` string is never shown, only logged in DEV;
 *   - failures throw a typed error carrying `.status`, so callers branch
 *     structurally rather than on prose;
 *   - the `"Session expired"` sentinel is re-thrown untouched, so a redirect
 *     never gets a toast on top of it.
 *
 * **No polling.** These are one-shot calls made when the Profile section
 * mounts and when the user saves. The Notification Center's provider remains
 * the application's only polling owner.
 */
import { apiFetch } from "../lib/api_fetch";
import { parseFastApiDetail } from "../lib/api_error";
import type {
    NotificationPreferenceListResponse,
    NotificationPreferenceUpdateRequest,
    NotificationPreferenceUpdateResponse,
} from "../models/notification_preference";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

const PREFERENCES_URL = `${base}/v1/notification-preferences`;

/**
 * Spanish messages per status. Deliberately generic: the backend's `detail`
 * is developer-facing English and can echo internals.
 *
 * 422 is the interesting one here. The API answers it for a duplicate type,
 * an unknown type, an attempt to enable email on a type whose policy forbids
 * it, and any attempt to send `in_app_enabled`. The UI prevents all four, so
 * reaching this message means a client bug rather than a user mistake — the
 * copy therefore points at the state being invalid rather than asking the
 * user to correct something they cannot see.
 */
function preferenceErrorMessage(status: number, fallback: string): string {
    if (status === 400) return "La solicitud no es válida.";
    if (status === 403) return "No tienes permiso para realizar esta acción.";
    if (status === 404) return "Las preferencias de notificaciones no están disponibles.";
    if (status === 422) return "Las preferencias seleccionadas no son válidas.";
    if (status === 429) return "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.";
    if (status >= 500) return "Error del servidor. Inténtalo de nuevo más tarde.";
    return fallback;
}

/**
 * Carries the HTTP status alongside the Spanish message, mirroring
 * `NotificationApiError`. A separate class rather than a shared one: the two
 * services answer for different endpoints with different status vocabularies,
 * and a caller that catches one should not silently also catch the other.
 */
export class NotificationPreferenceApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "NotificationPreferenceApiError";
        this.status = status;
    }
}

export function isNotificationPreferenceApiError(
    err: unknown,
): err is NotificationPreferenceApiError {
    return err instanceof NotificationPreferenceApiError;
}

async function requestPreferenceJSON<T>(
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
        // the parsed detail is a DEV-only breadcrumb, never shown.
        let detail: string | null = null;
        try {
            detail = parseFastApiDetail(await res.text());
        } catch {
            detail = null;
        }
        if (detail && import.meta.env.DEV) {
            console.warn(`[notification-preferences] ${res.status} ${url}: ${detail}`);
        }
        throw new NotificationPreferenceApiError(
            res.status,
            preferenceErrorMessage(res.status, fallbackMessage),
        );
    }

    return (await res.json()) as T;
}

/**
 * Every notification type's effective preference for the authenticated user.
 *
 * Takes no arguments by design: there is no filter, no pagination and no
 * scope parameter — the response is always all six types, in a fixed order,
 * for whoever the token identifies.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferenceListResponse> {
    return requestPreferenceJSON<NotificationPreferenceListResponse>(
        PREFERENCES_URL,
        { method: "GET", headers: { Accept: "application/json" } },
        "No fue posible cargar tus preferencias de notificaciones.",
    );
}

/**
 * Saves a **partial** batch of changes and returns the full effective list.
 *
 * Partial, not a full replace: only the types the user actually changed are
 * sent, so a build that does not yet know about a newly added type cannot
 * reset it. Atomic server-side — one invalid item means none of the batch is
 * applied — which is why callers can treat a rejection as "nothing changed"
 * and keep the user's edits on screen.
 */
export async function updateNotificationPreferences(
    request: NotificationPreferenceUpdateRequest,
): Promise<NotificationPreferenceUpdateResponse> {
    return requestPreferenceJSON<NotificationPreferenceUpdateResponse>(
        PREFERENCES_URL,
        {
            method: "PUT",
            headers: { Accept: "application/json" },
            body: JSON.stringify(request),
        },
        "No fue posible guardar tus preferencias de notificaciones.",
    );
}
