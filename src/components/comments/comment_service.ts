/**
 * Comment Service - API calls for comment functionality
 */

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

export type MentionUser = {
    id: string;
    name: string;
    username?: string | null;
    email: string;
    avatar_url?: string | null;
};

/**
 * Search users for mentions by query
 */
export async function searchMentionUsers(query: string): Promise<MentionUser[]> {
    try {
        const response = await getJSON<{ users: MentionUser[] }>(
            `/v1/laboratory/users/search?q=${encodeURIComponent(query)}`
        );
        return response.users;
    } catch (err) {
        console.error("Error searching users:", err);
        return [];
    }
}
