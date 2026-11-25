/**
 * Céluma 1.5 (#65): the management blockers (order/sample edits, capture removal,
 * sample creation) are shown in Spanish from their code. The English messages here
 * are the ones `app/services/order_lifecycle.py` and `capture_removal.py` write.
 */
import { describe, expect, it } from "vitest";
import { GENERIC_BLOCKER_MESSAGE, blockerMessage } from "../../lib/management_blockers";

describe("blockerMessage", () => {
    it.each([
        ["order_removed", "The order was removed as an erroneous capture", "La orden se retiró como captura errónea."],
        ["report_operation_active", "A signing, publication or PDF operation is still active",
            "Hay una firma, publicación o generación de PDF en curso en un reporte relacionado."],
        ["report_amendment_open", "The report has an open amendment", "El reporte tiene una enmienda abierta."],
        ["report_published", "A related report was published", "Un reporte relacionado ya fue publicado."],
        ["report_signing_evidence", "A related report version has signing, publication or issued-PDF evidence",
            "Una versión de un reporte relacionado ya tiene firma, publicación o PDF emitido."],
        ["report_review_evidence", "A reviewer already recorded a decision on a related report",
            "Un revisor ya registró una decisión sobre un reporte relacionado."],
        ["report_review_history",
            "A related report was already submitted for review, approved, signed or published at some point; use the correction or amendment flow",
            "Un reporte relacionado ya pasó por revisión, aprobación, firma o publicación; usa el flujo de corrección o de enmienda."],
        ["invoice_has_payments", "The order's invoice has payments; resolve them through billing before removing the order",
            "La factura de la orden tiene pagos; resuélvelos en facturación antes de retirar la orden."],
        ["last_sample",
            "This is the order's only sample; the order is never removed automatically. Remove the order, or register the replacement sample first",
            "Es la única muestra de la orden y la orden nunca se retira automáticamente. Retira la orden o registra primero la muestra de reemplazo."],
    ])("%s", (code, message, spanish) => {
        expect(blockerMessage({ code, message })).toBe(spanish);
    });

    it("names the order phase in Spanish", () => {
        expect(blockerMessage({
            code: "order_phase",
            message: "The order is in REVIEW; direct changes are only allowed from Reception through Diagnosis",
        })).toBe("La orden está en Revisión; los cambios directos solo se permiten de Recepción a Diagnóstico.");
        expect(blockerMessage({ code: "order_phase", message: "The order is in OrderStatus.RELEASED; …" }))
            .toContain("La orden está en Liberada");
    });

    it("an order phase it cannot read still explains the rule", () => {
        expect(blockerMessage({ code: "order_phase", message: "unexpected" }))
            .toBe("Los cambios directos solo se permiten de Recepción a Diagnóstico.");
    });

    it("names the related report's state in Spanish", () => {
        expect(blockerMessage({ code: "report_not_draft", message: "A related report is APPROVED, not a draft" }))
            .toBe("Un reporte relacionado está aprobado; ya no es un borrador.");
    });

    it("tells the two sample-creation refusals apart", () => {
        expect(blockerMessage({ code: "order_in_review", message: "The order is in review; samples cannot be added until the review ends" }))
            .toBe("La orden está en revisión; no se pueden agregar muestras hasta que termine la revisión.");
        expect(blockerMessage({ code: "order_in_review", message: "A related report is IN_REVIEW; samples cannot be added while it is under review" }))
            .toBe("Un reporte relacionado está en revisión; no se pueden agregar muestras mientras esté en revisión.");
    });

    it("names the invoice state in Spanish", () => {
        expect(blockerMessage({ code: "invoice_not_pending", message: "The order's invoice is PARTIAL; resolve it through billing before removing the order" }))
            .toBe("La factura de la orden está pagada parcialmente; resuélvela en facturación antes de retirar la orden.");
    });

    it("keeps a Spanish message of an unknown code", () => {
        expect(blockerMessage({ code: "nuevo_motivo", message: "La orden tiene un motivo nuevo." })).toBe("La orden tiene un motivo nuevo.");
    });

    it("never shows an English message of an unknown code", () => {
        expect(blockerMessage({ code: "new_reason", message: "Something new blocks this" })).toBe(GENERIC_BLOCKER_MESSAGE);
        expect(blockerMessage({ code: "new_reason", message: null })).toBe(GENERIC_BLOCKER_MESSAGE);
    });
});
