/**
 * Monthly numbering of orders and samples (Céluma 1.4, issue #8).
 *
 * Contract: `celuma-engineering/specs/laboratory/monthly-numbering.md`.
 */

export type NumberingKind = "order" | "sample";

/** `allowed`: a typed code is an override; `forbidden`: always generated; `required`: always typed. */
export type ManualPolicy = "allowed" | "forbidden" | "required";
export const MANUAL_POLICIES: ManualPolicy[] = ["allowed", "forbidden", "required"];

export type NumberingScope = "tenant" | "branch";

/** How the caller is offered the code input (computed by the API from policy AND capability). */
export type ManualEntry = "optional" | "required" | "hidden" | "blocked";

export interface NumberingConfig {
    entity_kind: NumberingKind;
    /** Deliberate activation. false = compatibility behaviour (orders `<code>-<n>`, samples typed by hand). */
    active: boolean;
    manual_policy: ManualPolicy;
    format: string;
    sequence_min_width: number;
    start_value: number;
    scope: NumberingScope;
    /** IANA zone of the month of tenant-wide counters (a branch-scoped counter uses its branch's zone). */
    timezone: string;
    /** true = the laboratory has no stored configuration (never activated). */
    is_default: boolean;
    manual_entry: ManualEntry;
    activated_at?: string | null;
}

export interface NumberingConfigs {
    order: NumberingConfig;
    sample: NumberingConfig;
}

export interface NumberingConfigInput {
    active: boolean;
    manual_policy: ManualPolicy;
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

export const POLICY_LABEL: Record<ManualPolicy, string> = {
    allowed: "Permitido a quien tenga el permiso",
    forbidden: "No permitido (siempre automático)",
    required: "Obligatorio (siempre manual)",
};

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
