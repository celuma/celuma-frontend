/** Céluma 1.5 (#64): the illustrative per-row example (not the server estimate). */
import { describe, expect, it } from "vitest";
import { monthIn, renderExample } from "../../lib/numbering_example";

const NOV_1_UTC_03 = new Date(Date.UTC(2026, 10, 1, 3, 0));  // Oct 31 21:00 in Mexico City

describe("renderExample", () => {
    it("renders the closed grammar with the month of the numbering zone", () => {
        expect(renderExample({ format: "{BASE}-{SEQ}{MM}{YY}", sequence_min_width: 3, sequence: 1, base: "HI", scheme: "monthly", timezone: "America/Mexico_City", now: NOV_1_UTC_03 }))
            .toBe("HI-0011026");
        expect(renderExample({ format: "{BASE}.{SEQ}{MM}{YYYY}", sequence_min_width: 2, sequence: 7, base: "TJ", scheme: "monthly", timezone: "UTC", now: NOV_1_UTC_03 }))
            .toBe("TJ.07112026");
    });

    it("grows past the minimum width and shows the compatibility shape while inactive", () => {
        expect(renderExample({ format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, sequence: 100, base: "CU", scheme: "monthly", timezone: "UTC", now: NOV_1_UTC_03 })).toBe("CU1001126");
        expect(renderExample({ format: "{BASE}{SEQ}{MM}{YY}", sequence_min_width: 2, sequence: 1, base: "CU", scheme: "legacy" })).toBe("CU-1");
    });

    it("uses a placeholder branch only for branch scope", () => {
        expect(renderExample({ format: "{BASE}{BRANCH}{SEQ}{MM}{YY}", sequence_min_width: 2, sequence: 1, base: "CU", scheme: "monthly", scope: "branch", timezone: "UTC", now: NOV_1_UTC_03 }))
            .toBe("CUSUC011126");
    });

    it("falls back to the browser month for an unknown zone", () => {
        expect(monthIn("Not/AZone", NOV_1_UTC_03).year).toBe(NOV_1_UTC_03.getFullYear());
    });
});
