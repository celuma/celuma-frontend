/**
 * Signature Service - Manages the authenticated user's digital signature PNG.
 *
 * Wraps the three /v1/users/me/signature endpoints implemented in T2 of the
 * digital-signature epic. Reviewer-only endpoints; the backend enforces the
 * RBAC check.
 */

export interface SignatureResponse {
    url: string;
    has_signature: boolean;
}

/** Shared Spanish copy for the "user has no signature uploaded yet" UX. */
export const NO_SIGNATURE_TITLE = "Aún no tienes firma digital";
export const NO_SIGNATURE_DESCRIPTION =
    "Sube un archivo PNG (máx. 2 MB) en la sección de Firma Digital de tu perfil para poder firmar informes que la requieran.";

/** Sentinel message used when the backend reply isn't valid JSON. */
export const SIGNATURE_HTML_RESPONSE_MESSAGE =
    "El servidor devolvió una respuesta inválida al consultar la firma digital. " +
    "Es posible que el backend no esté desplegado o que la ruta /api no esté bien configurada.";

/**
 * Identifies whether an error thrown by `getSignature` represents the
 * "user has no signature uploaded yet" case rather than a real failure.
 *
 * Mainly useful as a defensive fallback if the backend ever signals the
 * absence with a non-404 status containing a known error message — today
 * `getSignature` already returns `null` for 404, so the helper is rarely
 * needed in happy paths.
 */
export function isSignatureMissingError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes("no signature") || msg.includes("signature object not found");
}

/**
 * True when the error indicates the API returned HTML (typically the SPA's
 * index.html because the request never reached FastAPI). Callers in the
 * "check signature" flow can degrade gracefully to the "no signature" UX
 * while infra is fixed, instead of surfacing the cryptic browser message.
 */
export function isSignatureHtmlResponseError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return err.message === SIGNATURE_HTML_RESPONSE_MESSAGE;
}

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = getAuthToken();
    const headers: Record<string, string> = { ...extra };
    if (token) headers["Authorization"] = token;
    return headers;
}

/**
 * Heuristic: body text that starts with `<` is almost certainly HTML
 * (an SPA index.html, an ALB/CloudFront error page, etc.) and not the
 * JSON the API is supposed to return.
 */
function looksLikeHtml(text: string): boolean {
    return text.trimStart().startsWith("<");
}

function parseSignatureJson(text: string): SignatureResponse | null {
    try {
        return JSON.parse(text) as SignatureResponse;
    } catch {
        return null;
    }
}

function buildErrorMessage(res: Response, text: string): string {
    if (looksLikeHtml(text)) return SIGNATURE_HTML_RESPONSE_MESSAGE;
    try {
        const json = JSON.parse(text) as { detail?: unknown; message?: string };
        if (typeof json.detail === "string") return json.detail;
        if (Array.isArray(json.detail)) {
            return json.detail
                .map((e: { msg?: string }) => e.msg ?? "")
                .filter(Boolean)
                .join("; ");
        }
        if (typeof json.message === "string") return json.message;
    } catch {
        /* fallthrough to raw text */
    }
    return text || `${res.status} ${res.statusText}`;
}

/** Upload (or replace) the current user's signature PNG. */
export async function uploadSignature(file: File): Promise<SignatureResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${getApiBase()}/v1/users/me/signature`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
    });

    const text = await res.text();
    if (!res.ok) throw new Error(buildErrorMessage(res, text));
    if (looksLikeHtml(text)) throw new Error(SIGNATURE_HTML_RESPONSE_MESSAGE);

    const parsed = parseSignatureJson(text);
    if (!parsed) throw new Error(SIGNATURE_HTML_RESPONSE_MESSAGE);
    return parsed;
}

/**
 * Fetch the URL for the current user's signature.
 *
 * Returns `null` when:
 *   - the backend explicitly reports 404 (no signature uploaded), or
 *   - the API responds with HTML (the SPA's index.html), which in practice
 *     means the request never reached FastAPI. Treating this as "no
 *     signature" keeps the warning UX usable while infra is fixed, instead
 *     of showing the browser's cryptic JSON parsing error.
 *
 * Throws on any other unexpected error.
 */
export async function getSignature(): Promise<SignatureResponse | null> {
    const res = await fetch(`${getApiBase()}/v1/users/me/signature`, {
        method: "GET",
        headers: authHeaders({ accept: "application/json" }),
    });

    if (res.status === 404) return null;

    const text = await res.text();

    if (!res.ok) throw new Error(buildErrorMessage(res, text));

    if (looksLikeHtml(text)) {
        if (import.meta.env.DEV) {
            console.warn(
                "[signature_service] GET /me/signature returned HTML instead of JSON; " +
                "check that /api/* is proxied to FastAPI and the backend is deployed.",
            );
        }
        return null;
    }

    const parsed = parseSignatureJson(text);
    if (!parsed) return null;
    return parsed;
}

/** Delete the current user's signature from storage. */
export async function deleteSignature(): Promise<void> {
    const res = await fetch(`${getApiBase()}/v1/users/me/signature`, {
        method: "DELETE",
        headers: authHeaders(),
    });

    if (res.status === 204) return;
    if (!res.ok) {
        const text = await res.text();
        throw new Error(buildErrorMessage(res, text));
    }
}
