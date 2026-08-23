/**
 * Céluma 1.3, Phase 3, Block C — timestamp handling.
 *
 * The load-bearing case is the first describe block: the API returns *naive*
 * UTC, and a browser parsing "2026-08-04T12:00:00" without the Z reads it as
 * local time, silently shifting every notification by the viewer's offset.
 */
import { describe, expect, it } from "vitest";
import {
    formatNotificationDateTime,
    formatNotificationRelativeTime,
    parseBackendUtcDate,
    UNKNOWN_DATE_LABEL,
} from "../../lib/notification_dates";

describe("parseBackendUtcDate — naive UTC input", () => {
    it("treats a timestamp with no timezone suffix as UTC, not local", () => {
        const parsed = parseBackendUtcDate("2026-08-04T12:00:00");

        expect(parsed).not.toBeNull();
        // The whole point: the same instant as the explicit-Z form.
        expect(parsed!.getTime()).toBe(Date.parse("2026-08-04T12:00:00Z"));
        expect(parsed!.toISOString()).toBe("2026-08-04T12:00:00.000Z");
    });

    it("keeps microsecond precision as the backend sends it", () => {
        const parsed = parseBackendUtcDate("2026-08-05T23:10:04.659471");

        expect(parsed!.toISOString()).toBe("2026-08-05T23:10:04.659Z");
    });

    it("respects an explicit Z rather than appending a second one", () => {
        const parsed = parseBackendUtcDate("2026-08-04T12:00:00Z");

        expect(parsed!.getTime()).toBe(Date.parse("2026-08-04T12:00:00Z"));
    });

    it("respects an explicit offset", () => {
        const parsed = parseBackendUtcDate("2026-08-04T12:00:00+02:00");

        expect(parsed!.toISOString()).toBe("2026-08-04T10:00:00.000Z");
    });
});

describe("parseBackendUtcDate — invalid input", () => {
    it.each([null, undefined, "", "   ", "not-a-date", "2026-13-45T99:99:99"])(
        "returns null for %p instead of an Invalid Date",
        (value) => {
            expect(parseBackendUtcDate(value as string | null | undefined)).toBeNull();
        },
    );
});

describe("formatNotificationDateTime", () => {
    it("renders the instant in the viewer's local timezone", () => {
        const utc = "2026-08-04T12:00:00";
        const expected = new Date("2026-08-04T12:00:00Z");
        const day = String(expected.getDate()).padStart(2, "0");
        const month = String(expected.getMonth() + 1).padStart(2, "0");
        const hours = String(expected.getHours()).padStart(2, "0");
        const minutes = String(expected.getMinutes()).padStart(2, "0");

        expect(formatNotificationDateTime(utc)).toBe(
            `${day}/${month}/${expected.getFullYear()}, ${hours}:${minutes}`,
        );
    });

    it("falls back to a readable label for unparseable input", () => {
        expect(formatNotificationDateTime("garbage")).toBe(UNKNOWN_DATE_LABEL);
        expect(formatNotificationDateTime(null)).toBe(UNKNOWN_DATE_LABEL);
    });
});

describe("formatNotificationRelativeTime", () => {
    const now = new Date("2026-08-05T12:00:00Z");

    it.each([
        ["2026-08-05T11:59:40", "Hace un momento"],
        ["2026-08-05T11:59:00", "Hace 1 minuto"],
        ["2026-08-05T11:55:00", "Hace 5 minutos"],
        ["2026-08-05T11:00:00", "Hace 1 hora"],
        ["2026-08-05T10:00:00", "Hace 2 horas"],
        ["2026-08-04T12:00:00", "Hace 1 día"],
        ["2026-08-02T12:00:00", "Hace 3 días"],
    ])("renders %s as %s", (value, expected) => {
        expect(formatNotificationRelativeTime(value, now)).toBe(expected);
    });

    it("falls back to the absolute date beyond a week", () => {
        const result = formatNotificationRelativeTime("2026-07-01T12:00:00", now);

        expect(result).not.toContain("Hace");
        expect(result).toBe(formatNotificationDateTime("2026-07-01T12:00:00"));
    });

    it("does not say 'hace' for a future timestamp (clock skew)", () => {
        const result = formatNotificationRelativeTime("2026-08-05T12:30:00", now);

        expect(result).not.toContain("Hace");
    });

    it("falls back for unparseable input", () => {
        expect(formatNotificationRelativeTime("garbage", now)).toBe(UNKNOWN_DATE_LABEL);
    });
});
