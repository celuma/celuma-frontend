import { Spin } from "antd";
import React, { useRef, forwardRef, useImperativeHandle } from "react";
import type { ReportEnvelope } from "../../models/report";
import Panel from "../ui/panel";
import ReportPreviewPages, { type ReportRendererRef as ReportPreviewPagesRef, type SignerLookupEntry } from "./report_renderer_resolver";
import { useLocalPrint, localPrintMarkForStatus } from "../../hooks/use_local_print";

interface ReportPreviewProps {
    report: ReportEnvelope;
    loading?: boolean;
    style?: React.CSSProperties;
    /** Forwarded to the inner pages component to resolve the signer's display name. */
    signerLookup?: SignerLookupEntry[];
}

export interface ReportPreviewRef {
    /** Cuarta remediación (Observación 1): impresión LOCAL — nunca el PDF
     *  oficial. La marca de borrador/retractado se deriva del estado del
     *  reporte, no del llamante, para que ninguna pantalla pueda imprimir
     *  un no-publicado sin marca. Ver local-print-contract.md. */
    printLocalCopy: () => Promise<void>;
}

const ReportPreview = forwardRef<ReportPreviewRef, ReportPreviewProps>(({ report, loading = false, style, signerLookup }, ref) => {
    const previewPagesRef = useRef<ReportPreviewPagesRef>(null);
    const { printLocalCopy } = useLocalPrint();

    const handlePrintLocalCopy = async () => {
        await printLocalCopy(previewPagesRef, {
            filename: report.title ?? undefined,
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
