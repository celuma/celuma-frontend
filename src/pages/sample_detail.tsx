import { useEffect, useState, useCallback } from "react";
import { Layout, Card, Tag, Upload, Button as AntButton, Image, message, Avatar, Tooltip, Timeline, Typography, Dropdown, Input, Popconfirm, Spin } from "antd";
import type { UploadProps, MenuProps } from "antd";
import type { UploadRequestOption as RcCustomRequestOptions } from "rc-upload/lib/interface";
import { 
    ExperimentOutlined, CheckCircleOutlined,
    CalendarOutlined, SettingOutlined, PlusOutlined, FileImageOutlined,
    InboxOutlined, SkinOutlined, HeartOutlined, EyeOutlined, MedicineBoxOutlined,
    ContainerOutlined, EditOutlined, DeleteOutlined, LoadingOutlined
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

// Sample state configuration - matches backend SampleState enum
const SAMPLE_STATE_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida", icon: <InboxOutlined /> },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso", icon: <SettingOutlined /> },
    READY: { color: "#10b981", bg: "#ecfdf5", label: "Lista", icon: <CheckCircleOutlined /> },
    DAMAGED: { color: "#ef4444", bg: "#fef2f2", label: "Dañada", icon: <ExperimentOutlined /> },
    CANCELLED: { color: "#6b7280", bg: "#f3f4f6", label: "Cancelada", icon: <ExperimentOutlined /> },
};

// All valid sample states for the dropdown
const SAMPLE_STATES = ["RECEIVED", "PROCESSING", "READY", "DAMAGED", "CANCELLED"] as const;

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

type TimelineEvent = {
    id: string;
    event_type: string;
    description: string;
    metadata?: Record<string, unknown> | null;
    created_by?: string | null;
    created_by_name?: string | null;
    created_by_avatar?: string | null;
    created_at: string;
};

type EventsResponse = {
    events: TimelineEvent[];
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
    const [updatingState, setUpdatingState] = useState(false);
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    // Notes editing state
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);
    // Drag and drop state
    const [isDragging, setIsDragging] = useState(false);
    // Upload progress state
    const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
    // Deleting image state
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!sampleId) return;
        setLoading(true);
        setError(null);
        try {
            const [d, imgs, evts] = await Promise.all([
                getJSON<SampleDetail>(`/v1/laboratory/samples/${sampleId}`),
                getJSON<SampleImages>(`/v1/laboratory/samples/${sampleId}/images`),
                getJSON<EventsResponse>(`/v1/laboratory/samples/${sampleId}/events`),
            ]);
            setDetail(d);
            setImages(imgs);
            setEvents(evts.events);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    }, [sampleId]);

    useEffect(() => { refresh(); }, [refresh]);

    // Update sample state
    const updateState = useCallback(async (newState: string) => {
        if (!sampleId || updatingState) return;
        setUpdatingState(true);
        try {
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const res = await fetch(`${getApiBase()}/v1/laboratory/samples/${sampleId}/state`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: token } : {}),
                },
                body: JSON.stringify({ state: newState }),
                credentials: "include",
            });
            if (!res.ok) {
                const text = await res.text();
                let parsed: unknown = undefined;
                try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
                const msg = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
                throw new Error(msg);
            }
            const stateConfig = SAMPLE_STATE_CONFIG[newState] || SAMPLE_STATE_CONFIG.RECEIVED;
            message.success(`Estado cambiado a "${stateConfig.label}"`);
            await refresh();
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : "Error al actualizar el estado";
            message.error(errMsg);
        } finally {
            setUpdatingState(false);
        }
    }, [sampleId, updatingState, refresh]);

    // Update sample notes
    const updateNotes = useCallback(async () => {
        if (!sampleId || savingNotes) return;
        setSavingNotes(true);
        try {
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const res = await fetch(`${getApiBase()}/v1/laboratory/samples/${sampleId}/notes`, {
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
    }, [sampleId, savingNotes, notesValue, refresh]);

    // Delete sample image
    const deleteImage = useCallback(async (imageId: string) => {
        if (!sampleId || deletingImageId) return;
        setDeletingImageId(imageId);
        try {
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const res = await fetch(`${getApiBase()}/v1/laboratory/samples/${sampleId}/images/${imageId}`, {
                method: "DELETE",
                headers: {
                    ...(token ? { Authorization: token } : {}),
                },
                credentials: "include",
            });
            if (!res.ok) {
                const text = await res.text();
                let parsed: unknown = undefined;
                try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
                const msg = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
                throw new Error(msg);
            }
            message.success("Imagen eliminada");
            await refresh();
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : "Error al eliminar la imagen";
            message.error(errMsg);
        } finally {
            setDeletingImageId(null);
        }
    }, [sampleId, deletingImageId, refresh]);

    const uploadProps: UploadProps = {
        name: "file",
        multiple: true,
        showUploadList: false,
        customRequest: async (options: RcCustomRequestOptions) => {
            if (!sampleId) return;
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const formData = new FormData();
            const file = options.file as File;
            const fileName = file.name || "archivo";
            formData.append("file", file);
            
            // Add to uploading files list
            setUploadingFiles(prev => [...prev, fileName]);
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
                message.success(`"${fileName}" subida correctamente`);
                options.onSuccess?.({}, undefined as unknown as XMLHttpRequest);
                await refresh();
            } catch (e) {
                const errMsg = e instanceof Error ? e.message : "Error al subir la imagen";
                message.error(`Error al subir "${fileName}": ${errMsg}`);
                options.onError?.(new ProgressEvent("error"));
            } finally {
                // Remove from uploading files list
                setUploadingFiles(prev => prev.filter(f => f !== fileName));
                // Only set uploading to false when all files are done
                setUploadingFiles(prev => {
                    if (prev.length === 0) setUploading(false);
                    return prev;
                });
            }
        },
        onDrop: () => setIsDragging(false),
    } as const;

    const stateConfig = SAMPLE_STATE_CONFIG[detail?.state || "RECEIVED"] || { color: "#6b7280", bg: "#f3f4f6", label: detail?.state || "—", icon: <CheckCircleOutlined /> };
    const typeConfig = getSampleTypeConfig(detail?.type || "");

    // Dropdown menu for state change with styled tags (no icons)
    const stateMenuItems: MenuProps["items"] = SAMPLE_STATES.map((state) => {
        const config = SAMPLE_STATE_CONFIG[state];
        return {
            key: state,
            label: (
                <div style={{
                    backgroundColor: config.bg,
                    color: config.color,
                    borderRadius: 12,
                    padding: "6px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "center",
                    margin: "-4px -8px",
                }}>
                    {config.label}
                </div>
            ),
            disabled: detail?.state === state,
        };
    });

    const handleStateMenuClick: MenuProps["onClick"] = ({ key }) => {
        updateState(key);
    };

    // Event type configuration for timeline display
    const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
        SAMPLE_CREATED: { icon: <ExperimentOutlined />, color: "blue" },
        SAMPLE_RECEIVED: { icon: <InboxOutlined />, color: "green" },
        SAMPLE_STATE_CHANGED: { icon: <SettingOutlined />, color: "orange" },
        SAMPLE_NOTES_UPDATED: { icon: <EditOutlined />, color: "cyan" },
        SAMPLE_DAMAGED: { icon: <ExperimentOutlined />, color: "red" },
        SAMPLE_CANCELLED: { icon: <ExperimentOutlined />, color: "gray" },
        IMAGE_UPLOADED: { icon: <FileImageOutlined />, color: "purple" },
        IMAGE_DELETED: { icon: <FileImageOutlined />, color: "red" },
        STATUS_CHANGED: { icon: <SettingOutlined />, color: "orange" },
    };

    // Build action JSX from event (sample context - no need to mention sample)
    // Returns styled elements with state tags matching the UI
    const buildActionText = (event: TimelineEvent): React.ReactNode => {
        const meta = event.metadata || {};
        
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
                    </span>
                );
            }
            case "IMAGE_UPLOADED": {
                const filename = meta.filename as string || "imagen";
                return `subió la imagen ${filename}`;
            }
            case "IMAGE_DELETED": {
                const filename = meta.filename as string || "imagen";
                return `eliminó la imagen ${filename}`;
            }
            case "SAMPLE_NOTES_UPDATED": {
                const newNotes = meta.new_notes as string || "";
                if (newNotes) {
                    return "actualizó la descripción";
                }
                return "eliminó la descripción de la muestra";
            }
            case "SAMPLE_CREATED":
                return "registró la muestra";
            case "SAMPLE_RECEIVED":
                return "recibió la muestra en laboratorio";
            default:
                return event.description || event.event_type;
        }
    };

    // Build timeline from events API with avatar/monogram format
    const timelineItems = events.map((event) => {
        const config = EVENT_CONFIG[event.event_type] || { 
            icon: <CheckCircleOutlined />, 
            color: "gray"
        };
        const actionText = buildActionText(event);
        const userName = event.created_by_name || "Sistema";
        const userAvatar = event.created_by_avatar;
        
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
            color: config.color,
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
    });
    
    // Add initial dates if no events yet (fallback)
    if (timelineItems.length === 0) {
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
                                                    <Dropdown 
                                                        menu={{ items: stateMenuItems, onClick: handleStateMenuClick }} 
                                                        trigger={["click"]}
                                                        disabled={updatingState}
                                                    >
                                                        <div style={{ 
                                                            padding: "4px 10px",
                                                            borderRadius: 12,
                                                            background: stateConfig.bg,
                                                            color: stateConfig.color,
                                                            fontWeight: 600,
                                                            fontSize: 11,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 4,
                                                            cursor: "pointer",
                                                            transition: "all 0.15s ease",
                                                            border: `1px solid transparent`,
                                                        }}
                                                            onMouseEnter={(e) => e.currentTarget.style.borderColor = stateConfig.color}
                                                            onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
                                                        >
                                                            {updatingState ? (
                                                                <SettingOutlined spin />
                                                            ) : (
                                                                stateConfig.icon
                                                            )}
                                                            {stateConfig.label}
                                                        </div>
                                                    </Dropdown>
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

                                        {/* Description - editable */}
                                        <div style={{ 
                                            padding: 16, 
                                            background: "#f9fafb", 
                                            borderRadius: 8,
                                            border: "1px solid #e5e7eb"
                                        }}>
                                            <div style={{ 
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                marginBottom: 8
                                            }}>
                                                <div style={{ 
                                                    fontSize: 12, 
                                                    fontWeight: 600, 
                                                    color: tokens.textSecondary, 
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.5px"
                                                }}>
                                                    Descripción
                                                </div>
                                                {!editingNotes && (
                                                    <Tooltip title="Editar descripción">
                                                        <AntButton
                                                            type="text"
                                                            size="small"
                                                            icon={<EditOutlined />}
                                                            onClick={() => {
                                                                setNotesValue(detail.notes || "");
                                                                setEditingNotes(true);
                                                            }}
                                                            style={{ color: tokens.textSecondary }}
                                                        />
                                                    </Tooltip>
                                                )}
                                            </div>
                                            {editingNotes ? (
                                                <div>
                                                    <Input.TextArea
                                                        value={notesValue}
                                                        onChange={(e) => setNotesValue(e.target.value)}
                                                        placeholder="Escribe una descripción para esta muestra..."
                                                        autoSize={{ minRows: 2, maxRows: 6 }}
                                                        style={{ marginBottom: 8 }}
                                                        autoFocus
                                                    />
                                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                                        <AntButton 
                                                            size="small"
                                                            onClick={() => {
                                                                setEditingNotes(false);
                                                                setNotesValue(detail.notes || "");
                                                            }}
                                                            disabled={savingNotes}
                                                        >
                                                            Cancelar
                                                        </AntButton>
                                                        <AntButton 
                                                            size="small" 
                                                            type="primary"
                                                            onClick={updateNotes}
                                                            loading={savingNotes}
                                                        >
                                                            Guardar
                                                        </AntButton>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ 
                                                    color: detail.notes ? tokens.textPrimary : tokens.textSecondary, 
                                                    fontSize: 14,
                                                    lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap",
                                                    fontStyle: detail.notes ? "normal" : "italic"
                                                }}>
                                                    {detail.notes || "Sin descripción. Haz clic en el ícono de editar para agregar una."}
                                                </div>
                                            )}
                                        </div>
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
                                    <div
                                        onDragEnter={() => setIsDragging(true)}
                                        onDragLeave={(e) => {
                                            // Only set to false if leaving the container entirely
                                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                setIsDragging(false);
                                            }
                                        }}
                                        onDrop={() => setIsDragging(false)}
                                    >
                                        <Upload.Dragger
                                            {...uploadProps}
                                            style={{
                                                borderRadius: tokens.radius,
                                                border: isDragging ? "2px dashed #0f8b8d" : "1px dashed #d9d9d9",
                                                background: isDragging ? "#e6f7f7" : "#fafafa",
                                                padding: 12,
                                                height: 160,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexDirection: "column",
                                                color: isDragging ? "#0f8b8d" : "#8c8c8c",
                                                transition: "all 0.2s ease",
                                                transform: isDragging ? "scale(1.02)" : "scale(1)",
                                            }}
                                        >
                                            {uploading ? (
                                                <>
                                                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                                                    <Typography.Text strong style={{ marginTop: 8 }}>
                                                        Subiendo {uploadingFiles.length > 0 ? `(${uploadingFiles.length})` : "..."}
                                                    </Typography.Text>
                                                    {uploadingFiles.length > 0 && (
                                                        <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", textAlign: "center", fontSize: 11 }}>
                                                            {uploadingFiles.slice(0, 2).join(", ")}{uploadingFiles.length > 2 ? ` y ${uploadingFiles.length - 2} más` : ""}
                                                        </Typography.Paragraph>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                                                    <Typography.Text strong>{isDragging ? "Suelta aquí" : "Agregar"}</Typography.Text>
                                                    <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", textAlign: "center", fontSize: 12 }}>
                                                        {isDragging ? "Suelta para subir" : "Clic o arrastra"}
                                                    </Typography.Paragraph>
                                                </>
                                            )}
                                        </Upload.Dragger>
                                    </div>

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
                                                        position: "relative",
                                                    }}
                                                    bodyStyle={{ padding: 0, display: "flex", flexDirection: "column" }}
                                                >
                                                    {/* Action buttons overlay */}
                                                    <div style={{
                                                        position: "absolute",
                                                        top: 4,
                                                        right: 4,
                                                        display: "flex",
                                                        gap: 4,
                                                        zIndex: 10,
                                                    }}>
                                                        <Tooltip title="Ver imagen">
                                                            <AntButton
                                                                size="small"
                                                                type="text"
                                                                icon={<EyeOutlined />}
                                                                onClick={() => setPreview({ visible: true, index: idx })}
                                                                style={{ 
                                                                    background: "rgba(255,255,255,0.9)", 
                                                                    borderRadius: 4,
                                                                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
                                                                }}
                                                            />
                                                        </Tooltip>
                                                        <Popconfirm
                                                            title="Eliminar imagen"
                                                            description="¿Estás seguro de eliminar esta imagen?"
                                                            okText="Sí, eliminar"
                                                            cancelText="Cancelar"
                                                            okButtonProps={{ danger: true }}
                                                            onConfirm={() => deleteImage(img.id)}
                                                        >
                                                            <Tooltip title="Eliminar">
                                                                <AntButton
                                                                    size="small"
                                                                    type="text"
                                                                    danger
                                                                    icon={deletingImageId === img.id ? <LoadingOutlined spin /> : <DeleteOutlined />}
                                                                    disabled={deletingImageId !== null}
                                                                    style={{ 
                                                                        background: "rgba(255,255,255,0.9)", 
                                                                        borderRadius: 4,
                                                                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        </Popconfirm>
                                                    </div>
                                            <Image
                                                src={img.urls.thumbnail || img.urls.processed}
                                                        alt={img.label || `Imagen ${idx + 1}`}
                                                        style={{ width: "100%", height: 110, objectFit: "cover", cursor: "pointer" }}
                                                        fallback={img.urls.processed || img.urls.thumbnail}
                                                preview={{ src: img.urls.processed || img.urls.thumbnail }}
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
