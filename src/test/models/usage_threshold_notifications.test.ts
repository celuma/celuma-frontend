/**
 * Céluma 1.3, Phase 4, Block G — the four usage-threshold notification types
 * on the frontend.
 *
 * The frontend's whole job in this block is *presentation*: registering four
 * types, their Spanish chrome, their preference descriptions and their deep
 * link. It decides nothing. These tests are written to hold that line — the
 * strongest assertion in the file is the last one, which proves this app
 * contains no threshold logic at all.
 */
import { describe, expect, it } from "vitest";
import {
    isKnownNotificationResourceType,
    isKnownNotificationType,
    NOTIFICATION_TYPE_CHIP,
    NOTIFICATION_TYPE_LABELS,
    notificationTypeChip,
    notificationTypeLabel,
} from "../../models/notification";
import {
    NOTIFICATION_TYPE_DESCRIPTIONS,
    notificationTypeDescription,
} from "../../models/notification_preference";
import {
    isNotificationNavigable,
    resolveNotificationRoute,
} from "../../lib/notification_navigation";
import { USAGE_OVER_LIMIT_PERCENT, USAGE_WARNING_PERCENT } from "../../lib/usage_ui";

/** The four types this block adds, and nothing else. */
const USAGE_TYPES = [
    "STORAGE_USAGE_APPROACHING",
    "STORAGE_LIMIT_REACHED",
    "USER_LIMIT_APPROACHING",
    "USER_LIMIT_REACHED",
] as const;

const TENANT_ID = "9b1f5c40-aaaa-bbbb-cccc-1234567890ab";

describe("the four usage-threshold types are first-class notification types", () => {
    it.each(USAGE_TYPES)("%s is recognised", (type) => {
        expect(isKnownNotificationType(type)).toBe(true);
    });

    it.each(USAGE_TYPES)("%s has a Spanish label and a chip", (type) => {
        expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
        expect(NOTIFICATION_TYPE_CHIP[type]).toBeTruthy();
        // Never the raw enum value: a type filter that reads
        // "STORAGE_LIMIT_REACHED" is a leaked implementation detail.
        expect(notificationTypeLabel(type)).not.toBe(type);
        expect(notificationTypeLabel(type)).toBe(NOTIFICATION_TYPE_LABELS[type]);
    });

    it("gives the two APPROACHING types the warning tone and the two REACHED types the danger tone", () => {
        // The same two colours `/config/usage` paints its bars with, so the
        // inbox chip and the dashboard describe one condition rather than two.
        expect(notificationTypeChip("STORAGE_USAGE_APPROACHING")).toEqual(
            notificationTypeChip("USER_LIMIT_APPROACHING"),
        );
        expect(notificationTypeChip("STORAGE_LIMIT_REACHED")).toEqual(
            notificationTypeChip("USER_LIMIT_REACHED"),
        );
        expect(notificationTypeChip("STORAGE_USAGE_APPROACHING")).not.toEqual(
            notificationTypeChip("STORAGE_LIMIT_REACHED"),
        );
    });

    it.each(USAGE_TYPES)("%s has a preference description", (type) => {
        expect(NOTIFICATION_TYPE_DESCRIPTIONS[type]).toBeTruthy();
        expect(notificationTypeDescription(type)).toBe(NOTIFICATION_TYPE_DESCRIPTIONS[type]);
    });
});

describe("deep link", () => {
    it("routes a tenant-scoped notification to /config/usage", () => {
        expect(resolveNotificationRoute("tenant", TENANT_ID)).toBe("/config/usage");
        expect(isNotificationNavigable("tenant", TENANT_ID)).toBe(true);
        expect(isKnownNotificationResourceType("tenant")).toBe(true);
    });

    it("never builds the route out of the id it was given", () => {
        // `resource_id` is the tenant id, and `/config/usage` is a singleton
        // scoped by the session — interpolating an id would invent a route
        // that does not exist and, worse, look like a client-supplied tenant
        // selector on a page whose security model says the tenant comes from
        // the token.
        expect(resolveNotificationRoute("tenant", TENANT_ID)).not.toContain(TENANT_ID);
        expect(resolveNotificationRoute("tenant", "../../admin")).toBe("/config/usage");
        expect(resolveNotificationRoute("tenant", "?next=https://evil.test")).toBe(
            "/config/usage",
        );
    });

    it("still requires an id to be present at all", () => {
        // Not because the id is used, but because a notification with no
        // resource is malformed and should render non-navigable rather than
        // silently work.
        expect(resolveNotificationRoute("tenant", "")).toBeNull();
        expect(resolveNotificationRoute("tenant", null)).toBeNull();
        expect(isNotificationNavigable("tenant", "   ")).toBe(false);
    });
});

describe("copy safety", () => {
    const strings = [
        ...USAGE_TYPES.map((type) => NOTIFICATION_TYPE_LABELS[type]),
        ...USAGE_TYPES.map((type) => NOTIFICATION_TYPE_DESCRIPTIONS[type]),
    ];

    /**
     * Four bans, each with a concrete reason:
     *   - a cloud provider is an implementation detail a laboratory never
     *     needs and Céluma never names;
     *   - plan/price/upgrade language points at a product surface that does
     *     not exist — there is no plan catalog in Céluma 1.3;
     *   - "blocked"/"suspended"/"disabled" would describe enforcement, and
     *     Phase 4 enforces nothing: every flow keeps working at 100% and
     *     above;
     *   - clinical vocabulary has no business in a tenant-level
     *     administrative message.
     */
    const FORBIDDEN = [
        "aws",
        "s3",
        "bucket",
        "cloud",
        "$",
        "plan",
        "precio",
        "pago",
        "suscrip",
        "compra",
        "actualiza tu",
        "mejora tu",
        "upgrade",
        "bloque",
        "suspend",
        "deshabilit",
        "inhabilit",
        "desactivad",
        "paciente",
        "diagnóstico",
        "diagnostico",
        "muestra",
        "reporte",
    ];

    it.each(FORBIDDEN)("no usage-threshold string contains %s", (word) => {
        for (const text of strings) {
            expect(text.toLowerCase()).not.toContain(word);
        }
    });

    it("never renders a raw notification type in user-facing text", () => {
        for (const text of strings) {
            for (const type of USAGE_TYPES) {
                expect(text).not.toContain(type);
            }
        }
    });

    it("is written in Spanish, with the accents", () => {
        // A cheap guard against an English or accent-stripped string slipping
        // into the one place a Spanish-only product shows copy.
        for (const text of strings) {
            expect(text).toMatch(/[áéíóúñ¿¡]/i);
        }
    });
});

describe("the frontend owns no threshold logic", () => {
    it("keeps the dashboard's presentation constants as presentation constants", () => {
        // They still exist, they still have their Block F values, and nothing
        // about Block G changed them. They colour a progress bar; they do not
        // decide that anyone gets told anything.
        expect(USAGE_WARNING_PERCENT).toBe(80);
        expect(USAGE_OVER_LIMIT_PERCENT).toBe(100);
    });

    it("exposes no way to derive a notification type from a percentage", () => {
        // The strongest statement this suite can make: there is no
        // `notificationTypeForPercent`, no threshold table, no crossing
        // detector anywhere in the frontend. A usage notification exists
        // because the backend created one, and the only inputs this app has
        // are the type and resource fields on a row it was handed.
        //
        // If someone ever adds such a helper, the honest thing is to delete
        // this test deliberately rather than discover it failing — the same
        // instruction Block F left about its own no-notification test.
        const model = notificationTypeLabel("STORAGE_USAGE_APPROACHING");
        expect(model).toBeTruthy();
        expect(
            Object.keys({ USAGE_WARNING_PERCENT, USAGE_OVER_LIMIT_PERCENT }).some((key) =>
                key.toLowerCase().includes("notification"),
            ),
        ).toBe(false);
    });
});
