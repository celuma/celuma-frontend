/**
 * Numbering of orders and samples (Céluma 1.4, issue #8; automatic registration).
 *
 * Registration is AUTOMATIC for orders: no form types an order code and the API accepts none. A SAMPLE row may
 * carry a typed code (hotfix 1.4.3, `lab:enter_manual_code`); otherwise it is generated on save, and the form
 * shows a read-only suggestion (`POST /numbering/sample-code-suggestions`) that reserves nothing.
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
    /**
     * #64. With `scope_id`: `effective` (default) starts from what that type really uses (its own configuration,
     * else the laboratory's); `laboratory` starts from the laboratory's numbering only, ignoring the type's own
     * configuration (what the type would use if it were cleared). Candidate fields apply on top of either.
     */
    layer?: "effective" | "laboratory";
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
    /** #64: where the format, width and start value of the preview came from (before any candidate field). */
    config_source?: NumberingConfigSource;
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

// ── Sample-code suggestions (hotfix 1.4.3) ───────────────────────────────────────────────────────────────

/** One sample row asking what code it would get. `key` is echoed back (the form uses the row's field id). */
export interface SampleCodeSuggestionItem {
    key: string;
    sample_type_id: string;
    /** `YYYY-MM-DD` as typed; null while the row has no valid receipt date. */
    received_at: string | null;
}

export interface SampleCodeSuggestionRequest {
    branch_id?: string;
    /** In row order, only rows still on the automatic code (a typed code consumes no number). */
    items: SampleCodeSuggestionItem[];
    /** Codes typed by hand in the same lot: the API never suggests them. */
    reserved_codes: string[];
}

export interface SampleCodeSuggestion {
    key: string;
    code: string | null;
    /** Why there is no code yet: `receipt_date_required`, `receipt_date_invalid`, `branch_required`, ... */
    reason: string | null;
    period_year: number | null;
    period_month: number | null;
    /** Always false: a suggestion never reserves or consumes a number. */
    reserved: boolean;
}

export interface SampleCodeSuggestionResponse {
    scheme: "monthly" | "legacy";
    suggestions: SampleCodeSuggestion[];
    notice: string;
}

// ── Numbering by study type / sample type (Céluma 1.5, #64) ──────────────────────────────────────────────

/**
 * Where the format, minimum width and start value of a type come from: its own optional configuration
 * (`type`) or the laboratory's numbering of that kind (`laboratory`, the default). Activation, counter scope
 * and numbering timezone are always the laboratory's.
 */
export type NumberingConfigSource = "type" | "laboratory";

/** The settings a type may override. Everything else is inherited from the laboratory. */
export interface TypeNumberingInput {
    format: string;
    sequence_min_width: number;
    start_value: number;
}

export interface TypeNumberingOverride extends TypeNumberingInput {
    updated_at: string | null;
    updated_by: string | null;
}

/** What a type actually numbers with right now (override applied, inherited fields included). */
export interface EffectiveTypeNumbering extends TypeNumberingInput {
    active: boolean;
    scope: NumberingScope;
    timezone: string;
    scheme: "monthly" | "legacy";
}

export interface TypeNumberingEntry {
    entity_kind: NumberingKind;
    type_id: string;
    code: string;
    name: string;
    is_active: boolean;
    source: NumberingConfigSource;
    /** null = the type inherits the laboratory's numbering. */
    override: TypeNumberingOverride | null;
    effective: EffectiveTypeNumbering;
}

export interface TypeNumberingList {
    entity_kind: NumberingKind;
    /** The laboratory's numbering of this kind: the default every type without its own configuration uses. */
    laboratory: EffectiveTypeNumbering;
    types: TypeNumberingEntry[];
}
