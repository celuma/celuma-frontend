import { useState, useEffect } from "react";

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
    role: string;
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
                        "Authorization": token,
                        "accept": "application/json"
                    }
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

    return { profile, loading, error, isAdmin: profile?.role === "admin" };
}

