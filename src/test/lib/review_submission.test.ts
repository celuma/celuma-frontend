/**
 * Céluma 1.5 (#65): what stands between a draft and "Enviar a revisión".
 *
 *   - The precheck mirrors the backend's submission rules the editor can see
 *     (saved draft, amendment note, unsaved letterhead, reviewers) and never
 *     blocks what the server might still accept (no reviewers: a laboratory
 *     default may be assigned on submission).
 *   - A refusal from `POST /reports/{id}/submit` becomes one blocker that names
 *     the affected section, in Spanish, and never carries the raw body.
 */
import { describe, expect, it } from "vitest";
import {
    REVIEW_SECTION_ACTION,
    reviewSubmissionPrecheck,
    reviewSubmissionRejection,
    type ReviewPrecheckInput,
} from "../../lib/review_submission";

const READY: ReviewPrecheckInput = {
    saved: true,
    amendmentOpen: false,
    storedChangeNote: null,
    editorChangeNote: "",
    letterheadUnsaved: false,
    reviewers: [{ name: "Dra. Revisora", eligible: true }],
};

const precheck = (over: Partial<ReviewPrecheckInput> = {}) => reviewSubmissionPrecheck({ ...READY, ...over });
const ids = (over: Partial<ReviewPrecheckInput> = {}) => precheck(over).map((b) => b.id);
const body = (detail: unknown) => JSON.stringify({ detail });

describe("reviewSubmissionPrecheck", () => {
    it("has nothing to say about a draft that meets every rule", () => {
        expect(precheck()).toEqual([]);
    });

    it("an unsaved report only asks to save (nothing else can be judged yet)", () => {
        const blockers = precheck({ saved: false, amendmentOpen: true, letterheadUnsaved: true, reviewers: [] });
        expect(blockers).toHaveLength(1);
        expect(blockers[0]).toMatchObject({ id: "report_not_saved", section: "save", severity: "blocker" });
    });

    it("an open amendment needs a STORED change note", () => {
        const [blocker] = precheck({ amendmentOpen: true, storedChangeNote: "   " });
        expect(blocker).toMatchObject({ id: "amendment_change_note_required", section: "amendment", severity: "blocker" });
        expect(blocker.detail).toContain("Escribe qué cambió");
    });

    it("a change note typed but not saved still blocks, and says to save it", () => {
        const [blocker] = precheck({ amendmentOpen: true, storedChangeNote: "", editorChangeNote: "Se agrega IHC." });
        expect(blocker.id).toBe("amendment_change_note_required");
        expect(blocker.detail).toContain("aún no se ha guardado");
    });

    it("a stored change note satisfies the amendment rule", () => {
        expect(ids({ amendmentOpen: true, storedChangeNote: "Se agrega IHC." })).toEqual([]);
    });

    it("no amendment means no change note is required", () => {
        expect(ids({ amendmentOpen: false, storedChangeNote: "" })).toEqual([]);
    });

    it("an unsaved letterhead change blocks (submission freezes the stored one)", () => {
        expect(precheck({ letterheadUnsaved: true })[0]).toMatchObject({
            id: "letterhead_unsaved", section: "letterhead", severity: "blocker",
        });
    });

    it("no assigned reviewers is only a warning: the server may assign the laboratory default", () => {
        for (const reviewers of [[], undefined]) {
            const [blocker] = precheck({ reviewers });
            expect(blocker).toMatchObject({ id: "reviewers_missing", section: "reviewers", severity: "warning" });
        }
    });

    it("assigned reviewers that none can act block, like the backend's reviewers_unavailable", () => {
        const [blocker] = precheck({ reviewers: [{ name: "A", eligible: false }, { name: "B", eligible: false }] });
        expect(blocker).toMatchObject({ id: "reviewers_unavailable", section: "reviewers", severity: "blocker" });
    });

    it("one eligible reviewer is enough; an unknown eligibility counts as eligible", () => {
        expect(ids({ reviewers: [{ name: "A", eligible: false }, { name: "B", eligible: true }] })).toEqual([]);
        expect(ids({ reviewers: [{ name: "A", eligible: null }] })).toEqual([]);
        expect(ids({ reviewers: [{ name: "A" }] })).toEqual([]);
    });

    it("lists every unmet rule at once, in section order", () => {
        expect(ids({
            amendmentOpen: true, storedChangeNote: "", letterheadUnsaved: true, reviewers: [{ name: "A", eligible: false }],
        })).toEqual(["amendment_change_note_required", "letterhead_unsaved", "reviewers_unavailable"]);
    });
});

describe("reviewSubmissionRejection", () => {
    it("keeps the server's specific Spanish message for a known code", () => {
        const message = "Los códigos de muestra de la orden cambiaron desde el último guardado (M-1 → M-2). Guarda el reporte y vuelve a enviarlo a revisión.";
        const blocker = reviewSubmissionRejection(409, body({ code: "report_sample_codes_stale", message }));
        expect(blocker).toMatchObject({ id: "report_sample_codes_stale", section: "samples", severity: "blocker" });
        expect(blocker.title).toBe("Los códigos de muestra cambiaron");
        expect(blocker.detail).toBe(message);
    });

    it.each([
        ["report_sample_images_stale", "images"],
        ["amendment_change_note_required", "amendment"],
        ["reviewers_unavailable", "reviewers"],
        ["legacy_report_authoring_retired", "format"],
    ])("maps %s to the %s section", (code, section) => {
        expect(reviewSubmissionRejection(409, body({ code, message: "Mensaje del servidor en español." }))).toMatchObject({
            id: code, section,
        });
    });

    it("falls back to its own Spanish text when a known code comes with an English message", () => {
        const blocker = reviewSubmissionRejection(409, body({ code: "report_sample_images_stale", message: "Images were removed" }));
        expect(blocker.detail).toContain("imágenes que ya no están en la orden");
    });

    it("translates the English 'no reviewers' refusal to the reviewers section", () => {
        const blocker = reviewSubmissionRejection(400, body("Cannot submit report for review without reviewers assigned"));
        expect(blocker).toMatchObject({ id: "reviewers_missing", section: "reviewers", severity: "blocker" });
        expect(blocker.detail).toMatch(/revisor asignado/);
    });

    it("a report that is no longer a draft offers a reload and names its state in Spanish", () => {
        const blocker = reviewSubmissionRejection(400, body("Cannot submit report in ReportStatus.IN_REVIEW status"));
        expect(blocker).toMatchObject({ id: "report_status_changed", section: "status" });
        expect(blocker.detail).toContain("en revisión");
        expect(blocker.detail).not.toMatch(/IN_REVIEW|ReportStatus/);
        expect(reviewSubmissionRejection(400, body("Cannot submit report in PUBLISHED status")).detail).toContain("publicado");
    });

    it("routes the backend's Spanish letterhead refusals to the letterhead section", () => {
        const message = "Este reporte no tiene un membrete aplicado, así que no puede enviarse a revisión. Vuelve al borrador y selecciona un membrete.";
        expect(reviewSubmissionRejection(409, body(message))).toMatchObject({
            id: "letterhead_invalid", section: "letterhead", detail: message,
        });
    });

    it("a 403 says the user may not submit, without the permission code", () => {
        const blocker = reviewSubmissionRejection(403, body("Permission required: reports:submit"));
        expect(blocker).toMatchObject({ id: "permission_denied", section: "permission" });
        expect(blocker.detail).not.toContain("reports:submit");
    });

    it("an unknown refusal is still Spanish and never the raw body", () => {
        const blocker = reviewSubmissionRejection(500, "<html><body>Internal Server Error</body></html>");
        expect(blocker).toMatchObject({ section: "general", title: "No se pudo enviar a revisión" });
        expect(blocker.detail).toBe("Error del servidor. Inténtalo de nuevo más tarde.");

        const english = reviewSubmissionRejection(422, body([{ msg: "Field required", loc: ["body", "changelog"] }]));
        expect(english.detail).not.toMatch(/Field|required|\{/);
    });
});

describe("REVIEW_SECTION_ACTION", () => {
    it("offers a way to the section only where the user can act on it", () => {
        expect(REVIEW_SECTION_ACTION.amendment).toBe("Ir a la nota de enmienda");
        expect(REVIEW_SECTION_ACTION.reviewers).toBe("Ir a la orden");
        expect(REVIEW_SECTION_ACTION.status).toBe("Recargar");
        expect(REVIEW_SECTION_ACTION.permission).toBeNull();
        expect(REVIEW_SECTION_ACTION.format).toBeNull();
        expect(REVIEW_SECTION_ACTION.general).toBeNull();
    });
});
