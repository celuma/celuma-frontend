/**
 * Centralised auth-session helpers.
 * Keeps token storage and session-expiry logic in one place so that
 * every fetch wrapper and hook can share the same behaviour.
 */

export const AUTH_TOKEN_KEY = "auth_token";

export function getStoredToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearStoredAuth(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * Fire-and-forget redirect to /login with a "session expired" flag.
 * Uses window.location so it works outside the React tree (e.g. in service
 * modules).  The ?reason query param is consumed by the Login page to show
 * the appropriate alert.
 */
export function redirectToLoginForExpiredSession(): void {
    clearStoredAuth();
    // Preserve the current path so login can show it in the alert.
    const from = window.location.pathname;
    window.location.assign(`/login?reason=session_expired&from=${encodeURIComponent(from)}`);
}
