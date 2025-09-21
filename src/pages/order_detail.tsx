import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Descriptions, Tag, List, Avatar, Empty, Button as AntButton } from "antd";
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

type OrderFullResponse = {
    order: {
        id: string;
        order_code: string;
        status: string;
        patient_id: string;
        tenant_id: string;
        branch_id: string;
        requested_by?: string | null;
        notes?: string | null;
        billed_lock?: boolean;
    };
    patient: {
        id: string;
        patient_code: string;
        first_name?: string;
        last_name?: string;
        dob?: string | null;
        sex?: string | null;
        phone?: string | null;
        email?: string | null;
        tenant_id: string;
        branch_id: string;
    };
    samples: Array<{
        id: string;
        sample_code: string;
        type: string;
        state: string;
        order_id: string;
        tenant_id: string;
        branch_id: string;
    }>;
};

type PatientCasesResponse = {
    patient_id: string;
    cases: Array<{
        order: { id: string };
        report?: { id: string } | null;
    }>;
};

export default function OrderDetail() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { orderId } = useParams();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<OrderFullResponse | null>(null);
    const [reportId, setReportId] = useState<string | null>(null);

    useEffect(() => {
        if (!orderId) return;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const full = await getJSON<OrderFullResponse>(`/v1/laboratory/orders/${orderId}/full`);
                setData(full);

                // Fetch cases to discover linked report id (if any)
                try {
                    const cases = await getJSON<PatientCasesResponse>(`/v1/laboratory/patients/${full.patient.id}/cases`);
                    const found = cases.cases.find((c) => c.order.id === full.order.id);
                    setReportId(found?.report?.id ?? null);
                } catch { /* optional */ }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            } finally {
                setLoading(false);
            }
        })();
    }, [orderId]);

    const fullName = useMemo(() => {
        return `${data?.patient.first_name ?? ""} ${data?.patient.last_name ?? ""}`.trim();
    }, [data]);

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: "#f6f8fa" }}>
                <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
                    <Card
                        title="Detalle de Orden"
                        loading={loading}
                        style={{ borderRadius: 12 }}
                        extra={data ? (
                            <AntButton type="primary" onClick={() => navigate(`/samples/register?orderId=${data.order.id}`)}>
                                Registrar Muestra
                            </AntButton>
                        ) : null}
                    >
                        {data && (
                            <Descriptions bordered column={1} size="middle">
                                <Descriptions.Item label="Orden">{data.order.order_code}</Descriptions.Item>
                                <Descriptions.Item label="Estado"><Tag color="#49b6ad">{data.order.status}</Tag></Descriptions.Item>
                                <Descriptions.Item label="Paciente">
                                    <a onClick={() => navigate(`/patients/${data.patient.id}`)}>{fullName || data.patient.patient_code}</a>
                                </Descriptions.Item>
                                <Descriptions.Item label="Solicitante">{data.order.requested_by || "—"}</Descriptions.Item>
                                <Descriptions.Item label="Notas">{data.order.notes || "—"}</Descriptions.Item>
                            </Descriptions>
                        )}
                        <ErrorText>{error}</ErrorText>
                    </Card>

                    <Card title="Muestras" loading={loading} style={{ borderRadius: 12 }}>
                        {data && data.samples.length > 0 ? (
                            <List
                                itemLayout="horizontal"
                                dataSource={data.samples}
                                renderItem={(s) => (
                                    <List.Item onClick={() => navigate(`/samples/${s.id}`)} style={{ cursor: "pointer" }}>
                                        <List.Item.Meta
                                            avatar={<Avatar style={{ background: "#0f8b8d" }}>{s.sample_code.slice(0,2).toUpperCase()}</Avatar>}
                                            title={`${s.sample_code} · ${s.type}`}
                                            description={<span>Estado: <Tag color="#94a3b8">{s.state}</Tag></span>}
                                        />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty description="Sin muestras" />
                        )}
                    </Card>

                    <Card title="Reporte" loading={loading} style={{ borderRadius: 12 }}>
                        {reportId ? (
                            <List
                                dataSource={[{ id: reportId }]}
                                renderItem={() => (
                                    <List.Item onClick={() => navigate(`/reports/${reportId}`)} style={{ cursor: "pointer" }}>
                                        <List.Item.Meta title="Ver reporte" description="Ir al detalle del reporte" />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty description="Sin reporte" />
                        )}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}


