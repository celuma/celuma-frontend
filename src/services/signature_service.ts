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

async function readErrorMessage(res: Response): Promise<string> {
    const text = await res.text();
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

    if (!res.ok) {
        throw new Error(await readErrorMessage(res));
    }
    return (await res.json()) as SignatureResponse;
}

/**
 * Fetch a presigned URL for the current user's signature.
 *
 * Returns `null` if the user does not have a signature uploaded (404).
 * Throws on any other error.
 */
export async function getSignature(): Promise<SignatureResponse | null> {
    const res = await fetch(`${getApiBase()}/v1/users/me/signature`, {
        method: "GET",
        headers: authHeaders({ accept: "application/json" }),
    });

    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(await readErrorMessage(res));
    }
    return (await res.json()) as SignatureResponse;
}

/** Delete the current user's signature from storage. */
export async function deleteSignature(): Promise<void> {
    const res = await fetch(`${getApiBase()}/v1/users/me/signature`, {
        method: "DELETE",
        headers: authHeaders(),
    });

    if (!res.ok && res.status !== 204) {
        throw new Error(await readErrorMessage(res));
    }
}
