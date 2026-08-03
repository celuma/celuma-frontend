/**
 * Explicit report schema version resolution (Céluma 1.3 Phase 2, Block A,
 * Story A3). Pure, side-effect-free — used by ReportRendererResolver
 * (Story A5) to pick which renderer implementation renders a report.
 *
 * Rules (see report-schema-versioning.md):
 *   - schema_version absent            -> LEGACY_REPORT_SCHEMA_VERSION (1)
 *   - schema_version === 1             -> 1 (legacy renderer)
 *   - schema_version === 2             -> 2 (future V2 renderer)
 *   - anything else (unknown/invalid)  -> throws UnsupportedReportSchemaVersionError
 *
 * Deliberately does NOT infer the version from dates, tenant, or the
 * presence/absence of optional fields — only the `schema_version` key
 * itself is consulted. Historical JSON documents in S3/Postgres are never
 * rewritten to add this field; its absence IS the version-1 signal.
 */

export const LEGACY_REPORT_SCHEMA_VERSION = 1;
export const CURRENT_REPORT_SCHEMA_VERSION = 2;

const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [
    LEGACY_REPORT_SCHEMA_VERSION,
    CURRENT_REPORT_SCHEMA_VERSION,
];

/** Thrown when `schema_version` is present but not a value this build knows how to render. */
export class UnsupportedReportSchemaVersionError extends Error {
    readonly schemaVersion: unknown;

    constructor(schemaVersion: unknown) {
        super(`Unsupported report schema_version: ${JSON.stringify(schemaVersion)}`);
        this.name = "UnsupportedReportSchemaVersionError";
        this.schemaVersion = schemaVersion;
    }
}

/**
 * Resolves the schema version of a report content document.
 *
 * `report` is typed `unknown` on purpose: it must safely accept malformed or
 * unexpected data (a non-object, an array, `null`) without throwing — those
 * cases resolve to the legacy version, same as a document that simply lacks
 * the field. Only a `schema_version` key that IS present but holds a value
 * other than 1 or 2 is treated as an error, since that represents a document
 * explicitly claiming a version this code cannot handle.
 */
export function resolveReportSchemaVersion(report: unknown): number {
    if (report === null || typeof report !== "object" || Array.isArray(report)) {
        return LEGACY_REPORT_SCHEMA_VERSION;
    }

    if (!("schema_version" in report)) {
        return LEGACY_REPORT_SCHEMA_VERSION;
    }

    const value = (report as Record<string, unknown>).schema_version;

    if (SUPPORTED_SCHEMA_VERSIONS.includes(value as number)) {
        return value as number;
    }

    throw new UnsupportedReportSchemaVersionError(value);
}
