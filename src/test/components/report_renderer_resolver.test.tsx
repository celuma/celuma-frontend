import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import ReportRendererResolver from "../../components/report/report_renderer_resolver";
import type { ReportRendererRef } from "../../components/report/legacy/legacy_report_types";
import { draftSingleSampleNoImages } from "../fixtures/reports";
import { v2CompleteBranding, v2MissingSnapshot } from "../fixtures/reports/versioned_v2";
import type { ReportEnvelope } from "../../models/report";

// Cell 1.3 Phase 2, Block A/C, Stories A5/C5. Covers the full resolution
// matrix required by the acceptance criteria: absent/1 -> legacy, 2 ->
// VersionedReportRendererV2 (never the legacy renderer, even when its own
// snapshot is invalid — it renders its own controlled fallback), unknown ->
// controlled error, and ref propagation (getPages()) through each branch.

function withSchemaVersion(envelope: ReportEnvelope, schema_version: unknown): ReportEnvelope {
    return {
        ...envelope,
        report: { ...envelope.report, ...(schema_version === undefined ? {} : { schema_version }) } as ReportEnvelope["report"],
    };
}

describe("ReportRendererResolver — schema_version matrix", () => {
    it("renders LegacyReportRendererV1 when schema_version is absent", () => {
        render(<ReportRendererResolver report={draftSingleSampleNoImages} />);
        expect(screen.getByText("Dra. Arisbeth Villanueva Pérez.")).toBeTruthy();
        expect(screen.queryByTestId("unsupported-report-version")).toBeNull();
    });

    it("renders LegacyReportRendererV1 when schema_version is 1", () => {
        const report = withSchemaVersion(draftSingleSampleNoImages, 1);
        render(<ReportRendererResolver report={report} />);
        expect(screen.getByText("Dra. Arisbeth Villanueva Pérez.")).toBeTruthy();
        expect(screen.queryByTestId("unsupported-report-version")).toBeNull();
    });

    it("renders VersionedReportRendererV2 for a valid schema_version 2 report, NEVER the legacy renderer", () => {
        render(<ReportRendererResolver report={v2CompleteBranding} />);
        expect(screen.queryByText("Dra. Arisbeth Villanueva Pérez.")).toBeNull();
        expect(screen.queryByTestId("unsupported-report-version")).toBeNull();
        expect(screen.queryByTestId("invalid-report-snapshot")).toBeNull();
    });

    it("renders VersionedReportRendererV2's own controlled fallback for schema_version 2 with no snapshot, NEVER the legacy renderer or UnsupportedReportVersion", () => {
        render(<ReportRendererResolver report={v2MissingSnapshot} />);
        expect(screen.queryByText("Dra. Arisbeth Villanueva Pérez.")).toBeNull();
        expect(screen.queryByTestId("unsupported-report-version")).toBeNull();
        expect(screen.getByTestId("invalid-report-snapshot")).toBeTruthy();
    });

    it("renders VersionedReportRendererV2's own controlled fallback for schema_version 2 with no snapshot even via the generic withSchemaVersion helper", () => {
        const report = withSchemaVersion(draftSingleSampleNoImages, 2);
        render(<ReportRendererResolver report={report} />);
        expect(screen.queryByText("Dra. Arisbeth Villanueva Pérez.")).toBeNull();
        expect(screen.queryByTestId("unsupported-report-version")).toBeNull();
        expect(screen.getByTestId("invalid-report-snapshot")).toBeTruthy();
    });

    it("renders a controlled error state for an unknown schema_version, without throwing", () => {
        const report = withSchemaVersion(draftSingleSampleNoImages, 99);
        expect(() => render(<ReportRendererResolver report={report} />)).not.toThrow();
        const fallback = screen.getByTestId("unsupported-report-version");
        expect(fallback.getAttribute("data-reason")).toBe("unknown");
        expect(fallback.textContent).toContain("99");
    });

    it("renders a controlled error state for an invalid non-numeric schema_version", () => {
        const report = withSchemaVersion(draftSingleSampleNoImages, "v2");
        render(<ReportRendererResolver report={report} />);
        const fallback = screen.getByTestId("unsupported-report-version");
        expect(fallback.getAttribute("data-reason")).toBe("unknown");
    });
});

describe("ReportRendererResolver — ref propagation", () => {
    it("forwards getPages() from LegacyReportRendererV1 for a legacy report", () => {
        const ref = createRef<ReportRendererRef>();
        render(<ReportRendererResolver report={draftSingleSampleNoImages} ref={ref} />);
        const pages = ref.current?.getPages() ?? [];
        expect(pages.length).toBeGreaterThan(0);
        expect(pages[0]?.textContent).toContain("Paciente de Prueba Uno");
    });

    it("forwards getPages() from VersionedReportRendererV2 for a valid V2 report", () => {
        const ref = createRef<ReportRendererRef>();
        render(<ReportRendererResolver report={v2CompleteBranding} ref={ref} />);
        const pages = ref.current?.getPages() ?? [];
        expect(pages.length).toBeGreaterThan(0);
    });

    it("exposes a safe empty getPages() for a V2 report with an invalid/missing snapshot instead of crashing callers", () => {
        const ref = createRef<ReportRendererRef>();
        render(<ReportRendererResolver report={v2MissingSnapshot} ref={ref} />);
        expect(ref.current?.getPages()).toEqual([]);
    });

    it("exposes a safe empty getPages() for an unknown schema_version instead of crashing callers", () => {
        const ref = createRef<ReportRendererRef>();
        const report = withSchemaVersion(draftSingleSampleNoImages, 7);
        render(<ReportRendererResolver report={report} ref={ref} />);
        expect(ref.current?.getPages()).toEqual([]);
    });
});

describe("ReportRendererResolver — all existing fixtures still resolve to the legacy renderer", () => {
    it("draftSingleSampleNoImages has no schema_version and renders legacy content", () => {
        render(<ReportRendererResolver report={draftSingleSampleNoImages} />);
        // Appears in both the hidden pagination source and the cloned visible
        // page, same as LegacyReportRendererV1's own DOM structure.
        expect(screen.getAllByText("Macroscópica").length).toBeGreaterThan(0);
    });
});
