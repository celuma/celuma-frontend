import { useEffect, useState, useCallback, useRef } from "react";
import { Layout, Card, Image, message, Avatar, Tooltip, Timeline, Dropdown, Badge, Empty } from "antd";
import type { UploadProps } from "antd";
import type { UploadRequestOption as RcCustomRequestOptions } from "rc-upload/lib/interface";
import {
    ExperimentOutlined, CheckCircleOutlined,
    CalendarOutlined, SettingOutlined, FileImageOutlined,
    InboxOutlined, ContainerOutlined, EditOutlined,
    ClockCircleOutlined, CheckOutlined, FlagOutlined
} from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import CelumaButton from "../components/ui/button";
import Panel from "../components/ui/panel";
import ActionButtonPanel from "../components/ui/action_button_panel";
import CelumaTextArea from "../components/ui/textarea_field";
import UploadDropzone from "../components/ui/upload_dropzone";
import ImageGalleryCard from "../components/ui/image_gallery_card";
import ConfirmDialog from "../components/ui/confirm_dialog";
import CelumaTabs from "../components/ui/celuma_tabs";
import RecordCard, { codeChipStyle, statusChipStyle, MetaItem, Stat } from "../components/ui/record_card";
import { tokens, cardStyle } from "../components/design/tokens";
import AssigneesSection from "../components/collaboration/AssigneesSection";
import LabelsSection from "../components/collaboration/LabelsSection";
import { RailSectionHeader, RailConfigButton } from "../components/collaboration/RailSectionHeader";
import type { Label, LabUser, LabelWithInheritance } from "../services/collaboration_service";
import {
    getLabels,
    getLabUsers,
    updateSampleAssignees,
    updateSampleLabels
} from "../services/collaboration_service";
import { getSampleTypeConfig } from "../components/ui/table_helpers";
import { getInitials, getAvatarColor, formatLocalDateTime, renderUserMention } from "../components/comments/comment_utils";

// Predefined label colors (same as in LabelsSection)
const LABEL_COLORS = [
    { color: "#3b82f6", bg: "#eff6ff" },
    { color: "#f59e0b", bg: "#fffbeb" },
    { color: "#8b5cf6", bg: "#f5f3ff" },
    { color: "#ec4899", bg: "#fdf2f8" },
    { color: "#10b981", bg: "#ecfdf5" },
    { color: "#ef4444", bg: "#fef2f2" },
    { color: "#06b6d4", bg: "#ecfeff" },
    { color: "#84cc16", bg: "#f7fee7" },
    { color: "#6366f1", bg: "#eef2ff" },
    { color: "#a855f7", bg: "#faf5ff" },
    { color: "#f97316", bg: "#fff7ed" },
    { color: "#14b8a6", bg: "#f0fdfa" },
];

// Sample state configuration - matches backend SampleState enum
const SAMPLE_STATE_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida", icon: <InboxOutlined /> },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso", icon: <SettingOutlined /> },
    READY: { color: "#10b981", bg: "#ecfdf5", label: "Lista", icon: <CheckCircleOutlined /> },
    DAMAGED: { color: "#ef4444", bg: "#fef2f2", label: "Insuficiente", icon: <ExperimentOutlined /> },
    CANCELLED: { color: "#6b7280", bg: "#f3f4f6", label: "Cancelada", icon: <ExperimentOutlined /> },
};

// All valid sample states for the dropdown
const SAMPLE_STATES = ["RECEIVED", "PROCESSING", "READY", "DAMAGED", "CANCELLED"] as const;

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
    assignees?: Array<{ id: string; name: string; email: string; avatar_url?: string | null }> | null;
    labels?: LabelWithInheritance[] | null;
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
    const [updatingState, setUpdatingState] = useState(false);
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    // Active tab in the content card ("timeline" by default so it shows first)
    const [activeTab, setActiveTab] = useState<string>("timeline");
    // State picker dropdown open state (controlled so it closes on selection)
    const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
    // Image pending delete confirmation (null = dialog closed)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    // Notes editing state
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);
    // Upload progress state
    const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
    // Deleting image state
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
    
    // Collaboration states
    const [allLabels, setAllLabels] = useState<Label[]>([]);
    const [allUsers, setAllUsers] = useState<LabUser[]>([]);
    
    // Ref for gallery scroll
    const galleryRef = useRef<HTMLDivElement>(null);

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

    // Function to load collaboration data (labels and users)
    const loadCollaborationData = useCallback(async () => {
        try {
            const [labelsData, usersData] = await Promise.all([
                getLabels(),
                getLabUsers(),
            ]);
            setAllLabels(labelsData);
            setAllUsers(usersData);
        } catch (err) {
            console.error("Error loading collaboration data:", err);
        }
    }, []);

    // Handlers for updating collaboration
    const handleUpdateAssignees = useCallback(async (userIds: string[]) => {
        if (!sampleId) return;
        try {
            await updateSampleAssignees(sampleId, userIds);
            await refresh();
            message.success("Assignees actualizados");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar assignees");
            throw err;
        }
    }, [sampleId, refresh]);

    const handleUpdateLabels = useCallback(async (labelIds: string[]) => {
        if (!sampleId || !detail) return;
        // Only send own labels (filter out inherited ones)
        const newOwnLabels = labelIds.filter(id => 
            !detail.labels?.some(l => l.id === id && l.inherited)
        );
        
        try {
            await updateSampleLabels(sampleId, newOwnLabels);
            await refresh();
            message.success("Labels actualizados");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar labels");
            throw err;
        }
    }, [sampleId, refresh, detail]);

    useEffect(() => { 
        refresh();
        loadCollaborationData();
    }, [refresh, loadCollaborationData]);

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

    // Handle navigation to gallery (switch tab + scroll to the content card)
    const handleGoToGallery = useCallback(() => {
        setActiveTab("gallery");
        if (galleryRef.current) {
            galleryRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

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
    } as const;

    const stateConfig = SAMPLE_STATE_CONFIG[detail?.state || "RECEIVED"] || { color: "#6b7280", bg: "#f3f4f6", label: detail?.state || "—", icon: <CheckCircleOutlined /> };
    const typeConfig = getSampleTypeConfig(detail?.type || "");

    // State picker popup — same Céluma language as the Asignados/Etiquetas pickers:
    // rounded card + brand shadow, soft-circle icon rows with navy labels, the
    // current state highlighted in teal tint with a check.
    const stateDropdownContent = (
        <div
            style={{
                background: "#fff",
                borderRadius: 14,
                boxShadow: tokens.shadow,
                border: "1px solid #eef1f0",
                width: 260,
                maxWidth: "92vw",
                overflow: "hidden",
                padding: "6px 8px",
                display: "grid",
                gap: 2,
            }}
        >
            {SAMPLE_STATES.map((state) => {
                const config = SAMPLE_STATE_CONFIG[state];
                const active = detail?.state === state;
                const baseBg = active ? "#eaf7f5" : "transparent";
                return (
                    <div
                        key={state}
                        role="button"
                        onClick={() => {
                            setStateDropdownOpen(false);
                            if (!active) updateState(state);
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f1faf8"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = baseBg; }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "7px 10px",
                            borderRadius: 10,
                            cursor: active ? "default" : "pointer",
                            background: baseBg,
                            transition: "background .15s ease",
                        }}
                    >
                        <span style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: `${config.color}1a`,
                            color: config.color,
                            border: `2px solid ${config.color}33`,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            flexShrink: 0,
                        }}>
                            {config.icon}
                        </span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: tokens.textPrimary }}>
                            {config.label}
                        </span>
                        {active && <CheckOutlined style={{ color: tokens.primary, fontSize: 13, flexShrink: 0 }} />}
                    </div>
                );
            })}
        </div>
    );

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
                        Cambió el estado de{" "}
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
                return `Subió la imagen ${filename}`;
            }
            case "IMAGE_DELETED": {
                const filename = meta.filename as string || "imagen";
                return `Eliminó la imagen ${filename}`;
            }
            case "SAMPLE_NOTES_UPDATED": {
                const newNotes = meta.new_notes as string || "";
                if (newNotes) {
                    return "Actualizó la descripción";
                }
                return "Eliminó la descripción de la muestra";
            }
            case "SAMPLE_CREATED":
                return "Registró la muestra";
            case "SAMPLE_RECEIVED":
                return "Recibió la muestra en laboratorio";
            case "ASSIGNEES_ADDED": {
                const added = (meta.added as Array<{name: string; username?: string; avatar?: string | null}>) || [];
                const count = added.length;
                const userName = event.created_by_name || "Sistema";
                
                // Check if user assigned themselves
                const selfAssigned = added.some(u => u.name === userName);
                const othersCount = selfAssigned ? count - 1 : count;
                
                if (selfAssigned && othersCount === 0) {
                    return "Se asignó a sí mismo";
                } else if (selfAssigned && othersCount > 0) {
                    const others = added.filter(u => u.name !== userName);
                    return (
                        <span>
                            Se asignó a sí mismo y a{" "}
                            {others.map((u, idx) => (
                                <span key={u.name}>
                                    {idx > 0 && ", "}
                                    {renderUserMention(u)}
                                </span>
                            ))}
                        </span>
                    );
                } else {
                    return (
                        <span>
                            Asignó a{" "}
                            {added.map((u, idx) => (
                                <span key={u.name}>
                                    {idx > 0 && ", "}
                                    {renderUserMention(u)}
                                </span>
                            ))}
                        </span>
                    );
                }
            }
            case "ASSIGNEES_REMOVED": {
                const removed = (meta.removed as Array<{name: string; username?: string; avatar?: string | null}>) || [];
                const count = removed.length;
                const userName = event.created_by_name || "Sistema";
                
                // Check if user removed themselves
                const selfRemoved = removed.some(u => u.name === userName);
                const othersCount = selfRemoved ? count - 1 : count;
                
                if (selfRemoved && othersCount === 0) {
                    return "Se desasignó a sí mismo";
                } else if (selfRemoved && othersCount > 0) {
                    const others = removed.filter(u => u.name !== userName);
                    return (
                        <span>
                            Se desasignó a sí mismo y a{" "}
                            {others.map((u, idx) => (
                                <span key={u.name}>
                                    {idx > 0 && ", "}
                                    {renderUserMention(u)}
                                </span>
                            ))}
                        </span>
                    );
                } else {
                    return (
                        <span>
                            Desasignó a{" "}
                            {removed.map((u, idx) => (
                                <span key={u.name}>
                                    {idx > 0 && ", "}
                                    {renderUserMention(u)}
                                </span>
                            ))}
                        </span>
                    );
                }
            }
            case "LABELS_ADDED": {
                const added = (meta.added as Array<{name: string; color: string}>) || [];
                const count = added.length;
                return (
                    <span>
                        Agregó {count} {count === 1 ? "etiqueta" : "etiquetas"}:{" "}
                        {added.map((label, idx) => {
                            const colorConfig = LABEL_COLORS.find(c => c.color === label.color) || { color: label.color, bg: label.color + "20" };
                            return (
                                <span key={idx}>
                                    <span
                                        style={{ 
                                            padding: "2px 8px",
                                            borderRadius: 4,
                                            background: colorConfig.bg,
                                            color: colorConfig.color,
                                            fontWeight: 600,
                                            fontSize: 11,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            margin: "0 4px",
                                        }}
                                    >
                                        {label.name}
                                    </span>
                                    {idx < added.length - 1 && ", "}
                                </span>
                            );
                        })}
                    </span>
                );
            }
            case "LABELS_REMOVED": {
                const removed = (meta.removed as Array<{name: string; color: string}>) || [];
                const count = removed.length;
                return (
                    <span>
                        Removió {count} {count === 1 ? "etiqueta" : "etiquetas"}:{" "}
                        {removed.map((label, idx) => {
                            const colorConfig = LABEL_COLORS.find(c => c.color === label.color) || { color: label.color, bg: label.color + "20" };
                            return (
                                <span key={idx}>
                                    <span
                                        style={{ 
                                            padding: "2px 8px",
                                            borderRadius: 4,
                                            background: colorConfig.bg,
                                            color: colorConfig.color,
                                            fontWeight: 600,
                                            fontSize: 11,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            margin: "0 4px",
                                        }}
                                    >
                                        {label.name}
                                    </span>
                                    {idx < removed.length - 1 && ", "}
                                </span>
                            );
                        })}
                    </span>
                );
            }
            default:
                return event.description || event.event_type;
        }
    };

    // Build timeline from events API with avatar/monogram format
    const timelineItems = events.map((event, index) => {
        // Check if previous event is from the same user
        const prevEvent = index > 0 ? events[index - 1] : null;
        const isSameUserAsPrevious = prevEvent && prevEvent.created_by === event.created_by;
        
        const config = EVENT_CONFIG[event.event_type] || { 
            icon: <CheckCircleOutlined />, 
            color: "gray"
        };
        const actionText = buildActionText(event);
        const userName = event.created_by_name || "Sistema";
        const userAvatar = event.created_by_avatar;
        
        return {
            dot: isSameUserAsPrevious ? (
                <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#d1d5db",
                    border: "2px solid white",
                }} />
            ) : (
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
                    {!isSameUserAsPrevious && (
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {userName}
                    </div>
                )}
                <div style={{ color: "#666", lineHeight: 1.5, marginBottom: 4 }}>
                    {actionText}
                </div>
                    <div style={{ fontSize: 12, color: "#888" }}>
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

    // Sidebar content as a JSX value (NOT a nested component). Rendering it as a
    // component would give it a fresh identity on every re-render, remounting the
    // rail and resetting the collaboration dropdowns' state mid-interaction. As a
    // value it's reconciled by position and keeps its state across re-renders.
    const sidebarContent = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            {/* Estado — change the sample state from a rail action card */}
            <Card
                size="small"
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <RailSectionHeader
                    icon={<FlagOutlined />}
                    color={tokens.primary}
                    title="Estado"
                    trigger={
                        <Dropdown
                            popupRender={() => stateDropdownContent}
                            trigger={["click"]}
                            disabled={updatingState}
                            open={stateDropdownOpen}
                            onOpenChange={setStateDropdownOpen}
                            placement="bottomRight"
                        >
                            <RailConfigButton disabled={updatingState} />
                        </Dropdown>
                    }
                />
                {/* Current state shown the same way assignees are: soft-circle + label row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                        width: 24,
                        height: 24,
                        borderRadius: 7,
                        background: `${stateConfig.color}1a`,
                        color: stateConfig.color,
                        border: `2px solid ${stateConfig.color}33`,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        flexShrink: 0,
                    }}>
                        {updatingState ? <SettingOutlined spin /> : stateConfig.icon}
                    </span>
                    <span style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: 500,
                        color: tokens.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}>
                        {stateConfig.label}
                    </span>
                </div>
            </Card>

            {/* Assignees */}
            <Card
                size="small"
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <AssigneesSection
                    assignees={detail?.assignees || []}
                    allUsers={allUsers}
                    onUpdate={handleUpdateAssignees}
                />
            </Card>

            {/* Labels */}
            <Card
                size="small"
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <LabelsSection
                    labels={detail?.labels || []}
                    allLabels={allLabels}
                    onUpdate={handleUpdateLabels}
                    onLabelsRefresh={loadCollaborationData}
                    showInheritance={true}
                />
            </Card>
        </div>
    );

    // ── Timeline tab content (Céluma styled connectors) ──
    const timelineTabContent = timelineItems.length > 0 ? (
        <Timeline className="sd-timeline" items={timelineItems} />
    ) : (
        <Empty description="Sin eventos registrados" />
    );

    // ── Gallery tab content — reusable Céluma dropzone + image cards ──
    const galleryTabContent = (
        <div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                }}
            >
                <UploadDropzone
                    customRequest={uploadProps.customRequest}
                    accept="image/*"
                    uploading={uploading}
                    uploadingFiles={uploadingFiles}
                />

                {images && images.images.length > 0 && (
                    <Image.PreviewGroup>
                        {images.images.map((img, idx) => (
                            <ImageGalleryCard
                                key={img.id ?? idx}
                                src={img.urls.thumbnail || img.urls.processed}
                                previewSrc={img.urls.processed || img.urls.thumbnail}
                                alt={img.label || `Imagen ${idx + 1}`}
                                date={img.created_at}
                                isPrimary={img.is_primary}
                                deleting={deletingImageId === img.id}
                                deleteDisabled={deletingImageId !== null}
                                onDelete={() => setConfirmDeleteId(img.id)}
                            />
                        ))}
                    </Image.PreviewGroup>
                )}
            </div>

            {/* Empty state if no images */}
            {(!images || images.images.length === 0) && (
                <div style={{ marginTop: 12, padding: 24, textAlign: "center", color: tokens.textSecondary, fontSize: 13 }}>
                    No hay imágenes adicionales. Usa el área de arriba para subir.
                </div>
            )}

            <ConfirmDialog
                open={confirmDeleteId !== null}
                danger
                title="Eliminar imagen"
                description="¿Estás seguro de eliminar esta imagen? Esta acción no se puede deshacer."
                confirmText="Eliminar"
                cancelText="Cancelar"
                loading={deletingImageId !== null}
                onConfirm={async () => {
                    if (confirmDeleteId) await deleteImage(confirmDeleteId);
                    setConfirmDeleteId(null);
                }}
                onCancel={() => setConfirmDeleteId(null)}
            />
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
                            grid-template-columns: minmax(0, 1fr) 280px;
                            gap: ${tokens.gap}px;
                            align-items: start;
                        }
                        .sample-detail-grid > * {
                            min-width: 0;
                        }
                        .sd-main { display: grid; gap: ${tokens.gap}px; min-width: 0; }
                        .sd-main > * { min-width: 0; }
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

                        /* Céluma timeline — soft connector + comfortable spacing */
                        .sd-timeline { padding-top: 4px; }
                        .sd-timeline .ant-timeline-item-tail { border-inline-start: 2px solid #eef1f0; }
                        .sd-timeline .ant-timeline-item { padding-bottom: 22px; }
                        .sd-timeline .ant-timeline-item-head { background: transparent; }
                    `}</style>

                    {/* Main Grid Layout */}
                    <div className="sample-detail-grid">
                        {/* Left Column - Main Content */}
                        <div className="sd-main">
                            {/* Sample Header — Céluma ficha */}
                            <RecordCard
                                loading={loading}
                                avatar={detail && (
                                    <Tooltip title="Ver perfil del paciente">
                                        <Avatar
                                            size={104}
                                            onClick={() => navigate(`/patients/${detail.patient.id}`)}
                                            style={{
                                                backgroundColor: getAvatarColor(detail.patient.full_name || detail.patient.patient_code),
                                                fontSize: 38,
                                                fontWeight: 700,
                                                border: "2px solid #d1d5db",
                                                flexShrink: 0,
                                                cursor: "pointer",
                                            }}
                                        >
                                            {getInitials(detail.patient.full_name || detail.patient.patient_code)}
                                        </Avatar>
                                    </Tooltip>
                                )}
                                chips={detail && (
                                    <>
                                        <span style={codeChipStyle}>{detail.sample_code}</span>
                                        <span style={statusChipStyle(stateConfig)}>
                                            {stateConfig.icon}
                                            {stateConfig.label}
                                        </span>
                                    </>
                                )}
                                title={detail && (
                                    <h1
                                        onClick={() => navigate(`/patients/${detail.patient.id}`)}
                                        style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 26, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1, cursor: "pointer" }}
                                    >
                                        {detail.patient.full_name || detail.patient.patient_code}
                                    </h1>
                                )}
                                subtitle={detail?.patient.patient_code}
                                meta={detail && (
                                    <>
                                        <MetaItem icon={typeConfig.icon}>
                                            <span style={{ marginRight: 4 }}>Tipo:</span>
                                            <span style={{ fontWeight: 600, color: tokens.textPrimary }}>{typeConfig.label}</span>
                                        </MetaItem>
                                        <MetaItem icon={<ContainerOutlined />}>
                                            <span style={{ marginRight: 4 }}>Orden:</span>
                                            <a
                                                href={`/orders/${detail.order.id}`}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    navigate(`/orders/${detail.order.id}`);
                                                }}
                                                style={{ fontWeight: 600, color: tokens.primary }}
                                            >
                                                {detail.order.order_code}
                                            </a>
                                        </MetaItem>
                                        {detail.received_at && (
                                            <MetaItem icon={<CalendarOutlined />}>
                                                <span style={{ marginRight: 4 }}>Recibida:</span>
                                                {new Date(detail.received_at).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })}
                                            </MetaItem>
                                        )}
                                        <MetaItem icon={<InboxOutlined />}>
                                            <span style={{ marginRight: 4 }}>Sucursal:</span>
                                            <span style={{ fontWeight: 600, color: tokens.textPrimary }}>
                                                {`${detail.branch.code ?? ""} ${detail.branch.name ?? ""}`.trim() || "—"}
                                            </span>
                                        </MetaItem>
                                    </>
                                )}
                                stats={detail && (
                                    <div style={{ cursor: "pointer" }} onClick={handleGoToGallery}>
                                        <Stat value={images?.images.length || 0} label="Imágenes" color={tokens.primary} />
                                    </div>
                                )}
                                rail={detail && (
                                    <ActionButtonPanel
                                        actions={[
                                            { icon: <ContainerOutlined />, tooltip: "Ver orden", ariaLabel: "Ver orden", onClick: () => navigate(`/orders/${detail.order.id}`) },
                                        ]}
                                    />
                                )}
                            >
                                {detail && (
                                    <>
                                        {/* Description - at the bottom (Céluma panel) */}
                                        <Panel style={{ marginTop: 20 }}>
                                            <div style={{
                                                fontSize: 12,
                                                fontWeight: 600,
                                                color: tokens.textSecondary,
                                                marginBottom: editingNotes ? 10 : 8,
                                                textTransform: "uppercase",
                                                letterSpacing: "0.5px",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                            }}>
                                                <span>Descripción</span>
                                                {!editingNotes && (
                                                    <EditOutlined
                                                        style={{ fontSize: 14, color: tokens.primary, cursor: "pointer" }}
                                                        onClick={() => {
                                                            setNotesValue(detail.notes || "");
                                                            setEditingNotes(true);
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            {editingNotes ? (
                                                <div style={{ display: "grid", gap: 8 }}>
                                                    <CelumaTextArea
                                                        value={notesValue}
                                                        onChange={setNotesValue}
                                                        placeholder="Escribe una descripción para esta muestra..."
                                                        rows={4}
                                                        maxLength={500}
                                                        autoFocus
                                                    />
                                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                                        <CelumaButton
                                                            size="xsmall"
                                                            danger
                                                            onClick={() => {
                                                                setEditingNotes(false);
                                                                setNotesValue(detail.notes || "");
                                                            }}
                                                            disabled={savingNotes}
                                                        >
                                                            Cancelar
                                                        </CelumaButton>
                                                        <CelumaButton
                                                            type="primary"
                                                            size="xsmall"
                                                            onClick={updateNotes}
                                                            loading={savingNotes}
                                                        >
                                                            Guardar
                                                        </CelumaButton>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{
                                                    color: detail.notes ? tokens.textPrimary : tokens.textSecondary,
                                                    fontSize: 14,
                                                    lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap",
                                                    fontStyle: detail.notes ? "normal" : "italic",
                                                }}>
                                                    {detail.notes || "Sin descripción"}
                                                </div>
                                            )}
                                        </Panel>
                                    </>
                                )}
                                <ErrorText>{error}</ErrorText>
                            </RecordCard>

                            {/* Tabs Card — "Línea de Tiempo" is the default tab */}
                            <div ref={galleryRef}>
                                <Card loading={loading} style={cardStyle}>
                                    <CelumaTabs
                                        activeKey={activeTab}
                                        onChange={setActiveTab}
                                        items={[
                                            {
                                                key: "timeline",
                                                label: (
                                                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <ClockCircleOutlined />
                                                        Línea de Tiempo
                                                    </span>
                                                ),
                                                children: timelineTabContent,
                                            },
                                            {
                                                key: "gallery",
                                                label: (
                                                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <FileImageOutlined />
                                                        Galería de Imágenes
                                                        <Badge
                                                            count={images?.images.length || 0}
                                                            style={{ backgroundColor: tokens.primary }}
                                                            size="small"
                                                        />
                                                    </span>
                                                ),
                                                children: galleryTabContent,
                                            },
                                        ]}
                                    />
                                </Card>
                            </div>

                            {/* Mobile Sidebar */}
                            <div className="sample-detail-sidebar-mobile">
                                {sidebarContent}
                            </div>
                        </div>

                        {/* Right Column - Sidebar (Desktop only) */}
                        <div className="sample-detail-sidebar-desktop">
                            {sidebarContent}
                        </div>
                    </div>
                </div>
            </Layout.Content>
        </Layout>
    );
}
