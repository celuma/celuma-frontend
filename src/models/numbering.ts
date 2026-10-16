/**
 * Monthly numbering of orders and samples (Céluma 1.4, issue #8).
 *
 * Contract: `celuma-engineering/specs/laboratory/monthly-numbering.md`.
 */

export type NumberingKind = "order" | "sample";

/**
 * `automatic`: generated when the code is left empty, a typed code is a manual override.
 * `automatic_only`: always generated, a typed code is refused.
 * `manual_only`: the code is always required.
 */
export type NumberingMode = "automatic" | "automatic_only" | "manual_only";

export const NUMBERING_MODES: NumberingMode[] = ["automatic", "automatic_only", "manual_only"];

export interface NumberingConfig {
    entity_kind: NumberingKind;
    format: string;
    sequence_min_width: number;
    mode: NumberingMode;
    /** true = the laboratory has no stored configuration; defaults apply. */
    is_default: boolean;
}

export interface NumberingConfigs {
    order: NumberingConfig;
    sample: NumberingConfig;
}

export interface NumberingConfigInput {
    format: string;
    sequence_min_width: number;
    mode: NumberingMode;
}

export interface NumberingPreviewRequest {
    entity_kind: NumberingKind;
    format?: string;
    sequence_min_width?: number;
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

export const MODE_LABEL: Record<NumberingMode, string> = {
    automatic: "Automático (permite código manual)",
    automatic_only: "Solo automático",
    manual_only: "Solo manual",
};
