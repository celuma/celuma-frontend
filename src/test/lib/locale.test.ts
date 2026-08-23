/**
 * Céluma 1.3, Phase 3, Block F — frontend localization readiness (Story F17).
 *
 * The point of these is regression, not translation. Block F restructured the
 * presentation maps to be locale-keyed; what must be provably true afterwards
 * is that **not one rendered string changed**, because that is what lets the
 * Block C/D visual goldens stay byte-identical and what makes this a safe
 * refactor rather than a UI change.
 */
import { describe, expect, it } from "vitest";

import {
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    isSupportedLocale,
    resolveLocale,
} from "../../lib/locale";
import {
    NOTIFICATION_TYPES,
    NOTIFICATION_TYPE_LABELS,
    NOTIFICATION_TYPE_LABELS_BY_LOCALE,
    UNKNOWN_NOTIFICATION_TYPE_LABEL,
    notificationTypeLabel,
} from "../../models/notification";
import {
    NOTIFICATION_TYPE_DESCRIPTIONS,
    NOTIFICATION_TYPE_DESCRIPTIONS_BY_LOCALE,
    notificationTypeDescription,
} from "../../models/notification_preference";

describe("the locale identifier", () => {
    it("defaults to es-MX, matching the backend", () => {
        expect(DEFAULT_LOCALE).toBe("es-MX");
    });

    it("supports exactly one locale", () => {
        expect(SUPPORTED_LOCALES).toEqual(["es-MX"]);
        expect(isSupportedLocale("es-MX")).toBe(true);
        expect(isSupportedLocale("en-US")).toBe(false);
    });

    it("falls back to the default for anything it cannot serve", () => {
        expect(resolveLocale("en-US")).toBe(DEFAULT_LOCALE);
        expect(resolveLocale("pt-BR")).toBe(DEFAULT_LOCALE);
        expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
        expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
        expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    });

    it("does not throw on a malformed value", () => {
        // Unlike the backend, which rejects: nothing on the client
        // interpolates a locale into a path or a query, so a bad value can
        // only miss the map. Throwing would turn a cosmetic problem into a
        // blank Notification Center.
        expect(resolveLocale("../../foo")).toBe(DEFAULT_LOCALE);
        expect(resolveLocale("<script>")).toBe(DEFAULT_LOCALE);
    });
});

describe("the type labels are unchanged by the restructure", () => {
    it("still reads exactly what Block C shipped", () => {
        // `toMatchObject`, not `toEqual`: the assertion is that Block F's
        // locale restructure did not change a single one of Block C's six
        // strings, and that stays exactly as strong under a map that has since
        // grown. Céluma 1.3, Phase 4, Block G added four usage-threshold
        // labels; they are covered by their own suite
        // (test/models/usage_threshold_notifications.test.ts) and by the
        // "covers every type in every supported locale" case below, which is
        // what actually guards against a type with no label.
        expect(NOTIFICATION_TYPE_LABELS).toMatchObject({
            REPORT_SUBMITTED: "Enviado a revisión",
            REPORT_PDF_READY: "PDF oficial listo",
            REPORT_PUBLISHED: "Reporte publicado",
            REPORT_RETRACTED: "Reporte retractado",
            ASSIGNMENT_ADDED: "Nueva asignación",
            SAMPLE_STATUS_CHANGED: "Estado de muestra actualizado",
        });
    });

    it("exposes the default-locale map under its original name", () => {
        expect(NOTIFICATION_TYPE_LABELS).toBe(
            NOTIFICATION_TYPE_LABELS_BY_LOCALE[DEFAULT_LOCALE],
        );
    });

    it("covers every type in every supported locale", () => {
        for (const locale of SUPPORTED_LOCALES) {
            for (const type of NOTIFICATION_TYPES) {
                expect(NOTIFICATION_TYPE_LABELS_BY_LOCALE[locale][type]).toBeTruthy();
            }
        }
    });
});

describe("notificationTypeLabel", () => {
    it("returns the same string with and without an explicit locale", () => {
        for (const type of NOTIFICATION_TYPES) {
            expect(notificationTypeLabel(type)).toBe(notificationTypeLabel(type, "es-MX"));
        }
    });

    it("falls back to default-locale copy for an unsupported locale", () => {
        for (const type of NOTIFICATION_TYPES) {
            expect(notificationTypeLabel(type, "en-US")).toBe(
                NOTIFICATION_TYPE_LABELS[type],
            );
        }
    });

    it("still degrades an unknown type to the neutral noun", () => {
        // The enum-compatibility policy, independent of locale: one
        // unrecognised value degrades that item, never the inbox.
        expect(notificationTypeLabel("STORAGE_WARNING_80")).toBe(
            UNKNOWN_NOTIFICATION_TYPE_LABEL,
        );
        expect(notificationTypeLabel("STORAGE_WARNING_80", "en-US")).toBe(
            UNKNOWN_NOTIFICATION_TYPE_LABEL,
        );
    });

    it("degrades an unknown type even under a malformed locale", () => {
        expect(notificationTypeLabel("STORAGE_WARNING_80", "../../x")).toBe(
            UNKNOWN_NOTIFICATION_TYPE_LABEL,
        );
    });
});

describe("notificationTypeDescription", () => {
    it("returns the Block D copy unchanged", () => {
        expect(NOTIFICATION_TYPE_DESCRIPTIONS).toBe(
            NOTIFICATION_TYPE_DESCRIPTIONS_BY_LOCALE[DEFAULT_LOCALE],
        );
        expect(notificationTypeDescription("REPORT_PUBLISHED")).toBe(
            "Cuando un reporte se publica y firma.",
        );
    });

    it("falls back to default-locale copy for an unsupported locale", () => {
        for (const type of NOTIFICATION_TYPES) {
            expect(notificationTypeDescription(type, "en-US")).toBe(
                NOTIFICATION_TYPE_DESCRIPTIONS[type],
            );
        }
    });

    it("returns an empty string for a type this build predates", () => {
        // Not `undefined`: the section renders this straight into the DOM.
        expect(notificationTypeDescription("STORAGE_WARNING_80")).toBe("");
    });
});

describe("no localization machinery was introduced", () => {
    it("declares no locale beyond es-MX", () => {
        // Story F17 and §33: no language selector, no user/tenant locale
        // preference, no English UI. A second entry here would be a product
        // decision, not a refactor.
        expect(Object.keys(NOTIFICATION_TYPE_LABELS_BY_LOCALE)).toEqual(["es-MX"]);
        expect(Object.keys(NOTIFICATION_TYPE_DESCRIPTIONS_BY_LOCALE)).toEqual(["es-MX"]);
    });
});
