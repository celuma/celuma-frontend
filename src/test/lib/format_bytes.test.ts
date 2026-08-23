/**
 * Céluma 1.3, Phase 4, Block F — the byte formatter.
 *
 * Pins the two decisions this module makes: decimal units (so a "1 TB" plan
 * limit reads as 1 TB), and the refusal to turn an absent value into "0 B".
 */
import { describe, expect, it } from "vitest";
import { formatBytes, UNKNOWN_BYTES_LABEL } from "../../lib/format_bytes";

describe("formatBytes", () => {
    it("uses decimal units, so a commercial plan limit reads as a round number", () => {
        expect(formatBytes(1_000)).toBe("1 KB");
        expect(formatBytes(1_000_000)).toBe("1 MB");
        expect(formatBytes(1_000_000_000)).toBe("1 GB");
        // The case the choice was made for: a 1 TB plan must not read "0.9 TiB".
        expect(formatBytes(1_000_000_000_000)).toBe("1 TB");
    });

    it("renders bytes whole and larger units to one decimal", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(1)).toBe("1 B");
        expect(formatBytes(999)).toBe("999 B");
        expect(formatBytes(127_900_000)).toBe("127.9 MB");
        expect(formatBytes(1_234_567_890)).toBe("1.2 GB");
    });

    it("drops a trailing .0 so a round value reads as one", () => {
        expect(formatBytes(2_000_000)).toBe("2 MB");
        expect(formatBytes(2_000_000)).not.toContain(".0");
    });

    it("promotes to the next unit when rounding would overflow the current one", () => {
        // 999.95 MB rounds to 1000.0 MB, which is not a unit anyone writes.
        expect(formatBytes(999_950_000)).toBe("1 GB");
    });

    it("is deterministic — the same input always gives the same string", () => {
        const value = 123_456_789;
        expect(formatBytes(value)).toBe(formatBytes(value));
        expect(formatBytes(value)).toBe("123.5 MB");
    });

    it("never renders an absent value as 0 B", () => {
        // The rule the whole null-preserving contract exists for: "not
        // calculated" and "zero bytes" are different facts.
        expect(formatBytes(null)).toBe(UNKNOWN_BYTES_LABEL);
        expect(formatBytes(undefined)).toBe(UNKNOWN_BYTES_LABEL);
        expect(formatBytes(null)).not.toContain("0 B");
        expect(formatBytes(Number.NaN)).toBe(UNKNOWN_BYTES_LABEL);
    });

    it("groups large magnitudes in the es-MX convention", () => {
        // es-MX uses "." for decimals and "," for thousands, like the money
        // formatting already shipping in the billing pages.
        expect(formatBytes(1_500)).toBe("1.5 KB");
        // PB is the largest unit, so anything beyond it grows in place and
        // picks up the thousands separator rather than inventing "EB".
        expect(formatBytes(1_500_000_000_000_000_000)).toBe("1,500 PB");
    });

    it("keeps a negative difference readable", () => {
        // difference_bytes can be negative when the counter over-counted.
        expect(formatBytes(-2_000_000)).toBe("-2 MB");
    });
});
