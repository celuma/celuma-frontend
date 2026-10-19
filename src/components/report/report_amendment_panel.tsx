import { useCallback, useEffect, useState } from "react";
import { Input, message } from "antd";
import { ExclamationCircleOutlined, FilePdfOutlined, HistoryOutlined } from "@ant-design/icons";
import CelumaButton from "../ui/button";
import Panel from "../ui/panel";
import { tokens } from "../design/tokens";
import {
    AMENDMENT_CATEGORY_LABELS,
    type ReportAmendmentInfo,
    type ReportEmissionsResponse,
} from "../../models/report";
import { parseBackendUtcDate } from "../../lib/notification_dates";
import {
    getOfficialPdfDownloadUrl,
    getReportEmissions,
    triggerBrowserDownload,
} from "../../services/report_service";

/**
 * Céluma 1.4 (#13): the editor's amendment surface.
 *
 * - The internal "amendment in progress" indicator (owner decision D3): which
 *   amendment, why, and that the last signed emission is still the one
 *   delivered until this amendment is signed.
 * - The author's required change note (D2), saved with the content.
 * - Authorized history: every signed emission (original and amendments, with
 *   the delivered one marked) downloadable, and every amendment's outcome.
 *
 * Nothing here authorizes anything: the backend checks roles, assignment,
 * tenant, state and the password on every action.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

/** Backend timestamps are naive UTC; shown in the viewer's local time. */
function formatDateTime(iso: string | null | undefined): string {
    const date = parseBackendUtcDate(iso);
    return date ? DATE_FORMATTER.format(date).replace(/\./g, "") : "—";
}

const AMENDMENT_STATE_LABELS: Record<ReportAmendmentInfo["state"], string> = {
    OPEN: "En curso",
    PUBLISHED: "Firmada y republicada",
    CANCELLED: "Cancelada",
};

type Props = {
    reportId: string;
    /** Bumps whenever the report's status or version changes, to refresh the history. */
    refreshKey: string;
    openAmendment: ReportAmendmentInfo | null | undefined;
    /** Whether the report has ever been signed (only then is there history). */
    hasSignedEmission: boolean;
    changeNote: string;
    changeNoteEditable: boolean;
    onChangeNote: (note: string) => void;
    canCancelAmendment: boolean;
    onCancelAmendment: () => void;
    downloadFilename: string;
};

export default function ReportAmendmentPanel({
    reportId,
    refreshKey,
    openAmendment,
    hasSignedEmission,
    changeNote,
    changeNoteEditable,
    onChangeNote,
    canCancelAmendment,
    onCancelAmendment,
    downloadFilename,
}: Props) {
    const [history, setHistory] = useState<ReportEmissionsResponse | null>(null);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<number | null>(null);

    useEffect(() => {
        if (!hasSignedEmission) {
            setHistory(null);
            return;
        }
        let cancelled = false;
        setHistoryError(null);
        getReportEmissions(reportId)
            .then((data) => { if (!cancelled) setHistory(data); })
            .catch((err: unknown) => {
                if (!cancelled) setHistoryError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
            });
        return () => { cancelled = true; };
    }, [reportId, refreshKey, hasSignedEmission]);

    const download = useCallback(async (versionNo: number) => {
        setDownloading(versionNo);
        try {
            const { pdf_url } = await getOfficialPdfDownloadUrl(reportId, versionNo);
            triggerBrowserDownload(pdf_url, downloadFilename);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "No se pudo descargar el PDF de esa emisión.");
        } finally {
            setDownloading(null);
        }
    }, [reportId, downloadFilename]);

    if (!openAmendment && !hasSignedEmission) return null;

    return (
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
            {openAmendment && (
                <Panel
                    data-testid="amendment-in-progress"
                    style={{
                        background: "#fff7ed",
                        border: "2px solid #fed7aa",
                        display: "grid",
                        gap: 10,
                        padding: 12,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <ExclamationCircleOutlined style={{ color: "#c2410c", fontSize: 18, flexShrink: 0, marginTop: 2 }} />
                        <div style={{ fontSize: 13, color: "#7c2d12", lineHeight: 1.45, flex: 1 }}>
                            <b>Enmienda {openAmendment.amendment_no} en curso</b>
                            {" · "}{AMENDMENT_CATEGORY_LABELS[openAmendment.category] ?? openAmendment.category} — abierta por{" "}
                            {openAmendment.requested_by_name ?? "un usuario"} el {formatDateTime(openAmendment.requested_at)}.
                            <br />
                            <b>Motivo:</b> {openAmendment.reason}
                            <br />
                            La emisión firmada (versión {openAmendment.source_version_no ?? "—"}, firmada el{" "}
                            {formatDateTime(openAmendment.source_signed_at)}) sigue siendo la entregada hasta que esta
                            enmienda se firme. Esta indicación es interna.
                        </div>
                        {canCancelAmendment && (
                            <CelumaButton
                                size="small"
                                danger
                                onClick={onCancelAmendment}
                                data-testid="cancel-amendment"
                            >
                                Cancelar enmienda
                            </CelumaButton>
                        )}
                    </div>
                    <div>
                        <label
                            htmlFor="amendment-change-note"
                            style={{ display: "block", fontWeight: 600, marginBottom: 6, color: tokens.textPrimary }}
                        >
                            Nota de enmienda (obligatoria)
                        </label>
                        <Input.TextArea
                            id="amendment-change-note"
                            value={changeNote}
                            onChange={(e) => onChangeNote(e.target.value)}
                            rows={3}
                            maxLength={4000}
                            disabled={!changeNoteEditable}
                            placeholder="Describe qué cambió respecto de la emisión firmada y por qué."
                            data-testid="amendment-change-note"
                        />
                        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 4 }}>
                            Se imprime en el reporte enmendado. Es necesaria para enviarlo a revisión y firmarlo.
                        </div>
                    </div>
                </Panel>
            )}

            {hasSignedEmission && (
                <Panel data-testid="emission-history" style={{ display: "grid", gap: 8, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <HistoryOutlined /> Historial de emisiones
                    </div>
                    {historyError && <div style={{ color: "#b91c1c", fontSize: 13 }}>{historyError}</div>}
                    {(history?.emissions ?? []).map((emission) => (
                        <div
                            key={emission.report_version_id}
                            data-testid={`emission-${emission.version_no}`}
                            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, flexWrap: "wrap" }}
                        >
                            <span style={{ flex: 1, minWidth: 200 }}>
                                <b>Versión {emission.version_no}</b>{" "}
                                {emission.amendment_no ? `· Enmienda ${emission.amendment_no}` : "· Original"} · firmada el{" "}
                                {formatDateTime(emission.signed_at)}
                                {emission.signed_by_name ? ` por ${emission.signed_by_name}` : ""}
                                {emission.is_delivered && (
                                    <span style={{ marginLeft: 6, color: "#047857", fontWeight: 600 }}>· Vigente</span>
                                )}
                            </span>
                            {emission.pdf_available && (
                                <CelumaButton
                                    size="small"
                                    icon={<FilePdfOutlined />}
                                    loading={downloading === emission.version_no}
                                    onClick={() => { void download(emission.version_no); }}
                                >
                                    Descargar
                                </CelumaButton>
                            )}
                        </div>
                    ))}
                    {history && (history.amendments ?? []).length > 0 && (
                        <div style={{ display: "grid", gap: 4, fontSize: 12, color: tokens.textSecondary }}>
                            {(history.amendments ?? []).map((amendment) => (
                                <div key={amendment.id} data-testid={`amendment-history-${amendment.amendment_no}`}>
                                    Enmienda {amendment.amendment_no} — {AMENDMENT_STATE_LABELS[amendment.state]}
                                    {amendment.state === "CANCELLED" && amendment.cancel_reason
                                        ? ` el ${formatDateTime(amendment.cancelled_at)}: ${amendment.cancel_reason}`
                                        : ""}
                                    {amendment.state === "PUBLISHED"
                                        ? ` (versión ${amendment.published_version_no ?? "—"}, sustituye a la versión ${amendment.source_version_no ?? "—"})`
                                        : ""}
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            )}
        </div>
    );
}
