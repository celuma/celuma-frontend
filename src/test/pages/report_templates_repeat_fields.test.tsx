/**
 * Céluma 1.4 (#15) — the template administrator chooses which visible predefined fields repeat on
 * every page, and (#12) the new "Códigos de muestra" base field is offered, hidden by default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportTemplates from "../../pages/report_templates";
import * as reportService from "../../services/report_service";
import * as letterheadService from "../../services/report_letterhead_service";

const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000t2";

const TEMPLATE_JSON = {
    base: {
        order_code: { is_visible: true, label: "Código de orden", value: "" },
        patient: { is_visible: true, label: "Paciente", value: "" },
        requesting_physician: { is_visible: false, label: "Médico solicitante", value: "" },
    },
    sections: {},
    base_order: ["order_code", "patient", "requesting_physician"],
    section_order: [],
};

function mockTemplate(templateJson: object = TEMPLATE_JSON) {
    vi.spyOn(reportService, "getReportTemplates").mockResolvedValue({
        templates: [{ id: TEMPLATE_ID, name: "Plantilla Repetición", description: null, is_active: true, created_at: "2026-01-01T00:00:00Z" }],
    } as never);
    vi.spyOn(reportService, "getReportTemplateById").mockResolvedValue({
        id: TEMPLATE_ID, name: "Plantilla Repetición", description: null, is_active: true,
        template_json: templateJson, template_hash: "hash", created_at: "2026-01-01T00:00:00Z",
    } as never);
    vi.spyOn(letterheadService, "listReportLetterheads").mockResolvedValue({ letterheads: [] } as never);
}

async function openTemplate() {
    render(
        <MemoryRouter initialEntries={["/config/report-templates"]}>
            <ReportTemplates />
        </MemoryRouter>
    );
    await waitFor(() => expect(screen.getAllByText("Plantilla Repetición").length).toBeGreaterThan(0));
    const editIcon = document.querySelector(".anticon-edit");
    fireEvent.click(editIcon!.closest("button") ?? editIcon!);
    await waitFor(() => expect(document.body.textContent).toContain("Paciente"));
}

const box = (key: string) => document.querySelector<HTMLInputElement>(`[data-testid="repeat-${key}"] input, input[data-testid="repeat-${key}"]`);

beforeEach(() => {
    localStorage.setItem("tenant_id", "t1");
    localStorage.setItem("branch_id", "b1");
});
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("template configuration — repeat on every page", () => {
    it("offers the option per predefined field, off by default", async () => {
        mockTemplate();
        await openTemplate();
        expect(screen.getByLabelText("Repetir Paciente en cada página")).toBeTruthy();
        expect((screen.getByLabelText("Repetir Paciente en cada página") as HTMLInputElement).checked).toBe(false);
    });

    it("a hidden field cannot be set to repeat", async () => {
        mockTemplate();
        await openTemplate();
        expect((screen.getByLabelText("Repetir Médico solicitante en cada página") as HTMLInputElement).disabled).toBe(true);
    });

    it("saves the flag only on the fields that were ticked, leaving the rest of the JSON as it was", async () => {
        mockTemplate();
        const update = vi.spyOn(reportService, "updateReportTemplate").mockResolvedValue({} as never);
        await openTemplate();
        fireEvent.click(screen.getByLabelText("Repetir Paciente en cada página"));
        fireEvent.click(screen.getByText("Guardar Cambios"));
        await waitFor(() => expect(update).toHaveBeenCalled());
        const saved = update.mock.calls[0][1].template_json as unknown as { base: Record<string, Record<string, unknown>> };
        expect(saved.base.patient.repeat_on_every_page).toBe(true);
        expect("repeat_on_every_page" in saved.base.order_code).toBe(false);
        expect("repeat_on_every_page" in saved.base.requesting_physician).toBe(false);
        expect(saved.base.patient.label).toBe("Paciente");
    });

    it("unticking removes the flag instead of storing false", async () => {
        mockTemplate({
            ...TEMPLATE_JSON,
            base: { ...TEMPLATE_JSON.base, patient: { ...TEMPLATE_JSON.base.patient, repeat_on_every_page: true } },
        });
        const update = vi.spyOn(reportService, "updateReportTemplate").mockResolvedValue({} as never);
        await openTemplate();
        const checkbox = screen.getByLabelText("Repetir Paciente en cada página") as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
        fireEvent.click(checkbox);
        fireEvent.click(screen.getByText("Guardar Cambios"));
        await waitFor(() => expect(update).toHaveBeenCalled());
        const saved = update.mock.calls[0][1].template_json as unknown as { base: Record<string, Record<string, unknown>> };
        expect("repeat_on_every_page" in saved.base.patient).toBe(false);
    });

    it("offers 'Códigos de muestra' as a predefined field, hidden until the administrator opts in", async () => {
        mockTemplate();
        const update = vi.spyOn(reportService, "updateReportTemplate").mockResolvedValue({} as never);
        await openTemplate();
        expect(document.body.textContent).toContain("Códigos de muestra");
        expect(box("sample_codes") ?? screen.getByLabelText("Repetir Códigos de muestra en cada página")).toBeTruthy();
        fireEvent.click(screen.getByText("Guardar Cambios"));
        await waitFor(() => expect(update).toHaveBeenCalled());
        const saved = update.mock.calls[0][1].template_json as unknown as { base: Record<string, { is_visible: boolean }> };
        expect(saved.base.sample_codes.is_visible).toBe(false);
    });
});
