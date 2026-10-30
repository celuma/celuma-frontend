/**
 * Typed client for the privileged laboratory-content cleanup (Céluma 1.4, issue #39).
 *
 *   GET  .../authorization                 convenience probe only; the backend re-checks every call
 *   POST .../preview                       read-only
 *   POST .../operations                    confirm + start (202)
 *   GET  .../operations, .../operations/{id}
 *   POST .../operations/{id}/retry | cancel
 *
 * Hiding the screen is not authorization: every route enforces that the caller is an active Superadministrator of this
 * laboratory (recorded at its initial registration) and that the tenant is their own.
 * The password is sent once in the confirmation body and is never stored, logged or kept in state longer
 * than the form.
 */
import { apiFetch } from "../lib/api_fetch";
import { parseFastApiDetail } from "../lib/api_error";
import type { CleanupConfirmation, CleanupOperation, CleanupPreview } from "../models/laboratory_cleanup";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

const root = (tenantId: string) => `${base}/v1/maintenance/tenants/${encodeURIComponent(tenantId)}/laboratory-cleanup`;

/** An API failure with the stable `code` the backend sent (Spanish `message` already). */
export class CleanupApiError extends Error {
    status: number;
    code: string | null;
    constructor(status: number, code: string | null, message: string) {
        super(message);
        this.name = "CleanupApiError";
        this.status = status;
        this.code = code;
    }
}

async function failure(res: Response): Promise<CleanupApiError> {
    const text = await res.text();
    let code: string | null = null;
    try {
        const parsed = JSON.parse(text) as { detail?: { code?: string } };
        if (parsed.detail && typeof parsed.detail === "object" && typeof parsed.detail.code === "string") code = parsed.detail.code;
    } catch {
        /* not JSON */
    }
    const message = parseFastApiDetail(text) ?? (res.status >= 500 ? "Error del servidor. Inténtalo de nuevo más tarde." : `Error inesperado (${res.status}).`);
    return new CleanupApiError(res.status, code, message);
}

async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw await failure(res);
    return (await res.json()) as T;
}

/** Never throws: any failure means "not authorized" for the purposes of showing the entry point. */
export async function getCleanupAuthorization(tenantId: string): Promise<boolean> {
    try {
        const res = await apiFetch(`${root(tenantId)}/authorization`);
        if (!res.ok) return false;
        const body = (await res.json()) as { authorized?: unknown };
        return body.authorized === true;
    } catch {
        return false;
    }
}

/** No options: the preview and the cleanup always cover the complete scope (billing and audit included). */
export async function previewCleanup(tenantId: string): Promise<CleanupPreview> {
    return json<CleanupPreview>(await apiFetch(`${root(tenantId)}/preview`, { method: "POST", body: JSON.stringify({}) }));
}

export async function startCleanup(tenantId: string, confirmation: CleanupConfirmation): Promise<CleanupOperation> {
    return json<CleanupOperation>(
        await apiFetch(`${root(tenantId)}/operations`, { method: "POST", body: JSON.stringify(confirmation) }),
    );
}

export async function listCleanupOperations(tenantId: string): Promise<CleanupOperation[]> {
    return json<CleanupOperation[]>(await apiFetch(`${root(tenantId)}/operations`));
}

export async function getCleanupOperation(tenantId: string, operationId: string): Promise<CleanupOperation> {
    return json<CleanupOperation>(await apiFetch(`${root(tenantId)}/operations/${encodeURIComponent(operationId)}`));
}

export async function retryCleanup(tenantId: string, operationId: string): Promise<CleanupOperation> {
    return json<CleanupOperation>(await apiFetch(`${root(tenantId)}/operations/${encodeURIComponent(operationId)}/retry`, { method: "POST" }));
}

export async function cancelCleanup(tenantId: string, operationId: string): Promise<CleanupOperation> {
    return json<CleanupOperation>(await apiFetch(`${root(tenantId)}/operations/${encodeURIComponent(operationId)}/cancel`, { method: "POST" }));
}
