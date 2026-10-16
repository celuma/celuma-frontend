import { useEffect, useState } from "react";
import { tokens } from "../design/tokens";
import { previewNumbering } from "../../services/numbering_service";
import type { NumberingKind, NumberingMode } from "../../models/numbering";

interface Props {
    kind: NumberingKind;
    mode: NumberingMode;
    /** Study type (orders) or sample type (samples) chosen in the form. */
    scopeId?: string;
    branchId?: string;
    /** Whether the user has typed a manual code (the hint then explains the override). */
    manualTyped?: boolean;
}

/**
 * Explains how the code will be assigned and shows an ESTIMATE of it.
 *
 * The estimate comes from `POST /numbering/preview`, which reads only: it
 * reserves nothing and consumes no number (Céluma 1.4, issue #8). The real
 * code is the one the registration returns, and may differ.
 */
export default function AutoCodeHint({ kind, mode, scopeId, branchId, manualTyped }: Props) {
    const [estimate, setEstimate] = useState<string | null>(null);

    useEffect(() => {
        setEstimate(null);
        if (!scopeId || mode === "manual_only") return;
        let alive = true;
        previewNumbering({ entity_kind: kind, scope_id: scopeId, branch_id: branchId || undefined })
            .then((p) => alive && setEstimate(p.valid ? (p.estimate?.code ?? null) : null))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [kind, mode, scopeId, branchId]);

    const noun = kind === "order" ? "orden" : "muestra";
    let text: string;
    if (mode === "manual_only") text = `El código de la ${noun} es obligatorio.`;
    else if (manualTyped) text = `Se usará el código escrito, sin consumir la numeración automática.`;
    else if (mode === "automatic_only") text = `El código de la ${noun} se asigna automáticamente al registrar.`;
    else text = `Déjalo vacío para asignarlo automáticamente al registrar.`;

    return (
        <span style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={`auto-code-hint-${kind}`}>
            {text}
            {estimate && !manualTyped && mode !== "manual_only" ? ` Ejemplo: ${estimate} (no reservado).` : ""}
        </span>
    );
}
