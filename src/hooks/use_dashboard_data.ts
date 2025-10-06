import { useState, useEffect } from "react";

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

interface DashboardStats {
    total_patients: number;
    total_orders: number;
    total_samples: number;
    total_reports: number;
    pending_orders: number;
    draft_reports: number;
    published_reports: number;
}

interface RecentActivityItem {
    id: string;
    title: string;
    description: string;
    timestamp: string;
    type: "order" | "report" | "sample" | "patient";
    status?: string;
}

interface DashboardData {
    stats: DashboardStats;
    recent_activity: RecentActivityItem[];
}

export function useDashboardData() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Use the optimized dashboard endpoint
                const dashboardData = await getJSON<DashboardData>("/v1/dashboard/");
                setData(dashboardData);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Error al cargar los datos del dashboard");
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    return { data, loading, error };
}
