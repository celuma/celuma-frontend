import type { CSSProperties } from "react";
import { AMENDMENT_CATEGORY_LABELS, type ReportAmendmentBlock } from "../../models/report";
import { parseBackendUtcDate } from "../../lib/notification_dates";

/**
 * Céluma 1.4 (#13, owner decision D2): the identification printed at the top
 * of an amended emission — in the editor preview and in the official PDF,
 * which share the V2 renderer. Built only from the version's own frozen
 * `amendment` block, so a historical amended PDF re-renders identically.
 * No automatic diff: the change note is the author's statement.
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

const boxStyle: CSSProperties = {
    border: "1px solid #000",
    padding: "6px 8px",
    marginBottom: 12,
    fontSize: "9.5pt",
    lineHeight: 1.35,
    breakInside: "avoid",
    pageBreakInside: "avoid",
};

const lineStyle: CSSProperties = { margin: "2px 0" };

export default function AmendmentIdentification({ amendment }: { amendment: ReportAmendmentBlock }) {
    const signedOn = formatSignedDate(amendment.amends_signed_at);
    const category = AMENDMENT_CATEGORY_LABELS[amendment.category] ?? amendment.category;
    const note = (amendment.change_note ?? "").trim();
    return (
        <div style={boxStyle} data-testid="report-amendment-identification">
            <p style={{ ...lineStyle, fontWeight: 700, letterSpacing: "0.02em" }}>
                REPORTE ENMENDADO — Enmienda {amendment.amendment_no} · {category}
            </p>
            <p style={lineStyle}>
                Sustituye a la emisión firmada{signedOn ? ` el ${signedOn}` : ""} (versión {amendment.amends_version_no}).
            </p>
            <p style={lineStyle}>
                <b>Motivo:</b> {amendment.reason}
            </p>
            <p style={lineStyle}>
                <b>Nota de enmienda:</b>{" "}
                {note || <em style={{ color: "#888" }}>Pendiente</em>}
            </p>
        </div>
    );
}
