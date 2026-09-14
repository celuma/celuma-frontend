import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import LegacyReportRendererV1, {
    type LegacyReportRendererV1Ref,
} from "../../components/report/legacy/legacy_report_renderer_v1";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../components/report/versioned/versioned_report_renderer_v2";
import {
    DEFAULT_BASE_FIELDS,
    PREDEFINED_BASE_KEYS,
    resolveBaseFieldLabel,
    SYSTEM_METADATA_BASE_FIELDS,
} from "../../models/report";
import type {
    ReportContent,
    ReportEnvelope,
    ReportTemplateJSON,
} from "../../models/report";
import type { ReportRenderingSnapshotV2 } from "../../components/report/versioned/versioned_report_types";

/**
 * Céluma 1.3.1 manual-validation remediation — R3 (CEL-131-04).
 *
 * **The finding.** `requesting_physician` behaved as expected but
 * `reception_date` / `delivery_date` did not, and the template configuration
 * UI displayed their raw snake_case keys to administrators.
 *
 * **Root cause.** THREE independent hardcoded copies of "which base-field keys
 * are predefined", none of which learned about the two new keys when Block D
 * added them:
 *
 *   1. `PREDEFINED_BASE_KEYS` in the V2 renderer,
 *   2. `PREDEFINED_BASE_KEYS` in the Legacy renderer — both used as a row
 *      FILTER, so a key in neither list nor marked `is_custom` was dropped
 *      from the rendered report entirely, and therefore from the official PDF,
 *      which renders the same component;
 *   3. `BASE_FIELD_LABELS` in `report_templates.tsx`, whose `?? item.key`
 *      fallback printed the raw key — the symptom the release owner saw.
 *
 * `requesting_physician` was in all three because it predates 1.3.1, which is
 * exactly why one of the three fields "behaved as expected" and the other two
 * did not.
 *
 * **Why the existing suite allowed it through.** Block D's coverage was
 * backend-only plus `report_contract.test.ts`, which asserts the SHAPE of
 * `DEFAULT_BASE_FIELDS`. Nothing rendered a report containing the fields, so
 * no test could observe the renderers silently discarding them: every
 * assertion was about the data, and the data was correct the whole time.
 *
 * These tests render. That is the missing real-world condition.
 */

const CONTENT_BASE = {
    order_code: { is_visible: true, label: "Código de orden", value: "R3-0001" },
    patient: { is_visible: true, label: "Paciente", value: "Paciente R3" },
    requesting_physician: {
        is_visible: true,
        label: "Médico solicitante",
        value: "Dr. Solicitante R3",
    },
    reception_date: {
        is_visible: true,
        label: "Fecha de recepción",
        value: "5/8/2026",
    },
    delivery_date: {
        is_visible: true,
        label: "Fecha de entrega",
        value: "12/9/2026",
    },
};

const BASE_ORDER = [
    "order_code",
    "patient",
    "requesting_physician",
    "reception_date",
    "delivery_date",
];

function content(overrides: Partial<ReportContent> = {}): ReportContent {
    return {
        base: JSON.parse(JSON.stringify(CONTENT_BASE)),
        sections: {
            section_macroscopic: {
                is_visible: true,
                label: "Macroscópica",
                type: "richtext",
                content: "<p>Texto clínico.</p>",
            },
        },
        base_order: [...BASE_ORDER],
        section_order: ["section_macroscopic"],
        signatureMetadata: {
            show_signature_section: false,
            require_digital_signature: false,
        },
        ...overrides,
    } as ReportContent;
}

function templateFrom(c: ReportContent): ReportTemplateJSON {
    return {
        base: c.base,
        sections: c.sections,
        base_order: c.base_order,
        section_order: c.section_order,
    } as ReportTemplateJSON;
}

const ENVELOPE_BASE = {
    order_id: "00000000-0000-0000-0000-000000000003",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    branch_id: "00000000-0000-0000-0000-000000000002",
    created_by: "00000000-0000-0000-0000-000000000099",
    version_no: 1,
    status: "PUBLISHED" as const,
    title: "Reporte R3",
    published_at: "2026-09-12T12:00:00Z",
    signed_by: "00000000-0000-0000-0000-000000000099",
    signed_at: "2026-09-12T12:00:00Z",
};

function legacyEnvelope(c: ReportContent = content()): ReportEnvelope {
    return {
        ...ENVELOPE_BASE,
        id: "r3-legacy",
        template: templateFrom(c),
        report: c,
    } as ReportEnvelope;
}

function v2Envelope(c: ReportContent = content()): ReportEnvelope {
    const snapshot: ReportRenderingSnapshotV2 = {
        schema_version: 2,
        template: templateFrom(c) as never,
        presentation: {
            paper: {
                size: "LETTER",
                orientation: "PORTRAIT",
                margins_cm: { top: 1, right: 1, bottom: 1, left: 1 },
            },
            header: {
                enabled: true,
                logo_storage_id: null,
                institution_name: "Laboratorio R3",
                subtitle: null,
                address: null,
                phone: null,
                email: null,
            },
            footer: { enabled: true, custom_text: null, show_page_number: true },
            style: { primary_color: "#4A4A4A" },
            signer: null,
        },
    };
    return {
        ...ENVELOPE_BASE,
        id: "r3-v2",
        template: snapshot.template as unknown as ReportTemplateJSON,
        report: { ...c, schema_version: 2, rendering_snapshot: snapshot },
        schema_version: 2,
        template_version_id: "00000000-0000-0000-0000-0000000ab003",
        generated_by_renderer_version: "fixture/1.0.0",
    } as ReportEnvelope;
}

function renderLegacy(report: ReportEnvelope) {
    const ref = createRef<LegacyReportRendererV1Ref>();
    const { unmount } = render(<LegacyReportRendererV1 report={report} ref={ref} />);
    const pages = ref.current?.getPages() ?? [];
    return { text: pages.map((p) => p.textContent).join("\n"), unmount };
}

function renderV2(report: ReportEnvelope) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    const { unmount } = render(<VersionedReportRendererV2 report={report} ref={ref} />);
    const pages = ref.current?.getPages() ?? [];
    return { text: pages.map((p) => p.textContent).join("\n"), unmount };
}

const RENDERERS: [string, (r: ReportEnvelope) => { text: string; unmount: () => void }, () => ReportEnvelope][] = [
    ["Legacy", renderLegacy, () => legacyEnvelope()],
    ["V2", renderV2, () => v2Envelope()],
];

describe.each(RENDERERS)(
    "%s renderer — the three official metadata fields reach the page",
    (_name, doRender, buildEnvelope) => {
        it("renders all three labels", () => {
            const { text, unmount } = doRender(buildEnvelope());
            expect(text).toContain("Médico solicitante:");
            expect(text).toContain("Fecha de recepción:");
            expect(text).toContain("Fecha de entrega:");
            unmount();
        });

        it("renders all three values", () => {
            const { text, unmount } = doRender(buildEnvelope());
            expect(text).toContain("Dr. Solicitante R3");
            expect(text).toContain("5/8/2026");
            expect(text).toContain("12/9/2026");
            unmount();
        });

        it("never prints a raw snake_case key as a label", () => {
            const { text, unmount } = doRender(buildEnvelope());
            for (const key of SYSTEM_METADATA_BASE_FIELDS) {
                expect(text).not.toContain(key);
            }
            unmount();
        });

        it("renders an empty value as blank rather than dropping the row", () => {
            // The pre-signature state: `delivery_date` is declared and visible
            // but has no value yet. The field must still be NAMED — dropping
            // it is the defect this module exists for, and a report that
            // silently omits an official field it declares is wrong whether
            // the value is missing or not.
            const c = content();
            c.base.delivery_date.value = "";
            const envelope = buildEnvelope();
            const rebuilt =
                envelope.schema_version === 2 ? v2Envelope(c) : legacyEnvelope(c);
            const { text, unmount } = doRender(rebuilt);
            expect(text).toContain("Fecha de entrega:");
            expect(text).toContain("Sin especificar");
            unmount();
        });

        it("honours is_visible: false, the ordinary base-field control", () => {
            const c = content();
            c.base.reception_date.is_visible = false;
            const envelope = buildEnvelope();
            const rebuilt =
                envelope.schema_version === 2 ? v2Envelope(c) : legacyEnvelope(c);
            const { text, unmount } = doRender(rebuilt);
            expect(text).not.toContain("Fecha de recepción");
            // ...and its siblings are unaffected.
            expect(text).toContain("Fecha de entrega:");
            unmount();
        });

        it("respects an administrator's customized label", () => {
            const c = content();
            c.base.reception_date.label = "Ingreso al laboratorio";
            const envelope = buildEnvelope();
            const rebuilt =
                envelope.schema_version === 2 ? v2Envelope(c) : legacyEnvelope(c);
            const { text, unmount } = doRender(rebuilt);
            expect(text).toContain("Ingreso al laboratorio:");
            expect(text).not.toContain("Fecha de recepción:");
            unmount();
        });

        it("falls back to the canonical label when the stored one is missing", () => {
            // A template migrated from a pre-1.3.1 document, or one written by
            // a client that omitted the label. The renderer must never print
            // "undefined:" or the raw key.
            const c = content();
            delete (c.base.reception_date as { label?: string }).label;
            const envelope = buildEnvelope();
            const rebuilt =
                envelope.schema_version === 2 ? v2Envelope(c) : legacyEnvelope(c);
            const { text, unmount } = doRender(rebuilt);
            expect(text).toContain("Fecha de recepción:");
            expect(text).not.toContain("undefined");
            expect(text).not.toContain("reception_date");
            unmount();
        });
    }
);

describe("the predefined-key list has exactly one definition", () => {
    it("covers every key DEFAULT_BASE_FIELDS declares", () => {
        // The invariant that makes the three-stale-copies defect impossible to
        // reintroduce: the set is DERIVED, so adding a field in one place adds
        // it everywhere the renderers and the template UI look.
        for (const key of Object.keys(DEFAULT_BASE_FIELDS)) {
            expect(PREDEFINED_BASE_KEYS.has(key)).toBe(true);
        }
        expect(PREDEFINED_BASE_KEYS.size).toBe(
            Object.keys(DEFAULT_BASE_FIELDS).length
        );
    });

    it("includes the three system metadata keys", () => {
        for (const key of SYSTEM_METADATA_BASE_FIELDS) {
            expect(PREDEFINED_BASE_KEYS.has(key)).toBe(true);
        }
    });
});

describe("resolveBaseFieldLabel", () => {
    it("prefers the field's own label, so customization always wins", () => {
        expect(
            resolveBaseFieldLabel("reception_date", { label: "Ingreso" })
        ).toBe("Ingreso");
    });

    it("falls back to the canonical Spanish label for a predefined key", () => {
        expect(resolveBaseFieldLabel("reception_date", {})).toBe(
            "Fecha de recepción"
        );
        expect(resolveBaseFieldLabel("delivery_date", undefined)).toBe(
            "Fecha de entrega"
        );
        expect(resolveBaseFieldLabel("requesting_physician", null)).toBe(
            "Médico solicitante"
        );
    });

    it("treats a blank label as absent rather than rendering nothing", () => {
        expect(resolveBaseFieldLabel("delivery_date", { label: "   " })).toBe(
            "Fecha de entrega"
        );
    });

    it("returns the key only for a key this build does not know", () => {
        expect(resolveBaseFieldLabel("something_unknown", {})).toBe(
            "something_unknown"
        );
    });
});

describe("the released labels", () => {
    it("are the official Spanish ones, matching v1_3_1 §3b", () => {
        // The migration writes these exact strings into every live template.
        // If either side changes alone, an existing laboratory's templates and
        // a newly created one disagree.
        expect(DEFAULT_BASE_FIELDS.requesting_physician.label).toBe(
            "Médico solicitante"
        );
        expect(DEFAULT_BASE_FIELDS.reception_date.label).toBe(
            "Fecha de recepción"
        );
        expect(DEFAULT_BASE_FIELDS.delivery_date.label).toBe("Fecha de entrega");
    });
});
