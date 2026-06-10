import { Spin, Button } from "antd";
import React, { useRef, forwardRef, useImperativeHandle } from "react";
import { FilePdfOutlined } from "@ant-design/icons";
import type { ReportEnvelope } from "../../models/report";
import Panel from "../ui/panel";
import ReportPreviewPages, { type ReportPreviewPagesRef, type SignerLookupEntry } from "./report_preview_pages";
import { usePdfExport } from "../../hooks/use_pdf_export";

interface ReportPreviewProps {
    report: ReportEnvelope;
    loading?: boolean;
    style?: React.CSSProperties;
    /** Forwarded to the inner pages component to resolve the signer's display name. */
    signerLookup?: SignerLookupEntry[];
}

export interface ReportPreviewRef {
    exportPDF: () => Promise<void>;
}

const ReportPreview = forwardRef<ReportPreviewRef, ReportPreviewProps>(({ report, loading = false, style, signerLookup }, ref) => {
    const previewPagesRef = useRef<ReportPreviewPagesRef>(null);
    const { exportToPDF } = usePdfExport();

    const handleExportPDF = async () => {
        await exportToPDF(previewPagesRef, report.title ?? undefined);
    };

    useImperativeHandle(ref, () => ({
        exportPDF: handleExportPDF
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
            <div style={{ marginBottom: 12 }}>
                <Button
                    type="primary"
                    icon={<FilePdfOutlined />}
                    onClick={handleExportPDF}
                    size="small"
                    data-pdf-export
                    style={{ display: "none" }} // Hidden since we're using external button
                >
                    Exportar PDF
                </Button>
            </div>
            <ReportPreviewPages ref={previewPagesRef} report={report} signerLookup={signerLookup} />
        </Panel>
    );
});

ReportPreview.displayName = 'ReportPreview';

export default ReportPreview;
