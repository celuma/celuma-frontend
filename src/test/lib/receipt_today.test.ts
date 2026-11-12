import { describe, expect, it } from "vitest";
import { DEFAULT_NUMBERING_ZONE, receiptZone, todayInZone } from "../../lib/receipt_today";

// 2026-09-30 18:00 UTC: Mexico City is still on the 30th, Auckland is already on October 1.
const NOW = new Date("2026-09-30T18:00:00Z");

describe("receipt date defaults (hotfix 1.4.3)", () => {
    it("is today's calendar date in the given zone", () => {
        expect(todayInZone("America/Mexico_City", NOW)).toBe("2026-09-30");
        expect(todayInZone("Pacific/Auckland", NOW)).toBe("2026-10-01");
        expect(todayInZone("UTC", new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
    });

    it("falls back to the default zone for an unknown or missing one", () => {
        expect(todayInZone("Not/AZone", NOW)).toBe(todayInZone(DEFAULT_NUMBERING_ZONE, NOW));
        expect(todayInZone(undefined, NOW)).toBe("2026-09-30");
    });

    it("uses the branch's zone only for a branch-scoped numbering (as the API does)", () => {
        expect(receiptZone({ scope: "branch", timezone: "America/Mexico_City" }, "Pacific/Auckland")).toBe("Pacific/Auckland");
        expect(receiptZone({ scope: "branch", timezone: "America/Mexico_City" }, undefined)).toBe("America/Mexico_City");
        expect(receiptZone({ scope: "tenant", timezone: "America/Mexico_City" }, "Pacific/Auckland")).toBe("America/Mexico_City");
        expect(receiptZone(null, "Pacific/Auckland")).toBe(DEFAULT_NUMBERING_ZONE);
    });
});
