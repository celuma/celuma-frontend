/**
 * Céluma 1.3, Phase 3, Block C — the deep-link resolver.
 *
 * The routes asserted here are the ones actually registered in main.tsx. If a
 * route is renamed, this suite is what fails rather than a user landing on a
 * blank screen from their inbox.
 */
import { describe, expect, it } from "vitest";
import {
    isNotificationNavigable,
    resolveNotificationRoute,
    UNSUPPORTED_RESOURCE_MESSAGE,
} from "../../lib/notification_navigation";

const ID = "c7d2f0aa-1111-2222-3333-444455556666";

describe("resolveNotificationRoute — supported resources", () => {
    it.each([
        ["report", `/reports/${ID}`],
        ["order", `/orders/${ID}`],
        ["sample", `/samples/${ID}`],
    ])("maps %s to %s", (resourceType, expected) => {
        expect(resolveNotificationRoute(resourceType, ID)).toBe(expected);
    });

    it("reports every supported type as navigable", () => {
        for (const type of ["report", "order", "sample"]) {
            expect(isNotificationNavigable(type, ID)).toBe(true);
        }
    });
});

describe("resolveNotificationRoute — unsupported or incomplete", () => {
    it("returns null for a resource type this build does not know", () => {
        // A future backend value must degrade, never fabricate "/patients/:id"
        // or any other route out of thin air.
        expect(resolveNotificationRoute("invoice", ID)).toBeNull();
        expect(resolveNotificationRoute("patient", ID)).toBeNull();
        expect(isNotificationNavigable("invoice", ID)).toBe(false);
    });

    it("is case sensitive — the API sends lowercase", () => {
        expect(resolveNotificationRoute("REPORT", ID)).toBeNull();
    });

    it.each([
        [null, ID],
        [undefined, ID],
        ["", ID],
        ["report", null],
        ["report", undefined],
        ["report", ""],
        ["report", "   "],
    ])("returns null for resourceType=%p resourceId=%p", (type, id) => {
        expect(resolveNotificationRoute(type as string | null, id as string | null)).toBeNull();
    });

    it("percent-encodes the id so a malformed value cannot alter the path", () => {
        expect(resolveNotificationRoute("report", "abc/../../admin")).toBe(
            "/reports/abc%2F..%2F..%2Fadmin",
        );
    });

    it("offers an accessible explanation instead of a dead link", () => {
        expect(UNSUPPORTED_RESOURCE_MESSAGE).toContain("no se puede abrir");
    });
});
