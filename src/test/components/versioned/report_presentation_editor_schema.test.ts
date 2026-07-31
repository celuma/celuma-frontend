import { describe, expect, it } from "vitest";
import { validatePresentationDraft } from "../../../components/report/versioned/report_presentation_editor_schema";
import type { ReportPresentationSnapshotV2 } from "../../../components/report/versioned/versioned_report_types";

// Céluma 1.3 Fase 2, Bloque D, Historia D5/D14 — mirrors the backend Pydantic
// contract's limits (margins, hex color, phone pattern, markup rejection).

function validPresentation(): ReportPresentationSnapshotV2 {
    return {
        paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1, right: 1, bottom: 1, left: 1 } },
        header: {
            enabled: true,
            logo_storage_id: null,
            institution_name: "Laboratorio de Prueba",
            subtitle: "Subtítulo",
            address: "Calle Falsa 123",
            phone: "+52 55 1234 5678",
            email: "contacto@example.com",
        },
        footer: { enabled: true, custom_text: "Confidencial", show_page_number: true },
        style: { primary_color: "#4A4A4A" },
        signer: {
            display_name: "Dr. Firmante",
            specialty: "Patología",
            license_number: "12345",
            affiliation: "Instituto de Prueba",
        },
    };
}

describe("validatePresentationDraft — valid inputs", () => {
    it("accepts a fully-populated presentation", () => {
        expect(validatePresentationDraft(validPresentation())).toEqual({ valid: true });
    });

    it("accepts neutral defaults with every optional field null", () => {
        const neutral: ReportPresentationSnapshotV2 = {
            paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1, right: 1, bottom: 1, left: 1 } },
            header: { enabled: true, logo_storage_id: null, institution_name: null, subtitle: null, address: null, phone: null, email: null },
            footer: { enabled: true, custom_text: null, show_page_number: true },
            style: { primary_color: "#4A4A4A" },
            signer: null,
        };
        expect(validatePresentationDraft(neutral)).toEqual({ valid: true });
    });

    it("accepts the boundary margin values 0.5 and 4.0", () => {
        const p = validPresentation();
        p.paper.margins_cm = { top: 0.5, right: 4.0, bottom: 0.5, left: 4.0 };
        expect(validatePresentationDraft(p)).toEqual({ valid: true });
    });
});

describe("validatePresentationDraft — margins", () => {
    it("rejects a margin below 0.5cm", () => {
        const p = validPresentation();
        p.paper.margins_cm.top = 0.4;
        const result = validatePresentationDraft(p);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.fieldErrors["paper.margins_cm.top"]).toBeDefined();
    });

    it("rejects a margin above 4.0cm", () => {
        const p = validPresentation();
        p.paper.margins_cm.right = 4.1;
        const result = validatePresentationDraft(p);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.fieldErrors["paper.margins_cm.right"]).toBeDefined();
    });
});

describe("validatePresentationDraft — style", () => {
    it("rejects a non-hex color", () => {
        const p = validPresentation();
        p.style.primary_color = "not-a-color";
        const result = validatePresentationDraft(p);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.fieldErrors["style.primary_color"]).toBeDefined();
    });

    it("rejects a 3-digit hex shorthand (must be 6 digits)", () => {
        const p = validPresentation();
        p.style.primary_color = "#fff";
        expect(validatePresentationDraft(p).valid).toBe(false);
    });
});

describe("validatePresentationDraft — header", () => {
    it("rejects a phone with unsupported characters", () => {
        const p = validPresentation();
        p.header.phone = "call me maybe";
        const result = validatePresentationDraft(p);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.fieldErrors["header.phone"]).toBeDefined();
    });

    it("rejects an invalid email", () => {
        const p = validPresentation();
        p.header.email = "not-an-email";
        expect(validatePresentationDraft(p).valid).toBe(false);
    });

    it("rejects HTML markup in institution_name", () => {
        const p = validPresentation();
        p.header.institution_name = "<script>alert(1)</script>";
        const result = validatePresentationDraft(p);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.fieldErrors["header.institution_name"]).toBeDefined();
    });

    it("rejects javascript: markup in address", () => {
        const p = validPresentation();
        p.header.address = "javascript:alert(1)";
        expect(validatePresentationDraft(p).valid).toBe(false);
    });

    it("rejects institution_name longer than 255 characters", () => {
        const p = validPresentation();
        p.header.institution_name = "a".repeat(256);
        expect(validatePresentationDraft(p).valid).toBe(false);
    });
});

describe("validatePresentationDraft — footer", () => {
    it("rejects markup in custom_text", () => {
        const p = validPresentation();
        p.footer.custom_text = "<img onerror=alert(1)>";
        expect(validatePresentationDraft(p).valid).toBe(false);
    });

    it("rejects custom_text longer than 1000 characters", () => {
        const p = validPresentation();
        p.footer.custom_text = "a".repeat(1001);
        expect(validatePresentationDraft(p).valid).toBe(false);
    });
});

describe("validatePresentationDraft — signer", () => {
    it("rejects markup in a signer field", () => {
        const p = validPresentation();
        p.signer = { ...p.signer!, display_name: "<b>Dr. X</b>" };
        expect(validatePresentationDraft(p).valid).toBe(false);
    });

    it("rejects a license_number longer than 100 characters", () => {
        const p = validPresentation();
        p.signer = { ...p.signer!, license_number: "1".repeat(101) };
        expect(validatePresentationDraft(p).valid).toBe(false);
    });
});

describe("validatePresentationDraft — paper", () => {
    it("rejects a paper size other than LETTER", () => {
        const p = validPresentation();
        (p.paper as unknown as { size: string }).size = "A4";
        expect(validatePresentationDraft(p).valid).toBe(false);
    });
});
