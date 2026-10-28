import { useEffect, useState } from "react";
import { tokens } from "../design/tokens";
import { previewNumbering } from "../../services/numbering_service";
import type { NumberingKind } from "../../models/numbering";
import { isValidReceiptDate, periodLabel } from "../../lib/receipt_date";

interface Props {
    kind: NumberingKind;
    /** Study type (orders) or sample type (samples) chosen in the form. */
    scopeId?: string;
    branchId?: string;
    /**
     * Samples: the receipt date typed in the form (`YYYY-MM-DD`). The monthly code is numbered by it
     * (#33), so no estimate is shown until it is a valid date.
     */
    referenceDate?: string;
}

/**
 * Explains that the code is assigned automatically and shows an ESTIMATE of it.
 *
 * Registration never accepts a typed code (Céluma 1.4, issue #8 follow-up). The estimate comes from
 * `POST /numbering/preview`, which reads only: it reserves nothing and consumes no number. The real
 * code is the one the registration returns, and may differ.
 */
export default function AutoCodeHint({ kind, scopeId, branchId, referenceDate }: Props) {
    const [estimate, setEstimate] = useState<{ code: string; period: string | null } | null>(null);
    const datedBySample = kind === "sample";
    const validDate = datedBySample && isValidReceiptDate(referenceDate);

    useEffect(() => {
        setEstimate(null);
        if (!scopeId) return;
        // A sample is numbered by its receipt date: without a valid one there is nothing honest to estimate.
        if (datedBySample && !validDate) return;
        let alive = true;
        previewNumbering({
            entity_kind: kind, scope_id: scopeId, branch_id: branchId || undefined,
            reference_date: datedBySample ? referenceDate : undefined,
        })
            .then((p) => {
                if (!alive) return;
                const code = p.valid ? (p.estimate?.code ?? null) : null;
                const period = p.scheme === "monthly" && p.date_basis === "receipt_date" ? periodLabel(p.period_year, p.period_month) : null;
                setEstimate(code ? { code, period } : null);
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [kind, scopeId, branchId, datedBySample, validDate, referenceDate]);

    const noun = kind === "order" ? "orden" : "muestra";
    return (
        <span style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={`auto-code-hint-${kind}`}>
            {`El código de la ${noun} se asigna automáticamente al registrar.`}
            {datedBySample ? " El mes del código sale de la fecha de recepción." : ""}
            {estimate ? ` Ejemplo: ${estimate.code}${estimate.period ? ` (${estimate.period}, según la fecha de recepción)` : ""} (no reservado).` : ""}
        </span>
    );
}
