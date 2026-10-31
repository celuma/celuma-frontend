import type { CSSProperties } from "react";
import { AMENDMENT_CATEGORY_LABELS, type ReportAmendmentBlock } from "../../models/report";
import { parseBackendUtcDate } from "../../lib/notification_dates";
import { tokens } from "../design/tokens";

/**
 * Céluma 1.4 (#13, decision D2): the identification of an amended emission —
 * amendment number and category, the emission it replaces, the reason and the
 * author's change note — read from the version's own frozen `amendment` block.
 *
 * Owner correction (Rafael, 2026-10-30, #48): this is internal information for
 * the laboratory, not part of the report. It is shown only in the editor's
 * amendment panel, outside the document canvas; the shared V2 renderer (editor
 * preview, local print and the official PDF) never draws it. Emissions issued
 * before the correction keep the PDF they were signed with. The panel shows it
 * for the current amended emission and, on demand, for every earlier amended
 * emission of the history (review R1), each from its own version's block.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

/** `amends_signed_at` is naive UTC, like every backend timestamp. */
function formatSignedDate(iso: string | null | undefined): string | null {
    const date = parseBackendUtcDate(iso);
    return date ? DATE_FORMATTER.format(date).replace(/\./g, "") : null;
}

const lineStyle: CSSProperties = { margin: "2px 0" };

export default function AmendmentIdentification({
    amendment,
    current = true,
}: {
    amendment: ReportAmendmentBlock;
    /** `true` for the emission currently delivered; `false` for one read from the history. */
    current?: boolean;
}) {
    const signedOn = formatSignedDate(amendment.amends_signed_at);
    const category = AMENDMENT_CATEGORY_LABELS[amendment.category] ?? amendment.category;
    const note = (amendment.change_note ?? "").trim();
    return (
        <div
            data-testid="amendment-identification-internal"
            style={{ fontSize: 13, lineHeight: 1.45, color: tokens.textPrimary }}
        >
            <p style={{ ...lineStyle, fontWeight: 600 }}>
                {current ? "Emisión vigente: " : ""}Enmienda {amendment.amendment_no} · {category}
            </p>
            <p style={lineStyle}>
                Sustituye a la emisión firmada{signedOn ? ` el ${signedOn}` : ""} (versión {amendment.amends_version_no}).
            </p>
            <p style={lineStyle}>
                <b>Motivo:</b> {amendment.reason}
            </p>
            <p style={lineStyle}>
                <b>Nota de enmienda:</b>{" "}
                {note || <em style={{ color: tokens.textSecondary }}>Sin nota</em>}
            </p>
            <p style={{ ...lineStyle, fontSize: 12, color: tokens.textSecondary }}>
                Información interna: no se imprime en el reporte ni en el PDF entregado.
            </p>
        </div>
    );
}
