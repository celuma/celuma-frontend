import { describe, expect, it } from "vitest";
import { buildPreviewReportEnvelope } from "../../../components/report/versioned/editor_preview_fixture";
import { validateReportRenderingSnapshotV2 } from "../../../components/report/versioned/report_snapshot_validation";
import { resolveReportSchemaVersion, CURRENT_REPORT_SCHEMA_VERSION } from "../../../components/report/report_schema_version";
import type { ReportPresentationSnapshotV2 } from "../../../components/report/versioned/versioned_report_types";

// Céluma 1.3 Fase 2, Bloque D, Historia D6/D14 — the editor's live preview
// must always be a valid, resolver-renderable V2 envelope: this is what
// stands between the admin editor and rendering an actual patient's data.

const presentation: ReportPresentationSnapshotV2 = {
    paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 0.8, right: 1, bottom: 1, left: 1 } },
    header: { enabled: true, logo_storage_id: null, institution_name: "Lab X", subtitle: null, address: null, phone: null, email: null },
    footer: { enabled: true, custom_text: null, show_page_number: true },
    style: { primary_color: "#336699" },
    signer: null,
};

describe("buildPreviewReportEnvelope", () => {
    it("resolves to schema_version 2 via resolveReportSchemaVersion", () => {
        const envelope = buildPreviewReportEnvelope(presentation, null);
        expect(resolveReportSchemaVersion(envelope.report)).toBe(CURRENT_REPORT_SCHEMA_VERSION);
    });

    it("produces a rendering_snapshot that passes validateReportRenderingSnapshotV2", () => {
        const envelope = buildPreviewReportEnvelope(presentation, null);
        const snapshot = (envelope.report as unknown as { rendering_snapshot: unknown }).rendering_snapshot;
        expect(validateReportRenderingSnapshotV2(snapshot).valid).toBe(true);
    });

    it("embeds the given presentation verbatim", () => {
        const envelope = buildPreviewReportEnvelope(presentation, null);
        const snapshot = (envelope.report as unknown as { rendering_snapshot: { presentation: ReportPresentationSnapshotV2 } }).rendering_snapshot;
        expect(snapshot.presentation).toEqual(presentation);
    });

    it("sets resolved_resources.header_logo_url when a logo URL is given", () => {
        const envelope = buildPreviewReportEnvelope(presentation, "https://cdn.example/logo.png");
        expect(envelope.resolved_resources?.header_logo_url).toBe("https://cdn.example/logo.png");
    });

    it("omits resolved_resources when no logo URL is given", () => {
        const envelope = buildPreviewReportEnvelope(presentation, null);
        expect(envelope.resolved_resources).toBeUndefined();
    });

    it("uses only the fixed synthetic clinical template, never real patient data", () => {
        const envelope = buildPreviewReportEnvelope(presentation, null);
        expect(envelope.title).toBe("Previsualización de plantilla");
        expect(envelope.template.base.order_code.value).toBe("PREV-0001");
        expect(envelope.template.base.patient.value).toBe("Paciente de ejemplo");
        // No ambassador/legacy literals leak into the V2 preview fixture.
        expect(JSON.stringify(envelope)).not.toMatch(/villanueva|#002060/i);
    });

    it("reacts to a changed presentation (different margins produce a different snapshot)", () => {
        const changed: ReportPresentationSnapshotV2 = {
            ...presentation,
            paper: { ...presentation.paper, margins_cm: { top: 2, right: 2, bottom: 2, left: 2 } },
        };
        const a = buildPreviewReportEnvelope(presentation, null);
        const b = buildPreviewReportEnvelope(changed, null);
        const snapA = (a.report as unknown as { rendering_snapshot: { presentation: ReportPresentationSnapshotV2 } }).rendering_snapshot;
        const snapB = (b.report as unknown as { rendering_snapshot: { presentation: ReportPresentationSnapshotV2 } }).rendering_snapshot;
        expect(snapA.presentation.paper.margins_cm.top).toBe(0.8);
        expect(snapB.presentation.paper.margins_cm.top).toBe(2);
    });
});

/**
 * Tercera remediación post-Fase 2 — problema C: el logo de pie no aparecía
 * NUNCA en la previsualización del editor. El renderer ya sabía dibujarlo
 * (lee `resolved_resources.footer_logo_url`); lo que faltaba era que este
 * builder lo aceptara y lo pusiera en el sobre.
 */
describe("buildPreviewReportEnvelope — logo de pie", () => {
    it("expone footer_logo_url cuando se le pasa la URL del logo de pie", () => {
        const envelope = buildPreviewReportEnvelope(presentation, null, "https://cdn.example/pie.png");
        expect(envelope.resolved_resources?.footer_logo_url).toBe("https://cdn.example/pie.png");
    });

    it("mantiene los dos logos separados — nunca reutiliza el del encabezado", () => {
        const envelope = buildPreviewReportEnvelope(
            presentation,
            "https://cdn.example/header.png",
            "https://cdn.example/footer.png"
        );
        expect(envelope.resolved_resources?.header_logo_url).toBe("https://cdn.example/header.png");
        expect(envelope.resolved_resources?.footer_logo_url).toBe("https://cdn.example/footer.png");
    });

    it("expone solo el de pie cuando no hay logo de encabezado", () => {
        const envelope = buildPreviewReportEnvelope(presentation, null, "https://cdn.example/pie.png");
        expect(envelope.resolved_resources?.header_logo_url).toBeNull();
        expect(envelope.resolved_resources?.footer_logo_url).toBe("https://cdn.example/pie.png");
    });

    it("omite resolved_resources cuando no hay ninguno de los dos", () => {
        expect(buildPreviewReportEnvelope(presentation, null, null).resolved_resources).toBeUndefined();
    });
});
