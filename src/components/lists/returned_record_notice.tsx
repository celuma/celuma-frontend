import CelumaAlert from "../ui/celuma_alert";
import CelumaButton from "../ui/button";
import type { ReturnedPlacement } from "../../lib/list_return";

interface Props {
    /** "La orden CU-07", "La muestra S-11", "El elemento CU-07". */
    subject: string;
    placement: ReturnedPlacement;
    onGoToPage?: (page: number) => void;
    onOpen?: () => void;
    onClearFilters?: () => void;
    /** Worklist: switch to "Todas", where a record that is no longer pending still is. */
    onShowAll?: () => void;
    onDismiss: () => void;
    /** Whether the kept view has a search or filters (wording, and the "clear" action). */
    filtered: boolean;
}

export default function ReturnedRecordNotice({ subject, placement, onGoToPage, onOpen, onClearFilters, onShowAll, onDismiss, filtered }: Props) {
    if (placement.kind === "here") return null;
    const message =
        placement.kind === "not_pending"
            ? `${subject} ya no está pendiente${placement.state ? ` (${placement.state})` : ""}. Sigue disponible en Todas.`
            : placement.kind === "other_page"
            ? `${subject} ahora aparece en la página ${placement.page} con este orden.`
            : placement.kind === "no_match"
                ? filtered
                    ? `${subject} ya no coincide con la búsqueda y los filtros actuales (por ejemplo, porque cambió su estado). Se conservaron tu búsqueda, filtros y página.`
                    : `${subject} ya no aparece en esta lista (por ejemplo, porque se retiró).`
                : `${subject} ya no está en tu lista de trabajo (por ejemplo, porque cambió su estado o su asignación).`;
    return (
        <div data-testid="returned-record-notice" style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <CelumaAlert type="info" message={message} closable onClose={onDismiss} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {placement.kind === "other_page" && onGoToPage && (
                    <CelumaButton size="small" onClick={() => onGoToPage(placement.page)}>
                        Ir a la página {placement.page}
                    </CelumaButton>
                )}
                {placement.kind === "not_pending" && onShowAll && (
                    <CelumaButton size="small" onClick={onShowAll}>Ver en Todas</CelumaButton>
                )}
                {placement.kind !== "other_page" && onOpen && (
                    <CelumaButton size="small" onClick={onOpen}>Abrir de nuevo</CelumaButton>
                )}
                {placement.kind === "no_match" && filtered && onClearFilters && (
                    <CelumaButton size="small" onClick={onClearFilters}>Quitar búsqueda y filtros</CelumaButton>
                )}
            </div>
        </div>
    );
}
