import { Card, Spin, Button } from "antd";
import React, { useRef, forwardRef, useImperativeHandle } from "react";
import { FilePdfOutlined } from "@ant-design/icons";
import type { ReportEnvelope } from "../../models/report";
import { tokens } from "../design/tokens";
import ReportPreviewPages, { type ReportPreviewPagesRef } from "./report_preview_pages";
import { usePdfExport } from "../../hooks/use_pdf_export";

interface ReportPreviewProps {
    report: ReportEnvelope;
    loading?: boolean;
    style?: React.CSSProperties;
}

export interface ReportPreviewRef {
    exportPDF: () => Promise<void>;
}

const ReportPreview = forwardRef<ReportPreviewRef, ReportPreviewProps>(({ report, loading = false, style }, ref) => {
    const previewPagesRef = useRef<ReportPreviewPagesRef>(null);
    const { exportToPDF } = usePdfExport();

    const handleExportPDF = async () => {
        await exportToPDF(previewPagesRef);
    };

    useImperativeHandle(ref, () => ({
        exportPDF: handleExportPDF
    }));

    if (loading) {
        return (
            <Card
                style={{
                    ...style,
                    background: tokens.cardBg,
                    borderRadius: tokens.radius,
                    boxShadow: tokens.shadow,
                }}
            >
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
                    <Spin size="large" />
                </div>
            </Card>
        );
    }

    return (
        <Card
            style={{
                ...style,
                background: tokens.cardBg,
                borderRadius: tokens.radius,
                boxShadow: tokens.shadow,
            }}
        >
            <div style={{ padding: 16, overflowY: "auto", maxHeight: 600 }}>
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
                <ReportPreviewPages ref={previewPagesRef} report={report} />
            </div>
        </Card>
    );
});

ReportPreview.displayName = 'ReportPreview';

export default ReportPreview;
