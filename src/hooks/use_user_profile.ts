import { useState, useEffect } from "react";
import { hasPermission as _hasPermission, PERMS } from "../lib/rbac";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            const token = getAuthToken();
            if (!token) {
                setLoading(false);
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
                    const data = await res.json();
                    setProfile(data);
                } else {
                    setError("Failed to load profile");
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, []);

    const perms = profile?.permissions ?? [];
    const roles = profile?.roles ?? [];

    return {
        profile,
        loading,
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
