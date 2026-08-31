/**
 * Céluma 1.3 — the canonical download filename for a report PDF.
 *
 * ONE contract, two artifacts:
 *
 *     official    <ORDER_CODE>-<StudyTypePascalCase>.pdf
 *     local copy  <ORDER_CODE>-<StudyTypePascalCase>-v<VERSION>-LOCAL.pdf
 *
 * Before H-0c the two were built by unrelated string concatenation and did not
 * look like the same report: the official download was `reporte-CTM-35-v1.pdf`
 * while the local copy was named from the report's display TITLE, e.g.
 * `Reporte Citologia Mamaria - Luigi Mario (copia local).pdf` — which also put
 * the patient's name in a filename.
 *
 * Deliberate properties:
 *
 *   - **No patient identity.** The filename identifies the clinical artifact by
 *     order code and study type only. Orders without a patient name the same way.
 *   - **The official filename carries no version.** It names the canonical
 *     official artifact; provenance comes from the report id, version, object
 *     key, sha256 and audit history, never from a human-visible filename.
 *   - **The version marks the LOCAL copy**, with the `LOCAL` suffix, so a local
 *     copy can never be mistaken for the official document.
 *
 * Exact mirror of `celuma-backend/app/services/report_filename.py`. Both sides
 * share the same case table in their parity tests.
 */

const NON_WORD = /[^0-9A-Za-z]+/g;
const ORDER_CODE_UNSAFE = /[^0-9A-Za-z_-]+/g;

/** Deterministic bounds — the extension and the `-v<N>-LOCAL` suffix are never
 *  truncated, only these components, and always at the same length. */
const MAX_STUDY_TYPE_CHARS = 60;
const MAX_ORDER_CODE_CHARS = 40;

const FALLBACK_ORDER_CODE = "SIN-ORDEN";
const FALLBACK_STUDY_TYPE = "Reporte";

/** `Citología` -> `Citologia`, `Riñón` -> `Rinon`. NFD splits a letter from its
 *  combining mark, so removing the marks leaves plain ASCII letters. */
export function stripDiacritics(value: string): string {
    return (value ?? "").normalize("NFD").replace(/\p{M}+/gu, "");
}

/**
 * `"  Citología   Mamaria  "` -> `CitologiaMamaria`.
 *
 * Trims, collapses whitespace, removes diacritics, splits on every
 * non-alphanumeric boundary, capitalizes each word and concatenates. Every word
 * is capitalized including short connectors: `Biopsia de Riñón` becomes
 * `BiopsiaDeRinon`. Interior casing is preserved (`PCR` stays `PCR`, it does not
 * become `Pcr`).
 */
export function pascalCase(value: string): string {
    const ascii = stripDiacritics(value ?? "");
    const words = ascii.split(NON_WORD).filter(Boolean);
    if (words.length === 0) return "";
    return words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

/** Preserves the human-readable code as-is (`CTM-35` stays `CTM-35`) and only
 *  replaces characters unsafe in a filename. Never collapses the hyphen real
 *  order codes contain. */
export function sanitizeOrderCode(orderCode: string | null | undefined): string {
    const raw = stripDiacritics((orderCode ?? "").trim());
    const safe = raw
        .replace(ORDER_CODE_UNSAFE, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
    return safe.slice(0, MAX_ORDER_CODE_CHARS) || FALLBACK_ORDER_CODE;
}

/** The shared stem both artifacts are built from — what makes the official PDF
 *  and its local copy recognisably the same report. */
export function reportPdfFilenameBase(
    orderCode: string | null | undefined,
    studyType: string | null | undefined,
): string {
    const study = pascalCase(studyType ?? "").slice(0, MAX_STUDY_TYPE_CHARS) || FALLBACK_STUDY_TYPE;
    return `${sanitizeOrderCode(orderCode)}-${study}`;
}

export interface ReportPdfFilenameOptions {
    /** Required for a local copy; IGNORED for the official artifact. */
    version?: number | null;
    localCopy?: boolean;
}

/**
 * The canonical download filename.
 *
 * `version` is ignored for the official artifact — its name must not expose an
 * internal version number. A local copy with no known version falls back to
 * `v1`, so it still cannot collide with the official name.
 */
export function buildReportPdfFilename(
    orderCode: string | null | undefined,
    studyType: string | null | undefined,
    { version = null, localCopy = false }: ReportPdfFilenameOptions = {},
): string {
    const base = reportPdfFilenameBase(orderCode, studyType);
    if (localCopy) {
        const v = version && version > 0 ? version : 1;
        return `${base}-v${v}-LOCAL.pdf`;
    }
    return `${base}.pdf`;
}
