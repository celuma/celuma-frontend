import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api_fetch";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
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

                const res = await apiFetch(`${getApiBase()}/v1/dashboard/`);
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(text || `Error ${res.status}`);
                }
                const dashboardData: DashboardData = await res.json();
                setData(dashboardData);
            } catch (err) {
                // apiFetch already redirects on 401; only non-auth errors reach here
                if (err instanceof Error && err.message !== "Session expired") {
                    setError(err.message || "Error al cargar los datos del dashboard");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    return { data, loading, error };
}
