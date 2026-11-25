/**
 * Céluma 1.5 (#65): what stands between a draft and "Enviar a revisión".
 *
 * Two sources, one shape:
 *  - `reviewSubmissionPrecheck` mirrors the rules the backend applies in
 *    `POST /v1/reports/{id}/submit` that the editor can evaluate with the data
 *    it already has (saved draft, amendment note, letterhead change, assigned
 *    reviewers). It only explains; the backend stays authoritative.
 *  - `reviewSubmissionRejection` reads a refused submission (status + body)
 *    and says which section is affected and what to do, in Spanish.
 *
 * Each blocker names the editor section it belongs to so the UI can take the
 * user there (scroll + focus) or route them to the order when the fix lives
 * outside the report (reviewer assignment).
 */
import { formatHttpError, parseFastApiCode, parseFastApiDetail, looksSpanish } from "./api_error";

export type ReviewBlockerSection =
    | "save"
    | "amendment"
    | "letterhead"
    | "reviewers"
    | "samples"
    | "images"
    | "status"
    | "format"
    | "permission"
    | "general";

export interface ReviewBlocker {
    /** Stable id (backend code when there is one) — also the React key. */
    id: string;
    section: ReviewBlockerSection;
    /** Short title shown in bold. */
    title: string;
    /** What happened and how to fix it. */
    detail: string;
    /**
     * "blocker" stops the submission before it is sent; "warning" is shown
     * but lets the server decide (e.g. no reviewers: a laboratory default may
     * still be assigned on submission).
     */
    severity: "blocker" | "warning";
}

/** Human label of each section, used for the "Ir a…" action. */
export const REVIEW_SECTION_ACTION: Record<ReviewBlockerSection, string | null> = {
    save: "Ir a Guardar",
    amendment: "Ir a la nota de enmienda",
    letterhead: "Ir al membrete",
    reviewers: "Ir a la orden",
    samples: "Ir a Guardar",
    images: "Ir a Guardar",
    status: "Recargar",
    format: null,
    permission: null,
    general: null,
};

export interface ReviewPrecheckInput {
    /** The report has been saved at least once. */
    saved: boolean;
    /** An amendment is open on this report. */
    amendmentOpen: boolean;
    /** Change note as stored on the server (what the submission will read). */
    storedChangeNote: string | null | undefined;
    /** Change note currently typed in the editor. */
    editorChangeNote: string;
    /** A letterhead was picked in the editor but not saved yet. */
    letterheadUnsaved: boolean;
    /** Reviewers assigned to the order (`eligible === false` means they cannot act). */
    reviewers: Array<{ name: string; eligible?: boolean | null }> | undefined;
}

/** Client-side mirror of the backend's submission rules (explanatory only). */
export function reviewSubmissionPrecheck(input: ReviewPrecheckInput): ReviewBlocker[] {
    const blockers: ReviewBlocker[] = [];

    if (!input.saved) {
        blockers.push({
            id: "report_not_saved",
            section: "save",
            severity: "blocker",
            title: "Guarda el reporte",
            detail: "El reporte aún no se ha guardado. Guárdalo antes de enviarlo a revisión.",
        });
        return blockers;
    }

    if (input.amendmentOpen && !(input.storedChangeNote ?? "").trim()) {
        const typed = input.editorChangeNote.trim().length > 0;
        blockers.push({
            id: "amendment_change_note_required",
            section: "amendment",
            severity: "blocker",
            title: "Falta la nota de enmienda",
            detail: typed
                ? "Escribiste la nota de enmienda, pero aún no se ha guardado. Guarda el reporte para registrarla."
                : "Escribe qué cambió respecto de la emisión firmada y por qué, y guarda el reporte.",
        });
    }

    if (input.letterheadUnsaved) {
        blockers.push({
            id: "letterhead_unsaved",
            section: "letterhead",
            severity: "blocker",
            title: "El membrete seleccionado no se ha guardado",
            detail: "Al enviar a revisión se congela el membrete guardado. Guarda el reporte para aplicar el que elegiste.",
        });
    }

    const reviewers = input.reviewers ?? [];
    if (reviewers.length === 0) {
        blockers.push({
            id: "reviewers_missing",
            section: "reviewers",
            severity: "warning",
            title: "La orden no tiene revisores asignados",
            detail: "Si el laboratorio tiene un revisor predeterminado, se asignará al enviar. Si no, asigna un revisor desde la orden.",
        });
    } else if (!reviewers.some((r) => r.eligible !== false)) {
        blockers.push({
            id: "reviewers_unavailable",
            section: "reviewers",
            severity: "blocker",
            title: "Ningún revisor asignado puede revisar",
            detail: "Los revisores asignados ya no tienen el rol de revisor o están inactivos. Asigna a la orden un revisor activo del laboratorio.",
        });
    }

    return blockers;
}

/** Known refusal codes of `POST /reports/{id}/submit`. */
const CODE_BLOCKERS: Record<string, Omit<ReviewBlocker, "id" | "severity">> = {
    amendment_change_note_required: {
        section: "amendment",
        title: "Falta la nota de enmienda",
        detail: "Escribe y guarda la nota de enmienda (qué cambió y por qué) antes de enviar a revisión.",
    },
    report_sample_codes_stale: {
        section: "samples",
        title: "Los códigos de muestra cambiaron",
        detail: "La orden tiene códigos de muestra nuevos desde el último guardado. Guarda el reporte y vuelve a enviarlo a revisión.",
    },
    report_sample_images_stale: {
        section: "images",
        title: "Se retiraron imágenes de la orden",
        detail: "El reporte contiene imágenes que ya no están en la orden. Guarda el borrador para aplicar el cambio y vuelve a enviarlo.",
    },
    reviewers_unavailable: {
        section: "reviewers",
        title: "Ningún revisor asignado puede revisar",
        detail: "Asigna a la orden un revisor activo del laboratorio y vuelve a enviar. Un administrador no puede aprobar ni firmar como revisor.",
    },
    legacy_report_authoring_retired: {
        section: "format",
        title: "Formato anterior",
        detail: "Este reporte se creó con el formato anterior, que ya no admite envío a revisión. Contacta al administrador de tu laboratorio o al soporte de Céluma.",
    },
};

const STATUS_ES: Record<string, string> = {
    IN_REVIEW: "en revisión",
    APPROVED: "aprobado",
    PUBLISHED: "publicado",
    RETRACTED: "retractado",
};

/**
 * The blocker for a refused submission. `bodyText` is the raw response body.
 * Unknown refusals still produce a Spanish, section-less blocker — never the
 * raw body.
 */
export function reviewSubmissionRejection(status: number, bodyText: string): ReviewBlocker {
    const code = parseFastApiCode(bodyText);
    const rawDetail = parseFastApiDetail(bodyText) ?? "";

    if (code && CODE_BLOCKERS[code]) {
        const known = CODE_BLOCKERS[code];
        // The server's Spanish message is more specific (e.g. names the codes that changed).
        const detail = rawDetail && looksSpanish(rawDetail) ? rawDetail : known.detail;
        return { id: code, severity: "blocker", ...known, detail };
    }

    if (/without reviewers assigned/i.test(rawDetail)) {
        return {
            id: "reviewers_missing",
            section: "reviewers",
            severity: "blocker",
            title: "La orden no tiene revisores asignados",
            detail: "No es posible enviar el reporte a revisión sin un revisor asignado. Asigna uno desde la orden y vuelve a enviar.",
        };
    }

    const statusMatch = rawDetail.match(/^Cannot submit report in (?:ReportStatus\.)?(\w+) status/i);
    if (statusMatch) {
        const state = STATUS_ES[statusMatch[1].toUpperCase()];
        return {
            id: "report_status_changed",
            section: "status",
            severity: "blocker",
            title: "El reporte cambió de estado",
            detail: state
                ? `El reporte ya está ${state}, así que no puede enviarse de nuevo. Recarga la página para ver su estado actual.`
                : "El reporte ya no está en borrador. Recarga la página para ver su estado actual.",
        };
    }

    if (/membrete/i.test(rawDetail)) {
        return {
            id: "letterhead_invalid",
            section: "letterhead",
            severity: "blocker",
            title: "Revisa el membrete",
            detail: looksSpanish(rawDetail) ? rawDetail : "Selecciona un membrete válido y guarda el reporte antes de enviarlo a revisión.",
        };
    }

    if (status === 403) {
        return {
            id: "permission_denied",
            section: "permission",
            severity: "blocker",
            title: "Sin permiso",
            detail: "No tienes permiso para enviar reportes a revisión.",
        };
    }

    return {
        id: `submit_rejected_${status}`,
        section: "general",
        severity: "blocker",
        title: "No se pudo enviar a revisión",
        detail: formatHttpError(status, bodyText),
    };
}
