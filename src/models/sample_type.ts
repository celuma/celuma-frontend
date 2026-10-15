/**
 * Sample-type catalog and catalog JSON transfer (Céluma 1.4, issue #17).
 *
 * Contract: `celuma-engineering/specs/laboratory/sample-types.md` and
 * `.../catalog-transfer.md`.
 */

/** A sample's type as the API returns it; `null` means a legacy sample ("Sin tipo"). */
export interface SampleTypeRef {
    id: string;
    code: string;
    name: string;
    /** false = deactivated but still referenced: readable, not selectable for new samples. */
    is_active: boolean;
}

/** Display text of a sample without a catalog type. */
export const UNTYPED_LABEL = "Sin tipo";

/** Filter value that selects samples without a type. */
export const UNTYPED_FILTER_VALUE = "none";

export interface SampleType {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    description?: string | null;
    is_active: boolean;
    created_at: string;
    default_report_template_id?: string | null;
    default_template?: { id: string; name: string } | null;
}

export interface SampleTypesListResponse {
    sample_types: SampleType[];
}

export type CatalogKind = "study_types" | "sample_types";

/** Validation outcome of one source record against the sample-type catalog. */
export type TransferStatus = "ready" | "code_exists" | "duplicate_in_source" | "invalid";

export interface TransferIssue {
    code: string;
    message: string;
    field?: string | null;
}

export interface TransferItem {
    index: number;
    code: string | null;
    name: string | null;
    description: string | null;
    is_active: boolean;
    status: TransferStatus;
    template_reference: "none" | "mapped" | "dropped";
    source_id: string | null;
    existing_sample_type_id: string | null;
    issues: TransferIssue[];
    warnings: TransferIssue[];
}

export interface TransferPreview {
    source_kind: CatalogKind;
    origin: "file" | "copy";
    total: number;
    ready: number;
    conflicts: number;
    invalid: number;
    plan_digest: string;
    items: TransferItem[];
}

export type ConflictPolicy = "abort" | "skip";

export interface TransferResult {
    operation_id: string;
    created: SampleType[];
    skipped: Array<{ index: number; code: string | null; reason: string }>;
}
