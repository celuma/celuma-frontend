/**
 * Céluma 1.3.1 manual-validation remediation — R3 (CEL-131-04), the surface
 * the release owner actually looked at.
 *
 * The reported symptom, verbatim, in *Plantillas de Reporte*:
 *
 *     Médico solicitante
 *     reception_date
 *     delivery_date
 *
 * **Root cause.** `report_templates.tsx` carried its own hardcoded
 * `BASE_FIELD_LABELS` dictionary — a second source of truth beside
 * `DEFAULT_BASE_FIELDS` — and resolved a predefined field's label as
 * `BASE_FIELD_LABELS[key] ?? key`. The dictionary was never updated when
 * Block D added the two keys, so the `?? key` fallback printed them raw.
 *
 * The stored template data was CORRECT throughout — both `DEFAULT_BASE_FIELDS`
 * and the `v1_3_1` §3b backfill write the proper Spanish labels. Only this
 * screen ignored them. The fix deletes the dictionary and reads the field's
 * own label (so an administrator's customization is respected) with
 * `DEFAULT_BASE_FIELDS` as the fallback.
 *
 * **Why the existing suite allowed it through.** `report_contract.test.ts`
 * asserts `DEFAULT_BASE_FIELDS`, i.e. the data — which was never wrong. No
 * test rendered this screen, so nothing could observe it disagreeing with the
 * data it was given.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportTemplates from "../../pages/report_templates";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";
import templatesSource from "../../pages/report_templates.tsx?raw";
import { SYSTEM_METADATA_BASE_FIELDS } from "../../models/report";

const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000t1";

/** A live template exactly as `v1_3_1` §3b leaves it. */
const MIGRATED_TEMPLATE_JSON = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "" },
        requesting_physician: {
            is_visible: true, label: "Médico solicitante", value: "",
        },
        reception_date: { is_visible: true, label: "Fecha de recepción", value: "" },
        delivery_date: { is_visible: true, label: "Fecha de entrega", value: "" },
    },
    sections: {},
    base_order: [
        "order_code", "requesting_physician", "reception_date", "delivery_date",
    ],
    section_order: [],
};

function mockTemplate(templateJson: object) {
    vi.spyOn(reportService, "getReportTemplates").mockResolvedValue({
        templates: [
            {
                id: TEMPLATE_ID,
                name: "Plantilla General",
                description: null,
                is_active: true,
                created_at: "2026-01-01T00:00:00Z",
            },
        ],
    } as never);
    vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
        id: TEMPLATE_ID,
        name: "Plantilla General",
        description: null,
        is_active: true,
        template_json: templateJson,
        template_hash: "hash",
        created_at: "2026-01-01T00:00:00Z",
    } as never);
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({
        letterheads: [],
    } as never);
}

async function openTheTemplate() {
    render(
        <MemoryRouter initialEntries={["/config/report-templates"]}>
            <ReportTemplates />
        </MemoryRouter>
    );
    await waitFor(() => expect(screen.getAllByText("Plantilla General").length).toBeGreaterThan(0));
    const editIcon = document.querySelector(".anticon-edit");
    expect(editIcon, "edit action not found").toBeTruthy();
    fireEvent.click(editIcon!.closest("button") ?? editIcon!);
    await waitFor(() => {
        expect(document.body.textContent).toContain("Médico solicitante");
    });
}

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("R3 — the template configuration screen names the fields in Spanish", () => {
    it("shows the three official labels, never the raw keys", async () => {
        mockTemplate(MIGRATED_TEMPLATE_JSON);
        await openTheTemplate();

        expect(document.body.textContent).toContain("Médico solicitante");
        expect(document.body.textContent).toContain("Fecha de recepción");
        expect(document.body.textContent).toContain("Fecha de entrega");

        // The exact defect, asserted directly.
        for (const key of SYSTEM_METADATA_BASE_FIELDS) {
            expect(document.body.textContent).not.toContain(key);
        }
    });

    it("names a field whose stored label is missing, instead of printing the key", async () => {
        // A template that predates §3b's label repair, or one written by a
        // client that omitted the label.
        mockTemplate({
            ...MIGRATED_TEMPLATE_JSON,
            base: {
                ...MIGRATED_TEMPLATE_JSON.base,
                reception_date: { is_visible: true, value: "" },
            },
        });
        await openTheTemplate();

        expect(document.body.textContent).toContain("Fecha de recepción");
        expect(document.body.textContent).not.toContain("reception_date");
    });

    it("respects an administrator's customized label", async () => {
        mockTemplate({
            ...MIGRATED_TEMPLATE_JSON,
            base: {
                ...MIGRATED_TEMPLATE_JSON.base,
                reception_date: {
                    is_visible: true, label: "Ingreso al laboratorio", value: "",
                },
            },
        });
        await openTheTemplate();

        expect(document.body.textContent).toContain("Ingreso al laboratorio");
        expect(document.body.textContent).not.toContain("Fecha de recepción");
    });

    it("lists each system field exactly once", async () => {
        mockTemplate(MIGRATED_TEMPLATE_JSON);
        await openTheTemplate();

        const occurrences = (needle: string) =>
            (document.body.textContent ?? "").split(needle).length - 1;
        expect(occurrences("Fecha de recepción")).toBe(1);
        expect(occurrences("Fecha de entrega")).toBe(1);
    });
});

describe("R3 — the duplicate label dictionary is gone", () => {
    it("report_templates.tsx no longer declares its own BASE_FIELD_LABELS", () => {
        // The structural guarantee. As long as this screen derives labels
        // from the shared model, a field added to `DEFAULT_BASE_FIELDS` can
        // never again be missing here.
        expect(templatesSource).not.toContain("BASE_FIELD_LABELS");
        expect(templatesSource).toContain("resolveBaseFieldLabel");
    });
});
