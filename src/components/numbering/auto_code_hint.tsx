import { useEffect, useState } from "react";
import { tokens } from "../design/tokens";
import { previewNumbering } from "../../services/numbering_service";
import type { ManualEntry, NumberingKind } from "../../models/numbering";

interface Props {
    kind: NumberingKind;
    /** How this user is offered the code input (policy AND capability, computed by the API). */
    entry: ManualEntry;
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
export default function AutoCodeHint({ kind, entry, scopeId, branchId, manualTyped }: Props) {
    const [estimate, setEstimate] = useState<string | null>(null);

    useEffect(() => {
        setEstimate(null);
        if (!scopeId || entry === "required" || entry === "blocked") return;
        let alive = true;
        previewNumbering({ entity_kind: kind, scope_id: scopeId, branch_id: branchId || undefined })
            .then((p) => alive && setEstimate(p.valid ? (p.estimate?.code ?? null) : null))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [kind, entry, scopeId, branchId]);

    const noun = kind === "order" ? "orden" : "muestra";
    let text: string;
    if (entry === "blocked") text = `Este laboratorio exige escribir el código de la ${noun} y tu rol no tiene permiso para hacerlo: pide a un administrador.`;
    else if (entry === "required") text = `El código de la ${noun} es obligatorio.`;
    else if (manualTyped) text = `Se usará el código escrito, sin consumir la numeración automática.`;
    else if (entry === "hidden") text = `El código de la ${noun} se asigna automáticamente al registrar.`;
    else text = `Déjalo vacío para asignarlo automáticamente al registrar.`;
    const showEstimate = estimate && !manualTyped && entry !== "required" && entry !== "blocked";

    return (
        <span style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={`auto-code-hint-${kind}`}>
            {text}
            {showEstimate ? ` Ejemplo: ${estimate} (no reservado).` : ""}
        </span>
    );
}
