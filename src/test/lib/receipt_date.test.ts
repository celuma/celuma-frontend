/**
 * Céluma 1.4 (#33) — receipt-date validation shared by the sample and order registration forms.
 */
import { describe, expect, it } from "vitest";
import { collectionDateSchema, isValidReceiptDate, periodLabel, receiptDateSchema } from "../../lib/receipt_date";

describe("isValidReceiptDate", () => {
    it.each(["2026-09-30", "2026-10-01", "2026-12-31", "2027-01-01", "2024-02-29", "2000-01-01", "2099-12-31", "1999-12-31", "2100-01-01", "1900-01-01", "0001-01-01", "0099-12-31", "9999-12-31", "2000-02-29", "0004-02-29"])("accepts %s", (v) => {
        expect(isValidReceiptDate(v)).toBe(true);
    });

    it.each([
        "", "  ", "2026-9-30", "30-09-2026", "2026/09/30", "2026-09-30T00:00:00Z", "2026-09-30T00:00:00",
        "2026-02-30", "2025-02-29", "1900-02-29", "0100-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "0000-01-01", "0000-12-31", "1790000000", "20260930", "abc",
    ])("rejects %j", (v) => {
        expect(isValidReceiptDate(v)).toBe(false);
    });

    it("rejects null and undefined", () => {
        expect(isValidReceiptDate(null)).toBe(false);
        expect(isValidReceiptDate(undefined)).toBe(false);
    });
});

describe("receiptDateSchema", () => {
    it("is required, with a Spanish message", () => {
        const empty = receiptDateSchema.safeParse("");
        expect(empty.success).toBe(false);
        expect(empty.error?.issues[0].message).toBe("La fecha de recepción es requerida.");
        expect(receiptDateSchema.safeParse(undefined).success).toBe(false);
    });

    it("explains an impossible date", () => {
        const bad = receiptDateSchema.safeParse("2026-02-30");
        expect(bad.success).toBe(false);
        expect(bad.error?.issues[0].message).toContain("AAAA-MM-DD");
    });

    it("passes a valid date through unchanged (no time, no zone)", () => {
        expect(receiptDateSchema.parse(" 2026-10-01 ")).toBe("2026-10-01");
    });
});

describe("collectionDateSchema", () => {
    it("stays optional and independent of numbering", () => {
        expect(collectionDateSchema.safeParse(undefined).success).toBe(true);
        expect(collectionDateSchema.safeParse("").success).toBe(true);
        expect(collectionDateSchema.safeParse("2026-08-31").success).toBe(true);
        expect(collectionDateSchema.safeParse("31/08/2026").success).toBe(false);
    });
});

describe("periodLabel", () => {
    it("names the Spanish month and year", () => {
        expect(periodLabel(2026, 9)).toBe("septiembre 2026");
        expect(periodLabel(2027, 1)).toBe("enero 2027");
    });
});
