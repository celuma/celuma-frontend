/**
 * Thin fetch wrapper that:
 *  - injects the Authorization header from stored token,
 *  - detects 401 responses and triggers session-expiry redirect, and
 *  - re-exports a typed helper so callers don't have to handle token lookup.
 *
 * Migrate fetch calls here incrementally; every new page/hook should use
 * apiFetch instead of raw fetch.
 */
import { getStoredToken, redirectToLoginForExpiredSession } from "./auth_session";

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const token = getStoredToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string>),
    };
    // The stored token already includes the scheme ("bearer <value>")
    if (token) headers["Authorization"] = token;

    const response = await fetch(input, { ...init, headers });

    if (response.status === 401) {
        redirectToLoginForExpiredSession();
        // Throw so the caller's .then/.catch chain stops cleanly.
        throw new Error("Session expired");
    }

    return response;
}

export async function apiGet<T>(url: string): Promise<T> {
    const res = await apiFetch(url);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
}
