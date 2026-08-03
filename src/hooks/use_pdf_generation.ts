import { useCallback, useState } from "react";
import { generateReportPdf, type PdfGenerationStatusResponse } from "../services/report_service";

/**
 * Céluma 1.3 Phase 2, Block E, Story E12.
 *
 * Thin, testable wrapper around POST .../generate-pdf. Extracted out of
 * report_editor.tsx (already large — see block-e-dependencies.md) instead of
 * inlining fetch + loading state there.
 *
 * Deliberately holds no PDF-status state of its own: report_editor.tsx (like
 * every other action here — submit/approve/sign) treats `envelope` as the
 * single source of truth and merges the result back into it after a
 * successful call. This hook only owns the in-flight flag and error surface
 * for the request itself.
 *
 * The backend endpoint is synchronous (it blocks on the headless-Chromium
 * render, bounded by PDF_GENERATION_TIMEOUT_SECONDS) and idempotent once
 * READY, so no polling is needed — a single request resolves with the final
 * status.
 */
export function usePdfGeneration() {
    const [isRequesting, setIsRequesting] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);

    const generate = useCallback(
        async (reportId: string, versionNo: number): Promise<PdfGenerationStatusResponse> => {
            setIsRequesting(true);
            setLastError(null);
            try {
                const result = await generateReportPdf(reportId, versionNo);
                return result;
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Error al generar el PDF";
                setLastError(msg);
                throw err;
            } finally {
                setIsRequesting(false);
            }
        },
        [],
    );

    return { isRequesting, lastError, generate };
}
