/**
 * Centralised user-feedback helpers for Céluma.
 *
 * Use these instead of sprinkling message.error / notification calls
 * ad-hoc throughout the app, so tone, severity and format stay consistent.
 *
 * All toasts share the same placement, duration, and CSS class so they
 * can be uniformly styled via .celuma-notification in index.css.
 *
 * The module expects registerCelumaNotification() to be called once at
 * startup (inside <App>) so the context-aware instance from App.useApp()
 * is used. Falls back to the static API when the proxy hasn't mounted yet.
 */
import { notification as staticNotification } from "antd";
import type { NotificationInstance } from "antd/es/notification/interface";
import { getErrorMessage, isSessionExpiredError } from "./api_error";

const PLACEMENT = "topRight" as const;
const CLASS = "celuma-notification";

let _api: NotificationInstance | null = null;

/** Call once from CelumaNotificationProxy to wire the context-aware API. */
export function registerCelumaNotification(api: NotificationInstance): void {
    _api = api;
}

function api(): NotificationInstance {
    return _api ?? staticNotification;
}

/** Success toast — profile saved, password changed, etc. */
export function showCelumaSuccess(message: string, description?: string): void {
    api().success({ message, description, placement: PLACEMENT, duration: 4, className: CLASS });
}

/**
 * Warning toast — wrong current password, non-critical validation issues, etc.
 * @param message  Short title.
 * @param description  Optional longer detail.
 */
export function showCelumaWarning(message: string, description?: string): void {
    api().warning({ message, description, placement: PLACEMENT, duration: 6, className: CLASS });
}

/**
 * Shows a toast for any API / fetch error.
 * Skips silently when the error is the "Session expired" sentinel from
 * apiFetch (which already triggers a redirect).
 */
export function showCelumaApiError(err: unknown, fallback = "Ocurrió un error inesperado."): void {
    if (isSessionExpiredError(err)) return;
    const msg = getErrorMessage(err) || fallback;
    api().error({ message: "Error", description: msg, placement: PLACEMENT, duration: 5, className: CLASS });
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
    api().warning({ message: "Acceso denegado", description, placement: PLACEMENT, duration: 6, className: CLASS });
}
