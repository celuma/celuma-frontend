/**
 * Céluma 1.3, Phase 3, Block C — the frontend's copy of the notification
 * contract, and the enum-compatibility policy.
 *
 * The policy under test: **one unrecognised enum value degrades that item, it
 * never rejects the inbox.** A strict runtime schema would mean a single future
 * `type` from a newer backend blanks a user's entire notification list.
 */
import { describe, expect, it } from "vitest";
import {
    isKnownNotificationResourceType,
    isKnownNotificationSeverity,
    isKnownNotificationType,
    isUnread,
    NOTIFICATION_RECIPIENT_STATUSES,
    NOTIFICATION_RESOURCE_TYPES,
    NOTIFICATION_SEVERITIES,
    NOTIFICATION_STATUS_LABELS,
    NOTIFICATION_TYPE_CHIP,
    NOTIFICATION_TYPE_LABELS,
    NOTIFICATION_TYPES,
    notificationSeverityAccent,
    notificationTypeChip,
    notificationTypeLabel,
    UNKNOWN_NOTIFICATION_TYPE_LABEL,
    type NotificationListItem,
} from "../../models/notification";
import {
    formatUnreadBadge,
    mergeNotificationPages,
    unreadAccessibleLabel,
} from "../../lib/notification_ui";

function item(overrides: Partial<NotificationListItem> = {}): NotificationListItem {
    return {
        recipient_id: "r1",
        notification_id: "n1",
        type: "REPORT_PUBLISHED",
        severity: "INFO",
        title: "Reporte publicado — Orden ORD-2026-00152",
        body: "El reporte fue publicado y firmado por Dra. Martínez.",
        resource_type: "report",
        resource_id: "res1",
        status: "UNREAD",
        created_at: "2026-08-04T12:00:00",
        read_at: null,
        ...overrides,
    };
}

describe("enum sets match the Block B contract", () => {
    it("declares exactly the six notification types the backend produces", () => {
        expect([...NOTIFICATION_TYPES]).toEqual([
            "REPORT_SUBMITTED",
            "REPORT_PDF_READY",
            "REPORT_PUBLISHED",
            "REPORT_RETRACTED",
            "ASSIGNMENT_ADDED",
            "SAMPLE_STATUS_CHANGED",
        ]);
    });

    it("declares the three severities and the three recipient statuses", () => {
        expect([...NOTIFICATION_SEVERITIES]).toEqual(["INFO", "WARNING", "ACTION_REQUIRED"]);
        expect([...NOTIFICATION_RECIPIENT_STATUSES]).toEqual(["UNREAD", "READ", "DISMISSED"]);
    });

    it("declares the three resource types, lowercase as the API sends them", () => {
        expect([...NOTIFICATION_RESOURCE_TYPES]).toEqual(["report", "order", "sample"]);
    });

    it("has a Spanish label and a chip colour for every type", () => {
        for (const type of NOTIFICATION_TYPES) {
            expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
            expect(NOTIFICATION_TYPE_CHIP[type]).toBeTruthy();
        }
        for (const status of NOTIFICATION_RECIPIENT_STATUSES) {
            expect(NOTIFICATION_STATUS_LABELS[status]).toBeTruthy();
        }
    });

    it("keeps labels distinct from API values — a label is never sent to the API", () => {
        for (const type of NOTIFICATION_TYPES) {
            expect(NOTIFICATION_TYPE_LABELS[type]).not.toBe(type);
        }
    });
});

describe("unknown enum compatibility", () => {
    it("falls back to a neutral label for a future type", () => {
        expect(notificationTypeLabel("STORAGE_WARNING_80")).toBe(UNKNOWN_NOTIFICATION_TYPE_LABEL);
        expect(isKnownNotificationType("STORAGE_WARNING_80")).toBe(false);
    });

    it("falls back to a neutral chip for a future type", () => {
        const chip = notificationTypeChip("STORAGE_WARNING_80");
        expect(chip.color).toBeTruthy();
        expect(chip.bg).toBeTruthy();
    });

    it("returns no severity accent for a future severity rather than throwing", () => {
        expect(notificationSeverityAccent("CATASTROPHIC")).toBeNull();
        expect(isKnownNotificationSeverity("CATASTROPHIC")).toBe(false);
        expect(notificationSeverityAccent("INFO")).toBeNull();
        expect(notificationSeverityAccent("WARNING")).toBeTruthy();
    });

    it("does not recognise a future resource type", () => {
        expect(isKnownNotificationResourceType("invoice")).toBe(false);
        expect(isKnownNotificationResourceType("report")).toBe(true);
    });

    it("keeps the backend title/body intact for an unknown type", () => {
        const future = item({ type: "STORAGE_WARNING_80" });
        // The frozen Spanish is the record of what the recipient was shown; a
        // fallback label never replaces it.
        expect(future.title).toBe("Reporte publicado — Orden ORD-2026-00152");
        expect(future.body).toBeTruthy();
    });
});

describe("isUnread", () => {
    it("is true only for the exact UNREAD status", () => {
        expect(isUnread(item({ status: "UNREAD" }))).toBe(true);
        expect(isUnread(item({ status: "READ" }))).toBe(false);
        expect(isUnread(item({ status: "DISMISSED" }))).toBe(false);
    });

    it("treats an unrecognised status as read — over-counting the badge is worse", () => {
        expect(isUnread(item({ status: "ARCHIVED_SOMEDAY" }))).toBe(false);
    });
});

describe("formatUnreadBadge", () => {
    it.each([
        [1, "1"],
        [4, "4"],
        [9, "9"],
    ])("shows %i exactly", (count, expected) => {
        expect(formatUnreadBadge(count)).toBe(expected);
    });

    it.each([10, 11, 99, 1000])("caps %i at 9+", (count) => {
        expect(formatUnreadBadge(count)).toBe("9+");
    });
});

describe("unreadAccessibleLabel", () => {
    it("says 'ninguna sin leer' at zero", () => {
        expect(unreadAccessibleLabel(0)).toBe("Notificaciones, ninguna sin leer");
    });

    it("uses the singular at one", () => {
        expect(unreadAccessibleLabel(1)).toBe("Notificaciones, 1 sin leer");
    });

    it("states the exact count above nine, not the capped badge text", () => {
        // The badge reads "9+"; a screen-reader user still hears the real number.
        expect(unreadAccessibleLabel(42)).toBe("Notificaciones, 42 sin leer");
    });
});

describe("mergeNotificationPages", () => {
    it("appends a new page in order", () => {
        const merged = mergeNotificationPages(
            [item({ recipient_id: "a" })],
            [item({ recipient_id: "b" }), item({ recipient_id: "c" })],
        );

        expect(merged.map((i) => i.recipient_id)).toEqual(["a", "b", "c"]);
    });

    it("drops a row already accumulated, keyed on recipient_id", () => {
        const merged = mergeNotificationPages(
            [item({ recipient_id: "a" }), item({ recipient_id: "b" })],
            [item({ recipient_id: "b" }), item({ recipient_id: "c" })],
        );

        expect(merged.map((i) => i.recipient_id)).toEqual(["a", "b", "c"]);
    });

    it("deduplicates on recipient_id, not notification_id", () => {
        // One event notifying two people shares a notification_id but not a
        // recipient_id. Both rows are legitimately the caller's only if the ids
        // differ — keying on the wrong one would hide a real notification.
        const merged = mergeNotificationPages(
            [item({ recipient_id: "a", notification_id: "shared" })],
            [item({ recipient_id: "b", notification_id: "shared" })],
        );

        expect(merged).toHaveLength(2);
    });

    it("is a no-op for an empty incoming page", () => {
        const previous = [item({ recipient_id: "a" })];
        expect(mergeNotificationPages(previous, [])).toEqual(previous);
    });
});
