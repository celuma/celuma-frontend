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
import VersionedReportRendererV2 from "./versioned/versioned_report_renderer_v2";

/**
 * ReportRendererResolver (Céluma 1.3 Phase 2, Block A, Story A5).
 *
 * The single entry point for rendering a report — preview (editor + detail)
 * and PDF export all go through this component instead of importing a
 * renderer directly. It resolves report.report's schema_version and picks
 * the matching renderer:
 *
 *   absent / 1  -> LegacyReportRendererV1  (frozen, historical letterhead — Block A)
 *   2           -> VersionedReportRendererV2 (Block C — reads exclusively
 *                   report.report.rendering_snapshot; NEVER falls back to
 *                   the legacy renderer, even if its own snapshot turns out
 *                   to be missing/invalid — it renders its own controlled
 *                   fallback in that case, see versioned_report_renderer_v2.tsx)
 *   anything else -> UnsupportedReportVersion (controlled "unknown version" state)
 *
 * Every branch implements the same ReportRendererRef contract
 * (`getPages(): HTMLElement[]`), so use_local_print.ts and callers work
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
            // Never reinterpret a V2 report with the legacy renderer, even
            // when its snapshot is missing/invalid — VersionedReportRendererV2
            // owns that fallback itself (see its module docstring).
            return <VersionedReportRendererV2 ref={ref} report={report} style={style} signerLookup={signerLookup} />;
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
