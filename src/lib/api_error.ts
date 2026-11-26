/**
 * Utilities for parsing FastAPI error responses and turning ANY error into a
 * message a user can read: always in Spanish, never a raw response body, an
 * HTTP status line, a JSON blob, a stack trace or an English backend string.
 *
 * Céluma 1.5 (#65): the single place where error text is sanitized. Every
 * screen that shows an error should go through `getErrorMessage` (or
 * `showCelumaApiError`), which accepts whatever a service threw — including
 * the legacy `"Error al X: 409 - {json}"` shape — and returns safe Spanish.
 */

/** Known English backend messages → Spanish translation. */
const BACKEND_MSG_ES: Record<string, string> = {
    "Current password is incorrect": "La contraseña actual es incorrecta.",
    "Current password is required to set a new password": "Debes ingresar tu contraseña actual para cambiarla.",
    "Username already registered for this tenant": "Ese nombre de usuario ya está en uso.",
    "Username already taken": "Ese nombre de usuario ya está en uso.",
    "Email already registered for this tenant": "Ese correo electrónico ya está registrado.",
    "User with this email already exists": "Ese correo electrónico ya está registrado.",
    "There's already a pending invitation for this email": "Ya existe una invitación pendiente para ese correo electrónico.",
    "Failed to update profile": "No se pudo actualizar el perfil.",
    "Failed to update password": "No se pudo actualizar la contraseña.",
    "Cannot submit report for review without reviewers assigned": "No es posible enviar el reporte a revisión sin tener un revisor asignado.",
    "Only users with the 'reviewer' role can sign reports": "Solo los usuarios con el rol de Revisor pueden firmar reportes.",
    "Invalid credentials": "Usuario o contraseña incorrectos.",
    "Invalid authentication credentials": "Tu sesión expiró. Vuelve a iniciar sesión.",
    "Not authenticated": "Tu sesión expiró. Vuelve a iniciar sesión.",
    "Token has been revoked": "Tu sesión expiró. Vuelve a iniciar sesión.",
    "User account is inactive": "Tu cuenta está inactiva. Contacta al administrador de tu laboratorio.",
    "Invalid token": "El enlace no es válido o ya expiró.",
    "Invalid or expired reset token": "El enlace para restablecer la contraseña no es válido o ya expiró.",
    "Reset token has expired": "El enlace para restablecer la contraseña ya expiró.",
    "Invitation has expired": "La invitación ya expiró.",
    "Invitation not found or already used": "La invitación no existe o ya fue utilizada.",
    "Uploaded file is empty": "El archivo está vacío.",
    "Uploaded file must be a PDF": "El archivo debe ser un PDF.",
    "The document is too large": "El documento es demasiado grande.",
    "Signature file size must be less than 2MB": "La imagen de la firma debe pesar menos de 2 MB.",
    "Cannot deactivate the last administrator": "No puedes desactivar al último administrador del laboratorio.",
    "Requesting physician is inactive": "El médico solicitante está inactivo.",
    "Requesting physician code already exists for this tenant": "Ya existe un médico solicitante con ese código.",
    "Branch code already exists for this tenant": "Ya existe una sucursal con ese código.",
    "An order without a patient needs at least one requesting physician": "Una orden sin paciente necesita al menos un médico solicitante.",
    "Report is not yet available": "El reporte aún no está disponible.",
    "Cannot generate a PDF for a published or retracted report": "No se puede generar el PDF de un reporte publicado o retractado.",
    "Report access blocked due to pending payment": "El reporte no está disponible porque hay un pago pendiente.",
    "PDF not available for this report": "El PDF de este reporte no está disponible.",
    "You are not authorized to view this report": "No tienes permiso para ver este reporte.",
    "Report not found with this access code": "No se encontró un reporte con ese código de acceso.",
    "No current version found for this report": "El reporte no tiene una versión vigente.",
    "Version is already archived": "La versión ya está archivada.",
    "Cannot archive the active version. Activate a replacement version first.": "No se puede archivar la versión activa. Activa otra versión primero.",
    "Cannot replace the PDF of a signed report version": "No se puede reemplazar el PDF de una versión firmada.",
    "Sample type is referenced by samples; deactivate it instead": "El tipo de muestra está en uso por muestras existentes; desactívalo en lugar de eliminarlo.",
    "Selected records conflict with the destination catalog; nothing was created": "Los registros seleccionados entran en conflicto con el catálogo de destino; no se creó nada.",
    "The plan changed since the preview; review the new preview": "El plan cambió desde la vista previa; revisa la nueva vista previa.",
    "Template version configuration is invalid": "La configuración de la versión de la plantilla no es válida.",
    "This letterhead has no active version yet": "Este membrete aún no tiene una versión activa.",
    "The current version does not belong to the open amendment.": "La versión actual no pertenece a la enmienda abierta.",
    "Field required": "Falta un dato obligatorio.",
};

/** English entity names used in backend "X not found" / "X does not belong…" messages. */
const ENTITY_ES: Record<string, string> = {
    order: "La orden",
    sample: "La muestra",
    report: "El reporte",
    "report or version": "El reporte o su versión",
    tenant: "El laboratorio",
    laboratory: "El laboratorio",
    branch: "La sucursal",
    user: "El usuario",
    "study type": "El tipo de estudio",
    patient: "El paciente",
    template: "La plantilla",
    "report template": "La plantilla de reporte",
    "template version": "La versión de la plantilla",
    invoice: "La factura",
    "requesting physician": "El médico solicitante",
    "storage object": "El archivo",
    "signature object": "La firma",
    "report version": "La versión del reporte",
    "report section": "La sección del reporte",
    "price catalog entry": "El precio del catálogo",
    "sample type": "El tipo de muestra",
    type: "El tipo",
    letterhead: "El membrete",
    "letterhead version": "La versión del membrete",
    image: "La imagen",
    notification: "La notificación",
    operation: "La operación",
    review: "La revisión",
    label: "La etiqueta",
    invitation: "La invitación",
};

const REPORT_STATUS_ES: Record<string, string> = {
    DRAFT: "borrador",
    IN_REVIEW: "en revisión",
    APPROVED: "aprobado",
    PUBLISHED: "publicado",
    RETRACTED: "retractado",
};

function entityEs(raw: string): string | null {
    const key = raw.trim().toLowerCase().replace(/\s+\S*\d\S*$/, ""); // "Branch 1234" → "branch"
    return ENTITY_ES[key] ?? null;
}

/** Pattern rules for the families of English backend messages. */
const BACKEND_PATTERNS_ES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^permission required\b/i, () => "No tienes permiso para realizar esta acción."],
    // Céluma 1.5 (#94): catalog type removal.
    [/^(Study|Sample) type with code '(.+)' already exists: the code belongs to a type removed from the catalog/i, (m) =>
        `El código «${m[2]}» pertenece a un tipo de ${m[1].toLowerCase() === "study" ? "estudio eliminado del catálogo que tiene órdenes registradas" : "muestra eliminado del catálogo que tiene muestras registradas"} (incluidas las retiradas), por eso sigue reservado; usa otro código.`],
    [/^(Study|Sample) type '(.+)' was removed from the catalog/i, (m) =>
        `El tipo de ${m[1].toLowerCase() === "study" ? "estudio" : "muestra"} «${m[2]}» fue eliminado del catálogo y ya no se puede usar.`],
    [/^(.+?) not found(?: (?:or not in tenant|for this (?:order|case|report)))?\.?$/i, (m) => {
        const entity = entityEs(m[1]);
        return entity ? `${entity} no existe o ya no está disponible.` : "No se encontró el recurso solicitado.";
    }],
    [/^(.+?) does not belong to (?:your|this|the current) tenant\.?$/i, (m) => {
        const entity = entityEs(m[1]);
        return entity ? `${entity} no pertenece a tu laboratorio.` : "El recurso no pertenece a tu laboratorio.";
    }],
    [/^cannot (?:update|create orders for) (?:a )?different tenant$/i, () => "No puedes modificar datos de otro laboratorio."],
    [/^cannot (\w+) report in (?:ReportStatus\.)?(\w+) status$/i, (m) => {
        const status = REPORT_STATUS_ES[m[2].toUpperCase()];
        return status
            ? `El reporte está ${status} y ya no admite esta acción. Recarga la página para ver su estado actual.`
            : "El estado del reporte ya no admite esta acción. Recarga la página para ver su estado actual.";
    }],
    [/^cannot replace the pdf for a report in/i, () => "El estado del reporte no permite reemplazar su PDF."],
    [/already (?:exists|registered|taken)/i, () => "Ya existe un registro con esos datos."],
    [/^file too large/i, () => "El archivo es demasiado grande."],
    [/^sample type '.*' is inactive/i, () => "El tipo de muestra está desactivado y no puede usarse en muestras nuevas."],
    [/^(?:invalid|unknown) /i, () => "Alguno de los datos enviados no es válido."],
    [/^limit must be between/i, () => "Alguno de los datos enviados no es válido."],
];

const SPANISH_HINT = /[áéíóúñü¿¡]|\b(?:el|la|los|las|de|del|al|en|que|se|una?|para|con|por|sin|tu|su|sus|este|esta|hay|falta|está|están|es|ya|debe|puede|revisa|inténtalo)\b/gi;
const ENGLISH_HINT = /\b(?:the|not|cannot|can't|must|is|are|was|were|found|required|invalid|failed|already|does|unable|request|could|should|with|this|your|exists?|unknown|missing|error|denied|unauthorized|forbidden|internal|server|expected|input|value|field|of|for|and|from|has|have|been|to|received|access|no)\b/gi;

/** True when the text reads as Spanish (and not as an English message with a Spanish word). */
export function looksSpanish(text: string): boolean {
    const es = text.match(SPANISH_HINT)?.length ?? 0;
    const en = text.match(ENGLISH_HINT)?.length ?? 0;
    return es > 0 && es >= en;
}

/** Translates a known backend English string; returns it unchanged if not mapped. */
export function localizeBackendMessage(msg: string): string {
    const trimmed = msg.trim();
    const exact = BACKEND_MSG_ES[trimmed] ?? BACKEND_MSG_ES[trimmed.replace(/\.$/, "")];
    if (exact) return exact;
    for (const [pattern, translate] of BACKEND_PATTERNS_ES) {
        const m = trimmed.match(pattern);
        if (m) return translate(m);
    }
    return msg;
}

interface FastApiDetail {
    /** Plain message, validation-error array, or a structured `{code, message}` (catalog transfer, numbering). */
    detail?: string | Array<{ msg: string; loc?: unknown[] }> | { code?: string; message?: string };
    message?: string;
}

/**
 * Extracts a readable string from a FastAPI `detail` field.
 * Handles both string details and validation-error arrays.
 */
export function parseFastApiDetail(bodyText: string): string | null {
    try {
        const parsed: FastApiDetail = JSON.parse(bodyText);
        if (parsed === null || typeof parsed !== "object") return null;
        const { detail } = parsed;
        if (!detail) return typeof parsed.message === "string" ? parsed.message : null;
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail)) {
            return detail.map((e) => e.msg).join(". ");
        }
        if (typeof detail === "object" && typeof detail.message === "string") return detail.message;
    } catch {
        // body is not JSON — return as-is if it looks like plain text (never markup)
        const trimmed = bodyText.trim();
        if (trimmed && trimmed.length < 300 && !/^</.test(trimmed)) return trimmed;
    }
    return null;
}

/** Reads the machine-readable `detail.code` of a structured error body, if any. */
export function parseFastApiCode(bodyText: string): string | null {
    try {
        const detail = (JSON.parse(bodyText) as { detail?: unknown } | null)?.detail;
        if (detail && typeof detail === "object" && !Array.isArray(detail)) {
            const { code } = detail as { code?: unknown };
            return typeof code === "string" ? code : null;
        }
    } catch {
        /* not JSON */
    }
    return null;
}

export const GENERIC_ERROR_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
export const NETWORK_ERROR_MESSAGE = "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";
export const SESSION_EXPIRED_MESSAGE = "Tu sesión expiró. Vuelve a iniciar sesión.";

/**
 * A server-provided message (usually a success notice such as "Report approved")
 * when it reads as Spanish; otherwise the caller's Spanish message.
 */
export function spanishOr(serverMessage: string | null | undefined, spanish: string): string {
    const text = (serverMessage ?? "").trim();
    return text && looksSpanish(text) ? text : spanish;
}

/** A generic Spanish message for an HTTP status with no usable detail. */
export function httpStatusMessage(status: number): string {
    if (status === 400) return "La solicitud no es válida. Revisa los datos e inténtalo de nuevo.";
    if (status === 401) return SESSION_EXPIRED_MESSAGE;
    if (status === 403) return "No tienes permiso para realizar esta acción.";
    if (status === 404) return "No se encontró el recurso solicitado.";
    if (status === 408) return "El servidor tardó demasiado en responder. Inténtalo de nuevo.";
    if (status === 409) return "La operación entra en conflicto con el estado actual. Recarga la página e inténtalo de nuevo.";
    if (status === 413) return "El archivo o los datos enviados son demasiado grandes.";
    if (status === 415) return "El tipo de archivo no es compatible.";
    if (status === 422) return "Los datos enviados no son válidos. Revisa los campos e inténtalo de nuevo.";
    if (status === 429) return "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.";
    if (status >= 500) return "Error del servidor. Inténtalo de nuevo más tarde.";
    return GENERIC_ERROR_MESSAGE;
}

/**
 * Spanish messages for structured `{code, message}` refusals whose `message`
 * the backend writes in English (numbering, catalog transfer). A Spanish
 * message from the server still wins: it is usually more specific.
 */
const CODE_MSG_ES: Record<string, string> = {
    numbering_branch_code_unsafe: "El código de la sucursal está vacío o tiene caracteres no permitidos en un código generado (letras, dígitos, «.», «_» y «-»).",
    numbering_code_too_long: "El código generado sería demasiado largo; acorta el código base o el formato.",
    numbering_receipt_date_invalid: "La fecha de recepción no es válida en la zona horaria de la numeración.",
    numbering_receipt_date_required: "La fecha de recepción de la muestra es obligatoria para asignarle un código.",
    numbering_exhausted: "No se encontró un código libre; revisa el formato de numeración y los códigos existentes.",
    numbering_invalid_config: "La configuración de numeración no es válida.",
    numbering_manual_policy_unsupported: "Esta política de códigos manuales no es compatible.",
    numbering_type_config_conflict: "Hay tipos con numeración propia cuyo formato no es compatible con el nuevo alcance del contador; actualízalos o usa la del laboratorio antes de cambiarlo.",
    invalid_document: "El archivo no es una exportación válida de Céluma.",
    unsupported_schema: "El archivo no es una exportación de catálogo de Céluma.",
    unsupported_version: "La versión del archivo exportado no es compatible con esta versión de Céluma.",
    unsupported_catalog_kind: "El tipo de catálogo del archivo no es compatible.",
    too_many_items: "El archivo o la selección tiene demasiados registros.",
    body_too_large: "El documento es demasiado grande.",
    empty_selection: "Selecciona al menos un registro.",
    invalid_id: "Alguno de los registros seleccionados no es válido.",
    unknown_index: "Alguno de los registros seleccionados no es válido.",
    invalid_selection: "Alguno de los registros seleccionados no es válido.",
    study_type_not_found: "Uno o más tipos de estudio ya no existen.",
    study_type_removed: "El tipo de estudio fue eliminado del catálogo: ya no se puede usar, editar ni copiar.",
    sample_type_removed: "El tipo de muestra fue eliminado del catálogo: ya no se puede usar ni editar.",
    removal_reason_too_long: "El motivo admite como máximo 500 caracteres.",
    preview_stale: "El catálogo cambió desde la vista previa; revisa la nueva vista previa.",
    conflicts: "Los registros seleccionados entran en conflicto con el catálogo de destino; no se creó nada.",
    concurrent_conflict: "Los registros seleccionados entran en conflicto con el catálogo de destino; no se creó nada.",
    order_not_directly_modifiable: "Esta orden ya no puede modificarse directamente. Revisa los motivos indicados en la orden.",
    order_in_review: "No se pueden agregar muestras mientras la orden o su reporte están en revisión.",
};

/** A backend detail made safe to show, or null when it cannot be shown in Spanish. */
function safeDetail(raw: string | null): string | null {
    if (!raw) return null;
    const localized = localizeBackendMessage(raw).trim();
    if (!localized || localized.length > 400) return null;
    return looksSpanish(localized) ? localized : null;
}

/** Codes whose refusal names the catalog types it is about (`detail.types`); the message lists them. */
const CODES_LISTING_TYPES = new Set(["numbering_type_config_conflict"]);
/** A catalog type code, as the backend sends it: short and with no markup or spaces. */
const TYPE_CODE = /^[A-Za-z0-9._-]{1,32}$/;

/** The catalog type codes a structured refusal names, when they are safe to show (at most 20). */
function bodyTypeCodes(bodyText: string): string[] {
    try {
        const types = (JSON.parse(bodyText) as { detail?: { types?: unknown } } | null)?.detail?.types;
        if (!Array.isArray(types)) return [];
        return types.filter((t): t is string => typeof t === "string" && TYPE_CODE.test(t)).slice(0, 20);
    } catch {
        return [];
    }
}

/** The Spanish detail of a raw response body: the server's own text, else a known code's message. */
function safeBodyDetail(bodyText: string): string | null {
    const detail = safeDetail(parseFastApiDetail(bodyText));
    if (detail) return detail;
    const code = parseFastApiCode(bodyText);
    const message = code ? CODE_MSG_ES[code] ?? null : null;
    if (!message || !code || !CODES_LISTING_TYPES.has(code)) return message;
    const types = bodyTypeCodes(bodyText);
    return types.length ? `${message} Tipos: ${types.join(", ")}.` : message;
}

/**
 * Builds a user-facing error message from an HTTP status + raw response body.
 * A Spanish (or translated) backend detail wins — it is the actionable part;
 * otherwise a generic Spanish message for the status. 5xx never exposes detail.
 */
export function formatHttpError(status: number, bodyText: string): string {
    if (status >= 500) return httpStatusMessage(status);
    return safeBodyDetail(bodyText) ?? httpStatusMessage(status);
}

const NETWORK_PATTERN = /failed to fetch|networkerror|network ?error|\bload failed|network request failed|err_connection|econnrefused|err_internet_disconnected|the internet connection appears to be offline/i;
const STACK_PATTERN = /\n\s+at\s|Traceback \(most recent call last\)|^\s*(?:TypeError|ReferenceError|SyntaxError|RangeError):/m;
/** "Error al X: 409 - {…}", "Error al X: 409 Conflict", "404 Not Found", "Request failed: 500", "HTTP 500", "500". */
const STATUS_PATTERN = /^(?:[^:\n]{0,160}:\s*)?(?:HTTP\s+|Error\s+)?([45]\d{2})(?:\s*[-–]\s*|\s+|$)([\s\S]*)$/;
/** An HTTP reason phrase such as "Not Found" or "Internal Server Error". */
const REASON_PHRASE = /^[A-Z][a-zA-Z]*(?: [A-Z][a-zA-Z-]*)*$/;

function isEnglish(text: string): boolean {
    return !looksSpanish(text) && (text.match(ENGLISH_HINT)?.length ?? 0) > 0;
}

/**
 * Turns any error text into a message safe to show to a user, in Spanish.
 * `fallback` is the context-specific message used when nothing better can be said.
 */
export function sanitizeErrorMessage(raw: string, fallback: string = GENERIC_ERROR_MESSAGE, status?: number): string {
    // A Spanish message with the status appended for debugging ("No se pudo cargar el historial (404)")
    // reads fine without it: the code is technical noise for the user.
    const text = (raw ?? "").trim().replace(/\s*\((?:HTTP\s*)?[1-5]\d{2}\)(?=\.?$)/, "");
    if (!text) return status ? httpStatusMessage(status) : fallback;
    if (text === "Session expired") return SESSION_EXPIRED_MESSAGE;
    if (NETWORK_PATTERN.test(text)) return NETWORK_ERROR_MESSAGE;
    if (STACK_PATTERN.test(text)) return fallback;

    // A raw body (JSON or markup) thrown as the message.
    if (/^[{[<]/.test(text)) {
        if (status !== undefined && status >= 500) return httpStatusMessage(status);
        return safeBodyDetail(text) ?? (status ? httpStatusMessage(status) : fallback);
    }

    // A message that embeds an HTTP status and maybe a body.
    const m = text.match(STATUS_PATTERN);
    if (m) {
        const code = Number(m[1]);
        const body = m[2].trim();
        const isRawBody = /^[{[<]/.test(body);
        if (body === "" || isRawBody || REASON_PHRASE.test(body) || isEnglish(body)) {
            if (code >= 500) return httpStatusMessage(code);
            const detail = isRawBody ? safeBodyDetail(body) : safeDetail(body);
            return detail ?? fallbackFor(code, fallback);
        }
    }

    const detail = safeDetail(text);
    if (detail) return detail;
    return status ? fallbackFor(status, fallback) : fallback;
}

/** The caller's context message when it has one; the status message otherwise. */
function fallbackFor(status: number, fallback: string): string {
    if (fallback !== GENERIC_ERROR_MESSAGE) return fallback;
    return httpStatusMessage(status);
}

/**
 * Extracts a display message from any thrown value, sanitized (Spanish, no
 * raw bodies). Understands plain Error objects and enriched API errors that
 * carry a numeric `status`.
 */
export function getErrorMessage(err: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string {
    if (err instanceof Error) {
        const { status, code } = err as { status?: unknown; code?: unknown };
        // An API error that carries a known machine code says more than the caller's generic fallback.
        const byCode = typeof code === "string" ? CODE_MSG_ES[code] : undefined;
        return sanitizeErrorMessage(err.message, byCode ?? fallback, typeof status === "number" ? status : undefined);
    }
    if (typeof err === "string") return sanitizeErrorMessage(err, fallback);
    return fallback;
}

/**
 * Returns true when the error message is the sentinel thrown by apiFetch
 * on 401 (session expiry), so callers can skip showing a second toast.
 */
export function isSessionExpiredError(err: unknown): boolean {
    return err instanceof Error && err.message === "Session expired";
}
