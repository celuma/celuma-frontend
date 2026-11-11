/**
 * Pure rules of the "Código de muestra" field of the registration forms (hotfix 1.4.3).
 *
 * A row is either AUTOMATIC (the default: the field shows a read-only-in-spirit suggestion that is never
 * reserved, and the definitive code is assigned on save) or MANUAL (the user typed a code: it is sent as typed
 * and consumes no automatic number). A manual row is never overwritten by a type or date change or by a late
 * suggestion: the suggestion lives apart from what the user typed, and the shown value is derived from both.
 */
import type { SampleCodeSuggestion, SampleCodeSuggestionRequest } from "../models/numbering";
import { isValidReceiptDate } from "./receipt_date";

/** Same shape the API enforces: 1-100 characters of letters, digits, '.', '_' and '-'. */
export const MANUAL_SAMPLE_CODE_RE = /^[A-Za-z0-9._-]{1,100}$/;
export const MANUAL_SAMPLE_CODE_MESSAGE = "Use de 1 a 100 caracteres: letras, números, punto, guion y guion bajo.";

export interface SampleCodeRow {
    /** Stable id of the row (the form array's field id), not its position. */
    key: string;
    sampleTypeId: string;
    receivedDate: string;
    /** The user wrote a code of their own. */
    manual: boolean;
    typedCode: string;
}

/** What a suggestion was computed FOR; a suggestion only applies while the row still has these inputs. */
export interface SuggestionInputs {
    sampleTypeId: string;
    receivedDate: string | null;
}

export interface RowSuggestion extends SuggestionInputs {
    code: string | null;
    reason: string | null;
}

export type RowCodeState =
    | { kind: "manual"; code: string }
    | { kind: "need_type" }
    | { kind: "need_date" }
    | { kind: "pending" }
    | { kind: "suggested"; code: string }
    | { kind: "unavailable"; reason: string };

const validDate = (value: string): string | null => (isValidReceiptDate(value.trim()) ? value.trim() : null);

/** A manual row whose text is empty is still on the automatic code (nothing was written). */
export const isManualRow = (row: Pick<SampleCodeRow, "manual" | "typedCode">): boolean => row.manual && row.typedCode.trim() !== "";

export function isManualCodeValid(code: string): boolean {
    return MANUAL_SAMPLE_CODE_RE.test(code.trim());
}

export function inputsOf(row: SampleCodeRow): SuggestionInputs {
    return { sampleTypeId: row.sampleTypeId, receivedDate: validDate(row.receivedDate) };
}

/**
 * The request for the rows still on the automatic code (null = nothing to ask). Manual rows are not asked:
 * they consume no number, and their codes travel as `reserved_codes` so no suggestion repeats them.
 */
export function buildSuggestionRequest(rows: SampleCodeRow[], branchId?: string): SampleCodeSuggestionRequest | null {
    const items = rows
        .filter((r) => !isManualRow(r) && r.sampleTypeId)
        .map((r) => ({ key: r.key, sample_type_id: r.sampleTypeId, received_at: validDate(r.receivedDate) }));
    if (items.length === 0) return null;
    const reserved = [...new Set(rows.filter(isManualRow).map((r) => r.typedCode.trim()).filter(isManualCodeValid))].sort();
    return { ...(branchId ? { branch_id: branchId } : {}), items, reserved_codes: reserved };
}

export function toRowSuggestions(request: SampleCodeSuggestionRequest, suggestions: SampleCodeSuggestion[]): Record<string, RowSuggestion> {
    const inputs = new Map(request.items.map((i) => [i.key, { sampleTypeId: i.sample_type_id, receivedDate: i.received_at }]));
    const out: Record<string, RowSuggestion> = {};
    for (const s of suggestions) {
        const asked = inputs.get(s.key);
        if (asked) out[s.key] = { ...asked, code: s.code, reason: s.reason };
    }
    return out;
}

/**
 * What a row shows. Derived on every render from the row and the latest suggestion, never stored: so a
 * typed code cannot be replaced by an answer that arrives later, and a suggestion computed for an older
 * type or date is not shown as current.
 */
export function resolveRowCode(row: SampleCodeRow, suggestion: RowSuggestion | undefined, failed = false): RowCodeState {
    if (isManualRow(row)) return { kind: "manual", code: row.typedCode };
    if (!row.sampleTypeId) return { kind: "need_type" };
    const now = inputsOf(row);
    const current = suggestion && suggestion.sampleTypeId === now.sampleTypeId && suggestion.receivedDate === now.receivedDate;
    if (current) {
        if (suggestion.code) return { kind: "suggested", code: suggestion.code };
        if (suggestion.reason === "receipt_date_required" || suggestion.reason === "receipt_date_invalid") return { kind: "need_date" };
        return { kind: "unavailable", reason: suggestion.reason ?? "unknown" };
    }
    if (failed) return { kind: "unavailable", reason: "request_failed" };
    return { kind: "pending" };
}

/** The `sample_code` to send: only a manual row's text, trimmed. Automatic rows send none. */
export function payloadCode(row: Pick<SampleCodeRow, "manual" | "typedCode">, canEnterManual: boolean): string | undefined {
    return canEnterManual && isManualRow(row) ? row.typedCode.trim() : undefined;
}

/**
 * The real result after saving: the codes the API returned, and where an automatic code is not the one that
 * was shown as a suggestion (a concurrent registration took it, the configuration changed...).
 */
export function describeSavedCodes(
    shown: RowCodeState[],
    saved: Array<{ sample_code: string }>,
): { text: string; differs: boolean } {
    const parts = saved.map((s, i) => {
        const was = shown[i];
        if (was?.kind === "manual") return `${s.sample_code} (manual)`;
        if (was?.kind === "suggested" && was.code !== s.sample_code) return `${s.sample_code} (se sugirió ${was.code})`;
        return s.sample_code;
    });
    const differs = saved.some((s, i) => shown[i]?.kind === "suggested" && (shown[i] as { code: string }).code !== s.sample_code);
    const noun = saved.length === 1 ? "Muestra registrada" : "Muestras registradas";
    return { text: `${noun}: ${parts.join(", ")}.${differs ? " El código automático definitivo se asignó al guardar." : ""}`, differs };
}
