import { describe, expect, it } from "vitest";
import {
    mergePersistedContentIntoTemplateSnapshot,
    normalizeReportTemplateJSON,
    resolveBaseOrder,
    resolveDisplayOrder,
    resolveSectionOrder,
    resolveSignatureMetadata,
} from "../../models/report";
import {
    emptyOptionalSections,
    legacyOldestStructure,
    noPatientReport,
    publishedMultiSampleWithImages,
    specialCharactersAccents,
} from "../fixtures/reports";

// Regression coverage for Céluma 1.3 Fase 1 (Workstream 5). These protect the
// backward-compatibility logic in src/models/report.ts, which is the ONLY
// place today that tolerates historical/partial report JSON (the backend
// stores it as an opaque dict — see report-rendering-inventory.md §6).

describe("resolveBaseOrder / resolveSectionOrder — legacy documents without order arrays", () => {
    it("falls back to Object.keys(base) when base_order is empty (oldest-structure fixture)", () => {
        const { report } = legacyOldestStructure;
        expect(report.base_order).toEqual([]);
        const order = resolveBaseOrder({ base: report.base, base_order: report.base_order });
        expect(order).toEqual(["order_code", "patient", "study_type"]);
    });

    it("falls back to Object.keys(sections) when section_order is empty", () => {
        const { report } = legacyOldestStructure;
        const order = resolveSectionOrder({ sections: report.sections, section_order: report.section_order });
        expect(order).toEqual(["section_macroscopic", "section_microscopic", "images"]);
    });

    it("does not lose or duplicate keys that ARE present in base_order", () => {
        const { report } = publishedMultiSampleWithImages;
        const order = resolveBaseOrder({ base: report.base, base_order: report.base_order });
        expect(order).toEqual(report.base_order);
        expect(new Set(order).size).toBe(order.length);
    });

    it("appends any base key missing from base_order instead of dropping it", () => {
        const order = resolveBaseOrder({
            base: {
                a: { is_visible: true, label: "A", value: "" },
                b: { is_visible: true, label: "B", value: "" },
            },
            base_order: ["a"], // "b" is missing from the order array
        });
        expect(order).toEqual(["a", "b"]);
    });
});

describe("resolveDisplayOrder — content order takes priority over template order", () => {
    it("prefers content.base_order/section_order over the template snapshot when both are present", () => {
        const template = {
            base: { x: { is_visible: true, label: "X", value: "" }, y: { is_visible: true, label: "Y", value: "" } },
            sections: {},
            base_order: ["y", "x"],
            section_order: [],
        };
        const content = { base_order: ["x", "y"], section_order: [] };
        const { baseOrder } = resolveDisplayOrder(template, content);
        expect(baseOrder).toEqual(["x", "y"]);
    });

    it("falls back to the template order when content has no order arrays (legacy content)", () => {
        const template = {
            base: { x: { is_visible: true, label: "X", value: "" } },
            sections: {},
            base_order: ["x"],
            section_order: [],
        };
        const { baseOrder } = resolveDisplayOrder(template, null);
        expect(baseOrder).toEqual(["x"]);
    });
});

describe("resolveSignatureMetadata — absent/partial documents resolve safely", () => {
    it("resolves to {false, false} when signatureMetadata is entirely absent (legacy document)", () => {
        const resolved = resolveSignatureMetadata(legacyOldestStructure.report);
        expect(resolved).toEqual({ show_signature_section: false, require_digital_signature: false });
    });

    it("does not enable require_digital_signature unless show_signature_section is also true", () => {
        const resolved = resolveSignatureMetadata({
            signatureMetadata: { show_signature_section: false, require_digital_signature: true },
        });
        expect(resolved.show_signature_section).toBe(false);
        expect(resolved.require_digital_signature).toBe(false);
    });

    it("preserves signature_url verbatim when present (embedded server-side at sign time)", () => {
        const resolved = resolveSignatureMetadata(publishedMultiSampleWithImages.report);
        expect(resolved.signature_url).toBe("https://cdn.example.invalid/synthetic/signature.png");
    });

    it("treats a non-object signatureMetadata as absent rather than throwing", () => {
        // @ts-expect-error deliberately malformed input to prove it doesn't throw
        const resolved = resolveSignatureMetadata({ signatureMetadata: "not-an-object" });
        expect(resolved).toEqual({ show_signature_section: false, require_digital_signature: false });
    });
});

describe("normalizeReportTemplateJSON — tolerates partial/legacy payloads", () => {
    it("fills in missing base/sections/order arrays without throwing", () => {
        const normalized = normalizeReportTemplateJSON({ base: undefined as never, sections: undefined as never });
        expect(normalized.base).toEqual({});
        expect(normalized.sections).toEqual({});
        expect(normalized.base_order).toEqual([]);
        expect(normalized.section_order).toEqual([]);
    });

    it("round-trips a fully-formed document unchanged", () => {
        const { report } = emptyOptionalSections;
        const normalized = normalizeReportTemplateJSON(report);
        expect(normalized.base_order).toEqual(report.base_order);
        expect(normalized.section_order).toEqual(report.section_order);
    });
});

describe("mergePersistedContentIntoTemplateSnapshot — legacy content with blocks missing from the template", () => {
    it("copies base/section definitions from saved content when the template snapshot lacks them", () => {
        const templateSnapshot = {
            base: { order_code: { is_visible: true, label: "Código de orden", value: "" } },
            sections: {},
            base_order: ["order_code"],
            section_order: [],
        };
        const savedContent = noPatientReport.report; // has "patient" and "study_type" the snapshot above lacks

        const merged = mergePersistedContentIntoTemplateSnapshot(templateSnapshot, savedContent);
        expect(Object.keys(merged.base)).toEqual(expect.arrayContaining(["order_code", "patient", "study_type"]));
        expect(merged.base_order).toContain("patient");
    });

    it("returns the template snapshot unchanged when there is no saved content", () => {
        const templateSnapshot = { base: {}, sections: {}, base_order: [], section_order: [] };
        expect(mergePersistedContentIntoTemplateSnapshot(templateSnapshot, null)).toBe(templateSnapshot);
    });
});

describe("special characters survive the full resolve pipeline unmodified", () => {
    it("does not mangle accents/ñ when resolving order and reading values", () => {
        const { report } = specialCharactersAccents;
        const order = resolveBaseOrder({ base: report.base, base_order: report.base_order });
        const patientValue = report.base[order[1]].value;
        expect(patientValue).toBe("María José Muñóz Peña");
    });
});
