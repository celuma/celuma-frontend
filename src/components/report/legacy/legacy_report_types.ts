/**
 * Shared types for the report renderer contract (Céluma 1.3 Fase 2, Bloque A,
 * Historia A4/A5). LegacyReportRendererV1 implements this ref contract today;
 * any future renderer resolved by ReportRendererResolver must implement the
 * same shape so use_pdf_export.ts keeps working unmodified regardless of
 * which schema_version produced the report.
 */

/** Contract every report renderer implementation must expose via ref. */
export interface ReportRendererRef {
    /** Returns the currently rendered page elements, in order. Consumed verbatim by use_pdf_export.ts. */
    getPages: () => HTMLElement[];
}

/** Lightweight user lookup so the signature block can resolve `signed_by` (a UUID)
 *  into a display name without forcing every caller to pass a resolved object. */
export interface SignerLookupEntry {
    id: string;
    name: string;
}
