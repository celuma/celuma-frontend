/**
 * Céluma 1.5 (#65): the per-record issues and warnings of a catalog import/copy preview
 * are shown in Spanish from their code. The English messages here are the ones
 * `app/services/catalog_transfer.py` writes.
 */
import { describe, expect, it } from "vitest";
import { GENERIC_TRANSFER_ISSUE, transferIssueMessage } from "../../lib/catalog_transfer_messages";

describe("transferIssueMessage", () => {
    it.each([
        [{ code: "required", message: "code is required", field: "code" }, "El código es obligatorio."],
        [{ code: "required", message: "name cannot be empty", field: "name" }, "El nombre es obligatorio."],
        [{ code: "invalid_type", message: "is_active must be a boolean", field: "is_active" }, "El campo «activo» tiene un tipo de dato no válido."],
        [{ code: "invalid_characters", message: "description contains control characters", field: "description" }, "La descripción contiene caracteres de control."],
        [{ code: "too_long", message: "name cannot exceed 255 characters", field: "name" }, "El nombre supera el máximo de 255 caracteres."],
        [{ code: "invalid_item", message: "Item must be an object" }, "El registro no es un objeto válido."],
        [{ code: "unknown_field_ignored", message: "Ignored fields: color, size" }, "Se ignoraron campos desconocidos: color, size."],
        [{ code: "provenance_ignored", message: "provenance.source_id is not a short string; ignored" },
            "Se ignoró el identificador de procedencia porque no es un texto corto."],
        [{ code: "template_reference_dropped", message: "The report-template reference does not match a template of this laboratory; the sample type is created without one" },
            "La plantilla de reporte referida no existe en este laboratorio; el tipo de muestra se crea sin plantilla."],
        [{ code: "duplicate_in_source", message: "Code 'BIO' appears earlier in the source", field: "code" }, "El código «BIO» aparece antes en el archivo."],
        [{ code: "code_exists", message: "A sample type with code 'BIO' already exists", field: "code" }, "Ya existe un tipo de muestra con el código «BIO»."],
        [{ code: "code_exists", message: "A sample type with code 'BIO' already exists (inactive)", field: "code" },
            "Ya existe un tipo de muestra con el código «BIO» (inactivo)."],
        [{ code: "name_exists", message: "A sample type with this name already exists", field: "name" }, "Ya existe un tipo de muestra con este nombre."],
        [{ code: "source_inactive", message: "The study type is inactive; the sample type is created inactive too" },
            "El tipo de estudio está inactivo; el tipo de muestra también se crea inactivo."],
    ])("%o", (issue, spanish) => {
        expect(transferIssueMessage(issue)).toBe(spanish);
    });

    it("reads the field from the English message when the issue carries none", () => {
        expect(transferIssueMessage({ code: "required", message: "code is required" })).toBe("El código es obligatorio.");
        expect(transferIssueMessage({ code: "required", message: "weird is required" })).toBe("Un campo es obligatorio.");
    });

    it("keeps a Spanish message of an unknown code and never shows an English one", () => {
        expect(transferIssueMessage({ code: "nuevo", message: "Revisa la descripción del registro." })).toBe("Revisa la descripción del registro.");
        expect(transferIssueMessage({ code: "new_issue", message: "Something is wrong with this record" })).toBe(GENERIC_TRANSFER_ISSUE);
    });
});
