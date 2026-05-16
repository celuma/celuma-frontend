/**
 * Utilities for parsing FastAPI error responses and converting them into
 * user-friendly Spanish messages. Works regardless of whether the caller
 * used apiFetch or a local fetch wrapper.
 */

/** Known English backend messages → Spanish translation. */
const BACKEND_MSG_ES: Record<string, string> = {
    "Current password is incorrect": "La contraseña actual es incorrecta.",
    "Current password is required to set a new password": "Debes ingresar tu contraseña actual para cambiarla.",
    "Username already registered for this tenant": "Ese nombre de usuario ya está en uso.",
    "Email already registered for this tenant": "Ese correo electrónico ya está registrado.",
    "Failed to update profile": "No se pudo actualizar el perfil.",
    "Failed to update password": "No se pudo actualizar la contraseña.",
};

/** Translates a known backend English string; returns it unchanged if not mapped. */
export function localizeBackendMessage(msg: string): string {
    return BACKEND_MSG_ES[msg] ?? msg;
}

interface FastApiDetail {
    detail?: string | Array<{ msg: string; loc?: unknown[] }>;
    message?: string;
}

/**
 * Extracts a readable string from a FastAPI `detail` field.
 * Handles both string details and validation-error arrays.
 */
export function parseFastApiDetail(bodyText: string): string | null {
    try {
        const parsed: FastApiDetail = JSON.parse(bodyText);
        const { detail } = parsed;
        if (!detail) return parsed.message ?? null;
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail)) {
            return detail.map((e) => e.msg).join(". ");
        }
    } catch {
        // body is not JSON — return as-is if it looks like plain text
        const trimmed = bodyText.trim();
        if (trimmed && trimmed.length < 300) return trimmed;
    }
    return null;
}

/**
 * Builds a user-facing error message from an HTTP status + raw response body.
 *
 * 403  → "Sin permiso" prefix, with backend detail appended when available.
 * 404  → "Recurso no encontrado."
 * 5xx  → "Error del servidor."
 * else → "Error inesperado (status)."
 */
export function formatHttpError(status: number, bodyText: string): string {
    const raw = parseFastApiDetail(bodyText);
    const detail = raw ? localizeBackendMessage(raw) : null;

    if (status === 403) {
        const suffix = detail ? `: ${detail}` : ".";
        return `No tienes permiso para realizar esta acción${suffix}`;
    }
    if (status === 404) return "Recurso no encontrado.";
    if (status >= 500) return "Error del servidor. Inténtalo de nuevo más tarde.";

    return detail ?? `Error inesperado (${status}).`;
}

/**
 * Cryptic browser-level errors we want to translate before showing to the
 * user. These are usually raised when a JSON parser hits HTML or when an
 * extension/network layer aborts the request.
 */
const OPAQUE_BROWSER_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
    /unexpected token .*<!?/i,
    /unexpected token '<'/i,
    /did not match the expected pattern/i,
    /^json parse error/i,
    /^load failed$/i,
    /^failed to fetch$/i,
    /^networkerror /i,
];

const OPAQUE_BROWSER_ERROR_MESSAGE =
    "El servidor devolvió una respuesta inválida. Es posible que el backend no esté disponible o que la ruta /api no esté bien configurada.";

/**
 * Replaces unhelpful browser-level error strings with a Spanish message
 * the user can act on. Other messages are returned unchanged.
 */
export function normalizeClientErrorMessage(msg: string): string {
    if (!msg) return msg;
    return OPAQUE_BROWSER_ERROR_PATTERNS.some((re) => re.test(msg))
        ? OPAQUE_BROWSER_ERROR_MESSAGE
        : msg;
}

/**
 * Extracts a display message from any thrown value.
 * Understands plain Error objects and enriched ApiError instances, and
 * rewrites opaque browser messages to something the user can act on.
 */
export function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return normalizeClientErrorMessage(err.message);
    if (typeof err === "string") return normalizeClientErrorMessage(err);
    return "Ocurrió un error inesperado.";
}

/**
 * Returns true when the error message is the sentinel thrown by apiFetch
 * on 401 (session expiry), so callers can skip showing a second toast.
 */
export function isSessionExpiredError(err: unknown): boolean {
    return err instanceof Error && err.message === "Session expired";
}
