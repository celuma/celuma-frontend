/**
 * Zero-margin boundary: `0` is an explicit, valid page margin meaning "no
 * intentional page-margin gap". It is NOT "unset" — a missing/null margin is
 * a different thing that falls back to a default.
 *
 * These guard the two ways zero has historically been lost: a minimum bound
 * that rejects it, and truthiness logic that silently replaces it.
 */
import { describe, expect, it } from "vitest";
import {
    MIN_MARGIN_CM,
    MAX_MARGIN_CM,
    extractRenderingSnapshot,
} from "../../../components/report/versioned/report_snapshot_validation";
import { validatePresentationDraft } from "../../../components/report/versioned/report_presentation_editor_schema";
import { LEGACY_PARITY_PRESENTATION } from "../../fixtures/reports/legacy_v2_parity";

describe("margin bounds", () => {
    it("allows exactly 0 and keeps the existing upper bound", () => {
        expect(MIN_MARGIN_CM).toBe(0);
        expect(MAX_MARGIN_CM).toBe(4);
    });
});

describe("editor draft validation", () => {
    const draftWith = (margins: Record<string, number>) => ({
        ...LEGACY_PARITY_PRESENTATION,
        paper: { ...LEGACY_PARITY_PRESENTATION.paper, margins_cm: { ...LEGACY_PARITY_PRESENTATION.paper.margins_cm, ...margins } },
    });

    it("accepts 0 on every side", () => {
        const r = validatePresentationDraft(draftWith({ top: 0, right: 0, bottom: 0, left: 0 }));
        expect(r.valid).toBe(true);
    });

    it("still rejects negative margins", () => {
        const r = validatePresentationDraft(draftWith({ top: -0.1 }));
        expect(r.valid).toBe(false);
    });

    it("still rejects margins above the maximum", () => {
        const r = validatePresentationDraft(draftWith({ top: 4.1 }));
        expect(r.valid).toBe(false);
    });
});

describe("snapshot validation at the network boundary", () => {
    function snapshotWithMargins(margins: Record<string, number>) {
        return {
            schema_version: 2,
            template: { base: {}, sections: {} },
            presentation: {
                ...LEGACY_PARITY_PRESENTATION,
                paper: { ...LEGACY_PARITY_PRESENTATION.paper, margins_cm: { top: 1, right: 1, bottom: 1, left: 1, ...margins } },
            },
        };
    }

    it("accepts a persisted snapshot whose margins are all 0", () => {
        const res = extractRenderingSnapshot({ rendering_snapshot: snapshotWithMargins({ top: 0, right: 0, bottom: 0, left: 0 }) } as never);
        expect(res.valid).toBe(true);
        if (res.valid) {
            // Zero survives parsing as zero — not coerced to a default.
            expect(res.snapshot.presentation.paper.margins_cm.top).toBe(0);
            expect(res.snapshot.presentation.paper.margins_cm.left).toBe(0);
        }
    });

    it("rejects a negative margin", () => {
        const res = extractRenderingSnapshot({ rendering_snapshot: snapshotWithMargins({ top: -1 }) } as never);
        expect(res.valid).toBe(false);
    });
});
