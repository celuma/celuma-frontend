/**
 * Céluma 1.3, Phase 3, Block D — frontend contract for notification
 * preferences.
 *
 * A focused module beside `models/notification.ts` rather than an addition to
 * it. The two describe different endpoints with different lifetimes: the
 * inbox model is polled by the one provider and rendered on three surfaces,
 * while these types are loaded once by one section of the Profile page. Every
 * shared vocabulary item — the six `NotificationType` values, their Spanish
 * labels, the type chip — is **imported** from `models/notification.ts`, never
 * restated, so the two files cannot drift into two competing lists of what a
 * notification type is.
 *
 * Nothing here carries a `user_id` or a `tenant_id`. The endpoints are
 * self-scoped and take their scope from the token; the request schema
 * `extra="forbid"`s those fields, so sending one is a 422 rather than a
 * silently ignored parameter.
 */
import type { NotificationType } from "./notification";

/**
 * One notification type's **effective** preference.
 *
 * "Effective", not "stored": the backend returns all six types whether or not
 * a `notification_preference` row exists for them, so a client never has to
 * decide what a missing entry would have meant. `is_explicit` is the only
 * thing distinguishing "the user chose this" from "this is the default".
 */
export interface NotificationPreferenceItem {
    notification_type: NotificationType;
    /**
     * Always `true` in Céluma 1.3 and not user-editable — internal
     * notifications are the durable operational channel. Returned so a future
     * block can expose it without a contract change; there is deliberately no
     * control for it in the UI.
     */
    in_app_enabled: boolean;
    /**
     * Already bounded by backend policy: `false` whenever `email_supported`
     * is `false`, whatever any stored row says. The client renders this, it
     * does not re-derive it.
     */
    email_enabled: boolean;
    /**
     * Whether the type may use email at all. When `false` the switch is
     * disabled and the API refuses to enable it.
     */
    email_supported: boolean;
    /** True when a stored override backs these values. */
    is_explicit: boolean;
    /**
     * Naive UTC ISO string, or `null` for an implicit default — same
     * convention as every other Céluma timestamp, so it needs
     * `parseBackendUtcDate` if it is ever displayed.
     */
    updated_at: string | null;
}

export interface NotificationPreferenceListResponse {
    preferences: NotificationPreferenceItem[];
}

/**
 * One requested change. Only `email_enabled` is writable: there is no
 * `in_app_enabled` field here because the API rejects the whole request if it
 * receives one, and a field the client cannot legally send should not be
 * representable.
 */
export interface NotificationPreferenceUpdateItem {
    notification_type: NotificationType;
    email_enabled: boolean;
}

/**
 * A **partial** batch — only the types the user actually changed. The API
 * leaves every unmentioned type exactly as it was, so a client that knows
 * about five of six types cannot silently reset the sixth.
 */
export interface NotificationPreferenceUpdateRequest {
    preferences: NotificationPreferenceUpdateItem[];
}

/**
 * The update response is the full effective list, identical in shape to the
 * read. Local state is *replaced* by it rather than merged with an optimistic
 * guess, so the client ends up agreeing with the server about the values it
 * could not have predicted (a policy-bounded type, a row that was deleted for
 * matching the default).
 */
export type NotificationPreferenceUpdateResponse = NotificationPreferenceListResponse;

// ---------------------------------------------------------------------------
// Spanish copy — Profile's notification-preferences section
// ---------------------------------------------------------------------------
//
// Kept here beside the model, matching how `lib/notification_ui.ts` holds the
// Notification Center's copy in one place: it is what makes the UX contract
// checkable against the code rather than against a screenshot.

export const PREFERENCES_SECTION_TITLE = "Preferencias de notificaciones";
export const PREFERENCES_SECTION_DESCRIPTION =
    "Elige qué notificaciones quieres recibir también por correo electrónico. " +
    "Las notificaciones dentro de Céluma permanecerán activas.";

export const PREFERENCES_EMAIL_COLUMN = "Correo electrónico";
export const PREFERENCES_DEFAULT_BADGE = "Predeterminado";
export const PREFERENCES_EMAIL_UNSUPPORTED = "Disponible únicamente dentro de Céluma.";

export const PREFERENCES_SAVE = "Guardar preferencias";
export const PREFERENCES_RESET = "Restablecer";

export const PREFERENCES_LOADING = "Cargando preferencias…";
export const PREFERENCES_SAVE_SUCCESS_TITLE = "Preferencias guardadas";
export const PREFERENCES_SAVE_SUCCESS_DESCRIPTION =
    "Tus preferencias de notificaciones se actualizaron correctamente.";
export const PREFERENCES_LOAD_ERROR = "No fue posible cargar tus preferencias de notificaciones.";
export const PREFERENCES_SAVE_ERROR = "No fue posible guardar tus preferencias de notificaciones.";

/** Accessible name for one row's switch — the label alone is not unique enough. */
export function emailSwitchLabel(typeLabel: string): string {
    return `Recibir por correo electrónico: ${typeLabel}`;
}

/**
 * A short line of context per type, so a user is choosing between described
 * events rather than between enum labels. Deliberately generic: these describe
 * *when* a notification happens, never what a report contains.
 */
export const NOTIFICATION_TYPE_DESCRIPTIONS: Record<NotificationType, string> = {
    REPORT_SUBMITTED: "Cuando un reporte se envía a revisión y eres revisor.",
    REPORT_PDF_READY: "Cuando el PDF oficial de un reporte queda listo para firma.",
    REPORT_PUBLISHED: "Cuando un reporte se publica y firma.",
    REPORT_RETRACTED: "Cuando un reporte publicado se retracta.",
    ASSIGNMENT_ADDED: "Cuando se te asigna una orden o una muestra.",
    SAMPLE_STATUS_CHANGED: "Cuando cambia el estado de una muestra de tus órdenes.",
};
