/**
 * Centralised user-feedback helpers for Céluma.
 *
 * Use these instead of sprinkling message.error / notification calls
 * ad-hoc throughout the app, so tone, severity and format stay consistent.
 */
import { notification } from "antd";
import { getErrorMessage, isSessionExpiredError } from "./api_error";

/**
 * Shows a toast for any API / fetch error.
 * Skips silently when the error is the "Session expired" sentinel from
 * apiFetch (which already triggers a redirect).
 */
export function showCelumaApiError(err: unknown, fallback = "Ocurrió un error inesperado."): void {
    if (isSessionExpiredError(err)) return;
    const msg = getErrorMessage(err) || fallback;
    notification.error({
        message: "Error",
        description: msg,
        placement: "topRight",
        duration: 5,
    });
}

/**
 * Shows a warning notification when the user attempted to access a
 * resource they don't have permission for.
 *
 * @param routeLabel  Human-readable name of the section they tried to reach
 *                    (e.g. "Facturación"). Leave undefined for a generic message.
 */
export function showCelumaPermissionDenied(routeLabel?: string): void {
    const description = routeLabel
        ? `No tienes permiso para acceder a la sección "${routeLabel}".`
        : "No tienes permiso para acceder a esa sección.";

    notification.warning({
        message: "Acceso denegado",
        description,
        placement: "topRight",
        duration: 6,
    });
}
