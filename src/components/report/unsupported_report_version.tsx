import { forwardRef, useImperativeHandle, type CSSProperties } from "react";
import type { ReportRendererRef } from "./legacy/legacy_report_types";

interface UnsupportedReportVersionProps {
    /** The schema_version value that could not be rendered (may be an invalid/unknown value). */
    schemaVersion: unknown;
    /** "not-implemented" = a known future version (currently only 2, V2) with no renderer yet.
     *  "unknown" = resolveReportSchemaVersion rejected the value outright. */
    reason: "not-implemented" | "unknown";
    style?: CSSProperties;
}

/**
 * Controlled fallback rendered by ReportRendererResolver (Céluma 1.3 Phase 2,
 * Block A, Story A5) when a report cannot be rendered: either its
 * schema_version is recognized but has no renderer yet (V2, before Block C),
 * or the value is not a version this build understands at all.
 *
 * Implements the same ReportRendererRef contract as every real renderer so
 * consumers (use_local_print.ts, etc.) can call getPages() unconditionally
 * without a type-level branch — it just safely returns no pages.
 */
const UnsupportedReportVersion = forwardRef<ReportRendererRef, UnsupportedReportVersionProps>(
    ({ schemaVersion, reason, style }, ref) => {
        useImperativeHandle(ref, () => ({ getPages: () => [] }), []);

        const message =
            reason === "not-implemented"
                ? "Este reporte usa una versión de plantilla que todavía no tiene un visor disponible en esta versión de la aplicación."
                : "Este reporte tiene una versión de esquema desconocida y no puede mostrarse.";

        return (
            <div
                style={{
                    ...style,
                    padding: 24,
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    background: "#fafbfc",
                    color: "#374151",
                    fontFamily: "Arial, sans-serif",
                }}
                data-testid="unsupported-report-version"
                data-reason={reason}
            >
                <p style={{ margin: 0, fontWeight: 700 }}>Versión de reporte no disponible</p>
                <p style={{ margin: "8px 0 0 0" }}>{message}</p>
                <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#6b7280" }}>
                    schema_version: {JSON.stringify(schemaVersion)}
                </p>
            </div>
        );
    },
);

UnsupportedReportVersion.displayName = "UnsupportedReportVersion";

export default UnsupportedReportVersion;
