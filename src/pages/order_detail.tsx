import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Layout, Card, Avatar, Empty, message, Timeline, Tabs, Badge, Tooltip } from "antd";
import { 
    ReloadOutlined, FilePdfOutlined, CheckCircleOutlined, 
    FileTextOutlined, InboxOutlined, 
    ExperimentOutlined, SolutionOutlined, AuditOutlined, SendOutlined, 
    LockOutlined, CloseCircleOutlined, UserOutlined, CalendarOutlined,
    MessageOutlined, PlusOutlined, ExclamationCircleOutlined, SettingOutlined, EditOutlined,
    DollarOutlined, ClockCircleOutlined
} from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import ActionButtonPanel, { type ActionButtonItem } from "../components/ui/action_button_panel";
import CelumaButton from "../components/ui/button";
import Panel from "../components/ui/panel";
import CelumaSteps, { type CelumaStep } from "../components/ui/celuma_steps";
import CelumaTextArea from "../components/ui/textarea_field";
import { tokens, cardStyle } from "../components/design/tokens";
import { getReport } from "../services/report_service";
import type { ReportEnvelope } from "../models/report";
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
    getReviewerUsers,
    updateOrderAssignees, 
    updateOrderReviewers, 
    updateOrderLabels 
} from "../services/collaboration_service";
import CommentInput from "../components/comments/comment_input";
import ConversationThread from "../components/comments/conversation_thread";
import type { CommentData } from "../components/comments/comment_item";
import { 
    getInitials, 
    getAvatarColor, 
    formatLocalDateTime,
    renderUserMention 
} from "../components/comments/comment_utils";
import { renderLabels, renderStatusChip } from "../components/ui/table_helpers";
import { getSampleTypeConfig } from "../components/ui/table_helpers";
import { showCelumaApiError } from "../lib/celuma_feedback";

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
        patient_id?: string | null;
        tenant_id: string;
        branch_id: string;
        requesting_physician?: { id: string; full_name: string; physician_code: string; specialty?: string | null; institution?: string | null; email?: string | null } | null;
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
    patient?: {
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
    } | null;
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

// Status configuration — single source of truth for color + icon + label per status,
// so the status chip and the Céluma steps bar stay visually in sync.
const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida", icon: <InboxOutlined /> },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso", icon: <ExperimentOutlined /> },
    DIAGNOSIS: { color: "#8b5cf6", bg: "#f5f3ff", label: "Diagnóstico", icon: <SolutionOutlined /> },
    REVIEW: { color: "#ec4899", bg: "#fdf2f8", label: "Revisión", icon: <AuditOutlined /> },
    RELEASED: { color: "#10b981", bg: "#ecfdf5", label: "Liberada", icon: <SendOutlined /> },
    CLOSED: { color: "#0891b2", bg: "#ecfeff", label: "Cerrada", icon: <LockOutlined /> },
    CANCELLED: { color: "#ef4444", bg: "#fef2f2", label: "Cancelada", icon: <CloseCircleOutlined /> },
};

// Sample state configuration - matches backend SampleState enum
const SAMPLE_STATE_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida", icon: <InboxOutlined /> },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso", icon: <SettingOutlined /> },
    READY: { color: "#10b981", bg: "#ecfdf5", label: "Lista", icon: <CheckCircleOutlined /> },
    DAMAGED: { color: "#ef4444", bg: "#fef2f2", label: "Insuficiente", icon: <ExperimentOutlined /> },
    CANCELLED: { color: "#6b7280", bg: "#f3f4f6", label: "Cancelada", icon: <ExperimentOutlined /> },
};

// ── Céluma "ficha" header helpers (shared visual language with patient/physician detail) ──
const codeChipStyle: React.CSSProperties = {
    background: tokens.secondary,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
};

const statusChipStyle = (cfg: { color: string; bg: string }): React.CSSProperties => ({
    background: cfg.bg,
    color: cfg.color,
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
});

const MetaItem = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: tokens.textSecondary, fontSize: 14 }}>
        <span style={{ color: tokens.primary, fontSize: 16, display: "inline-flex" }}>{icon}</span>
        {children}
    </span>
);

const Stat = ({ value, label, color }: { value: number; label: string; color: string }) => (
    <div style={{ textAlign: "center", padding: "0 18px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: tokens.titleFont, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{label}</div>
    </div>
);

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
    const [activeTab, setActiveTab] = useState("timeline");
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
    const [allReviewerUsers, setAllReviewerUsers] = useState<LabUser[]>([]);

    const conversationScrollRef = useRef<HTMLDivElement>(null);
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    
    // Get current user profile for avatar, name and permissions
    const { profile: currentUserProfile, hasPermission } = useUserProfile();
    
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

    // Function to load the latest report by report ID
    const loadLatestReport = async (rId: string) => {
        setReportLoading(true);
        try {
            const report = await getReport(rId);
            setLatestReport(report);
        } catch (err) {
            setLatestReport(null);
            showCelumaApiError(err, "Error al cargar la vista previa del reporte.");
        } finally {
            setReportLoading(false);
        }
    };

    // Function to refresh order data.
    // `silent` re-fetches without flipping the page skeleton (`loading`) or reloading
    // the report preview — used after collaboration edits so the whole page doesn't flash.
    const refresh = useCallback(async (opts?: { silent?: boolean }) => {
        if (!orderId) return;
            const silent = opts?.silent ?? false;
            if (!silent) setLoading(true);
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

                // Load latest report for preview if reportId exists.
                // Skipped on silent refreshes (collaboration edits don't touch the report
                // and reloading the preview would cause a visible flash).
                if (foundReportId && !silent) {
                    await loadLatestReport(foundReportId);
                }
            } catch (err) {
                if (!silent) setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            } finally {
                if (!silent) setLoading(false);
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
            // Timeline is secondary; skip toast to avoid noise on background refreshes.
            void err;
        }
    }, [orderId]);

    // Function to load collaboration data (labels, users and reviewer-eligible users)
    const loadCollaborationData = useCallback(async () => {
        try {
            const [labelsData, usersData, reviewerUsersData] = await Promise.all([
                getLabels(),
                getLabUsers(),
                getReviewerUsers(),
            ]);
            setAllLabels(labelsData);
            setAllUsers(usersData);
            setAllReviewerUsers(reviewerUsersData);
        } catch (err) {
            showCelumaApiError(err, "Error al cargar datos de colaboración.");
        }
    }, []);

    // Handlers for updating collaboration
    const handleUpdateAssignees = useCallback(async (userIds: string[]) => {
        if (!orderId) return;
        try {
            await updateOrderAssignees(orderId, userIds);
            await refresh({ silent: true });
            message.success("Asignados actualizados");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar asignados");
            throw err;
        }
    }, [orderId, refresh]);

    const handleUpdateReviewers = useCallback(async (userIds: string[]) => {
        if (!orderId) return;
        try {
            await updateOrderReviewers(orderId, userIds);
            await refresh({ silent: true });
            message.success("Revisores actualizados");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar revisores");
            throw err;
        }
    }, [orderId, refresh]);

    const handleUpdateLabels = useCallback(async (labelIds: string[]) => {
        if (!orderId) return;
        try {
            await updateOrderLabels(orderId, labelIds);
            await refresh({ silent: true });
            message.success("Etiquetas actualizadas");
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : "Error al actualizar etiquetas");
            throw err;
        }
    }, [orderId, refresh]);

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
            if (!options?.silent) {
                showCelumaApiError(err, "Error al cargar la conversación.");
            }
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

    // Handle navigation to samples tab
    const handleGoToSamples = useCallback(() => {
        setActiveTab("samples");
        // Scroll to tabs container
        if (tabsContainerRef.current) {
            tabsContainerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

    const fullName = useMemo(() => {
        return `${data?.patient?.first_name ?? ""} ${data?.patient?.last_name ?? ""}`.trim();
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

    const handleCreateReport = () => {
        if (!data) return;
        navigate(`/reports/editor?orderId=${data.order.id}`);
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
                marginBottom: 16,
                gap: 12,
                flexWrap: "wrap",
            }}>
                <span style={{ fontWeight: 700, color: tokens.textPrimary, fontSize: 15 }}>
                    {data?.samples.length || 0} muestra{(data?.samples.length || 0) !== 1 ? "s" : ""} registrada{(data?.samples.length || 0) !== 1 ? "s" : ""}
                </span>
                <CelumaButton
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => data && navigate(`/samples/register?orderId=${data.order.id}`)}
                >
                    Agregar Muestra
                </CelumaButton>
            </div>

            {data && data.samples.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                    {data.samples.map((sample) => {
                        const typeConfig = getSampleTypeConfig(sample.type);
                        return (
                            <div
                                key={sample.id}
                                onClick={() => navigate(`/samples/${sample.id}`)}
                                style={{
                                    padding: "14px 16px",
                                    cursor: "pointer",
                                    border: "2px solid #eef1f0",
                                    borderRadius: 12,
                                    background: "#fff",
                                    transition: "background .15s ease, border-color .15s ease",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#f7fcfb"; e.currentTarget.style.borderColor = "#cfe9e6"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#eef1f0"; }}
                            >
                                {/* Top Row: type avatar, code/type, state */}
                                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                    <Avatar
                                        size={38}
                                        icon={typeConfig.icon}
                                        style={{
                                            backgroundColor: `${typeConfig.color}1a`,
                                            color: typeConfig.color,
                                            border: `2px solid ${typeConfig.color}33`,
                                            fontSize: 16,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, color: tokens.primary, fontSize: 14 }}>
                                            {sample.sample_code}
                                        </div>
                                        <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                                            {typeConfig.label}
                                        </div>
                                    </div>
                                    {renderStatusChip(sample.state, "sample")}
                                </div>

                                {/* Bottom Row: labels and assignees */}
                                {((sample.labels && sample.labels.length > 0) || (sample.assignees && sample.assignees.length > 0)) && (
                                    <div style={{
                                        display: "flex",
                                        gap: 16,
                                        marginLeft: 52,
                                        marginTop: 10,
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                    }}>
                                        {sample.labels && sample.labels.length > 0 && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{ fontSize: 11, color: tokens.textSecondary, fontWeight: 600 }}>Etiquetas:</span>
                                                {renderLabels(sample.labels)}
                                            </div>
                                        )}
                                        {sample.assignees && sample.assignees.length > 0 && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{ fontSize: 11, color: tokens.textSecondary, fontWeight: 600 }}>Asignados:</span>
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
                <Panel style={{ padding: 40, textAlign: "center", display: "grid", justifyItems: "center", gap: 8 }}>
                    <Empty description="Sin muestras registradas" />
                </Panel>
            )}
        </div>
    );

    // Report Tab Content
    const ReportContent = () => (
        <div>
            {reportId ? (
                <div style={{ display: "grid", gap: 16 }}>
                    {/* Report header */}
                    <Panel style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 16,
                        flexWrap: "wrap",
                    }}>
                        <div
                            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", minWidth: 0 }}
                            onClick={() => navigate(`/reports/${reportId}`)}
                        >
                            <Avatar
                                size={42}
                                style={{
                                    backgroundColor: "#eaf7f5",
                                    color: tokens.primary,
                                    border: `2px solid ${tokens.primary}33`,
                                    fontSize: 17,
                                    flexShrink: 0,
                                }}
                                icon={<FileTextOutlined />}
                            />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: tokens.primary, fontSize: 15 }}>
                                    {latestReport?.title || "Reporte"}
                                </div>
                                <div style={{ marginTop: 4 }}>
                                    {latestReport?.status
                                        ? renderStatusChip(latestReport.status, "report")
                                        : <span style={{ fontSize: 12, color: tokens.textSecondary }}>—</span>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <CelumaButton
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={() => reportId && loadLatestReport(reportId)}
                                loading={reportLoading}
                            >
                                Actualizar
                            </CelumaButton>
                            <CelumaButton
                                size="small"
                                type="primary"
                                icon={<FilePdfOutlined />}
                                onClick={() => previewRef.current?.exportPDF()}
                            >
                                Exportar PDF
                            </CelumaButton>
                        </div>
                    </Panel>

                    {latestReport && (
                        <ReportPreview
                            ref={previewRef}
                            report={latestReport}
                            loading={reportLoading}
                            style={{ margin: 0 }}
                            signerLookup={(data?.order.reviewers ?? []).map((r) => ({
                                id: r.id,
                                name: r.name,
                            }))}
                        />
                    )}
                </div>
            ) : (
                <Panel style={{ padding: "48px 24px", textAlign: "center", display: "grid", justifyItems: "center", gap: 10 }}>
                    <div style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: "#eaf7f5",
                        color: tokens.primary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 28,
                    }}>
                        <FileTextOutlined />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary, fontFamily: tokens.titleFont }}>
                        Sin reporte
                    </div>
                    <div style={{ color: tokens.textSecondary, marginBottom: 6 }}>
                        No hay un reporte asociado a esta orden
                    </div>
                    {hasPermission("reports:create") && (
                        <CelumaButton type="primary" icon={<PlusOutlined />} onClick={handleCreateReport}>
                            Crear Reporte
                        </CelumaButton>
                    )}
                </Panel>
            )}
        </div>
    );


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
                border: "2px solid #eef1f0",
                borderRadius: tokens.radius,
                background: "#fff",
                height: 600,
                maxHeight: "72vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}
        >
            {/* Chat-style grouped message thread */}
            <ConversationThread
                ref={conversationScrollRef}
                messages={conversationData}
                currentUserId={currentUserProfile?.id}
                loading={loadingConversation}
            />

            {/* Composer — unified within the same panel, Telegram-style integrated send */}
            <div style={{ borderTop: "1px solid #eef1f0", padding: "12px 14px", background: "#fbfdfc", display: "flex" }}>
                <CommentInput
                    variant="chat"
                    value={commentText}
                    onChange={setCommentText}
                    onSubmit={addComment}
                    loading={submittingComment}
                    placeholder="Escribe un mensaje… Usa @ para mencionar a alguien"
                    rows={1}
                />
            </div>
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
                    allUsers={allReviewerUsers}
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
                            grid-template-columns: minmax(0, 1fr) 280px;
                            gap: ${tokens.gap}px;
                            align-items: start;
                        }
                        .order-detail-grid > * {
                            min-width: 0;
                        }
                        /* Inner cards of the main column must be allowed to shrink below their
                           content width, otherwise the ficha overflows its track and overlaps the rail. */
                        .od-main { display: grid; gap: ${tokens.gap}px; min-width: 0; }
                        .od-main > * { min-width: 0; }
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

                        /* Order ficha (header badge) — fluid: the action/alert rail wraps below
                           the patient info when the column gets narrow, instead of overflowing. */
                        .od-badge { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: stretch; }
                        .od-badge-info { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; }
                        .od-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 12px; }
                        .od-stats { display: flex; flex-wrap: wrap; align-items: stretch; margin-left: -18px; }
                        .od-stat-divider { width: 1px; background: #eef1f0; }
                        /* Right rail — action panel + alert. Sits to the right of the info on wide
                           columns (margin-left:auto), drops to its own line and stays right-aligned
                           when wrapped. Items wrap internally so the amber alert never forces overflow. */
                        .od-rail { display: flex; flex-direction: row; flex-wrap: wrap; align-items: flex-end; justify-content: flex-end; gap: 12px 20px; margin-left: auto; align-self: flex-end; }
                        /* Céluma tabs — teal active ink + label */
                        .od-tabs .ant-tabs-tab .ant-tabs-tab-btn { font-weight: 600; color: ${tokens.textSecondary}; }
                        .od-tabs .ant-tabs-tab:hover .ant-tabs-tab-btn { color: #3da8a0; }
                        .od-tabs .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn { color: ${tokens.primary}; }
                        .od-tabs .ant-tabs-ink-bar { background: ${tokens.primary}; height: 3px; border-radius: 3px; }
                        .od-tabs .ant-tabs-nav::before { border-bottom-color: #eef1f0; }
                        /* Céluma timeline — soft connector + comfortable spacing */
                        .od-timeline { padding-top: 4px; }
                        .od-timeline .ant-timeline-item-tail { border-inline-start: 2px solid #eef1f0; }
                        .od-timeline .ant-timeline-item { padding-bottom: 22px; }
                        .od-timeline .ant-timeline-item-head { background: transparent; }
                        @media (max-width: 640px) {
                            .od-badge { flex-direction: column; align-items: center; text-align: center; }
                            .od-meta { justify-content: center; }
                            .od-name-row { justify-content: center; }
                            .od-stats { margin-left: 0; justify-content: center; }
                            .od-rail { width: 100%; flex-wrap: wrap; justify-content: center; align-self: auto; margin-left: 0; }
                        }
                    `}</style>

                    {/* Main Grid Layout */}
                    <div className="order-detail-grid">
                        {/* Left Column - Main Content */}
                        <div className="od-main">
                            {/* Order Header Card — Céluma ficha */}
                    <Card
                        loading={loading}
                        style={{ ...cardStyle, borderLeft: `5px solid ${tokens.secondary}`, position: "relative" }}
                    >
                        {data && (
                            <>
                                {/* Top-right: order code + status chips */}
                                <div style={{ position: "absolute", top: 16, right: 20, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    <span style={codeChipStyle}>{data.order.order_code}</span>
                                    <span style={statusChipStyle(statusConfig)}>
                                        {statusConfig.icon}
                                        {statusConfig.label}
                                    </span>
                                </div>
                                        {/* Order ficha — patient badge + meta + stats */}
                                        <div className="od-badge">
                                            {data.patient ? (
                                                <Tooltip title="Ver perfil del paciente">
                                                    <Avatar
                                                        size={104}
                                                        onClick={() => data.patient && navigate(`/patients/${data.patient.id}`)}
                                                        style={{
                                                            backgroundColor: getAvatarColor(fullName || data.patient.patient_code),
                                                            fontSize: 38,
                                                            fontWeight: 700,
                                                            border: "2px solid #d1d5db",
                                                            flexShrink: 0,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        {getInitials(fullName || data.patient.patient_code)}
                                                    </Avatar>
                                                </Tooltip>
                                            ) : (
                                                <Avatar
                                                    size={104}
                                                    icon={<FileTextOutlined />}
                                                    style={{ backgroundColor: tokens.primary, fontSize: 38, border: "2px solid #d1d5db", flexShrink: 0 }}
                                                />
                                            )}
                                            <div className="od-badge-info">
                                                <div className="od-name-row" style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                                                    <h1
                                                        onClick={() => data.patient && navigate(`/patients/${data.patient.id}`)}
                                                        style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 26, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1, cursor: data.patient ? "pointer" : "default" }}
                                                    >
                                                        {fullName || data.patient?.patient_code || "Orden sin paciente"}
                                                    </h1>
                                                    {data.patient && (
                                                        <span style={{ fontSize: 13, color: tokens.textSecondary }}>{data.patient.patient_code}</span>
                                                    )}
                                                </div>
                                                <div className="od-meta">
                                                    {(data.order.requesting_physician || data.order.requested_by) && (
                                                        <MetaItem icon={<UserOutlined />}>
                                                            <span style={{ marginRight: 4 }}>Solicitante:</span>
                                                            {data.order.requesting_physician ? (
                                                                <a
                                                                    href={`/requesting-physicians/${data.order.requesting_physician.id}`}
                                                                    onClick={(event) => {
                                                                        event.preventDefault();
                                                                        navigate(`/requesting-physicians/${data.order.requesting_physician?.id}`);
                                                                    }}
                                                                    style={{ fontWeight: 600, color: tokens.primary }}
                                                                >
                                                                    {data.order.requesting_physician.full_name}
                                                                </a>
                                                            ) : (
                                                                <span style={{ fontWeight: 600, color: tokens.textPrimary }}>{data.order.requested_by}</span>
                                                            )}
                                                        </MetaItem>
                                                    )}
                                                    {data.order.created_at && (
                                                        <MetaItem icon={<CalendarOutlined />}>
                                                            {new Date(data.order.created_at).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })}
                                                        </MetaItem>
                                                    )}
                                                </div>
                                                <div className="od-stats" style={{ marginTop: 18 }}>
                                                    <div style={{ cursor: "pointer" }} onClick={handleGoToSamples}>
                                                        <Stat value={data.samples.length} label="Muestras" color={tokens.primary} />
                                                    </div>
                                                    <div className="od-stat-divider" />
                                                    <Stat value={reportId ? 1 : 0} label="Reporte" color="#22c55e" />
                                                    {data.order.invoice_id && (
                                                        <>
                                                            <div className="od-stat-divider" />
                                                            <Stat value={1} label="Factura" color="#f59e0b" />
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Right rail: action panel (left) + payment warning (right), in the white space between the chips and the description */}
                                            <div className="od-rail">
                                                {(() => {
                                                    const actions: ActionButtonItem[] = [];
                                                    if (data.order.invoice_id && hasPermission("billing:read")) {
                                                        actions.push({ icon: <DollarOutlined />, tooltip: "Ver factura", ariaLabel: "Ver factura", onClick: () => navigate(`/billing/${data.order.id}`) });
                                                    }
                                                    if (!reportId && hasPermission("reports:create")) {
                                                        actions.push({ icon: <FileTextOutlined />, tooltip: "Crear reporte", ariaLabel: "Crear reporte", onClick: handleCreateReport });
                                                    } else if (reportId && hasPermission("reports:read")) {
                                                        actions.push({ icon: <FileTextOutlined />, tooltip: "Ver reporte", ariaLabel: "Ver reporte", onClick: () => navigate(`/reports/${reportId}`) });
                                                    }
                                                    return actions.length > 0 ? <ActionButtonPanel actions={actions} /> : null;
                                                })()}
                                                {data.order.billed_lock && hasPermission("billing:read") && (
                                                    <Panel style={{
                                                        background: "#fffbeb",
                                                        border: "2px solid #fde68a",
                                                        display: "flex",
                                                        alignItems: "flex-start",
                                                        gap: 10,
                                                        padding: 12,
                                                        width: "fit-content",
                                                        maxWidth: 260,
                                                    }}>
                                                        <ExclamationCircleOutlined style={{ color: "#d97706", fontSize: 18, flexShrink: 0, marginTop: 2 }} />
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13 }}>Retenido por Pago Pendiente</div>
                                                            <div style={{ color: "#b45309", fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>
                                                                El reporte no será visible para los solicitantes hasta liquidar el pago.
                                                            </div>
                                                        </div>
                                                    </Panel>
                                                )}
                                            </div>
                                        </div>

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
                                                            setNotesValue(data.order.notes || "");
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
                                                        placeholder="Agregar descripción o notas de la orden..."
                                                        rows={4}
                                                        maxLength={500}
                                                        autoFocus
                                                    />
                                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                                        <CelumaButton
                                                            size="xsmall"
                                                            danger
                                                            onClick={() => setEditingNotes(false)}
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
                                                    color: data.order.notes ? tokens.textPrimary : tokens.textSecondary,
                                                    fontSize: 14,
                                                    lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap",
                                                    fontStyle: data.order.notes ? "normal" : "italic",
                                                }}>
                                                    {data.order.notes || "Sin descripción"}
                                                </div>
                                            )}
                                        </Panel>
                            </>
                        )}
                        <ErrorText>{error}</ErrorText>
                    </Card>

                            {/* Tabs Card — "Línea de Tiempo" is the default tab so users don't have to scroll to find it */}
                            <div ref={tabsContainerRef}>
                            <Card loading={loading} style={cardStyle}>
                                <Tabs
                                    activeKey={activeTab}
                                    onChange={setActiveTab}
                                    className="od-tabs"
                                    items={[
                                        {
                                            key: "timeline",
                                            label: (
                                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <ClockCircleOutlined />
                                                    Línea de Tiempo
                                                </span>
                                            ),
                                            children: (
                                                <>
                                {/* Order Status Steps — Céluma styled */}
                                {data && (
                                    <div style={{ marginBottom: 24 }}>
                                        {data.order.status === "CANCELLED" ? (
                                            <Panel style={{
                                                background: STATUS_CONFIG.CANCELLED.bg,
                                                border: "2px solid #fecaca",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: 10,
                                                padding: "16px",
                                            }}>
                                                <CloseCircleOutlined style={{ fontSize: 22, color: STATUS_CONFIG.CANCELLED.color }} />
                                                <span style={{ fontSize: 16, fontWeight: 700, color: "#b91c1c", fontFamily: tokens.titleFont }}>Orden Cancelada</span>
                                            </Panel>
                                        ) : (
                                            <CelumaSteps
                                                current={getCurrentStep(data.order.status)}
                                                steps={ORDER_STEPS.map<CelumaStep>((step) => {
                                                    const cfg = STATUS_CONFIG[step.key] || STATUS_CONFIG.RECEIVED;
                                                    return {
                                                        key: step.key,
                                                        title: step.title,
                                                        icon: step.icon,
                                                        color: cfg.color,
                                                        bg: cfg.bg,
                                                    };
                                                })}
                                            />
                                        )}
                                    </div>
                                )}

                        {timeline.length > 0 ? (
                            <Timeline
                                className="od-timeline"
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
                                                            color: "#49b6ad",
                                                            fontWeight: 600,
                                                            textDecoration: "none",
                                                            borderBottom: "1px dashed #49b6ad",
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
                                                                        color: "#49b6ad",
                                                                        fontWeight: 600,
                                                                        textDecoration: "none",
                                                                        borderBottom: "1px dashed #49b6ad",
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
                                                                color: "#49b6ad",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                color: "#49b6ad",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                color: "#49b6ad",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                color: "#49b6ad",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                color: "#49b6ad",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                    color: "#49b6ad",
                                                                    fontWeight: 600,
                                                                    textDecoration: "none",
                                                                    borderBottom: "1px dashed #49b6ad",
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
                                                                    color: "#49b6ad",
                                                                    fontWeight: 600,
                                                                    textDecoration: "none",
                                                                    borderBottom: "1px dashed #49b6ad",
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
                                                                    color: "#49b6ad",
                                                                    fontWeight: 600,
                                                                    textDecoration: "none",
                                                                    borderBottom: "1px dashed #49b6ad",
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
                                                                                color: "#49b6ad",
                                                                                fontWeight: 600,
                                                                                textDecoration: "none",
                                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                                color: "#49b6ad",
                                                                                fontWeight: 600,
                                                                                textDecoration: "none",
                                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                                color: "#49b6ad",
                                                                                fontWeight: 600,
                                                                                textDecoration: "none",
                                                                                borderBottom: "1px dashed #49b6ad",
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
                                                                            color: "#49b6ad",
                                                                            fontWeight: 600,
                                                                            textDecoration: "none",
                                                                            borderBottom: "1px dashed #49b6ad",
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
                                                                            color: "#49b6ad",
                                                                            fontWeight: 600,
                                                                            textDecoration: "none",
                                                                            borderBottom: "1px dashed #49b6ad",
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
                                                    <div style={{ fontWeight: 700, marginBottom: 4, color: tokens.textPrimary }}>
                                                        {userName}
                                                    </div>
                                                )}
                                                <div style={{ color: tokens.textSecondary, lineHeight: 1.55, marginBottom: 4 }}>
                                                    {actionText}
                                                </div>
                                                <div style={{ fontSize: 12, color: "#94a3b8" }}>
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
                                                </>
                                            ),
                                        },
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
