import { useState, useEffect } from "react";
import { hasPermission as _hasPermission, PERMS } from "../lib/rbac";
import { getStoredToken, clearStoredAuth } from "../lib/auth_session";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

export type AuthStatus = "loading" | "unauthenticated" | "authenticated" | "error";

export interface UserProfile {
    id: string;
    email: string;
    username?: string;
    full_name: string;
    /** Array of role codes, e.g. ["admin", "superuser"] */
    roles: string[];
    /** Array of atomic permission codes, e.g. ["admin:manage_users", "lab:read"] */
    permissions: string[];
    tenant_id: string;
    branch_ids: string[];
    avatar_url?: string;
}

export function useUserProfile() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
    const [sessionExpired, setSessionExpired] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            const token = getStoredToken();
            if (!token) {
                setAuthStatus("unauthenticated");
                return;
            }

            try {
                const res = await fetch(`${getApiBase()}/v1/auth/me`, {
                    headers: {
                        Authorization: token,
                        accept: "application/json",
                    },
                });

                if (res.ok) {
                    const data: UserProfile = await res.json();
                    setProfile(data);
                    setAuthStatus("authenticated");
                } else if (res.status === 401 || res.status === 403) {
                    // Token expired or invalid — clear it and mark session as expired
                    clearStoredAuth();
                    setSessionExpired(true);
                    setAuthStatus("unauthenticated");
                } else {
                    setError(`Error ${res.status}: no se pudo cargar el perfil`);
                    setAuthStatus("error");
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Error de red");
                setAuthStatus("error");
            }
        };

        fetchProfile();
    }, []);

    const perms = profile?.permissions ?? [];
    const roles = profile?.roles ?? [];

    // Convenience boolean derived from authStatus
    const loading = authStatus === "loading";

    return {
        profile,
        loading,
        authStatus,
        sessionExpired,
        error,
        /** True when the user has the admin:manage_users permission. Replaces the old isAdmin flag. */
        canManageUsers: _hasPermission(perms, PERMS.MANAGE_USERS),
        canManageBranches: _hasPermission(perms, PERMS.MANAGE_BRANCHES),
        canManageCatalog: _hasPermission(perms, PERMS.MANAGE_CATALOG),
        canManageTenant: _hasPermission(perms, PERMS.MANAGE_TENANT),
        /** Generic helper — check any permission code at the call site. */
        hasPermission: (code: string) => _hasPermission(perms, code),
        hasRole: (code: string) => roles.includes(code),
    };
}
