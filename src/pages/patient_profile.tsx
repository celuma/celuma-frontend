import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Avatar, Table, Tag, Empty, Button as AntButton } from "antd";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";

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

type PatientOrdersResponse = {
    patient_id: string;
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        tenant_id: string;
        branch_id: string;
        patient_id: string;
        requested_by?: string | null;
        notes?: string | null;
        created_at?: string | null;
        sample_count: number;
        has_report: boolean;
    }>;
};

type PatientDetail = {
    id: string;
    patient_code: string;
    first_name?: string;
    last_name?: string;
    dob?: string | null;
    sex?: string | null;
    phone?: string | null;
    email?: string | null;
};

export default function PatientProfile() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { patientId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ordersResp, setOrdersResp] = useState<PatientOrdersResponse | null>(null);
    const [patient, setPatient] = useState<PatientDetail | null>(null);

    useEffect(() => {
        if (!patientId) return;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [orders, detail] = await Promise.all([
                    getJSON<PatientOrdersResponse>(`/v1/laboratory/patients/${patientId}/orders`),
                    getJSON<PatientDetail>(`/v1/patients/${patientId}`),
                ]);
                // Sort orders by created_at desc when available, otherwise by order_code
                orders.orders.sort((a, b) => {
                    const ad = a.created_at ? Date.parse(a.created_at) : 0;
                    const bd = b.created_at ? Date.parse(b.created_at) : 0;
                    if (ad !== bd) return bd - ad;
                    return b.order_code.localeCompare(a.order_code);
                });
                setOrdersResp(orders);
                setPatient(detail);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            } finally {
                setLoading(false);
            }
        })();
    }, [patientId]);

    const fullName = useMemo(() => {
        return `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim();
    }, [patient]);

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: "#f6f8fa" }}>
                <style>{`
                  .pp-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
                  @media (min-width: 960px) { .pp-grid { grid-template-columns: 320px 1fr; } }
                `}</style>

                <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
                    <div className="pp-grid">
                        <Card loading={loading} style={{ borderRadius: 12 }}
                              extra={!loading && patient ? (
                                  <AntButton type="primary" onClick={() => navigate(`/cases/register?patientId=${patient.id}`)}>
                                      Registrar Caso
                                  </AntButton>
                              ) : null}
                        >
                            {!loading && (
                                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                                    <Avatar size={72} style={{ background: "#0f8b8d", fontWeight: 800 }}>
                                        {(fullName || patient?.patient_code || "P").slice(0,1).toUpperCase()}
                                    </Avatar>
                                    <div>
                                        <div style={{ fontSize: 20, fontWeight: 900, color: "#0d1b2a" }}>{fullName || "Paciente"}</div>
                                        <div style={{ color: "#64748b" }}>Código: <strong style={{ color: "#0d1b2a" }}>{patient?.patient_code ?? "—"}</strong></div>
                                        <div style={{ color: "#64748b", marginTop: 2 }}>Sexo: <strong style={{ color: "#0d1b2a" }}>{patient?.sex ?? "—"}</strong></div>
                                        <div style={{ color: "#64748b", marginTop: 2 }}>DOB: <strong style={{ color: "#0d1b2a" }}>{patient?.dob ?? "—"}</strong></div>
                                        <div style={{ color: "#64748b", marginTop: 2 }}>Contacto: <strong style={{ color: "#0d1b2a" }}>{patient?.phone ?? patient?.email ?? "—"}</strong></div>
                                    </div>
                                </div>
                            )}
                        </Card>

                        <Card title="Órdenes del paciente" loading={loading} style={{ borderRadius: 12 }}>
                            {!loading && (
                                <Table
                                    dataSource={ordersResp?.orders ?? []}
                                    rowKey={(r) => r.id}
                                    pagination={{ pageSize: 10, showSizeChanger: false }}
                                    locale={{ emptyText: <Empty description="Sin órdenes" /> }}
                                    columns={[
                                        { title: "Fecha", dataIndex: "created_at", key: "created_at", width: 180, render: (v: string | null) => v ? new Date(v).toLocaleString() : "—" },
                                        { title: "Orden", dataIndex: "order_code", key: "order_code", width: 140 },
                                        { title: "Estado", dataIndex: "status", key: "status", width: 140, render: (v: string) => <Tag color="#49b6ad">{v}</Tag> },
                                        { title: "Muestras", dataIndex: "sample_count", key: "sample_count", width: 120 },
                                        { title: "Reporte", dataIndex: "has_report", key: "has_report", width: 120, render: (v: boolean) => v ? <Tag color="#22c55e">Sí</Tag> : <Tag color="#94a3b8">No</Tag> },
                                        { title: "Notas", dataIndex: "notes", key: "notes" },
                                    ]}
                                    onRow={(record) => ({
                                        onClick: () => navigate(`/orders/${record.id}`),
                                        style: { cursor: "pointer" },
                                    })}
                                />
                            )}
                            <ErrorText>{error}</ErrorText>
                        </Card>
                    </div>
                </div>
            </Layout.Content>
        </Layout>
    );
}


