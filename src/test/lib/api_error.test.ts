import { describe, expect, it } from "vitest";
import {
    GENERIC_ERROR_MESSAGE,
    NETWORK_ERROR_MESSAGE,
    SESSION_EXPIRED_MESSAGE,
    formatHttpError,
    getErrorMessage,
    httpStatusMessage,
    localizeBackendMessage,
    looksSpanish,
    parseFastApiCode,
    parseFastApiDetail,
    sanitizeErrorMessage,
    spanishOr,
} from "../../lib/api_error";

describe("api_error — structured detail (catalog transfer, monthly numbering)", () => {
    it("reads the message of a {code, message} detail", () => {
        const body = JSON.stringify({ detail: { code: "numbering_code_required", message: "A code is required: automatic numbering is disabled" } });
        expect(parseFastApiDetail(body)).toBe("A code is required: automatic numbering is disabled");
        // Céluma 1.5 (#65): an untranslated English detail is never shown; the user gets Spanish.
        expect(formatHttpError(422, body)).toBe("Los datos enviados no son válidos. Revisa los campos e inténtalo de nuevo.");
    });

    it("keeps handling string and validation-array details", () => {
        expect(parseFastApiDetail(JSON.stringify({ detail: "plain" }))).toBe("plain");
        expect(parseFastApiDetail(JSON.stringify({ detail: [{ msg: "a" }, { msg: "b" }] }))).toBe("a. b");
    });

    it("returns null for a detail object without a message", () => {
        expect(parseFastApiDetail(JSON.stringify({ detail: { code: "x" } }))).toBeNull();
    });

    it("never returns markup as a detail", () => {
        expect(parseFastApiDetail("<html><body>Bad Gateway</body></html>")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Céluma 1.5 (#65): every error a user sees is Spanish and never a raw body.
// ---------------------------------------------------------------------------

const body = (detail: unknown) => JSON.stringify({ detail });

describe("api_error — reading structured codes", () => {
    it("reads detail.code and ignores other shapes", () => {
        expect(parseFastApiCode(body({ code: "report_sample_codes_stale", message: "…" }))).toBe("report_sample_codes_stale");
        expect(parseFastApiCode(body("plain"))).toBeNull();
        expect(parseFastApiCode(body([{ msg: "x" }]))).toBeNull();
        expect(parseFastApiCode("not json")).toBeNull();
    });
});

describe("api_error — language detection", () => {
    it.each([
        "No tienes permiso para realizar esta acción.",
        "Error de red",
        "El membrete quedó fijado al enviar el reporte a revisión",
        "Revisor no puede asignarse",
    ])("reads %j as Spanish", (text) => {
        expect(looksSpanish(text)).toBe(true);
    });

    it.each([
        "No access token received from server",
        "Report not found",
        "Something exploded in the pipeline",
        "Not Found",
    ])("does not read %j as Spanish", (text) => {
        expect(looksSpanish(text)).toBe(false);
    });
});

describe("api_error — translating backend messages", () => {
    it.each([
        ["Invalid credentials", "Usuario o contraseña incorrectos."],
        ["Uploaded file must be a PDF", "El archivo debe ser un PDF."],
        ["Report not found", "El reporte no existe o ya no está disponible."],
        ["Study type not found", "El tipo de estudio no existe o ya no está disponible."],
        ["Branch 0f3a9 not found", "La sucursal no existe o ya no está disponible."],
        ["Widget not found", "No se encontró el recurso solicitado."],
        ["Order does not belong to your tenant", "La orden no pertenece a tu laboratorio."],
        ["Permission required: lab:read", "No tienes permiso para realizar esta acción."],
        ["Sample type with code 'BIO' already exists", "Ya existe un registro con esos datos."],
        ["File too large. Limit is 10MB for this file type", "El archivo es demasiado grande."],
        ["Sample type 'BIO' is inactive and cannot be used for new samples", "El tipo de muestra está desactivado y no puede usarse en muestras nuevas."],
    ])("%j → %j", (english, spanish) => {
        expect(localizeBackendMessage(english)).toBe(spanish);
    });

    it("names the report state in Spanish when a transition is refused", () => {
        expect(localizeBackendMessage("Cannot retract report in ReportStatus.DRAFT status")).toContain("borrador");
    });

    it("leaves unmapped text unchanged (the caller decides what to show)", () => {
        expect(localizeBackendMessage("Mensaje ya en español.")).toBe("Mensaje ya en español.");
    });
});

describe("api_error — formatHttpError", () => {
    it("prefers a Spanish detail, including a {code, message} one", () => {
        expect(formatHttpError(409, body({ code: "x", message: "La enmienda ya no está abierta." }))).toBe("La enmienda ya no está abierta.");
        expect(formatHttpError(400, body("Revisa la fecha de recepción."))).toBe("Revisa la fecha de recepción.");
    });

    it("translates a known English detail", () => {
        expect(formatHttpError(403, body("Permission required: lab:read"))).toBe("No tienes permiso para realizar esta acción.");
        expect(formatHttpError(404, body("Order not found"))).toBe("La orden no existe o ya no está disponible.");
    });

    it("replaces an untranslated English detail with the status message", () => {
        expect(formatHttpError(422, body([{ msg: "Field required" }, { msg: "Input should be a valid string" }])))
            .toBe(httpStatusMessage(422));
        expect(formatHttpError(409, body("Something exploded in the pipeline"))).toBe(httpStatusMessage(409));
    });

    it("never exposes a 5xx detail, even a Spanish one", () => {
        expect(formatHttpError(500, body("Falló la base de datos en el nodo 3"))).toBe("Error del servidor. Inténtalo de nuevo más tarde.");
    });

    it("gives Spanish for known codes whose message is English", () => {
        expect(formatHttpError(409, body({ code: "numbering_exhausted", message: "Could not find a free code after 10000 attempts" })))
            .toBe("No se encontró un código libre; revisa el formato de numeración y los códigos existentes.");
        expect(formatHttpError(409, body({ code: "order_not_directly_modifiable", message: "This order can no longer be changed directly: …", blockers: [] })))
            .toBe("Esta orden ya no puede modificarse directamente. Revisa los motivos indicados en la orden.");
        expect(formatHttpError(409, body({ code: "order_in_review", message: "Samples cannot be added while the order or its report is in review: " })))
            .toBe("No se pueden agregar muestras mientras la orden o su reporte están en revisión.");
    });

    it("an empty or markup body gives the status message", () => {
        expect(formatHttpError(404, "")).toBe("No se encontró el recurso solicitado.");
        expect(formatHttpError(413, "<html>Request Entity Too Large</html>")).toBe(httpStatusMessage(413));
    });
});

describe("api_error — sanitizeErrorMessage", () => {
    it("extracts the Spanish detail from the legacy 'Error al X: 409 - {json}' shape", () => {
        const raw = `Error al enviar reporte: 409 - ${body({ code: "report_sample_codes_stale", message: "Los códigos de muestra cambiaron." })}`;
        expect(sanitizeErrorMessage(raw)).toBe("Los códigos de muestra cambiaron.");
    });

    it("translates an English detail inside the legacy shape", () => {
        expect(sanitizeErrorMessage(`Error al obtener reporte: 404 - ${body("Report not found")}`))
            .toBe("El reporte no existe o ya no está disponible.");
    });

    it("uses the caller's message when the embedded detail cannot be shown", () => {
        const raw = `Error al guardar reporte: 409 - ${body("Conflict happened in the storage layer")}`;
        expect(sanitizeErrorMessage(raw, "No se pudo guardar el reporte.")).toBe("No se pudo guardar el reporte.");
    });

    it.each([
        ["404 Not Found", "No se encontró el recurso solicitado."],
        ["Error al obtener reporte: 404 - ", "No se encontró el recurso solicitado."],
        ["Request failed: 500", "Error del servidor. Inténtalo de nuevo más tarde."],
        ["HTTP 503", "Error del servidor. Inténtalo de nuevo más tarde."],
        ["403 Forbidden", "No tienes permiso para realizar esta acción."],
    ])("a bare status line %j becomes %j", (raw, expected) => {
        expect(sanitizeErrorMessage(raw)).toBe(expected);
    });

    it("a 5xx never shows its body", () => {
        expect(sanitizeErrorMessage(`Error al aprobar reporte: 500 - ${body("Falló la base de datos")}`))
            .toBe("Error del servidor. Inténtalo de nuevo más tarde.");
    });

    it("a raw JSON or HTML body thrown as the message is never shown", () => {
        expect(sanitizeErrorMessage(body("La plantilla elegida ya no está disponible."))).toBe("La plantilla elegida ya no está disponible.");
        expect(sanitizeErrorMessage(body({ code: "x" }), "No se pudo cargar.")).toBe("No se pudo cargar.");
        expect(sanitizeErrorMessage("<!doctype html><html><body>502 Bad Gateway</body></html>")).toBe(GENERIC_ERROR_MESSAGE);
    });

    it("network failures read as a connection problem", () => {
        for (const raw of ["Failed to fetch", "TypeError: Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
            expect(sanitizeErrorMessage(raw)).toBe(NETWORK_ERROR_MESSAGE);
        }
        // Safari's "Load failed" is a network error; an "Upload failed" is not.
        expect(sanitizeErrorMessage("Upload failed", "Error al subir la foto.")).toBe("Error al subir la foto.");
    });

    it("the apiFetch session sentinel reads as an expired session", () => {
        expect(sanitizeErrorMessage("Session expired")).toBe(SESSION_EXPIRED_MESSAGE);
    });

    it("a stack trace is never shown", () => {
        expect(sanitizeErrorMessage("Error: boom\n    at render (app.js:1:1)", "No se pudo cargar.")).toBe("No se pudo cargar.");
        expect(sanitizeErrorMessage("ReferenceError: x is not defined")).toBe(GENERIC_ERROR_MESSAGE);
    });

    it("an English message falls back to the caller's Spanish message", () => {
        expect(sanitizeErrorMessage("Upload failed", "Error al subir la foto.")).toBe("Error al subir la foto.");
        expect(sanitizeErrorMessage("No access token received from server")).toBe(GENERIC_ERROR_MESSAGE);
    });

    it("keeps Spanish messages as they are, including ones with numbers or colons", () => {
        expect(sanitizeErrorMessage("El archivo supera el límite de 100 MB.")).toBe("El archivo supera el límite de 100 MB.");
        expect(sanitizeErrorMessage("Límite: 450 caracteres")).toBe("Límite: 450 caracteres");
        expect(sanitizeErrorMessage("Las contraseñas no coinciden")).toBe("Las contraseñas no coinciden");
    });

    it("drops an HTTP status appended to a Spanish message", () => {
        expect(sanitizeErrorMessage("No se pudo cargar el historial (404)")).toBe("No se pudo cargar el historial");
        expect(sanitizeErrorMessage("No se pudo completar la operación (409).")).toBe("No se pudo completar la operación.");
        expect(sanitizeErrorMessage("No se pudo cargar la versión 3 (HTTP 500)")).toBe("No se pudo cargar la versión 3");
    });

    it("an empty message uses the status message when there is one, else the fallback", () => {
        expect(sanitizeErrorMessage("", undefined, 404)).toBe("No se encontró el recurso solicitado.");
        expect(sanitizeErrorMessage("   ", "No se pudo cargar.")).toBe("No se pudo cargar.");
    });
});

describe("api_error — getErrorMessage", () => {
    it("sanitizes Error messages", () => {
        expect(getErrorMessage(new Error("Report not found"))).toBe("El reporte no existe o ya no está disponible.");
    });

    it("uses the error's numeric status when the message says nothing usable", () => {
        class StatusError extends Error {
            readonly status: number;
            constructor(status: number, message: string) { super(message); this.status = status; }
        }
        expect(getErrorMessage(new StatusError(500, "boom"))).toBe("Error del servidor. Inténtalo de nuevo más tarde.");
        expect(getErrorMessage(new StatusError(403, "nope"), "No se pudo eliminar.")).toBe("No se pudo eliminar.");
    });

    it("an API error with a known code says more than the caller's generic fallback", () => {
        class CodedError extends Error {
            readonly status = 422;
            readonly code = "unsupported_version";
        }
        expect(getErrorMessage(new CodedError("Unsupported export version 2; supported: 1"), "No se pudo generar la vista previa."))
            .toBe("La versión del archivo exportado no es compatible con esta versión de Céluma.");
    });

    it("accepts strings and returns the fallback for anything else", () => {
        expect(getErrorMessage("Failed to fetch")).toBe(NETWORK_ERROR_MESSAGE);
        expect(getErrorMessage(42, "No se pudo cargar.")).toBe("No se pudo cargar.");
        expect(getErrorMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE);
    });
});

describe("api_error — spanishOr (server notices)", () => {
    it("replaces an English success notice with the Spanish one", () => {
        expect(spanishOr("Report approved", "Reporte aprobado.")).toBe("Reporte aprobado.");
        expect(spanishOr("Report submitted for review", "Reporte enviado a revisión.")).toBe("Reporte enviado a revisión.");
    });

    it("keeps a Spanish notice from the server", () => {
        expect(spanishOr("Se solicitaron cambios al reporte", "x")).toBe("Se solicitaron cambios al reporte");
    });

    it("an empty notice uses the Spanish one", () => {
        expect(spanishOr("", "Reporte reabierto.")).toBe("Reporte reabierto.");
        expect(spanishOr(undefined, "Reporte reabierto.")).toBe("Reporte reabierto.");
    });
});
