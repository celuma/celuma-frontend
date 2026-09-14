/**
 * Céluma 1.3.1 Block C — how the V2 renderer behaves when a report's frozen
 * `rendering_snapshot.template` does not describe the clinical content stored
 * alongside it.
 *
 * **This state is no longer reachable through the supported create flow.**
 * Finding C-8 made it reachable — `create_report` re-read the mutable
 * `ReportTemplate.template_json` at save time, so an administrator editing a
 * template mid-session produced exactly this pair — and the C-8 guard now
 * refuses that request with 409 (`tests/http/test_block_c_template_mutation_race.py`).
 * Creating a mismatched report is **not** valid behaviour and nothing here
 * should be read as saying otherwise.
 *
 * These tests are kept deliberately, as renderer **defence documentation**: the
 * pair can still occur in data the guard never saw — reports created before
 * 1.3.1, or a body corrupted by some other means — and an engineer reading a
 * support ticket about a missing section needs to know that this is what it
 * looks like and why. They describe a failure mode, not a contract.
 *
 * The mechanism: the renderer joins the two halves by walking the SNAPSHOT's
 * section order and looking each key up in the SNAPSHOT's section map
 * (`const v = tmpl.sections[k]; if (!v?.is_visible) return null;`), and
 * `resolveSectionOrder` likewise filters the content's own order array against
 * that map. A section present only in the content is therefore dropped — with
 * no error, no placeholder, and nothing in the document indicating anything is
 * missing. That silence is what made C-8 worth fixing at the source rather than
 * here: a renderer cannot safely invent a structure for content it was given no
 * structure for.
 *
 * Full history: docs/celuma-1.3.1/block-c/template-mutation-race.md.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import VersionedReportRendererV2, {
    type VersionedReportRendererV2Ref,
} from "../../../components/report/versioned/versioned_report_renderer_v2";
import type { ReportEnvelope } from "../../../models/report";
import type { ReportRenderingSnapshotV2 } from "../../../components/report/versioned/versioned_report_types";

const AUTHORED_TEXT = "Pieza de 4.2 cm con lesión central de bordes irregulares.";

const PRESENTATION: ReportRenderingSnapshotV2["presentation"] = {
    paper: {
        size: "LETTER",
        orientation: "PORTRAIT",
        margins_cm: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    header: {
        enabled: true,
        logo_storage_id: null,
        institution_name: "Laboratorio Sintético Carrera",
        subtitle: null,
        address: null,
        phone: null,
        email: null,
    },
    footer: { enabled: true, custom_text: null, show_page_number: true },
    style: { primary_color: "#336699" },
    signer: null,
} as unknown as ReportRenderingSnapshotV2["presentation"];

/** Structure A — what the author bootstrapped with and wrote against. */
const STRUCTURE_A = {
    base: {
        diagnosis: { is_visible: true, is_custom: true, label: "Diagnóstico", type: "text", value: "" },
    },
    sections: {
        macroscopia: { is_visible: true, label: "Macroscopía", type: "richtext", content: "" },
    },
    base_order: ["diagnosis"],
    section_order: ["macroscopia"],
};

/** Structure B — what an administrator saved while the editor was open. */
const STRUCTURE_B = {
    base: {
        diagnosis: { is_visible: true, is_custom: true, label: "Diagnóstico", type: "text", value: "" },
    },
    sections: {
        inmunohistoquimica: {
            is_visible: true,
            label: "Inmunohistoquímica",
            type: "richtext",
            content: "",
        },
    },
    base_order: ["diagnosis"],
    section_order: ["inmunohistoquimica"],
};

/** The author's clinical content, keyed by structure A. */
const AUTHORED_CONTENT = {
    base: {
        diagnosis: {
            is_visible: true,
            is_custom: true,
            label: "Diagnóstico",
            value: "Carcinoma ductal infiltrante",
        },
    },
    sections: {
        macroscopia: {
            is_visible: true,
            label: "Macroscopía",
            type: "richtext",
            content: `<p>${AUTHORED_TEXT}</p>`,
        },
    },
    base_order: ["diagnosis"],
    section_order: ["macroscopia"],
};

function envelopeWith(frozenTemplate: Record<string, unknown>): ReportEnvelope {
    return {
        id: "fixture-race-1",
        order_id: "00000000-0000-0000-0000-000000000103",
        tenant_id: "00000000-0000-0000-0000-000000000101",
        branch_id: "00000000-0000-0000-0000-000000000102",
        created_by: "00000000-0000-0000-0000-000000000199",
        version_no: 1,
        status: "DRAFT",
        title: "Reporte con carrera",
        published_at: null,
        signed_by: null,
        signed_at: null,
        schema_version: 2,
        template_version_id: null,
        template: STRUCTURE_A as never,
        report: {
            ...AUTHORED_CONTENT,
            schema_version: 2,
            rendering_snapshot: {
                schema_version: 2,
                template: frozenTemplate,
                presentation: PRESENTATION,
            },
        } as never,
    } as unknown as ReportEnvelope;
}

function renderReport(report: ReportEnvelope) {
    const ref = createRef<VersionedReportRendererV2Ref>();
    const { container } = render(<VersionedReportRendererV2 report={report} ref={ref} />);
    const pages = ref.current?.getPages() ?? [];
    return { pages, text: pages.map((p) => p.textContent).join("\n"), container };
}

describe("VersionedReportRendererV2 — frozen structure matching the content (the supported state)", () => {
    it("renders the authored section and its text", () => {
        const { text } = renderReport(envelopeWith(STRUCTURE_A));

        expect(text).toContain("Macroscopía");
        expect(text).toContain(AUTHORED_TEXT);
        expect(text).toContain("Carcinoma ductal infiltrante");
    });
});

describe("VersionedReportRendererV2 — a mismatched snapshot in historical data", () => {
    it("HISTORICAL_DATA drops the authored section entirely", () => {
        const { text } = renderReport(envelopeWith(STRUCTURE_B));

        expect(text).not.toContain("Macroscopía");
    });

    it("HISTORICAL_DATA silently omits the author's clinical text", () => {
        // The severity that made C-8 release-blocking, in one assertion: the
        // sentence IS persisted in the report body, and it does not appear in
        // the rendered report or in the PDF produced from it. The backend guard
        // is what stops such a report from being created in the first place.
        const { text } = renderReport(envelopeWith(STRUCTURE_B));

        expect(text).not.toContain(AUTHORED_TEXT);
    });

    it("HISTORICAL_DATA shows no error, warning or placeholder", () => {
        // Not a controlled degraded state: the document renders as if complete.
        const { text, pages } = renderReport(envelopeWith(STRUCTURE_B));

        expect(pages.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/no se pudo|inválid|error|falta|incompleto/i);
    });

    it("HISTORICAL_DATA renders NO clinical section whatsoever", () => {
        // Worse than substituting an empty heading. A richtext section with no
        // content returns null before its header is emitted
        // (`if (!rawContent) return null`), so the new structure's section is
        // invisible too. The finished report carries the base fields and not one
        // line of the clinical narrative — and nothing says so.
        const { text } = renderReport(envelopeWith(STRUCTURE_B));

        expect(text).not.toContain("Inmunohistoquímica");
        expect(text).not.toContain("Macroscopía");
        expect(text).not.toContain(AUTHORED_TEXT);
    });

    it("HISTORICAL_DATA base fields survive, because both structures share them", () => {
        // Establishes the blast radius precisely: the loss is scoped to keys
        // the two structures disagree about, not to the whole document. A
        // partially-overlapping edit loses only the sections it removed, which
        // is harder to notice than losing everything.
        const { text } = renderReport(envelopeWith(STRUCTURE_B));

        expect(text).toContain("Carcinoma ductal infiltrante");
    });

    it("HISTORICAL_DATA a renamed section label is taken from the frozen structure", () => {
        // The milder, far more likely shape of the same race: the administrator
        // renames a section rather than replacing it. The content survives and
        // renders, but under the NEW label — so the report asserts a heading the
        // author never saw over text they wrote under a different one.
        const renamed = {
            ...STRUCTURE_A,
            sections: {
                macroscopia: {
                    is_visible: true,
                    label: "Descripción macroscópica (rev. 2)",
                    type: "richtext",
                    content: "",
                },
            },
        };

        const { text } = renderReport(envelopeWith(renamed));

        expect(text).toContain("Descripción macroscópica (rev. 2)");
        expect(text).not.toContain("Macroscopía");
        expect(text).toContain(AUTHORED_TEXT);
    });

    it("HISTORICAL_DATA a section hidden after bootstrap drops its text", () => {
        // The quietest shape of all: the administrator only toggles visibility.
        const hidden = {
            ...STRUCTURE_A,
            sections: {
                macroscopia: {
                    is_visible: false,
                    label: "Macroscopía",
                    type: "richtext",
                    content: "",
                },
            },
        };

        const { text } = renderReport(envelopeWith(hidden));

        expect(text).not.toContain(AUTHORED_TEXT);
    });
});
