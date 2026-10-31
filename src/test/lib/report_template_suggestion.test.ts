import { describe, expect, it } from "vitest";
import { suggestReportTemplate } from "../../lib/report_template_suggestion";

const BIO = { id: "t-bio", name: "Biopsia" };
const CIT = { id: "t-cit", name: "Citología" };
const EST = { id: "t-est", name: "Estudio" };

const TYPES = [
    { id: "st-bx", default_template: BIO },
    { id: "st-bx2", default_template: BIO },
    { id: "st-ct", default_template: CIT },
    { id: "st-none", default_template: null },
];
const STUDY = { id: "study", default_template: EST };

describe("suggestReportTemplate (mirror of app/services/order_report_template.py defaults)", () => {
    it("uses the sample types' template when the samples agree, over the study type's", () => {
        expect(suggestReportTemplate(["st-bx", "st-bx2", "st-none"], TYPES, STUDY)).toEqual({
            status: "RESOLVED", template: BIO, source: "SAMPLE_TYPE", candidates: [],
        });
    });

    it("is AMBIGUOUS when the samples disagree, listing candidates by name — never by sample order", () => {
        const result = suggestReportTemplate(["st-ct", "st-bx"], TYPES, STUDY);
        expect(result.status).toBe("AMBIGUOUS");
        expect(result.template).toBeNull();
        expect(result.candidates).toEqual([BIO, CIT]);
        // The study type does not settle the disagreement.
        expect(result.source).toBeNull();
    });

    it("falls back to the study type, then to nothing", () => {
        expect(suggestReportTemplate(["st-none", ""], TYPES, STUDY)).toMatchObject({ template: EST, source: "STUDY_TYPE" });
        expect(suggestReportTemplate(["st-none"], TYPES, { id: "s", default_template: null })).toEqual({
            status: "NONE", template: null, source: null, candidates: [],
        });
        expect(suggestReportTemplate([], TYPES, undefined).status).toBe("NONE");
    });

    it("ignores defaults outside the active catalog, like the API does with deactivated templates", () => {
        const active = new Set(["t-cit", "t-est"]);
        expect(suggestReportTemplate(["st-bx", "st-ct"], TYPES, STUDY, active)).toMatchObject({
            status: "RESOLVED", template: CIT, source: "SAMPLE_TYPE",
        });
        expect(suggestReportTemplate(["st-bx"], TYPES, STUDY, active)).toMatchObject({ template: EST, source: "STUDY_TYPE" });
        // Unknown catalog (no `reports:read`): the defaults are shown as they are.
        expect(suggestReportTemplate(["st-bx"], TYPES, STUDY, null).template).toEqual(BIO);
    });
});
