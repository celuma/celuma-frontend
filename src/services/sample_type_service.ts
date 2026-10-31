/**
 * Typed client for the sample-type catalog and the catalog JSON transfer
 * endpoints (Céluma 1.4, issue #17).
 *
 *   GET    /v1/sample-types/                         (lab:read)
 *   POST   /v1/sample-types/ · PUT/DELETE /{id}      (admin:manage_catalog)
 *   GET    /v1/sample-types/export · /v1/study-types/export
 *   POST   /v1/sample-types/import/{preview,confirm}
 *   POST   /v1/sample-types/copy-from-study-types/{preview,confirm}
 *
 * Nothing here takes a tenant: the API scopes every call to the caller's own.
 */
import { apiFetch } from "../lib/api_fetch";
import { formatHttpError } from "../lib/api_error";
import type {
    CatalogKind,
    ConflictPolicy,
    SampleType,
    SampleTypesListResponse,
    TransferPreview,
    TransferResult,
} from "../models/sample_type";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";
const SAMPLE_TYPES = `${base}/v1/sample-types`;
const STUDY_TYPES = `${base}/v1/study-types`;

/** A failed catalog call, keeping the structured detail the transfer endpoints return. */
export class CatalogApiError extends Error {
    readonly status: number;
    /** Stable machine code from `detail.code` (e.g. "preview_stale", "conflicts"), if any. */
    readonly code?: string;
    /** The fresh preview a 409 carries, so the UI can show what changed. */
    readonly preview?: TransferPreview;

    constructor(message: string, status: number, code?: string, preview?: TransferPreview) {
        super(message);
        this.name = "CatalogApiError";
        this.status = status;
        this.code = code;
        this.preview = preview;
    }
}

async function failure(res: Response): Promise<CatalogApiError> {
    const text = await res.text();
    try {
        const detail = (JSON.parse(text) as { detail?: unknown }).detail;
        if (detail && typeof detail === "object" && !Array.isArray(detail)) {
            const d = detail as { code?: string; message?: string; preview?: TransferPreview };
            return new CatalogApiError(d.message ?? formatHttpError(res.status, text), res.status, d.code, d.preview);
        }
    } catch {
        /* not JSON */
    }
    return new CatalogApiError(formatHttpError(res.status, text), res.status);
}

async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw await failure(res);
    return (await res.json()) as T;
}

export async function listSampleTypes(activeOnly = true): Promise<SampleType[]> {
    const res = await apiFetch(`${SAMPLE_TYPES}/?active_only=${activeOnly}`);
    return (await json<SampleTypesListResponse>(res)).sample_types ?? [];
}

export interface SampleTypeInput {
    code: string;
    name: string;
    /** Omitted = unchanged; `null` (or blank) clears the stored description. */
    description?: string | null;
    is_active?: boolean;
    /** Céluma 1.4.1. Omitted = unchanged; `null` (or blank) clears the link. */
    default_report_template_id?: string | null;
}

export async function createSampleType(input: SampleTypeInput): Promise<SampleType> {
    return json<SampleType>(await apiFetch(`${SAMPLE_TYPES}/`, { method: "POST", body: JSON.stringify(input) }));
}

export async function updateSampleType(id: string, input: Partial<SampleTypeInput>): Promise<SampleType> {
    return json<SampleType>(await apiFetch(`${SAMPLE_TYPES}/${id}`, { method: "PUT", body: JSON.stringify(input) }));
}

export async function deactivateSampleType(id: string): Promise<void> {
    const res = await apiFetch(`${SAMPLE_TYPES}/${id}`, { method: "DELETE" });
    if (!res.ok) throw await failure(res);
}

/** The export file the API produced, ready to be saved. */
export interface CatalogDownload {
    filename: string;
    blob: Blob;
}

export async function exportCatalog(kind: CatalogKind): Promise<CatalogDownload> {
    const root = kind === "study_types" ? STUDY_TYPES : SAMPLE_TYPES;
    const res = await apiFetch(`${root}/export`);
    if (!res.ok) throw await failure(res);
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const fallback = `celuma-${kind.replace("_", "-")}-export.json`;
    return { filename: match?.[1] ?? fallback, blob: await res.blob() };
}

/** Save a download through the browser. */
export function saveDownload({ filename, blob }: CatalogDownload): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** Upper bound the API enforces on an import body; checked here to fail early. */
export const MAX_IMPORT_BYTES = 1024 * 1024;

export async function previewImport(document: Record<string, unknown>): Promise<TransferPreview> {
    return json<TransferPreview>(
        await apiFetch(`${SAMPLE_TYPES}/import/preview`, { method: "POST", body: JSON.stringify({ document }) }),
    );
}

export async function confirmImport(args: {
    document: Record<string, unknown>;
    selectedIndexes: number[];
    onConflict: ConflictPolicy;
    planDigest: string;
}): Promise<TransferResult> {
    return json<TransferResult>(
        await apiFetch(`${SAMPLE_TYPES}/import/confirm`, {
            method: "POST",
            body: JSON.stringify({
                document: args.document,
                selected_indexes: args.selectedIndexes,
                on_conflict: args.onConflict,
                plan_digest: args.planDigest,
            }),
        }),
    );
}

export async function previewCopy(studyTypeIds: string[]): Promise<TransferPreview> {
    return json<TransferPreview>(
        await apiFetch(`${SAMPLE_TYPES}/copy-from-study-types/preview`, {
            method: "POST",
            body: JSON.stringify({ study_type_ids: studyTypeIds }),
        }),
    );
}

export async function confirmCopy(args: {
    studyTypeIds: string[];
    onConflict: ConflictPolicy;
    planDigest: string;
}): Promise<TransferResult> {
    return json<TransferResult>(
        await apiFetch(`${SAMPLE_TYPES}/copy-from-study-types/confirm`, {
            method: "POST",
            body: JSON.stringify({
                study_type_ids: args.studyTypeIds,
                on_conflict: args.onConflict,
                plan_digest: args.planDigest,
            }),
        }),
    );
}

/** Parse an uploaded export file; throws a Spanish message for anything that is not a JSON object. */
export async function readExportFile(file: File): Promise<Record<string, unknown>> {
    if (file.size > MAX_IMPORT_BYTES) {
        throw new Error("El archivo supera el límite de 1 MB.");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        throw new Error("El archivo no es un JSON válido.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("El archivo debe contener un objeto JSON exportado desde Céluma.");
    }
    return parsed as Record<string, unknown>;
}
