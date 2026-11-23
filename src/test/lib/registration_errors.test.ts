import { describe, expect, it } from "vitest";
import { registrationProblem } from "../../lib/registration_errors";

const known = (field: string) => /^(branch_id|patient_id|requesting_physician_ids|study_type_id|report_template_id|samples\.\d+\.(sample_type_id|received_date|collected_date|sample_code|notes))$/.test(field);

describe("registration errors → fields and rows (Céluma 1.5, #67)", () => {
    it("maps request-validation locations to form fields and sample rows", () => {
        const problem = registrationProblem(422, {
            detail: [
                { loc: ["body", "samples", 1, "received_at"], msg: "Value error, received_at is required" },
                { loc: ["body", "samples", 2, "collected_at"], msg: "Input should be a valid datetime" },
                { loc: ["body", "tenant_id"], msg: "Field required" },
            ],
        }, known);
        expect(problem.fields).toEqual([
            { field: "samples.1.received_date", row: 1, message: expect.stringContaining("fecha de recepción") },
            { field: "samples.2.collected_date", row: 2, message: expect.stringContaining("fecha de recolección") },
        ]);
        expect(problem.summary).toContain("(muestras 2, 3)");
    });

    it("maps the API's field pointers with a message per code", () => {
        const problem = registrationProblem(400, {
            detail: { code: "sample_type_inactive", message: "Sample type 'OFF' is inactive", fields: ["samples.0.sample_type_id", "samples.3.sample_type_id"] },
        }, known);
        expect(problem.fields.map((f) => [f.field, f.row])).toEqual([["samples.0.sample_type_id", 0], ["samples.3.sample_type_id", 3]]);
        expect(problem.fields[0].message).toBe("Este tipo de muestra fue desactivado. Elija otro.");
        expect(problem.summary).toBe("No se registró nada. Corrija los campos marcados (muestras 1, 4); los demás datos se conservaron.");
    });

    it("order-level pointers have no row", () => {
        const problem = registrationProblem(400, {
            detail: { code: "patient_or_physician_required", message: "x", fields: ["patient_id", "requesting_physician_ids"] },
        }, known);
        expect(problem.fields.every((f) => f.row === undefined)).toBe(true);
        expect(problem.summary).toBe("No se registró nada. Corrija los campos marcados; los demás datos se conservaron.");
    });

    it("an error that names no known field stays in the summary", () => {
        const problem = registrationProblem(403, { detail: "Cannot create orders for a different tenant" }, known);
        expect(problem.fields).toEqual([]);
        expect(problem.summary).toContain("No tienes permiso");
        expect(problem.summary).toContain("se conservaron");
    });
});
