import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Layout, Card, Avatar, Empty, Button as AntButton, message, Timeline, Steps, Tabs, Badge, Tooltip, Input } from "antd";
import { 
    ReloadOutlined, FilePdfOutlined, CheckCircleOutlined, 
    FileTextOutlined, InboxOutlined, 
    ExperimentOutlined, SolutionOutlined, AuditOutlined, SendOutlined, 
    LockOutlined, CloseCircleOutlined, UserOutlined, CalendarOutlined,
    MessageOutlined, PlusOutlined, ExclamationCircleOutlined, SettingOutlined, EditOutlined,
    DollarOutlined
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
import { useUserProfile } from "../hooks/use_user_profile";
import AssigneesSection from "../components/collaboration/AssigneesSection";
import ReviewersSection from "../components/collaboration/ReviewersSection";
import LabelsSection from "../components/collaboration/LabelsSection";
import type { Label, LabUser, UserRef } from "../services/collaboration_service";
import type { ReviewerWithStatus } from "../services/worklist_service";
import { 
    getLabels, 
    getLabUsers, 
    updateOrderAssignees, 
    updateOrderReviewers, 
    updateOrderLabels 
} from "../services/collaboration_service";
import CommentInput from "../components/comments/comment_input";
import CommentList from "../components/comments/comment_list";
import type { CommentData } from "../components/comments/comment_item";
import { 
    getInitials, 
    getAvatarColor, 
    formatLocalDateTime,
    renderUserMention 
} from "../components/comments/comment_utils";
import { renderLabels } from "../components/ui/table_helpers";
import { getSampleTypeConfig } from "../components/ui/table_helpers";

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
        report_id?: string | null;
        invoice_id?: string | null;
        created_at?: string | null;
        assignees?: UserRef[] | null;
        reviewers?: ReviewerWithStatus[] | null;
        labels?: Label[] | null;
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
        assignees?: Array<{ id: string; name: string; email: string; avatar_url?: string | null }> | null;
        labels?: Array<{ id: string; name: string; color: string; inherited?: boolean }> | null;
    }>;
    report?: {
        id: string;
        status: string;
        title?: string | null;
        published_at?: string | null;
        version_no?: number | null;
        has_pdf?: boolean;
    } | null;
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
    DAMAGED: { color: "#ef4444", bg: "#fef2f2", label: "Insuficiente", icon: <ExperimentOutlined /> },
    CANCELLED: { color: "#6b7280", bg: "#f3f4f6", label: "Cancelada", icon: <ExperimentOutlined /> },
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
    
    // Conversation state
    const [conversation, setConversation] = useState<Array<{
        id: string;
        user_id: string;
        user_name: string;
        user_avatar?: string | null;
        text: string;
        mentions: string[];
        mentioned_users?: Array<{
            user_id: string;
            username: string;
            name: string;
            avatar?: string | null;
        }>;
        created_at: string;
    }>>([]);
    const [commentText, setCommentText] = useState("");
    const [submittingComment, setSubmittingComment] = useState(false);
    const [loadingConversation, setLoadingConversation] = useState(false);

    // Collaboration states
    const [allLabels, setAllLabels] = useState<Label[]>([]);
    const [allUsers, setAllUsers] = useState<LabUser[]>([]);

    const conversationScrollRef = useRef<HTMLDivElement>(null);
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    
    // Get current user profile for avatar and name
    const { profile: currentUserProfile } = useUserProfile();
    
    // Scroll to bottom of conversation
    const scrollToBottom = useCallback(() => {
        // Use requestAnimationFrame and multiple attempts to ensure scroll reaches bottom
        requestAnimationFrame(() => {
            if (conversationScrollRef.current) {
                conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
            }
            setTimeout(() => {
                if (conversationScrollRef.current) {
                    conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
                }
            }, 50);
            setTimeout(() => {
                if (conversationScrollRef.current) {
                    conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
                }
            }, 200);
        });
    }, []);

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

                // Get report id from the order full response
                foundReportId = full.order.report_id ?? full.report?.id ?? null;
                    setReportId(foundReportId);

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

    // Check if user is scrolled to bottom (with some tolerance)
    const isScrolledToBottom = useCallback(() => {
        if (!conversationScrollRef.current) return false;
        const { scrollTop, scrollHeight, clientHeight } = conversationScrollRef.current;
        // Consider "at bottom" if within 100px of bottom
        return scrollHeight - scrollTop - clientHeight < 100;
    }, []);

    // Refresh only timeline (lightweight update)
    const refreshTimeline = useCallback(async () => {
        if (!orderId) return;
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
        } catch (err) {
            console.error("Error loading timeline:", err);
        }
    }, [orderId]);

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
        if (!orderId) return;
        try {
            await updateOrderAssignees(orderId, userIds);
            await refresh();
            await refreshTimeline();
            message.success("Assignees actualizados");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar assignees");
            throw err;
        }
    }, [orderId, refresh, refreshTimeline]);

    const handleUpdateReviewers = useCallback(async (userIds: string[]) => {
        if (!orderId) return;
        try {
            await updateOrderReviewers(orderId, userIds);
            await refresh();
            await refreshTimeline();
            message.success("Reviewers actualizados");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar reviewers");
            throw err;
        }
    }, [orderId, refresh, refreshTimeline]);

    const handleUpdateLabels = useCallback(async (labelIds: string[]) => {
        if (!orderId) return;
        try {
            await updateOrderLabels(orderId, labelIds);
            await refresh();
            await refreshTimeline();
            message.success("Labels actualizados");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar labels");
            throw err;
        }
    }, [orderId, refresh, refreshTimeline]);

    // Load conversation with smart scroll behavior
    const loadConversation = useCallback(async (options?: { forceScrollToBottom?: boolean; silent?: boolean }) => {
        if (!orderId) return;
        
        // Save scroll position before loading
        const wasAtBottom = isScrolledToBottom();
        
        if (!options?.silent) {
            setLoadingConversation(true);
        }
        
        try {
            const response = await getJSON<{ 
                items: Array<{
                    id: string;
                    created_by: string;
                    created_by_name?: string | null;
                    created_by_avatar?: string | null;
                    text: string;
                    mentions: string[];
                    mentioned_users?: Array<{
                        user_id: string;
                        username: string;
                        name: string;
                        avatar?: string | null;
                    }>;
                    created_at: string;
                }>;
                page_info: {
                    has_more: boolean;
                    next_before?: string | null;
                    next_after?: string | null;
                };
            }>(`/v1/laboratory/orders/${orderId}/comments`);
            
            // Map backend fields to frontend format
            const mappedComments = (response.items || []).map(item => ({
                id: item.id,
                user_id: item.created_by,
                user_name: item.created_by_name || "Unknown User",
                user_avatar: item.created_by_avatar,
                text: item.text,
                mentions: item.mentions,
                mentioned_users: item.mentioned_users,
                created_at: item.created_at,
            }));
            
            setConversation(mappedComments);
            
            // Only scroll to bottom if: forced, was at bottom, or first load
            if (options?.forceScrollToBottom || wasAtBottom || conversation.length === 0) {
                scrollToBottom();
            }
        } catch (err) {
            console.error("Error loading conversation:", err);
        } finally {
            if (!options?.silent) {
                setLoadingConversation(false);
            }
        }
    }, [orderId, scrollToBottom, isScrolledToBottom, conversation.length]);
    
    // Refresh conversation and timeline without affecting scroll or other parts
    const refreshConversationAndTimeline = useCallback(async () => {
        await Promise.all([
            loadConversation({ silent: true }),
            refreshTimeline()
        ]);
    }, [loadConversation, refreshTimeline]);
    
    // Add comment to conversation
    const addComment = useCallback(async (text: string, mentionIds: string[]) => {
        if (!orderId || !text.trim()) return;
        setSubmittingComment(true);
        try {
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const res = await fetch(`${getApiBase()}/v1/laboratory/orders/${orderId}/comments`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: token } : {}),
                },
                body: JSON.stringify({ 
                    text,
                    mentions: mentionIds
                }),
                credentials: "include",
            });
            if (!res.ok) {
                const responseText = await res.text();
                let parsed: unknown = undefined;
                try { parsed = responseText ? JSON.parse(responseText) : undefined; } catch { /* ignore */ }
                const msg = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
                throw new Error(msg);
            }
            message.success("Comentario agregado");
            setCommentText("");
            // Force scroll to bottom after adding new comment
            await loadConversation({ forceScrollToBottom: true, silent: false });
            await refreshTimeline(); // Update timeline without reloading entire page
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : "Error al agregar comentario";
            message.error(errMsg);
            throw e;
        } finally {
            setSubmittingComment(false);
        }
    }, [orderId, loadConversation, refreshTimeline]);

    useEffect(() => {
        refresh();
        loadCollaborationData();
    }, [refresh, loadCollaborationData]);
    
    // Load conversation when tab changes to conversation (first load scrolls to bottom)
    useEffect(() => {
        if (activeTab === "conversation" && orderId) {
            loadConversation({ forceScrollToBottom: true });
        }
    }, [activeTab, orderId, loadConversation]);
    
    // Auto-refresh conversation and timeline every 30 seconds (preserves scroll position)
    useEffect(() => {
        if (activeTab !== "conversation") return;
        const interval = setInterval(() => {
            // Silent refresh - only updates content, preserves scroll unless user is at bottom
            refreshConversationAndTimeline();
        }, 30000); // 30 seconds
        return () => clearInterval(interval);
    }, [activeTab, refreshConversationAndTimeline]);
    
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

    // Handle quick action to add comment - switch to conversation tab
    const handleGoToComment = useCallback(() => {
        setActiveTab("conversation");
        // Scroll to tabs container
        if (tabsContainerRef.current) {
            tabsContainerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

    // Handle navigation to samples tab
    const handleGoToSamples = useCallback(() => {
        setActiveTab("samples");
        // Scroll to tabs container
        if (tabsContainerRef.current) {
            tabsContainerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

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
                                    padding: "14px 16px",
                                    cursor: "pointer",
                                    borderBottom: index < data.samples.length - 1 ? "1px solid #e5e7eb" : "none",
                                    transition: "background 0.15s ease",
                                    background: "#fff"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
                            >
                                {/* Top Row: Avatar, Code/Type, and State */}
                                <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
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
                                
                                {/* Bottom Row: Labels and Assignees */}
                                {((sample.labels && sample.labels.length > 0) || (sample.assignees && sample.assignees.length > 0)) && (
                                    <div style={{ 
                                        display: "flex", 
                                        gap: 16, 
                                        marginLeft: 50,
                                        flexWrap: "wrap",
                                        alignItems: "center"
                                    }}>
                                        {/* Labels */}
                                        {sample.labels && sample.labels.length > 0 && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{ fontSize: 11, color: tokens.textSecondary, fontWeight: 500 }}>Etiquetas:</span>
                                                {renderLabels(sample.labels)}
                                            </div>
                                        )}
                                        
                                        {/* Assignees */}
                                        {sample.assignees && sample.assignees.length > 0 && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{ fontSize: 11, color: tokens.textSecondary, fontWeight: 500 }}>Asignados:</span>
                                                <Avatar.Group maxCount={3} size="small">
                                                    {sample.assignees.map(user => (
                                                        <Tooltip key={user.id} title={user.name}>
                                                            <Avatar 
                                                                size={24}
                                                                src={user.avatar_url}
                                                                style={{ 
                                                                    backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name),
                                                                    fontSize: 10,
                                                                }}
                                                            >
                                                                {!user.avatar_url && getInitials(user.name)}
                                                            </Avatar>
                                                        </Tooltip>
                                                    ))}
                                                </Avatar.Group>
                                            </div>
                                        )}
                                    </div>
                                )}
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

    // Current user info for comment input
    const currentUserName = currentUserProfile?.full_name || "Usuario";
    const currentUserAvatar = currentUserProfile?.avatar_url || null;
    
    // Convert conversation to CommentData format
    const conversationData: CommentData[] = useMemo(() => {
        return conversation.map(c => ({
            id: c.id,
            user_id: c.user_id,
            user_name: c.user_name,
            user_avatar: c.user_avatar,
            text: c.text,
            mentions: c.mentions,
            mentioned_users: c.mentioned_users,
            created_at: c.created_at,
        }));
    }, [conversation]);

    // Conversation content JSX (not a function component to avoid re-renders)
    const conversationContentJSX = (
        <div 
            style={{ 
                display: "flex", 
                flexDirection: "column", 
                height: "100%"
            }}
        >
            {/* Comments List with scroll */}
            <CommentList
                ref={conversationScrollRef}
                comments={conversationData}
                loading={loadingConversation}
                emptyMessage="Sin comentarios"
                emptyDescription="Sé el primero en comentar sobre esta orden"
            />

            {/* Comment Input Form - At bottom */}
            <Card 
                size="small" 
                style={{ ...cardStyle }}
                bodyStyle={{ padding: 16 }}
            >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <Avatar 
                        size={36}
                        src={currentUserAvatar}
                        style={{ 
                            backgroundColor: currentUserAvatar ? undefined : getAvatarColor(currentUserName),
                            fontSize: 14,
                            flexShrink: 0
                        }}
                    >
                        {!currentUserAvatar && getInitials(currentUserName)}
                    </Avatar>
                    <CommentInput
                        value={commentText}
                        onChange={setCommentText}
                        onSubmit={addComment}
                        loading={submittingComment}
                        placeholder="Escribe un comentario... Usa @ para mencionar a alguien"
                        rows={3}
                    />
                </div>
            </Card>
        </div>
    );

    // Sidebar content component (for reuse in responsive layout)
    const SidebarContent = () => (
        <div style={{ display: "grid", gap: tokens.gap }}>
            {/* Reviewers */}
            <Card 
                size="small" 
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <ReviewersSection
                    reviewers={data?.order.reviewers || []}
                    allUsers={allUsers}
                    onUpdate={handleUpdateReviewers}
                    orderStatus={data?.order.status}
                />
            </Card>
            
            {/* Assignees */}
            <Card 
                size="small" 
                style={{ ...cardStyle, padding: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <AssigneesSection
                    assignees={data?.order.assignees || []}
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
                    labels={data?.order.labels || []}
                    allLabels={allLabels}
                    onUpdate={handleUpdateLabels}
                    onLabelsRefresh={loadCollaborationData}
                />
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
                        icon={<MessageOutlined />}
                        onClick={handleGoToComment}
                    >
                        Hacer Comentario
                    </AntButton>
                    <AntButton 
                        block 
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => data && navigate(`/samples/register?orderId=${data.order.id}`)}
                    >
                        Agregar Muestra
                    </AntButton>
                    {data?.order?.invoice_id && (
                        <AntButton 
                            block 
                            size="small"
                            icon={<DollarOutlined />}
                            onClick={() => data && navigate(`/billing/${data.order.id}`)}
                            style={{ borderColor: tokens.primary, color: tokens.primary }}
                        >
                            Ver Factura
                        </AntButton>
                    )}
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
                                title={
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                                        <span style={cardTitleStyle}>Detalle de Orden</span>
                                        {data && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <span style={{ 
                                                    fontFamily: tokens.titleFont, 
                                                    fontSize: 16, 
                                                    fontWeight: 700,
                                                    color: tokens.textPrimary
                                                }}>
                                                    {data.order.order_code}
                                                </span>
                                                <div style={{ 
                                                    padding: "4px 10px",
                                                    borderRadius: 12,
                                                    background: statusConfig.bg,
                                                    color: statusConfig.color,
                                                    fontWeight: 600,
                                                    fontSize: 11,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 4
                                                }}>
                                                    {data.order.status === "CANCELLED" ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
                                                    {statusConfig.label}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                }
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

                                        {/* Invoice Link */}
                                        {data.order.invoice_id && (
                                            <div style={{ marginBottom: 16 }}>
                                                <AntButton 
                                                    type="default" 
                                                    size="small"
                                                    icon={<DollarOutlined />}
                                                    onClick={() => navigate(`/billing/${data.order.id}`)}
                                                    style={{ 
                                                        borderColor: tokens.primary,
                                                        color: tokens.primary
                                                    }}
                                                >
                                                    Ver Factura
                                                </AntButton>
                                            </div>
                                        )}

                                        {/* Meta Info Row */}
                                        <div style={{ 
                                            display: "flex", 
                                            flexWrap: "wrap",
                                            alignItems: "center", 
                                            gap: "12px 20px",
                                            color: tokens.textSecondary,
                                            fontSize: 13,
                                            marginBottom: 16
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

                                            <Tooltip title="Ver muestras">
                                                <div 
                                                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                                                    onClick={handleGoToSamples}
                                                >
                                                    <ExperimentOutlined />
                                                    <span style={{ fontWeight: 500, color: tokens.primary }}>
                                                        {data.samples.length} muestra{data.samples.length !== 1 ? "s" : ""}
                                                    </span>
                                                </div>
                                            </Tooltip>
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
                                items={timeline.map((event, index) => {
                                    // Check if previous event is from the same user
                                    const prevEvent = index > 0 ? timeline[index - 1] : null;
                                    const isSameUserAsPrevious = prevEvent && prevEvent.created_by === event.created_by;
                                    
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
                                                        {renderSampleLink()}
                                                    </span>
                                                );
                                            }
                                            case "IMAGE_UPLOADED": {
                                                const filename = meta.filename as string || "imagen";
                                                return (
                                                    <span>
                                                        Subió imagen {filename}
                                                        {renderSampleLink()}
                                                    </span>
                                                );
                                            }
                                            case "IMAGE_DELETED": {
                                                const filename = meta.filename as string || "imagen";
                                                return (
                                                    <span>
                                                        Eliminó imagen {filename}
                                                        {renderSampleLink()}
                                                    </span>
                                                );
                                            }
                                            case "SAMPLE_NOTES_UPDATED": {
                                                const newNotes = meta.new_notes as string || "";
                                                const action = newNotes ? "Actualizó" : "Eliminó";
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
                                                        Registró muestra{" "}
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
                                                ) : (sampleCode ? `Registró muestra ${sampleCode}` : "Registró una muestra");
                                            case "SAMPLE_RECEIVED":
                                                return sampleId ? (
                                                    <span>
                                                        Recibió muestra{" "}
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
                                                ) : (sampleCode ? `Recibió muestra ${sampleCode}` : "Recibió una muestra");
                                            case "REPORT_CREATED": {
                                                const reportId = meta.report_id as string;
                                                return reportId ? (
                                                    <span>
                                                        Creó el{" "}
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
                                                ) : "Creó el reporte";
                                            }
                                            case "REPORT_VERSION_CREATED": {
                                                const reportId = meta.report_id as string;
                                                return reportId ? (
                                                    <span>
                                                        Editó el{" "}
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
                                                ) : "Editó el reporte";
                                            }
                                            case "REPORT_SUBMITTED": {
                                                const reportId = meta.report_id as string;
                                                return reportId ? (
                                                    <span>
                                                        Envió a revisión el{" "}
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
                                                ) : "Envió a revisión el reporte";
                                            }
                                            case "REPORT_APPROVED": {
                                                const reportId = meta.report_id as string;
                                                const reviewerName = meta.reviewer_name as string;
                                                const comment = meta.comment as string;
                                                return (
                                                    <span>
                                                        {reviewerName ? `${reviewerName} aprobó` : "Aprobó"} el{" "}
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
                                                        {comment && (
                                                            <span style={{ color: "#888", fontStyle: "italic", marginLeft: 4 }}>
                                                                : "{comment}"
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            case "REPORT_CHANGES_REQUESTED": {
                                                const reportId = meta.report_id as string;
                                                const reviewerName = meta.reviewer_name as string;
                                                const comment = meta.comment as string;
                                                return (
                                                    <span>
                                                        {reviewerName ? `${reviewerName} solicitó cambios` : "Solicitó cambios"} en el{" "}
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
                                                        {comment && (
                                                            <span style={{ color: "#888", fontStyle: "italic", marginLeft: 4 }}>
                                                                : "{comment}"
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            case "REPORT_RETRACTED": {
                                                const reportId = meta.report_id as string;
                                                const reason = meta.reason as string;
                                                return (
                                                    <span>
                                                        Retrajo el{" "}
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
                                                return `Cambió el estado de la orden de ${oldStatus || "?"} a ${newStatus || "?"}`;
                                            }
                                            case "ORDER_NOTES_UPDATED": {
                                                const newNotes = meta.new_notes as string || "";
                                                const action = newNotes ? "Actualizó" : "Eliminó";
                                                return `${action} la descripción de la orden`;
                                            }
                                            case "COMMENT_ADDED": {
                                                const preview = meta.comment_preview as string || "";
                                                return (
                                                    <span>
                                                        Agregó un comentario
                                                        {preview && (
                                                            <span style={{ color: "#888", fontStyle: "italic", marginLeft: 4 }}>
                                                                : "{preview}"
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            case "ASSIGNEES_ADDED": {
                                                const added = (meta.added as Array<{name: string; username?: string; avatar?: string | null}>) || [];
                                                const count = added.length;
                                                const userName = event.created_by_name || "Sistema";
                                                
                                                // Check if user assigned themselves
                                                const selfAssigned = added.some(u => u.name === userName);
                                                const othersCount = selfAssigned ? count - 1 : count;
                                                
                                                // Build message with @username mentions
                                                if (selfAssigned && othersCount === 0) {
                                                    return (
                                                        <span>
                                                            Se asignó a sí mismo
                                                            {renderSampleLink()}
                                                        </span>
                                                    );
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
                                                            {renderSampleLink()}
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
                                                            {renderSampleLink()}
                                                        </span>
                                                    );
                                                }
                                            }
                                            case "ASSIGNEES_REMOVED": {
                                                const removed = (meta.removed as Array<{name: string; username?: string; avatar?: string | null}>) || [];
                                                const count = removed.length;
                                                const sampleCodeMeta = meta.sample_code as string | undefined;
                                                const userName = event.created_by_name || "Sistema";
                                                
                                                // Check if user removed themselves
                                                const selfRemoved = removed.some(u => u.name === userName);
                                                const othersCount = selfRemoved ? count - 1 : count;
                                                
                                                // Build message with @username mentions
                                                if (selfRemoved && othersCount === 0) {
                                                    return (
                                                        <span>
                                                            Se desasignó a sí mismo
                                                            {sampleCodeMeta && (
                                                                <span>
                                                                    {" "}de la muestra{" "}
                                                                    {sampleId ? (
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
                                                                            {sampleCodeMeta}
                                                                        </a>
                                                                    ) : sampleCodeMeta}
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
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
                                                            {sampleCodeMeta && (
                                                                <span>
                                                                    {" "}de la muestra{" "}
                                                                    {sampleId ? (
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
                                                                            {sampleCodeMeta}
                                                                        </a>
                                                                    ) : sampleCodeMeta}
                                                                </span>
                                                            )}
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
                                                            {sampleCodeMeta && (
                                                                <span>
                                                                    {" "}de la muestra{" "}
                                                                    {sampleId ? (
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
                                                                            {sampleCodeMeta}
                                                                        </a>
                                                                    ) : sampleCodeMeta}
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
                                                }
                                            }
                                            case "REVIEWERS_ADDED": {
                                                const added = (meta.added as Array<{name: string; username?: string; avatar?: string | null}>) || [];
                                                const count = added.length;
                                                const userName = event.created_by_name || "Sistema";
                                                
                                                // Check if user assigned themselves as reviewer
                                                const selfAssigned = added.some(u => u.name === userName);
                                                const othersCount = selfAssigned ? count - 1 : count;
                                                
                                                if (selfAssigned && othersCount === 0) {
                                                    return "Se asignó como revisor";
                                                } else if (selfAssigned && othersCount > 0) {
                                                    const others = added.filter(u => u.name !== userName);
                                                    return (
                                                        <span>
                                                            Se asignó como revisor junto con{" "}
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
                                                            Asignó como {count === 1 ? "revisor" : "revisores"} a{" "}
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
                                            case "REVIEWERS_REMOVED": {
                                                const removed = (meta.removed as Array<{name: string; username?: string; avatar?: string | null}>) || [];
                                                const count = removed.length;
                                                const userName = event.created_by_name || "Sistema";
                                                
                                                // Check if user removed themselves as reviewer
                                                const selfRemoved = removed.some(u => u.name === userName);
                                                const othersCount = selfRemoved ? count - 1 : count;
                                                
                                                if (selfRemoved && othersCount === 0) {
                                                    return "Se removió como revisor";
                                                } else if (selfRemoved && othersCount > 0) {
                                                    const others = removed.filter(u => u.name !== userName);
                                                    return (
                                                        <span>
                                                            Se removió como revisor junto con{" "}
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
                                                            removió como {count === 1 ? "revisor" : "revisores"} a{" "}
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
                                                const sampleCodeMeta = meta.sample_code as string | undefined;
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
                                                        {sampleCodeMeta && (
                                                            <span>
                                                                {" "}a la muestra{" "}
                                                                {sampleId ? (
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
                                                                        {sampleCodeMeta}
                                                                    </a>
                                                                ) : sampleCodeMeta}
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            case "LABELS_REMOVED": {
                                                const removed = (meta.removed as Array<{name: string; color: string}>) || [];
                                                const count = removed.length;
                                                const sampleCodeMeta = meta.sample_code as string | undefined;
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
                                                        {sampleCodeMeta && (
                                                            <span>
                                                                {" "}de la muestra{" "}
                                                                {sampleId ? (
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
                                                                        {sampleCodeMeta}
                                                                    </a>
                                                                ) : sampleCodeMeta}
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            }
                                            default:
                                                return event.description || event.event_type;
                                        }
                                    };

                                    const userName = event.created_by_name || "Sistema";
                                    const userAvatar = event.created_by_avatar;
                                    const actionText = buildActionText();

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
                                })}
                            />
                        ) : (
                            <Empty description="Sin eventos registrados" />
                        )}
                    </Card>

                            {/* Tabs Card - Samples, Report, Conversation */}
                            <div ref={tabsContainerRef}>
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
                                            children: conversationContentJSX,
                                        },
                                    ]}
                                />
                            </Card>
                            </div>

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
