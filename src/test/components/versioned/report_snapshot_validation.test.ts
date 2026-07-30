import { describe, expect, it } from "vitest";
import {
    extractRenderingSnapshot,
    validateReportRenderingSnapshotV2,
} from "../../../components/report/versioned/report_snapshot_validation";
import { v2CompleteBranding, v2MinimalNeutral } from "../../fixtures/reports/versioned_v2";

// Céluma 1.3 Fase 2, Bloque C, Historia C2/C7.

function validSnapshot() {
    return (v2CompleteBranding.report as unknown as { rendering_snapshot: unknown }).rendering_snapshot;
}

describe("validateReportRenderingSnapshotV2 — valid inputs", () => {
    it("accepts a fully-populated snapshot", () => {
        const result = validateReportRenderingSnapshotV2(validSnapshot());
        expect(result.valid).toBe(true);
    });

    it("accepts a minimal snapshot with every optional field null", () => {
        const minimal = (v2MinimalNeutral.report as unknown as { rendering_snapshot: unknown }).rendering_snapshot;
        const result = validateReportRenderingSnapshotV2(minimal);
        expect(result.valid).toBe(true);
    });
});

describe("validateReportRenderingSnapshotV2 — invalid inputs", () => {
    it("rejects a snapshot with the wrong schema_version", () => {
        const snapshot = { ...(validSnapshot() as object), schema_version: 1 };
        const result = validateReportRenderingSnapshotV2(snapshot);
        expect(result.valid).toBe(false);
    });

    it("rejects an unsupported paper size", () => {
        const snapshot = JSON.parse(JSON.stringify(validSnapshot())) as { presentation: { paper: { size: string } } };
        snapshot.presentation.paper.size = "A4";
        const result = validateReportRenderingSnapshotV2(snapshot);
        expect(result.valid).toBe(false);
    });

    it("rejects a margin outside the 0.5-4.0cm range", () => {
        const snapshot = JSON.parse(JSON.stringify(validSnapshot())) as {
            presentation: { paper: { margins_cm: { top: number } } };
        };
        snapshot.presentation.paper.margins_cm.top = 6.0;
        const result = validateReportRenderingSnapshotV2(snapshot);
        expect(result.valid).toBe(false);
    });

    it("rejects an invalid hex color", () => {
        const snapshot = JSON.parse(JSON.stringify(validSnapshot())) as { presentation: { style: { primary_color: string } } };
        snapshot.presentation.style.primary_color = "blue";
        const result = validateReportRenderingSnapshotV2(snapshot);
        expect(result.valid).toBe(false);
    });

    it("rejects a completely malformed value without throwing", () => {
        expect(() => validateReportRenderingSnapshotV2("not an object")).not.toThrow();
        expect(validateReportRenderingSnapshotV2("not an object").valid).toBe(false);
        expect(() => validateReportRenderingSnapshotV2(null)).not.toThrow();
        expect(() => validateReportRenderingSnapshotV2(undefined)).not.toThrow();
        expect(() => validateReportRenderingSnapshotV2(42)).not.toThrow();
    });

    it("rejects a snapshot missing required paper fields", () => {
        const snapshot = JSON.parse(JSON.stringify(validSnapshot())) as { presentation: Record<string, unknown> };
        delete (snapshot.presentation as { paper?: unknown }).paper;
        const result = validateReportRenderingSnapshotV2(snapshot);
        expect(result.valid).toBe(false);
    });
});

describe("extractRenderingSnapshot", () => {
    it("extracts and validates rendering_snapshot from a report content object", () => {
        const result = extractRenderingSnapshot(v2CompleteBranding.report);
        expect(result.valid).toBe(true);
    });

    it("returns a controlled failure when rendering_snapshot is missing", () => {
        const result = extractRenderingSnapshot({ base: {}, sections: {}, schema_version: 2 });
        expect(result.valid).toBe(false);
    });

    it("returns a controlled failure when the report content itself is not an object", () => {
        expect(extractRenderingSnapshot(null).valid).toBe(false);
        expect(extractRenderingSnapshot("string").valid).toBe(false);
        expect(extractRenderingSnapshot([1, 2, 3]).valid).toBe(false);
    });
});
