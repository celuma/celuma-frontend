import { useEffect, useState, useCallback } from "react";
import { Layout, Card, Tag, Upload, Button as AntButton, Image, message, Avatar, Tooltip, Timeline, Typography } from "antd";
import type { UploadProps } from "antd";
import type { UploadRequestOption as RcCustomRequestOptions } from "rc-upload/lib/interface";
import { 
    ExperimentOutlined, CheckCircleOutlined,
    CalendarOutlined, SettingOutlined, PlusOutlined, FileImageOutlined,
    InboxOutlined, SkinOutlined, HeartOutlined, EyeOutlined, MedicineBoxOutlined,
    ContainerOutlined
} from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";

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
    for (const [key, config] of Object.entries(SAMPLE_TYPE_CONFIG)) {
        if (key !== "DEFAULT" && upperType.includes(key)) {
            return config;
        }
    }
    return SAMPLE_TYPE_CONFIG.DEFAULT;
};

// Sample state configuration
const SAMPLE_STATE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    REGISTERED: { color: "#3b82f6", bg: "#eff6ff", label: "Registrada" },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso" },
    ANALYZED: { color: "#8b5cf6", bg: "#f5f3ff", label: "Analizada" },
    COMPLETED: { color: "#10b981", bg: "#ecfdf5", label: "Completada" },
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

type SampleDetail = {
    id: string;
    sample_code: string;
    type: string;
    state: string;
    collected_at?: string | null;
    received_at?: string | null;
    notes?: string | null;
    tenant_id: string;
    branch: { id: string; name?: string; code?: string | null };
    order: { id: string; order_code: string; status: string };
    patient: { id: string; full_name: string; patient_code: string };
};

type SampleImages = {
    sample_id: string;
    images: Array<{
        id: string;
        label?: string | null;
        is_primary: boolean;
        created_at: string;
        urls: Record<string, string>;
    }>;
};

export default function SampleDetailPage() {
    const { sampleId } = useParams();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [detail, setDetail] = useState<SampleDetail | null>(null);
    const [images, setImages] = useState<SampleImages | null>(null);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<{ visible: boolean; index: number }>({ visible: false, index: 0 });

    const refresh = useCallback(async () => {
        if (!sampleId) return;
        setLoading(true);
        setError(null);
        try {
            const [d, imgs] = await Promise.all([
                getJSON<SampleDetail>(`/v1/laboratory/samples/${sampleId}`),
                getJSON<SampleImages>(`/v1/laboratory/samples/${sampleId}/images`),
            ]);
            setDetail(d);
            setImages(imgs);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    }, [sampleId]);

    useEffect(() => { refresh(); }, [refresh]);

    const uploadProps: UploadProps = {
        name: "file",
        multiple: true,
        showUploadList: false,
        customRequest: async (options: RcCustomRequestOptions) => {
            if (!sampleId) return;
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const formData = new FormData();
            formData.append("file", options.file as Blob);
            setUploading(true);
            try {
                const res = await fetch(`${getApiBase()}/v1/laboratory/samples/${sampleId}/images`, {
                    method: "POST",
                    headers: token ? { Authorization: token } : undefined,
                    body: formData,
                    credentials: "include",
                });
                if (!res.ok) {
                    const text = await res.text();
                    let parsed: unknown = undefined;
                    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
                    const msg = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
                    throw new Error(msg);
                }
                message.success("Imagen subida correctamente");
                options.onSuccess?.({}, undefined as unknown as XMLHttpRequest);
                await refresh();
            } catch (e) {
                const errMsg = e instanceof Error ? e.message : "Error al subir la imagen";
                message.error(errMsg);
                options.onError?.(new ProgressEvent("error"));
            } finally {
                setUploading(false);
            }
        },
    } as const;

    const stateConfig = SAMPLE_STATE_CONFIG[detail?.state || "REGISTERED"] || { color: "#6b7280", bg: "#f3f4f6", label: detail?.state || "—" };
    const typeConfig = getSampleTypeConfig(detail?.type || "");

    // Build timeline from dates
    const timelineItems = [];
    if (detail?.collected_at) {
        timelineItems.push({
            dot: <ExperimentOutlined />,
            color: "blue",
            children: (
                <div>
                    <div style={{ fontWeight: 600 }}>Muestra recolectada</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                        {new Date(detail.collected_at).toLocaleString('es-MX')}
                    </div>
                </div>
            ),
        });
    }
    if (detail?.received_at) {
        timelineItems.push({
            dot: <InboxOutlined />,
            color: "green",
            children: (
                <div>
                    <div style={{ fontWeight: 600 }}>Muestra recibida en laboratorio</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                        {new Date(detail.received_at).toLocaleString('es-MX')}
                    </div>
                </div>
            ),
        });
    }

    // Sidebar content component
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
                    <Upload {...uploadProps}>
                        <AntButton 
                            block 
                            icon={<PlusOutlined />}
                            loading={uploading}
                            style={{ width: "100%" }}
                        >
                            Subir Imagen
                        </AntButton>
                    </Upload>
                    {detail && (
                        <AntButton 
                            block 
                            icon={<ContainerOutlined />}
                            onClick={() => navigate(`/orders/${detail.order.id}`)}
                        >
                            Ver Orden
                        </AntButton>
                    )}
                </div>
            </Card>

            {/* Sample Info */}
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
                    Información
                </div>
                <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: tokens.textSecondary }}>Tipo</span>
                        <span style={{ fontWeight: 500, color: tokens.textPrimary }}>{detail?.type || "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: tokens.textSecondary }}>Sucursal</span>
                        <span style={{ fontWeight: 500, color: tokens.textPrimary }}>
                            {detail ? `${detail.branch.code ?? ""} ${detail.branch.name ?? ""}`.trim() : "—"}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: tokens.textSecondary }}>Imágenes</span>
                        <span style={{ fontWeight: 500, color: tokens.textPrimary }}>{images?.images.length || 0}</span>
                    </div>
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
                        .sample-detail-grid {
                            display: grid;
                            grid-template-columns: 1fr 280px;
                            gap: ${tokens.gap}px;
                            align-items: start;
                        }
                        .sample-detail-sidebar-desktop {
                            display: block;
                            position: sticky;
                            top: 24px;
                        }
                        .sample-detail-sidebar-mobile {
                            display: none;
                        }
                        @media (max-width: 900px) {
                            .sample-detail-grid {
                                grid-template-columns: 1fr;
                            }
                            .sample-detail-sidebar-desktop {
                                display: none;
                            }
                            .sample-detail-sidebar-mobile {
                                display: block;
                            }
                        }
                    `}</style>

                    {/* Main Grid Layout */}
                    <div className="sample-detail-grid">
                        {/* Left Column - Main Content */}
                        <div style={{ display: "grid", gap: tokens.gap }}>
                            {/* Sample Header Card */}
                            <Card
                                title={<span style={cardTitleStyle}>Detalle de Muestra</span>}
                                loading={loading}
                                style={cardStyle}
                            >
                                {detail && (
                                    <>
                                        {/* Sample Code & Status */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                                            <Avatar
                                                size={44}
                                                icon={typeConfig.icon}
                                                style={{ 
                                                    backgroundColor: typeConfig.color,
                                                    fontSize: 20,
                                                    flexShrink: 0
                                                }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <h2 style={{ 
                                                        margin: 0, 
                                                        fontFamily: tokens.titleFont, 
                                                        fontSize: 22, 
                                                        fontWeight: 700,
                                                        color: tokens.textPrimary
                                                    }}>
                                                        {detail.sample_code}
                                                    </h2>
                                                    <div style={{ 
                                                        padding: "4px 10px",
                                                        borderRadius: 12,
                                                        background: stateConfig.bg,
                                                        color: stateConfig.color,
                                                        fontWeight: 600,
                                                        fontSize: 11,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 4
                                                    }}>
                                                        <CheckCircleOutlined />
                                                        {stateConfig.label}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 4 }}>
                                                    {detail.type}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Patient Info */}
                                        <Tooltip title="Ver perfil del paciente">
                                            <div 
                                                onClick={() => navigate(`/patients/${detail.patient.id}`)}
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
                                                    size={36}
                                                    style={{ 
                                                        backgroundColor: getAvatarColor(detail.patient.full_name || detail.patient.patient_code),
                                                        fontSize: 14,
                                                        fontWeight: 600,
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {getInitials(detail.patient.full_name || detail.patient.patient_code)}
                                                </Avatar>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: tokens.primary, fontSize: 14 }}>
                                                        {detail.patient.full_name || detail.patient.patient_code}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                                                        Paciente · {detail.patient.patient_code}
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
                                            marginBottom: detail.notes ? 16 : 0
                                        }}>
                                            <Tooltip title="Ver orden">
                                                <div 
                                                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                                                    onClick={() => navigate(`/orders/${detail.order.id}`)}
                                                >
                                                    <ContainerOutlined />
                                                    <span>Orden:</span>
                                                    <span style={{ fontWeight: 500, color: tokens.primary }}>{detail.order.order_code}</span>
                                                </div>
                                            </Tooltip>

                                            {detail.received_at && (
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <CalendarOutlined />
                                                    <span>Recibida: {new Date(detail.received_at).toLocaleDateString("es-MX", { 
                                                        year: "numeric", 
                                                        month: "short", 
                                                        day: "numeric" 
                                                    })}</span>
                                                </div>
                                            )}

                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <FileImageOutlined />
                                                <span>{images?.images.length || 0} imagen{(images?.images.length || 0) !== 1 ? "es" : ""}</span>
                                            </div>
                                        </div>

                                        {/* Description - at the bottom */}
                                        {detail.notes && (
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
                                                    letterSpacing: "0.5px"
                                                }}>
                                                    Descripción
                                                </div>
                                                <div style={{ 
                                                    color: tokens.textPrimary, 
                                                    fontSize: 14,
                                                    lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap"
                                                }}>
                                                    {detail.notes}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                <ErrorText>{error}</ErrorText>
                            </Card>

                            {/* Timeline Card */}
                            {timelineItems.length > 0 && (
                                <Card
                                    title={<span style={cardTitleStyle}>Línea de Tiempo</span>}
                                    loading={loading}
                                    style={cardStyle}
                                >
                                    <Timeline items={timelineItems} />
                                </Card>
                            )}

                            {/* Images Gallery Card */}
                            <Card
                                title={<span style={cardTitleStyle}>Galería de Imágenes</span>}
                                style={cardStyle}
                            >
                                <Typography.Paragraph type="secondary" style={{ margin: "0 0 16px 0" }}>
                                    Arrastra o haz clic para subir imágenes de la muestra.
                                </Typography.Paragraph>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                        gap: 12,
                                    }}
                                >
                                    {/* Drag and Drop Upload Area */}
                                    <Upload.Dragger
                                        {...uploadProps}
                                        style={{
                                            borderRadius: tokens.radius,
                                            border: "1px dashed #d9d9d9",
                                            background: "#fafafa",
                                            padding: 12,
                                            height: 160,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            flexDirection: "column",
                                            color: "#8c8c8c",
                                        }}
                                    >
                                        <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                                        <Typography.Text strong>Agregar</Typography.Text>
                                        <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", textAlign: "center", fontSize: 12 }}>
                                            Clic o arrastra
                                        </Typography.Paragraph>
                                    </Upload.Dragger>

                                    {/* Images Grid */}
                                    {images && images.images.length > 0 && (
                                        <Image.PreviewGroup
                                            preview={{
                                                visible: preview.visible,
                                                current: preview.index,
                                                onVisibleChange: (visible) => setPreview((prev) => ({ ...prev, visible })),
                                                onChange: (current: number) => setPreview((prev) => ({ ...prev, index: current })),
                                            }}
                                        >
                                            {images.images.map((img, idx) => (
                                                <Card
                                                    key={img.id ?? idx}
                                                    size="small"
                                                    hoverable
                                                    style={{
                                                        width: "100%",
                                                        borderRadius: tokens.radius,
                                                        overflow: "hidden",
                                                        border: "1px solid #e5e7eb",
                                                        background: "#ffffff",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        height: "100%",
                                                    }}
                                                    bodyStyle={{ padding: 0, display: "flex", flexDirection: "column" }}
                                                >
                                                    <Image
                                                        src={img.urls.thumbnail || img.urls.processed}
                                                        alt={img.label || `Imagen ${idx + 1}`}
                                                        style={{ width: "100%", height: 110, objectFit: "cover" }}
                                                        fallback={img.urls.processed || img.urls.thumbnail}
                                                        preview={{ src: img.urls.processed || img.urls.thumbnail }}
                                                        onClick={() => setPreview({ visible: true, index: idx })}
                                                    />
                                                    <div style={{ 
                                                        display: "flex", 
                                                        alignItems: "center", 
                                                        justifyContent: "space-between", 
                                                        padding: "8px 10px", 
                                                        gap: 6,
                                                        borderTop: "1px solid #f0f0f0"
                                                    }}>
                                                        <span style={{ color: tokens.textSecondary, fontSize: 11 }}>
                                                            {new Date(img.created_at).toLocaleDateString("es-MX")}
                                                        </span>
                                                        {img.is_primary && (
                                                            <Tag color="#10b981" style={{ margin: 0, fontSize: 10, borderRadius: 8 }}>
                                                                Principal
                                                            </Tag>
                                                        )}
                                                    </div>
                                                </Card>
                                            ))}
                                        </Image.PreviewGroup>
                                    )}
                                </div>

                                {/* Empty state if no images */}
                                {(!images || images.images.length === 0) && (
                                    <div style={{ 
                                        marginTop: 12,
                                        padding: 24,
                                        textAlign: "center",
                                        color: tokens.textSecondary,
                                        fontSize: 13
                                    }}>
                                        No hay imágenes adicionales. Usa el área de arriba para subir.
                                    </div>
                                )}
                            </Card>

                            {/* Mobile Sidebar */}
                            <div className="sample-detail-sidebar-mobile">
                                <SidebarContent />
                            </div>
                        </div>

                        {/* Right Column - Sidebar (Desktop only) */}
                        <div className="sample-detail-sidebar-desktop">
                            <SidebarContent />
                        </div>
                    </div>
                </div>
            </Layout.Content>
        </Layout>
    );
}
