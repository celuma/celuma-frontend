/**
 * Numbering of orders and samples (Céluma 1.4, issue #8; automatic registration).
 *
 * Registration is AUTOMATIC: no form types an order or sample code and the API accepts none.
 * Contract: `celuma-engineering/specs/laboratory/monthly-numbering.md`.
 */

export type NumberingKind = "order" | "sample";

/**
 * Legacy manual-code policy. Since registration is automatic it no longer affects anything; the stored
 * value is kept readable (and a stored `required` is preserved untouched) but cannot be newly chosen.
 */
export type ManualPolicy = "allowed" | "forbidden" | "required";

export type NumberingScope = "tenant" | "branch";

export interface NumberingConfig {
    entity_kind: NumberingKind;
    /** Deliberate activation. false = compatibility numbering: `<code>-<n>` for orders AND samples. */
    active: boolean;
    /** Legacy; no effect on registration. */
    manual_policy: ManualPolicy;
    format: string;
    sequence_min_width: number;
    start_value: number;
    scope: NumberingScope;
    /** IANA zone of the month of tenant-wide counters (a branch-scoped counter uses its branch's zone). */
    timezone: string;
    /** true = the laboratory has no stored configuration (never activated). */
    is_default: boolean;
    /** Always "automatic". */
    registration: "automatic";
    /** True when the stored (retired) policy is `required`; shown so an administrator can see it. */
    legacy_manual_policy: boolean;
    activated_at?: string | null;
}

export interface NumberingConfigs {
    order: NumberingConfig;
    sample: NumberingConfig;
}

export interface NumberingConfigInput {
    active: boolean;
    /** Omit to keep the stored value. */
    manual_policy?: ManualPolicy;
    format: string;
    sequence_min_width: number;
    start_value: number;
    scope: NumberingScope;
    timezone: string;
}

export interface NumberingPreviewRequest {
    entity_kind: NumberingKind;
    active?: boolean;
    format?: string;
    sequence_min_width?: number;
    start_value?: number;
    scope?: NumberingScope;
    timezone?: string;
    /** Study type (orders) or sample type (samples) id. */
    scope_id?: string;
    branch_id?: string;
    /**
     * Samples only (#33): the receipt date typed in the form, as a date-only `YYYY-MM-DD`. It defines the
     * period shown, exactly as the registration will. Never consumes a number.
     */
    reference_date?: string;
}

export interface NumberingPreview {
    entity_kind: NumberingKind;
    valid: boolean;
    errors: string[];
    format: string;
    sequence_min_width: number;
    scheme: "monthly" | "legacy";
    /** The zone that defined the period shown. */
    timezone: string;
    period_year: number;
    period_month: number;
    /** What defined the period: the receipt date, or the allocation instant (orders; samples without a date). */
    date_basis?: "receipt_date" | "allocation_instant";
    base_code: string;
    examples: Array<{ sequence: number; code: string }>;
    /** Read-only estimate; `reserved` is always false. */
    estimate: { sequence: number; code: string; reserved: boolean; skipped_occupied: number } | null;
    notice: string;
}

/** The default format of the issue: base code + sequence (min. 2 digits) + MM + YY, no separators. */
export const DEFAULT_NUMBERING_FORMAT = "{BASE}{SEQ}{MM}{YY}";
/** The optional hyphen after the base code: `CU-011026`. */
export const HYPHEN_NUMBERING_FORMAT = "{BASE}-{SEQ}{MM}{YY}";

/** `{BASE}[-]{BRANCH}[-]{SEQ}{MM}{YY}`: the format of a separator preset (branch token only for branch scope). */
export function composeFormat(separator: "none" | "hyphen", scope: NumberingScope): string {
    const sep = separator === "hyphen" ? "-" : "";
    return scope === "branch" ? `{BASE}${sep}{BRANCH}${sep}{SEQ}{MM}{YY}` : `{BASE}${sep}{SEQ}{MM}{YY}`;
}


/** Default numbering zone: the platform default of branches (explicit, never guessed from a branch). */
export const DEFAULT_NUMBERING_TIMEZONE = "America/Mexico_City";

/** IANA zones offered by the selector (the browser's list when available). */
export function timezoneOptions(): string[] {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const zones = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
    const base = zones.length ? zones : ["America/Mexico_City", "America/Bogota", "America/Lima", "America/Santiago", "Europe/Madrid"];
    return Array.from(new Set(["UTC", DEFAULT_NUMBERING_TIMEZONE, ...base]));
}
