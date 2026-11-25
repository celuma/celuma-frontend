import { describe, expect, it } from "vitest";
import { automaticSampleStateSuffix } from "../../lib/sample_state_trigger";

describe("automaticSampleStateSuffix (#86)", () => {
    it("marks the first-image transition as automatic, as before", () => {
        expect(automaticSampleStateSuffix("first_image_upload")).toBe(" (automático)");
    });

    it("marks the Ready-on-review transition as automatic", () => {
        expect(automaticSampleStateSuffix("report_submitted")).toBe(" (automático)");
    });

    it("leaves manual changes and unknown triggers unlabelled", () => {
        expect(automaticSampleStateSuffix(undefined)).toBe("");
        expect(automaticSampleStateSuffix(null)).toBe("");
        expect(automaticSampleStateSuffix("")).toBe("");
        expect(automaticSampleStateSuffix("something_else")).toBe("");
        expect(automaticSampleStateSuffix(42)).toBe("");
    });
});
