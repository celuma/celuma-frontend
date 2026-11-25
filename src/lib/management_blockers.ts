/**
 * Céluma 1.5 (#65): Spanish text for the blockers of `GET /laboratory/orders/{id}/management`
 * (order/sample edits, capture removal, sample creation).
 *
 * The backend writes these messages in English (`app/services/order_lifecycle.py`,
 * `app/services/capture_removal.py`); the stable `code` is what the UI translates. A Spanish
 * message from the server is kept as is; an unknown English one is replaced by a generic
 * Spanish reason, never shown raw.
 */
import { looksSpanish } from "./api_error";

export interface BlockerLike {
    code: string;
    message?: string | null;
}

const ORDER_STATUS_ES: Record<string, string> = {
    RECEIVED: "Recepción",
    PROCESSING: "Procesamiento",
    DIAGNOSIS: "Diagnóstico",
    REVIEW: "Revisión",
    RELEASED: "Liberada",
    CLOSED: "Cerrada",
    CANCELLED: "Cancelada",
};

const REPORT_STATUS_ES: Record<string, string> = {
    DRAFT: "en borrador",
    IN_REVIEW: "en revisión",
    APPROVED: "aprobado",
    PUBLISHED: "publicado",
    RETRACTED: "retractado",
};

const PAYMENT_STATUS_ES: Record<string, string> = {
    PENDING: "pendiente",
    PAID: "pagada",
    FAILED: "fallida",
    REFUNDED: "reembolsada",
    PARTIAL: "pagada parcialmente",
    VOID: "anulada",
};

/** The enum value an English message names ("… is IN_REVIEW, …", "… is in OrderStatus.REVIEW; …"). */
function statusIn(message: string | null | undefined, after: RegExp): string | null {
    const m = (message ?? "").match(after);
    return m ? m[1].replace(/^\w+Status\./, "").toUpperCase() : null;
}

export const GENERIC_BLOCKER_MESSAGE = "Hay una condición que impide este cambio por ahora.";

const BLOCKER_ES: Record<string, (message: string | null | undefined) => string> = {
    order_removed: () => "La orden se retiró como captura errónea.",
    order_phase: (msg) => {
        const phase = ORDER_STATUS_ES[statusIn(msg, /is in ([A-Za-z_.]*[A-Za-z_])/) ?? ""];
        return phase
            ? `La orden está en ${phase}; los cambios directos solo se permiten de Recepción a Diagnóstico.`
            : "Los cambios directos solo se permiten de Recepción a Diagnóstico.";
    },
    report_operation_active: () => "Hay una firma, publicación o generación de PDF en curso en un reporte relacionado.",
    report_amendment_open: () => "El reporte tiene una enmienda abierta.",
    report_not_draft: (msg) => {
        const state = REPORT_STATUS_ES[statusIn(msg, /report is ([A-Za-z_.]*[A-Za-z_])/) ?? ""];
        return state
            ? `Un reporte relacionado está ${state}; ya no es un borrador.`
            : "Un reporte relacionado ya no es un borrador.";
    },
    report_published: () => "Un reporte relacionado ya fue publicado.",
    report_signing_evidence: () => "Una versión de un reporte relacionado ya tiene firma, publicación o PDF emitido.",
    report_review_evidence: () => "Un revisor ya registró una decisión sobre un reporte relacionado.",
    report_review_history: () =>
        "Un reporte relacionado ya pasó por revisión, aprobación, firma o publicación; usa el flujo de corrección o de enmienda.",
    order_in_review: (msg) => {
        if (/^a related report/i.test(msg ?? "")) {
            const state = REPORT_STATUS_ES[statusIn(msg, /report is ([A-Za-z_.]*[A-Za-z_])/) ?? ""];
            return state
                ? `Un reporte relacionado está ${state}; no se pueden agregar muestras mientras esté en revisión.`
                : "Un reporte relacionado está en revisión; no se pueden agregar muestras mientras tanto.";
        }
        return "La orden está en revisión; no se pueden agregar muestras hasta que termine la revisión.";
    },
    invoice_has_payments: () => "La factura de la orden tiene pagos; resuélvelos en facturación antes de retirar la orden.",
    invoice_not_pending: (msg) => {
        const state = PAYMENT_STATUS_ES[statusIn(msg, /invoice is ([A-Za-z_.]*[A-Za-z_])/) ?? ""];
        return state
            ? `La factura de la orden está ${state}; resuélvela en facturación antes de retirar la orden.`
            : "La factura de la orden ya no está pendiente; resuélvela en facturación antes de retirar la orden.";
    },
    last_sample: () =>
        "Es la única muestra de la orden y la orden nunca se retira automáticamente. Retira la orden o registra primero la muestra de reemplazo.",
};

/** The Spanish reason for one management blocker. */
export function blockerMessage(blocker: BlockerLike): string {
    const translate = BLOCKER_ES[blocker.code];
    if (translate) return translate(blocker.message);
    const message = (blocker.message ?? "").trim();
    return message && looksSpanish(message) ? message : GENERIC_BLOCKER_MESSAGE;
}
