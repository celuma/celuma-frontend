import { useEffect, useState } from "react";
import ConfirmDialog from "../ui/confirm_dialog";
import CelumaTextArea from "../ui/textarea_field";
import { tokens } from "../design/tokens";
import { getErrorMessage } from "../../lib/api_error";
import { getRemovalImpact, removeCatalogType } from "../../services/sample_type_service";
import type { CatalogTypeRemoval, CatalogTypeRemovalImpact, RemovableCatalog } from "../../models/sample_type";

/** Longest reason the API accepts. */
export const REMOVAL_REASON_MAX = 500;

const TEXT: Record<RemovableCatalog, { noun: string; records: string; record: string; refKey: string; hidden: string; kept: string }> = {
    study_types: {
        noun: "tipo de estudio",
        records: "órdenes",
        record: "orden",
        refKey: "orders",
        hidden: "Deja de aparecer en el catálogo y en los selectores de órdenes nuevas, precios y copia a tipos de muestra.",
        kept: "Las órdenes que ya lo usan lo conservan y lo siguen mostrando; sus códigos, reportes, precios y facturas no cambian.",
    },
    sample_types: {
        noun: "tipo de muestra",
        records: "muestras",
        record: "muestra",
        refKey: "samples",
        hidden: "Deja de aparecer en el catálogo, en los selectores de muestras nuevas, en la exportación y en la importación.",
        kept: "Las muestras que ya lo usan lo conservan y lo siguen mostrando como eliminado; sus códigos, filtros y reportes no cambian.",
    },
};

export interface RemoveCatalogTypeDialogProps {
    kind: RemovableCatalog;
    /** The type to remove; `null` closes the dialog. */
    target: { id: string; code: string; name: string; is_active: boolean } | null;
    onCancel: () => void;
    /** Called after the API confirmed the removal (also when it had already been removed). */
    onRemoved: (result: CatalogTypeRemoval) => void;
}

/**
 * Confirmation for removing a study type or sample type from the catalog (Céluma 1.5, #94).
 *
 * Removal is not deactivation: the dialog says what disappears, what is kept, what happens to the code
 * (owner decision 2026-11-25: freed for a DIFFERENT type when no order/sample — withdrawn ones included —
 * uses it, otherwise reserved; read from `removal-impact`, re-decided by the API on removal) and that it
 * cannot be undone from Céluma, and points to deactivation for a reversible pause. A failed
 * request keeps the dialog (and the typed reason) open with the reason of the failure and a retry. The API
 * is the authority (`admin:manage_catalog`, tenant scope, frozen removed types); this is presentation only.
 */
export default function RemoveCatalogTypeDialog({ kind, target, onCancel, onRemoved }: RemoveCatalogTypeDialogProps) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const text = TEXT[kind];
    const [impact, setImpact] = useState<CatalogTypeRemovalImpact | null>(null);
    const [impactFailed, setImpactFailed] = useState(false);

    useEffect(() => {
        setReason("");
        setError(null);
        setSubmitting(false);
        setImpact(null);
        setImpactFailed(false);
        if (!target) return;
        let current = true;
        getRemovalImpact(kind, target.id)
            .then((value) => { if (current) setImpact(value); })
            .catch(() => { if (current) setImpactFailed(true); });
        return () => { current = false; };
    }, [kind, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const used = impact ? impact.references[text.refKey] ?? 0 : 0;
    const codeLine = impact
        ? impact.code_will_be_released
            ? `No tiene ${text.records} registradas (ni retiradas): su código «${target?.code}» quedará libre para crear o asignar a otro ${text.noun} distinto. Este registro conserva el código en su historial y no se reactiva.`
            : `Tiene ${used} ${used === 1 ? text.record : text.records} registrada${used === 1 ? "" : "s"} (incluidas las retiradas): su código «${target?.code}» seguirá reservado y no podrá usarse para otro ${text.noun}.`
        : impactFailed
            ? `Si no tiene ${text.records} (ni retiradas), su código quedará libre para otro ${text.noun}; si las tiene, seguirá reservado.`
            : "Comprobando si su código podrá reutilizarse…";

    const tooLong = reason.trim().length > REMOVAL_REASON_MAX;

    const confirm = async () => {
        if (!target || tooLong) return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await removeCatalogType(kind, target.id, reason);
            onRemoved(result);
        } catch (err) {
            setError(getErrorMessage(err, `No se pudo eliminar el ${text.noun}.`));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ConfirmDialog
            open={target !== null}
            danger
            title={`¿Eliminar «${target?.name ?? ""}» del catálogo?`}
            description={`Eliminar no es lo mismo que desactivar. El ${text.noun} ${target?.code ?? ""} se conserva para sus ${text.records} existentes, pero ya no forma parte del catálogo.`}
            confirmText={error ? "Reintentar eliminar" : "Eliminar del catálogo"}
            cancelText="Cancelar"
            loading={submitting}
            confirmDisabled={tooLong}
            onCancel={onCancel}
            onConfirm={() => void confirm()}
        >
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: tokens.textSecondary, display: "grid", gap: 4 }}
                data-testid="remove-type-consequences">
                <li>{text.hidden}</li>
                <li>{text.kept}</li>
                <li data-testid="remove-type-code-outcome" aria-live="polite">{codeLine}</li>
                <li>Su numeración propia, si tiene, se conserva y ya no se puede editar; los consecutivos no se reinician.</li>
                <li>No se puede deshacer desde Céluma ni editar después.</li>
            </ul>
            <div style={{ marginTop: 10, fontSize: 13, color: tokens.textPrimary }}>
                {target?.is_active
                    ? "Si solo quieres dejar de usarlo por un tiempo, desactívalo en su lugar: podrás reactivarlo."
                    : "Ya está desactivado; desactivado puede reactivarse, eliminado no."}
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 6 }} data-testid="remove-type-reason">
                <div aria-hidden style={{ fontSize: 12, fontWeight: 600, color: tokens.primary }}>
                    Motivo (opcional, queda en la auditoría)
                </div>
                <CelumaTextArea
                    ariaLabel="Motivo de la eliminación (opcional)"
                    value={reason}
                    onChange={(v) => setReason(v)}
                    rows={2}
                    maxLength={REMOVAL_REASON_MAX}
                    placeholder="Por ejemplo: creado por error, duplicado de otro tipo"
                    error={tooLong ? `Máximo ${REMOVAL_REASON_MAX} caracteres.` : undefined}
                />
            </div>
            {error && (
                <div role="alert" style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }} data-testid="remove-type-error">
                    No se eliminó: {error}
                </div>
            )}
        </ConfirmDialog>
    );
}
