import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Layout, Card, Avatar, Empty, Button as AntButton, message, Timeline, Steps, Tabs, Badge, Tooltip, Input } from "antd";
import { 
    ReloadOutlined, FilePdfOutlined, CheckCircleOutlined, 
    FileTextOutlined, InboxOutlined, 
    ExperimentOutlined, SolutionOutlined, AuditOutlined, SendOutlined, 
    LockOutlined, CloseCircleOutlined, UserOutlined, CalendarOutlined,
    MessageOutlined, PlusOutlined, ExclamationCircleOutlined, SettingOutlined,
    MedicineBoxOutlined, SkinOutlined, HeartOutlined, EyeOutlined, EditOutlined
} from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import { saveReport, getLatestReportByOrderId } from "../services/report_service";
import type { ReportEnvelope, ReportFlags } from "../models/report";
import ReportPreview, { type ReportPreviewRef } from "../components/report/report_preview";

// Generate initials from full name
const getInitials = (fullName?: string): string => {
    if (!fullName) return "P";
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0]?.toUpperCase() || "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0]?.toUpperCase() : "";
    return first + last || "P";
};

// Generate a consistent color based on name
const getAvatarColor = (name: string): string => {
    const colors = [
        "#0f8b8d", "#3b82f6", "#8b5cf6", "#ec4899", 
        "#f59e0b", "#10b981", "#ef4444", "#6366f1"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

// Sample type configuration with icons and colors
const SAMPLE_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    "BIOPSIA": { icon: <SkinOutlined />, color: "#8b5cf6", label: "Biopsia" },
    "CITOLOGIA": { icon: <EyeOutlined />, color: "#ec4899", label: "Citología" },
    "TEJIDO": { icon: <HeartOutlined />, color: "#ef4444", label: "Tejido" },
    "SANGRE": { icon: <MedicineBoxOutlined />, color: "#dc2626", label: "Sangre" },
    "LIQUIDO": { icon: <ExperimentOutlined />, color: "#3b82f6", label: "Líquido" },
    "ORINA": { icon: <ExperimentOutlined />, color: "#f59e0b", label: "Orina" },
    "DEFAULT": { icon: <ExperimentOutlined />, color: "#0f8b8d", label: "Muestra" },
};

const getSampleTypeConfig = (type: string) => {
    const upperType = type?.toUpperCase() || "";
    // Check if type contains any of the keys
    for (const [key, config] of Object.entries(SAMPLE_TYPE_CONFIG)) {
        if (key !== "DEFAULT" && upperType.includes(key)) {
            return config;
        }
    }
    return SAMPLE_TYPE_CONFIG.DEFAULT;
};

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
        created_at?: string | null;
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
        created_at?: string | null;
    }>;
};

type PatientCasesResponse = {
    patient_id: string;
    cases: Array<{
        order: { id: string };
        report?: { id: string } | null;
    }>;
};

// Status configuration
const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida" },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso" },
    DIAGNOSIS: { color: "#8b5cf6", bg: "#f5f3ff", label: "Diagnóstico" },
    REVIEW: { color: "#ec4899", bg: "#fdf2f8", label: "Revisión" },
    RELEASED: { color: "#10b981", bg: "#ecfdf5", label: "Liberada" },
    CLOSED: { color: "#6b7280", bg: "#f3f4f6", label: "Cerrada" },
    CANCELLED: { color: "#ef4444", bg: "#fef2f2", label: "Cancelada" },
};

// Sample state configuration - matches backend SampleState enum
const SAMPLE_STATE_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida", icon: <InboxOutlined /> },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso", icon: <SettingOutlined /> },
    READY: { color: "#10b981", bg: "#ecfdf5", label: "Lista", icon: <CheckCircleOutlined /> },
    DAMAGED: { color: "#ef4444", bg: "#fef2f2", label: "Dañada", icon: <ExperimentOutlined /> },
    CANCELLED: { color: "#6b7280", bg: "#f3f4f6", label: "Cancelada", icon: <ExperimentOutlined /> },
};

// Format UTC datetime to local time
const formatLocalDateTime = (utcDateString: string): string => {
    // Ensure the date string is interpreted as UTC if it doesn't have a timezone
    const dateStr = utcDateString.endsWith('Z') ? utcDateString : utcDateString + 'Z';
    const date = new Date(dateStr);
    
    // Format in local timezone
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
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
    const [activeTab, setActiveTab] = useState("samples");
    const [timeline, setTimeline] = useState<Array<{
        id: string;
        event_type: string;
        description: string;
        metadata?: Record<string, unknown> | null;
        created_at: string;
        created_by?: string;
        created_by_name?: string;
        created_by_avatar?: string;
        sample_id?: string;
    }>>([]);
    
    // Notes editing state
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);

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

    // Function to refresh order data
    const refresh = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        setError(null);
        let foundReportId: string | null = null;
        
        try {
            const full = await getJSON<OrderFullResponse>(`/v1/laboratory/orders/${orderId}/full`);
            setData(full);

            // Load timeline events
            try {
                const eventsResult = await getJSON<{ events: Array<{
                    id: string;
                    event_type: string;
                    description: string;
                    metadata?: Record<string, unknown> | null;
                    created_at: string;
                    created_by?: string;
                    created_by_name?: string;
                    created_by_avatar?: string;
                    sample_id?: string;
                }> }>(`/v1/laboratory/orders/${orderId}/events`);
                setTimeline(eventsResult.events);
            } catch {
                // Timeline is optional, ignore errors
            }

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
    }, [orderId]);

    useEffect(() => {
        refresh();
    }, [refresh]);
    
    // Update order notes
    const updateNotes = useCallback(async () => {
        if (!orderId || savingNotes) return;
        setSavingNotes(true);
        try {
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const res = await fetch(`${getApiBase()}/v1/laboratory/orders/${orderId}/notes`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: token } : {}),
                },
                body: JSON.stringify({ notes: notesValue || null }),
                credentials: "include",
            });
            if (!res.ok) {
                const text = await res.text();
                let parsed: unknown = undefined;
                try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
                const msg = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
                throw new Error(msg);
            }
            message.success("Descripción actualizada");
            setEditingNotes(false);
            await refresh();
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : "Error al actualizar la descripción";
            message.error(errMsg);
        } finally {
            setSavingNotes(false);
        }
    }, [orderId, savingNotes, notesValue, refresh]);

    const fullName = useMemo(() => {
        return `${data?.patient.first_name ?? ""} ${data?.patient.last_name ?? ""}`.trim();
    }, [data]);

    // Order status steps configuration
    const ORDER_STEPS = [
        { key: "RECEIVED", title: "Recibida", icon: <InboxOutlined /> },
        { key: "PROCESSING", title: "En Proceso", icon: <ExperimentOutlined /> },
        { key: "DIAGNOSIS", title: "Diagnóstico", icon: <SolutionOutlined /> },
        { key: "REVIEW", title: "Revisión", icon: <AuditOutlined /> },
        { key: "CLOSED", title: "Cerrada", icon: <LockOutlined /> },
        { key: "RELEASED", title: "Liberada", icon: <SendOutlined /> },
    ];

    const getCurrentStep = (status: string | undefined): number => {
        if (!status) return 0;
        if (status === "CANCELLED") return -1;
        const index = ORDER_STEPS.findIndex((step) => step.key === status);
        return index >= 0 ? index : 0;
    };

    const getStepStatus = (stepIndex: number, currentStep: number, orderStatus: string | undefined): "wait" | "process" | "finish" | "error" => {
        if (orderStatus === "CANCELLED") return "error";
        if (stepIndex < currentStep) return "finish";
        if (stepIndex === currentStep) return "process";
        return "wait";
    };

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
                signed_by: null,
                signed_at: null,
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
            
            localStorage.setItem("reportEnvelopeDraft", JSON.stringify(created));
            
            message.success("Reporte creado");
            setReportId(created.id);
            setLatestReport(created);
            navigate(`/reports/${created.id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "No se pudo crear el reporte");
        }
    };

    const statusConfig = STATUS_CONFIG[data?.order.status || "RECEIVED"] || STATUS_CONFIG.RECEIVED;

    // Samples Tab Content
    const SamplesContent = () => (
        <div>
            {/* Header */}
            <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                marginBottom: 16
            }}>
                <span style={{ fontWeight: 600, color: tokens.textPrimary }}>
                    {data?.samples.length || 0} muestra{(data?.samples.length || 0) !== 1 ? "s" : ""} registrada{(data?.samples.length || 0) !== 1 ? "s" : ""}
                </span>
                <AntButton 
                    type="primary" 
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => data && navigate(`/samples/register?orderId=${data.order.id}`)}
                >
                    Agregar Muestra
                </AntButton>
            </div>
            
            {data && data.samples.length > 0 ? (
                <div style={{ 
                    border: "1px solid #e5e7eb", 
                    borderRadius: tokens.radius, 
                    overflow: "hidden" 
                }}>
                    {data.samples.map((sample, index) => {
                        const stateConfig = SAMPLE_STATE_CONFIG[sample.state] || { color: "#6b7280", bg: "#f3f4f6", label: sample.state, icon: <CheckCircleOutlined /> };
                        const typeConfig = getSampleTypeConfig(sample.type);
                        return (
                            <div
                                key={sample.id}
                                onClick={() => navigate(`/samples/${sample.id}`)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "14px 16px",
                                    cursor: "pointer",
                                    borderBottom: index < data.samples.length - 1 ? "1px solid #e5e7eb" : "none",
                                    transition: "background 0.15s ease",
                                    background: "#fff"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
                            >
                                <Avatar
                                    size={36}
                                    icon={typeConfig.icon}
                                    style={{ 
                                        backgroundColor: typeConfig.color,
                                        fontSize: 16,
                                        marginRight: 14,
                                        flexShrink: 0
                                    }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: tokens.primary, fontSize: 14 }}>
                                        {sample.sample_code}
                                    </div>
                                    <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                                        {sample.type}
                                    </div>
                                </div>
                                <div style={{
                                    backgroundColor: stateConfig.bg,
                                    color: stateConfig.color,
                                    borderRadius: 12,
                                    fontSize: 11,
                                    fontWeight: 500,
                                    padding: "4px 10px",
                                    display: "inline-block",
                                }}>
                                    {stateConfig.label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ 
                    padding: 40,
                    textAlign: "center",
                    background: "#f9fafb",
                    borderRadius: tokens.radius,
                    border: "1px solid #e5e7eb"
                }}>
                    <Empty description="Sin muestras registradas" />
                </div>
            )}
        </div>
    );

    // Report Tab Content
    const ReportContent = () => (
        <div>
            {reportId ? (
                <div style={{ display: "grid", gap: 16 }}>
                    {/* Report header */}
                    <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center",
                        padding: "14px 16px",
                        background: "#f9fafb",
                        borderRadius: tokens.radius,
                        border: "1px solid #e5e7eb"
                    }}>
                        <div 
                            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                            onClick={() => navigate(`/reports/${reportId}`)}
                        >
                            <Avatar
                                size={40}
                                style={{ 
                                    backgroundColor: "#10b981",
                                    fontSize: 16
                                }}
                                icon={<FileTextOutlined />}
                            />
                            <div>
                                <div style={{ fontWeight: 600, color: tokens.primary }}>
                                    {latestReport?.title || "Reporte"}
                                </div>
                                <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                                    {latestReport?.status === "DRAFT" ? "Borrador" : 
                                     latestReport?.status === "PUBLISHED" ? "Publicado" : 
                                     latestReport?.status || "—"}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <AntButton 
                                type="text" 
                                icon={<ReloadOutlined />} 
                                onClick={() => reportId && loadLatestReport(reportId)}
                                loading={reportLoading}
                            >
                                Actualizar
                            </AntButton>
                            <AntButton 
                                type="primary" 
                                icon={<FilePdfOutlined />}
                                onClick={() => previewRef.current?.exportPDF()}
                            >
                                Exportar PDF
                            </AntButton>
                        </div>
                    </div>
                    
                    {latestReport && (
                        <ReportPreview 
                            ref={previewRef}
                            report={latestReport} 
                            loading={reportLoading}
                            style={{ margin: 0 }}
                        />
                    )}
                </div>
            ) : (
                <div style={{ 
                    padding: 60, 
                    textAlign: "center",
                    background: "#f9fafb",
                    borderRadius: tokens.radius,
                    border: "1px solid #e5e7eb"
                }}>
                    <FileTextOutlined style={{ fontSize: 48, color: "#9ca3af", marginBottom: 16 }} />
                    <div style={{ fontSize: 16, fontWeight: 600, color: tokens.textPrimary, marginBottom: 8 }}>
                        Sin reporte
                    </div>
                    <div style={{ color: tokens.textSecondary, marginBottom: 16 }}>
                        No hay un reporte asociado a esta orden
                    </div>
                    <AntButton type="primary" icon={<PlusOutlined />} onClick={handleCreateReport}>
                        Crear Reporte
                    </AntButton>
                </div>
            )}
        </div>
    );

    // Conversation Tab Content
    const ConversationContent = () => (
        <div style={{ 
            padding: 60, 
            textAlign: "center",
            background: "#f9fafb",
            borderRadius: tokens.radius,
            border: "1px solid #e5e7eb"
        }}>
            <MessageOutlined style={{ fontSize: 48, color: "#9ca3af", marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: tokens.textPrimary, marginBottom: 8 }}>
                Sin conversaciones
            </div>
            <div style={{ color: tokens.textSecondary, marginBottom: 16 }}>
                Las conversaciones sobre esta orden aparecerán aquí
            </div>
            <AntButton disabled icon={<PlusOutlined />}>
                Iniciar Conversación
            </AntButton>
        </div>
    );

    // Sidebar content component (for reuse in responsive layout)
    const SidebarContent = () => (
        <div style={{ display: "grid", gap: tokens.gap }}>
            {/* Assignees */}
            <Card 
                size="small" 
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: 12
                }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Asignados
                    </span>
                    <Tooltip title="Próximamente">
                        <SettingOutlined style={{ color: tokens.textSecondary, cursor: "pointer" }} />
                    </Tooltip>
                </div>
                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                    Sin asignar
                </div>
            </Card>

            {/* Reviewers */}
            <Card 
                size="small" 
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: 12
                }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Revisores
                    </span>
                    <Tooltip title="Próximamente">
                        <SettingOutlined style={{ color: tokens.textSecondary, cursor: "pointer" }} />
                    </Tooltip>
                </div>
                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                    Sin revisores — se requiere al menos 1 revisión
                </div>
            </Card>

            {/* Labels */}
            <Card 
                size="small" 
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: 12
                }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Etiquetas
                    </span>
                    <Tooltip title="Próximamente">
                        <SettingOutlined style={{ color: tokens.textSecondary, cursor: "pointer" }} />
                    </Tooltip>
                </div>
                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                    Ninguna
                </div>
            </Card>

            {/* Quick Actions */}
            <Card 
                size="small" 
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <div style={{ 
                    fontWeight: 600, 
                    fontSize: 12, 
                    color: tokens.textSecondary, 
                    textTransform: "uppercase", 
                    letterSpacing: "0.5px",
                    marginBottom: 12
                }}>
                    Acciones Rápidas
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                    <AntButton 
                        block 
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => data && navigate(`/samples/register?orderId=${data.order.id}`)}
                    >
                        Agregar Muestra
                    </AntButton>
                    {!reportId && (
                        <AntButton 
                            block 
                            size="small"
                            type="primary"
                            icon={<FileTextOutlined />}
                            onClick={handleCreateReport}
                        >
                            Crear Reporte
                        </AntButton>
                    )}
                    {reportId && (
                        <AntButton 
                            block 
                            size="small"
                            icon={<FileTextOutlined />}
                            onClick={() => navigate(`/reports/${reportId}`)}
                        >
                            Editar Reporte
                        </AntButton>
                    )}
                </div>
            </Card>
        </div>
    );

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    
                    {/* Responsive CSS */}
                    <style>{`
                        .order-detail-grid {
                            display: grid;
                            grid-template-columns: 1fr 280px;
                            gap: ${tokens.gap}px;
                            align-items: start;
                        }
                        .order-detail-sidebar-desktop {
                            display: block;
                            position: sticky;
                            top: 24px;
                        }
                        .order-detail-sidebar-mobile {
                            display: none;
                        }
                        
                        @media (max-width: 900px) {
                            .order-detail-grid {
                                grid-template-columns: 1fr;
                            }
                            .order-detail-sidebar-desktop {
                                display: none;
                            }
                            .order-detail-sidebar-mobile {
                                display: block;
                            }
                        }
                    `}</style>

                    {/* Main Grid Layout */}
                    <div className="order-detail-grid">
                        {/* Left Column - Main Content */}
                        <div style={{ display: "grid", gap: tokens.gap }}>
                            {/* Order Header Card */}
                    <Card
                                title={<span style={cardTitleStyle}>Detalle de Orden</span>}
                        loading={loading}
                                style={cardStyle}
                    >
                        {data && (
                            <>
                                        {/* Billed Lock Warning */}
                                {data.order.billed_lock && (
                                    <div style={{ 
                                                padding: "12px 16px", 
                                        background: "#fff7e6", 
                                        border: "1px solid #ffd591", 
                                                borderRadius: 8,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 12,
                                                marginBottom: 20
                                            }}>
                                                <ExclamationCircleOutlined style={{ color: "#d48806", fontSize: 18 }} />
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontWeight: 600, color: "#ad6800" }}>Retenido por Pago Pendiente</span>
                                                    <span style={{ color: "#ad6800", marginLeft: 8 }}>
                                                        — El acceso al reporte está bloqueado.
                                                    </span>
                                        </div>
                                        <AntButton 
                                            size="small" 
                                            onClick={() => navigate(`/billing/${data.order.id}`)}
                                        >
                                            Ver Facturación
                                        </AntButton>
                                    </div>
                                )}

                                        {/* Order Title & Status */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                                            <h2 style={{ 
                                                margin: 0, 
                                                fontFamily: tokens.titleFont, 
                                                fontSize: 22, 
                                                fontWeight: 700,
                                                color: tokens.textPrimary
                                            }}>
                                                {data.order.order_code}
                                            </h2>
                                            <div style={{ 
                                                padding: "6px 12px",
                                                borderRadius: 16,
                                                background: statusConfig.bg,
                                                color: statusConfig.color,
                                                fontWeight: 600,
                                                fontSize: 12,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6
                                            }}>
                                                {data.order.status === "CANCELLED" ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
                                                {statusConfig.label}
                                            </div>
                                        </div>

                                        {/* Patient Info */}
                                        <Tooltip title="Ver perfil del paciente">
                                            <div 
                                                onClick={() => navigate(`/patients/${data.patient.id}`)}
                                                style={{ 
                                                    display: "inline-flex", 
                                                    alignItems: "center", 
                                                    gap: 10,
                                                    cursor: "pointer",
                                                    padding: "8px 12px",
                                                    borderRadius: 8,
                                                    marginLeft: -12,
                                                    marginBottom: 16,
                                                    transition: "background 0.15s ease"
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                            >
                                                <Avatar 
                                                    size={40}
                                                    style={{ 
                                                        backgroundColor: getAvatarColor(fullName || data.patient.patient_code),
                                                        fontSize: 15,
                                                        fontWeight: 600,
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {getInitials(fullName || data.patient.patient_code)}
                                                </Avatar>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: tokens.primary, fontSize: 14 }}>
                                                        {fullName || data.patient.patient_code}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                                                        {data.patient.patient_code}
                                                    </div>
                                                </div>
                                            </div>
                                        </Tooltip>

                                        {/* Meta Info Row */}
                                        <div style={{ 
                                            display: "flex", 
                                            flexWrap: "wrap",
                                            alignItems: "center", 
                                            gap: "12px 20px",
                                            color: tokens.textSecondary,
                                            fontSize: 13,
                                            marginBottom: data.order.notes ? 16 : 0
                                        }}>
                                            {data.order.requested_by && (
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <UserOutlined />
                                                    <span>Solicitante:</span>
                                                    <span style={{ fontWeight: 500, color: tokens.textPrimary }}>{data.order.requested_by}</span>
                                                </div>
                                            )}

                                            {data.order.created_at && (
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <CalendarOutlined />
                                                    <span>{new Date(data.order.created_at).toLocaleDateString("es-MX", { 
                                                        year: "numeric", 
                                                        month: "short", 
                                                        day: "numeric" 
                                                    })}</span>
                                                </div>
                                            )}

                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <ExperimentOutlined />
                                                <span>{data.samples.length} muestra{data.samples.length !== 1 ? "s" : ""}</span>
                                            </div>
                                        </div>

                                        {/* Description - at the bottom */}
                                        <div style={{ 
                                            padding: 16, 
                                            background: "#f9fafb", 
                                            borderRadius: 8,
                                            border: "1px solid #e5e7eb"
                                        }}>
                                            <div style={{ 
                                                fontSize: 12, 
                                                fontWeight: 600, 
                                                color: tokens.textSecondary, 
                                                marginBottom: 8,
                                                textTransform: "uppercase",
                                                letterSpacing: "0.5px",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center"
                                            }}>
                                                <span>Descripción</span>
                                                {!editingNotes && (
                                                    <EditOutlined 
                                                        style={{ fontSize: 14, color: tokens.primary, cursor: "pointer" }}
                                                        onClick={() => {
                                                            setNotesValue(data.order.notes || "");
                                                            setEditingNotes(true);
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            {editingNotes ? (
                                                <div style={{ display: "grid", gap: 8 }}>
                                                    <Input.TextArea
                                                        value={notesValue}
                                                        onChange={(e) => setNotesValue(e.target.value)}
                                                        placeholder="Agregar descripción o notas de la orden..."
                                                        rows={4}
                                                        maxLength={500}
                                                    />
                                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                                        <AntButton 
                                                            size="small" 
                                                            onClick={() => setEditingNotes(false)}
                                                            disabled={savingNotes}
                                                        >
                                                            Cancelar
                                                        </AntButton>
                                                        <AntButton 
                                                            type="primary" 
                                                            size="small" 
                                                            onClick={updateNotes}
                                                            loading={savingNotes}
                                                        >
                                                            Guardar
                                                        </AntButton>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ 
                                                    color: data.order.notes ? tokens.textPrimary : tokens.textSecondary, 
                                                    fontSize: 14,
                                                    lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap",
                                                    fontStyle: data.order.notes ? "normal" : "italic"
                                                }}>
                                                    {data.order.notes || "Sin descripción"}
                                                </div>
                                            )}
                                        </div>
                            </>
                        )}
                        <ErrorText>{error}</ErrorText>
                    </Card>

                            {/* Timeline Card */}
                    <Card
                                title={<span style={cardTitleStyle}>Línea de Tiempo</span>}
                        loading={loading}
                                style={cardStyle}
                            >
                                {/* Order Status Steps */}
                                {data && (
                                    <div style={{ marginBottom: 24 }}>
                                        {data.order.status === "CANCELLED" ? (
                                            <div style={{ 
                                                padding: 16, 
                                                background: "#fff2f0", 
                                                border: "1px solid #ffccc7", 
                                                borderRadius: 8,
                                                textAlign: "center"
                                            }}>
                                                <CloseCircleOutlined style={{ fontSize: 32, color: "#ff4d4f", marginBottom: 8 }} />
                                                <div style={{ fontSize: 16, fontWeight: 600, color: "#cf1322" }}>Orden Cancelada</div>
                                            </div>
                                        ) : (
                                            <Steps
                                                current={getCurrentStep(data.order.status)}
                                                size="small"
                                                items={ORDER_STEPS.map((step, index) => {
                                                    const stepStatus = getStepStatus(index, getCurrentStep(data.order.status), data.order.status);
                                                    const stepConfig = STATUS_CONFIG[step.key] || STATUS_CONFIG.RECEIVED;
                                                    const isActive = stepStatus === "process" || stepStatus === "finish";
                                                    
                                                    return {
                                                        title: step.title,
                                                        icon: step.icon,
                                                        status: stepStatus,
                                                        styles: isActive ? {
                                                            icon: {
                                                                backgroundColor: stepConfig.color,
                                                                borderColor: stepConfig.color,
                                                            }
                                                        } : undefined,
                                                    };
                                                })}
                                                style={{ padding: "16px 0" }}
                                            />
                                        )}
                                    </div>
                                )}

                        {timeline.length > 0 ? (
                            <Timeline
                                items={timeline.map((event) => {
                                    // Build action JSX (order context - include sample info when applicable)
                                    // Returns styled elements with state tags matching the UI
                                    const buildActionText = (): React.ReactNode => {
                                        const meta = event.metadata || {};
                                        const sampleCode = meta.sample_code as string;
                                        const sampleId = meta.sample_id as string || event.sample_id;
                                        
                                        // Helper to render sample link
                                        const renderSampleLink = () => {
                                            if (!sampleCode) return null;
                                            return sampleId ? (
                                                <span>
                                                    {" "}en la muestra{" "}
                                                    <a 
                                                        href={`/samples/${sampleId}`}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            navigate(`/samples/${sampleId}`);
                                                        }}
                                                        style={{
                                                            color: "#0f8b8d",
                                                            fontWeight: 600,
                                                            textDecoration: "none",
                                                            borderBottom: "1px dashed #0f8b8d",
                                                        }}
                                                    >
                                                        {sampleCode}
                                                    </a>
                                                </span>
                                            ) : ` en la muestra ${sampleCode}`;
                                        };
                                        
                                        switch (event.event_type) {
                                            case "SAMPLE_STATE_CHANGED":
                                            case "SAMPLE_DAMAGED":
                                            case "SAMPLE_CANCELLED": {
                                                const oldState = meta.old_state as string;
                                                const newState = meta.new_state as string;
                                                const oldConfig = SAMPLE_STATE_CONFIG[oldState] || { color: "#6b7280", bg: "#f3f4f6", label: oldState, icon: null };
                                                const newConfig = SAMPLE_STATE_CONFIG[newState] || { color: "#6b7280", bg: "#f3f4f6", label: newState, icon: null };
                                                const trigger = meta.trigger === "first_image_upload" ? " (automático)" : "";
                                                
                                                return (
                                                    <span>
                                                        cambió el estado de{" "}
                                                        <span style={{
                                                            backgroundColor: oldConfig.bg,
                                                            color: oldConfig.color,
                                                            borderRadius: 12,
                                                            fontSize: 12,
                                                            fontWeight: 500,
                                                            padding: "2px 8px",
                                                            margin: "0 2px",
                                                            display: "inline-block",
                                                        }}>
                                                            {oldConfig.label}
                                                        </span>
                                                        {" "}a{" "}
                                                        <span style={{
                                                            backgroundColor: newConfig.bg,
                                                            color: newConfig.color,
                                                            borderRadius: 12,
                                                            fontSize: 12,
                                                            fontWeight: 500,
                                                            padding: "2px 8px",
                                                            margin: "0 2px",
                                                            display: "inline-block",
                                                        }}>
                                                            {newConfig.label}
                                                        </span>
                                                        {trigger}
                                                        {renderSampleLink()}
                                                    </span>
                                                );
                                            }
                                            case "IMAGE_UPLOADED": {
                                                const filename = meta.filename as string || "imagen";
                                                return (
                                                    <span>
                                                        subió imagen {filename}
                                                        {renderSampleLink()}
                                                    </span>
                                                );
                                            }
                                            case "IMAGE_DELETED": {
                                                const filename = meta.filename as string || "imagen";
                                                return (
                                                    <span>
                                                        eliminó imagen {filename}
                                                        {renderSampleLink()}
                                                    </span>
                                                );
                                            }
                                            case "SAMPLE_NOTES_UPDATED": {
                                                const newNotes = meta.new_notes as string || "";
                                                const action = newNotes ? "actualizó" : "eliminó";
                                                return (
                                                    <span>
                                                        {action} la descripción
                                                        {sampleCode && sampleId && (
                                                            <span>
                                                                {" "}de la muestra{" "}
                                                                <a 
                                                                    href={`/samples/${sampleId}`}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        navigate(`/samples/${sampleId}`);
                                                                    }}
                                                                    style={{
                                                                        color: "#0f8b8d",
                                                                        fontWeight: 600,
                                                                        textDecoration: "none",
                                                                        borderBottom: "1px dashed #0f8b8d",
                                                                    }}
                                                                >
                                                                    {sampleCode}
                                                                </a>
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            case "SAMPLE_CREATED":
                                                return sampleId ? (
                                                    <span>
                                                        registró muestra{" "}
                                                        <a 
                                                            href={`/samples/${sampleId}`}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                navigate(`/samples/${sampleId}`);
                                                            }}
                                                            style={{
                                                                color: "#0f8b8d",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #0f8b8d",
                                                            }}
                                                        >
                                                            {sampleCode}
                                                        </a>
                                                    </span>
                                                ) : (sampleCode ? `registró muestra ${sampleCode}` : "registró una muestra");
                                            case "SAMPLE_RECEIVED":
                                                return sampleId ? (
                                                    <span>
                                                        recibió muestra{" "}
                                                        <a 
                                                            href={`/samples/${sampleId}`}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                navigate(`/samples/${sampleId}`);
                                                            }}
                                                            style={{
                                                                color: "#0f8b8d",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #0f8b8d",
                                                            }}
                                                        >
                                                            {sampleCode}
                                                        </a>
                                                    </span>
                                                ) : (sampleCode ? `recibió muestra ${sampleCode}` : "recibió una muestra");
                                            case "REPORT_CREATED": {
                                                const reportId = meta.report_id as string;
                                                return reportId ? (
                                                    <span>
                                                        creó el{" "}
                                                        <a 
                                                            href={`/reports/${reportId}`}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                navigate(`/reports/${reportId}`);
                                                            }}
                                                            style={{
                                                                color: "#0f8b8d",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #0f8b8d",
                                                            }}
                                                        >
                                                            reporte
                                                        </a>
                                                    </span>
                                                ) : "creó el reporte";
                                            }
                                            case "REPORT_VERSION_CREATED": {
                                                const reportId = meta.report_id as string;
                                                return reportId ? (
                                                    <span>
                                                        editó el{" "}
                                                        <a 
                                                            href={`/reports/${reportId}`}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                navigate(`/reports/${reportId}`);
                                                            }}
                                                            style={{
                                                                color: "#0f8b8d",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #0f8b8d",
                                                            }}
                                                        >
                                                            reporte
                                                        </a>
                                                    </span>
                                                ) : "editó el reporte";
                                            }
                                            case "REPORT_SUBMITTED": {
                                                const reportId = meta.report_id as string;
                                                return reportId ? (
                                                    <span>
                                                        envió a revisión el{" "}
                                                        <a 
                                                            href={`/reports/${reportId}`}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                navigate(`/reports/${reportId}`);
                                                            }}
                                                            style={{
                                                                color: "#0f8b8d",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #0f8b8d",
                                                            }}
                                                        >
                                                            reporte
                                                        </a>
                                                    </span>
                                                ) : "envió a revisión el reporte";
                                            }
                                            case "REPORT_RETRACTED": {
                                                const reportId = meta.report_id as string;
                                                const reason = meta.reason as string;
                                                return (
                                                    <span>
                                                        retrajo el{" "}
                                                        {reportId ? (
                                                            <a 
                                                                href={`/reports/${reportId}`}
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    navigate(`/reports/${reportId}`);
                                                                }}
                                                                style={{
                                                                    color: "#0f8b8d",
                                                                    fontWeight: 600,
                                                                    textDecoration: "none",
                                                                    borderBottom: "1px dashed #0f8b8d",
                                                                }}
                                                            >
                                                                reporte
                                                            </a>
                                                        ) : "reporte"}
                                                        {reason && reason !== "Sin razón especificada" && (
                                                            <span style={{ fontStyle: "italic", color: "#888" }}>
                                                                {" "}({reason})
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            case "ORDER_STATUS_CHANGED": {
                                                const oldStatus = meta.old_status as string;
                                                const newStatus = meta.new_status as string;
                                                return `cambió el estado de la orden de ${oldStatus || "?"} a ${newStatus || "?"}`;
                                            }
                                            case "ORDER_NOTES_UPDATED": {
                                                const newNotes = meta.new_notes as string || "";
                                                const action = newNotes ? "actualizó" : "eliminó";
                                                return `${action} la descripción de la orden`;
                                            }
                                            default:
                                                return event.description || event.event_type;
                                        }
                                    };

                                    const userName = event.created_by_name || "Sistema";
                                    const userAvatar = event.created_by_avatar;
                                    const actionText = buildActionText();

                                    return {
                                        dot: (
                                            <Avatar 
                                                size={28}
                                                src={userAvatar}
                                                style={{ 
                                                    backgroundColor: userAvatar ? undefined : getAvatarColor(userName),
                                                    fontSize: 12,
                                                }}
                                            >
                                                {!userAvatar && getInitials(userName)}
                                            </Avatar>
                                        ),
                                        children: (
                                            <div style={{ marginLeft: 4 }}>
                                                <div style={{ lineHeight: 1.5 }}>
                                                    <span style={{ fontWeight: 600 }}>{userName}</span>
                                                    <span style={{ color: "#666", marginLeft: 6 }}>{actionText}</span>
                                                </div>
                                                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                                                    {formatLocalDateTime(event.created_at)}
                                                </div>
                                            </div>
                                        ),
                                    };
                                })}
                            />
                        ) : (
                            <Empty description="Sin eventos registrados" />
                        )}
                    </Card>

                            {/* Tabs Card - Samples, Report, Conversation */}
                            <Card style={cardStyle}>
                                <Tabs
                                    activeKey={activeTab}
                                    onChange={setActiveTab}
                                    items={[
                                        {
                                            key: "samples",
                                            label: (
                                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <ExperimentOutlined />
                                                    Muestras
                                                    <Badge 
                                                        count={data?.samples.length || 0} 
                                                        style={{ backgroundColor: tokens.primary }}
                                                        size="small"
                                                    />
                                                </span>
                                            ),
                                            children: <SamplesContent />,
                                        },
                                        {
                                            key: "report",
                                            label: (
                                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <FileTextOutlined />
                                                    Reporte
                                                    {reportId && <Badge status="success" />}
                                                </span>
                                            ),
                                            children: <ReportContent />,
                                        },
                                        {
                                            key: "conversation",
                                            label: (
                                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <MessageOutlined />
                                                    Conversación
                                                </span>
                                            ),
                                            children: <ConversationContent />,
                                        },
                                    ]}
                                />
                            </Card>

                            {/* Mobile Sidebar - Shows below main content on small screens */}
                            <div className="order-detail-sidebar-mobile">
                                <SidebarContent />
                                    </div>
                            </div>

                        {/* Right Column - Sidebar (Desktop only) */}
                        <div className="order-detail-sidebar-desktop">
                            <SidebarContent />
                                </div>
                            </div>
                </div>
            </Layout.Content>
        </Layout>
    );
}
