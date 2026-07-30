import { forwardRef, type CSSProperties } from "react";
import type { ReportEnvelope } from "../../models/report";
import {
    CURRENT_REPORT_SCHEMA_VERSION,
    LEGACY_REPORT_SCHEMA_VERSION,
    UnsupportedReportSchemaVersionError,
    resolveReportSchemaVersion,
} from "./report_schema_version";
import LegacyReportRendererV1 from "./legacy/legacy_report_renderer_v1";
import type { ReportRendererRef, SignerLookupEntry } from "./legacy/legacy_report_types";
import UnsupportedReportVersion from "./unsupported_report_version";

/**
 * ReportRendererResolver (Céluma 1.3 Fase 2, Bloque A, Historia A5).
 *
 * The single entry point for rendering a report — preview (editor + detail)
 * and PDF export all go through this component instead of importing a
 * renderer directly. It resolves report.report's schema_version and picks
 * the matching renderer:
 *
 *   absent / 1  -> LegacyReportRendererV1  (the only renderer that exists today)
 *   2           -> UnsupportedReportVersion (V2 has no renderer until Bloque C —
 *                   NEVER falls back to the legacy renderer for a V2 report)
 *   anything else -> UnsupportedReportVersion (controlled "unknown version" state)
 *
 * Every branch implements the same ReportRendererRef contract
 * (`getPages(): HTMLElement[]`), so use_pdf_export.ts and callers work
 * unchanged regardless of which branch actually rendered.
 */

interface ReportRendererResolverProps {
    report: ReportEnvelope;
    style?: CSSProperties;
    signerLookup?: SignerLookupEntry[];
}

const ReportRendererResolver = forwardRef<ReportRendererRef, ReportRendererResolverProps>(
    ({ report, style, signerLookup }, ref) => {
        let version: number | undefined;
        let unsupportedError: UnsupportedReportSchemaVersionError | undefined;

        try {
            version = resolveReportSchemaVersion(report.report);
        } catch (err) {
            if (err instanceof UnsupportedReportSchemaVersionError) {
                unsupportedError = err;
            } else {
                throw err;
            }
        }

        if (version === LEGACY_REPORT_SCHEMA_VERSION) {
            return <LegacyReportRendererV1 ref={ref} report={report} style={style} signerLookup={signerLookup} />;
        }

        if (version === CURRENT_REPORT_SCHEMA_VERSION) {
            // VersionedReportRendererV2 does not exist yet (Bloque C). Never
            // reinterpret a V2 report with the legacy renderer.
            return <UnsupportedReportVersion ref={ref} schemaVersion={version} reason="not-implemented" style={style} />;
        }

        return (
            <UnsupportedReportVersion
                ref={ref}
                schemaVersion={unsupportedError?.schemaVersion}
                reason="unknown"
                style={style}
            />
        );
    },
);

ReportRendererResolver.displayName = "ReportRendererResolver";

export default ReportRendererResolver;
export type { ReportRendererRef, SignerLookupEntry } from "./legacy/legacy_report_types";
