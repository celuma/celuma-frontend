import { describe, expect, it } from "vitest";
import {
    buildSuggestionRequest,
    describeSavedCodes,
    isManualCodeValid,
    payloadCode,
    resolveRowCode,
    toRowSuggestions,
    type SampleCodeRow,
} from "../../lib/sample_code_rows";

const row = (over: Partial<SampleCodeRow> = {}): SampleCodeRow => ({
    key: "a", sampleTypeId: "t1", receivedDate: "2026-09-30", manual: false, typedCode: "", ...over,
});

describe("sample code rows (hotfix 1.4.3)", () => {
    it("asks only for automatic rows that have a type, and reserves the codes typed in the lot", () => {
        const request = buildSuggestionRequest([
            row({ key: "a" }),
            row({ key: "b", manual: true, typedCode: " MAN-2 " }),
            row({ key: "c", sampleTypeId: "" }),
            row({ key: "d", manual: true, typedCode: "" }), // emptied: still automatic
            row({ key: "e", receivedDate: "2026-9-3" }), // not a valid date yet: sent as null
            row({ key: "f", manual: true, typedCode: "bad code" }), // invalid text is never reserved
        ], "br-1");
        expect(request).toEqual({
            branch_id: "br-1",
            items: [
                { key: "a", sample_type_id: "t1", received_at: "2026-09-30" },
                { key: "d", sample_type_id: "t1", received_at: "2026-09-30" },
                { key: "e", sample_type_id: "t1", received_at: null },
            ],
            reserved_codes: ["MAN-2"],
        });
    });

    it("asks nothing when no row is automatic with a type", () => {
        expect(buildSuggestionRequest([row({ sampleTypeId: "" }), row({ manual: true, typedCode: "X" })])).toBeNull();
    });

    it("a manual row shows what was typed, whatever the suggestion says", () => {
        const request = buildSuggestionRequest([row()])!;
        const answers = toRowSuggestions(request, [{ key: "a", code: "BX011026", reason: null, period_year: 2026, period_month: 10, reserved: false }]);
        expect(resolveRowCode(row({ manual: true, typedCode: "MAN-1" }), answers.a)).toEqual({ kind: "manual", code: "MAN-1" });
        expect(resolveRowCode(row(), answers.a)).toEqual({ kind: "suggested", code: "BX011026" });
    });

    it("a suggestion computed for an older type or date is not shown as current", () => {
        const request = buildSuggestionRequest([row()])!;
        const answers = toRowSuggestions(request, [{ key: "a", code: "BX011026", reason: null, period_year: 2026, period_month: 10, reserved: false }]);
        expect(resolveRowCode(row({ sampleTypeId: "t2" }), answers.a).kind).toBe("pending");
        expect(resolveRowCode(row({ receivedDate: "2026-10-01" }), answers.a).kind).toBe("pending");
        expect(resolveRowCode(row({ sampleTypeId: "" }), answers.a).kind).toBe("need_type");
        expect(resolveRowCode(row({ sampleTypeId: "t2" }), answers.a, true)).toEqual({ kind: "unavailable", reason: "request_failed" });
    });

    it("reports a missing date and other reasons without inventing a code", () => {
        const request = buildSuggestionRequest([row({ receivedDate: "" })])!;
        const answers = toRowSuggestions(request, [{ key: "a", code: null, reason: "receipt_date_required", period_year: null, period_month: null, reserved: false }]);
        expect(resolveRowCode(row({ receivedDate: "" }), answers.a)).toEqual({ kind: "need_date" });
        const other = toRowSuggestions(request, [{ key: "a", code: null, reason: "sample_type_inactive", period_year: null, period_month: null, reserved: false }]);
        expect(resolveRowCode(row({ receivedDate: "" }), other.a)).toEqual({ kind: "unavailable", reason: "sample_type_inactive" });
    });

    it("sends a code only for a manual, non-empty row of a user who may type it", () => {
        expect(payloadCode({ manual: true, typedCode: " AB-1 " }, true)).toBe("AB-1");
        expect(payloadCode({ manual: true, typedCode: " AB-1 " }, false)).toBeUndefined();
        expect(payloadCode({ manual: true, typedCode: "  " }, true)).toBeUndefined();
        expect(payloadCode({ manual: false, typedCode: "AB-1" }, true)).toBeUndefined();
    });

    it("validates the typed code with the API's shape", () => {
        for (const ok of ["A", "a.b_c-1", "x".repeat(100)]) expect(isManualCodeValid(ok)).toBe(true);
        for (const bad of ["", "a b", "ñ", "a/b", "x".repeat(101)]) expect(isManualCodeValid(bad)).toBe(false);
    });

    it("shows the real codes and says when an automatic one differs from its suggestion", () => {
        const shown = [{ kind: "manual", code: "M-1" }, { kind: "suggested", code: "BX01" }, { kind: "suggested", code: "BX02" }] as const;
        const out = describeSavedCodes([...shown], [{ sample_code: "M-1" }, { sample_code: "BX01" }, { sample_code: "BX03" }]);
        expect(out.text).toBe("Muestras registradas: M-1 (manual), BX01, BX03 (se sugirió BX02). El código automático definitivo se asignó al guardar.");
        expect(out.differs).toBe(true);
        expect(describeSavedCodes([{ kind: "suggested", code: "BX01" }], [{ sample_code: "BX01" }])).toEqual({ text: "Muestra registrada: BX01.", differs: false });
    });
});
