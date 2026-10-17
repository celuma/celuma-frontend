import { useEffect, useState } from "react";
import { tokens } from "../design/tokens";
import { previewNumbering } from "../../services/numbering_service";
import type { NumberingKind } from "../../models/numbering";

interface Props {
    kind: NumberingKind;
    /** Study type (orders) or sample type (samples) chosen in the form. */
    scopeId?: string;
    branchId?: string;
}

/**
 * Explains that the code is assigned automatically and shows an ESTIMATE of it.
 *
 * Registration never accepts a typed code (Céluma 1.4, issue #8 follow-up). The estimate comes from
 * `POST /numbering/preview`, which reads only: it reserves nothing and consumes no number. The real
 * code is the one the registration returns, and may differ.
 */
export default function AutoCodeHint({ kind, scopeId, branchId }: Props) {
    const [estimate, setEstimate] = useState<string | null>(null);

    useEffect(() => {
        setEstimate(null);
        if (!scopeId) return;
        let alive = true;
        previewNumbering({ entity_kind: kind, scope_id: scopeId, branch_id: branchId || undefined })
            .then((p) => alive && setEstimate(p.valid ? (p.estimate?.code ?? null) : null))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [kind, scopeId, branchId]);

    const noun = kind === "order" ? "orden" : "muestra";
    return (
        <span style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={`auto-code-hint-${kind}`}>
            {`El código de la ${noun} se asigna automáticamente al registrar.`}
            {estimate ? ` Ejemplo: ${estimate} (no reservado).` : ""}
        </span>
    );
}
