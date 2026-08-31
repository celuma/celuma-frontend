import { Spin } from "antd";
import React, { useRef, forwardRef, useImperativeHandle } from "react";
import type { ReportEnvelope } from "../../models/report";
import Panel from "../ui/panel";
import ReportPreviewPages, { type ReportRendererRef as ReportPreviewPagesRef, type SignerLookupEntry } from "./report_renderer_resolver";
import { useLocalPrint, localPrintMarkForStatus } from "../../hooks/use_local_print";
import { buildReportPdfFilename } from "../../lib/report_filename";

interface ReportPreviewProps {
    report: ReportEnvelope;
    loading?: boolean;
    style?: React.CSSProperties;
    /** Forwarded to the inner pages component to resolve the signer's display name. */
    signerLookup?: SignerLookupEntry[];
    /** H-0c: the order's human-readable code, for the canonical local-copy
     *  filename. When omitted it is read from the report's own content, which
     *  carries it in the `order_code` base field. */
    orderCode?: string | null;
    /** H-0c: the study type's display name, same contract as `orderCode`. */
    studyTypeName?: string | null;
}

export interface ReportPreviewRef {
    /** Fourth remediation (Observation 1): LOCAL printing — never the
     *  official PDF. The draft/retracted mark is derived from the report
     *  status, not the caller, so no screen can print an unpublished report
     *  without a mark. See local-print-contract.md. */
    printLocalCopy: () => Promise<void>;
}

/** H-0c: the report's own content carries both values (the editor fills the
 *  `order_code` and `study_type` base fields when it builds the envelope), so
 *  a caller that does not have them to hand still gets the canonical filename
 *  rather than falling back to the patient-bearing display title. */
function baseFieldValue(report: ReportEnvelope, key: string): string | null {
    const field = (report.report?.base ?? {})[key] as { value?: unknown } | undefined;
    const value = typeof field?.value === "string" ? field.value.trim() : "";
    return value || null;
}

const ReportPreview = forwardRef<ReportPreviewRef, ReportPreviewProps>(({ report, loading = false, style, signerLookup, orderCode, studyTypeName }, ref) => {
    const previewPagesRef = useRef<ReportPreviewPagesRef>(null);
    const { printLocalCopy } = useLocalPrint();

    const handlePrintLocalCopy = async () => {
        await printLocalCopy(previewPagesRef, {
            // H-0c: the canonical local-copy name, sharing its base with the
            // official PDF. Never `report.title` — that carries the patient's
            // name into the filename.
            filename: buildReportPdfFilename(
                orderCode ?? baseFieldValue(report, "order_code"),
                studyTypeName ?? baseFieldValue(report, "study_type"),
                { version: report.version_no, localCopy: true },
            ),
            mark: localPrintMarkForStatus(report.status),
        });
    };

    useImperativeHandle(ref, () => ({
        printLocalCopy: handlePrintLocalCopy
    }));

    if (loading) {
        return (
            <Panel style={{ ...style, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
                <Spin size="large" />
            </Panel>
        );
    }

    return (
        <Panel style={{ ...style, padding: 16, overflowY: "auto", maxHeight: 600 }}>
            <ReportPreviewPages ref={previewPagesRef} report={report} signerLookup={signerLookup} />
        </Panel>
    );
});

ReportPreview.displayName = 'ReportPreview';

export default ReportPreview;
