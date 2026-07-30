import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import ReportRendererResolver from "../../components/report/report_renderer_resolver";
import type { ReportRendererRef } from "../../components/report/legacy/legacy_report_types";
import { draftSingleSampleNoImages } from "../fixtures/reports";
import type { ReportEnvelope } from "../../models/report";

// Céluma 1.3 Fase 2, Bloque A, Historia A5. Covers the full resolution
// matrix required by the acceptance criteria: absent/1 -> legacy, 2 ->
// controlled "not implemented" (never the legacy renderer), unknown ->
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

    it("renders the controlled 'not implemented' state for schema_version 2, NEVER the legacy renderer", () => {
        const report = withSchemaVersion(draftSingleSampleNoImages, 2);
        render(<ReportRendererResolver report={report} />);
        expect(screen.queryByText("Dra. Arisbeth Villanueva Pérez.")).toBeNull();
        const fallback = screen.getByTestId("unsupported-report-version");
        expect(fallback.getAttribute("data-reason")).toBe("not-implemented");
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

    it("exposes a safe empty getPages() for an unsupported (V2) report instead of crashing callers", () => {
        const ref = createRef<ReportRendererRef>();
        const report = withSchemaVersion(draftSingleSampleNoImages, 2);
        render(<ReportRendererResolver report={report} ref={ref} />);
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
