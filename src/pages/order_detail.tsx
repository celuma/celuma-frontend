import { useEffect, useMemo, useState, useRef } from "react";
import { Layout, Card, Descriptions, Tag, List, Avatar, Empty, Button as AntButton, message } from "antd";
import { ReloadOutlined, FilePdfOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens } from "../components/design/tokens";
import { saveReport, getLatestReportByOrderId } from "../services/report_service";
import type { ReportEnvelope, ReportFlags } from "../models/report";
import ReportPreview, { type ReportPreviewRef } from "../components/report/report_preview";

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
    const [latestReport, setLatestReport] = useState<ReportEnvelope | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const previewRef = useRef<ReportPreviewRef>(null);

    // Default flags for initial report when creating
    const DEFAULT_FLAGS: ReportFlags = {
        incluirMacroscopia: true,
        incluirMicroscopia: true,
        incluirCitomorfologia: true,
        incluirInterpretacion: true,
        incluirDiagnostico: true,
        incluirComentario: true,
        incluirIF: false,
        incluirME: false,
        incluirEdad: false,
        incluirCU: false,
        incluirInmunotinciones: false,
    };

    // Function to load the latest report by report ID
    const loadLatestReport = async (reportId: string) => {
        setReportLoading(true);
        try {
            const report = await getLatestReportByOrderId(reportId);
            setLatestReport(report);
        } catch (err) {
            console.error("Error loading latest report:", err);
            setLatestReport(null);
        } finally {
            setReportLoading(false);
        }
    };

    useEffect(() => {
        if (!orderId) return;
        (async () => {
            setLoading(true);
            setError(null);
            let foundReportId: string | null = null;
            
            try {
                const full = await getJSON<OrderFullResponse>(`/v1/laboratory/orders/${orderId}/full`);
                setData(full);

                // Fetch cases to discover linked report id (if any)
                try {
                    const cases = await getJSON<PatientCasesResponse>(`/v1/laboratory/patients/${full.patient.id}/cases`);
                    const found = cases.cases.find((c) => c.order.id === full.order.id);
                    foundReportId = found?.report?.id ?? null;
                    setReportId(foundReportId);
                } catch { /* optional */ }

                // Load latest report for preview if reportId exists
                if (foundReportId) {
                    await loadLatestReport(foundReportId);
                }
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

    const handleCreateReport = async () => {
        if (!data) return;
        try {
            const userId = localStorage.getItem("user_id") || sessionStorage.getItem("user_id") || "";
            const envelope: ReportEnvelope = {
                id: "",
                tenant_id: data.order.tenant_id,
                branch_id: data.order.branch_id,
                order_id: data.order.id,
                version_no: 1,
                status: "DRAFT",
                title: `Reporte Histopatologia - ${fullName || data.patient.patient_code}`,
                diagnosis_text: "",
                created_by: userId,
                published_at: null,
                report: {
                    tipo: "Histopatologia",
                    base: {
                        paciente: fullName || data.patient.patient_code,
                        examen: "",
                        folio: data.order.order_code || "",
                        fechaRecepcion: "",
                        especimen: "",
                        diagnosticoEnvio: null,
                    },
                    secciones: {
                        descripcionMacroscopia: null,
                        descripcionMicroscopia: null,
                        descripcionCitomorfologica: null,
                        interpretacion: null,
                        diagnostico: null,
                        comentario: null,
                        inmunofluorescenciaHTML: null,
                        inmunotincionesHTML: null,
                        microscopioElectronicoHTML: null,
                        citologiaUrinariaHTML: null,
                        edad: null,
                    },
                    flags: { ...DEFAULT_FLAGS },
                    images: [],
                },
            };
            const created = await saveReport(envelope);
            
            // Update localStorage with the created report to ensure consistency
            localStorage.setItem("reportEnvelopeDraft", JSON.stringify(created));
            
            message.success("Reporte creado");
            setReportId(created.id);
            setLatestReport(created);
            // Navigate to the report
            navigate(`/reports/${created.id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "No se pudo crear el reporte");
        }
    };

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <Card
                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Detalle de Orden</span>}
                        loading={loading}
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
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

                    <Card
                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Muestras</span>}
                        loading={loading}
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
                        extra={data ? (
                            <AntButton type="primary" onClick={() => navigate(`/samples/register?orderId=${data.order.id}`)}>
                                Registrar Muestra
                            </AntButton>
                        ) : null}
                    >
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

                    <Card
                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Reporte</span>}
                        loading={loading}
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
                    >
                        {reportId ? (
                            <div style={{ display: "grid", gap: 16 }}>
                                <List
                                    dataSource={[{ id: reportId }]}
                                    renderItem={() => (
                                        <List.Item onClick={() => navigate(`/reports/${reportId}`)} style={{ cursor: "pointer" }}>
                                            <List.Item.Meta title="Editar reporte" description="Ir al editor del reporte" />
                                        </List.Item>
                                    )}
                                />
                                {latestReport && (
                                    <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                            <h4 style={{ fontFamily: tokens.titleFont, fontSize: 16, fontWeight: 600, color: "#0d1b2a", margin: 0 }}>
                                                Vista previa del reporte
                                            </h4>
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <AntButton 
                                                    type="text" 
                                                    icon={<ReloadOutlined />} 
                                                    onClick={() => reportId && loadLatestReport(reportId)}
                                                    loading={reportLoading}
                                                    title="Actualizar vista previa"
                                                >
                                                    Actualizar
                                                </AntButton>
                                                <AntButton 
                                                    type="primary" 
                                                    icon={<FilePdfOutlined />}
                                                    onClick={() => {
                                                        previewRef.current?.exportPDF();
                                                    }}
                                                    title="Exportar reporte a PDF"
                                                >
                                                    Exportar PDF
                                                </AntButton>
                                            </div>
                                        </div>
                                        <ReportPreview 
                                            ref={previewRef}
                                            report={latestReport} 
                                            loading={reportLoading}
                                            style={{ margin: 0 }}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                                <Empty description="Sin reporte" />
                                <div>
                                    <AntButton type="primary" onClick={handleCreateReport}>Registrar Reporte</AntButton>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
