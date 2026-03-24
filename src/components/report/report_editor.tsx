import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
    message, Button, Tabs, Tag, Typography, Input, Popconfirm, Card, Image, Modal, Avatar, Divider, Form,
} from "antd";
import {
    UserOutlined, FileTextOutlined, ExperimentOutlined,
    DeleteOutlined, FilePdfOutlined, SaveOutlined, EditOutlined,
} from "@ant-design/icons";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import {
    getReportFull, getStudyType, getReportTemplateById,
    saveReport, saveReportVersion,
    submitReport, approveReport, requestChanges, signReport,
} from "../../services/report_service";
import type { ReportImage } from "./report_images";
import SampleImagesPicker from "./sample_images_picker";
import ReportPreviewPages, { type ReportPreviewPagesRef } from "./report_preview_pages";
import { usePdfExport } from "../../hooks/use_pdf_export";
import type {
    ReportEnvelope, ReportFullResponse, ReportStatus,
    ReportTemplateJSON, ReportSectionText,
    ReportBaseFieldConfig, ReportBaseFieldCustom, TemplateImageItem,
} from "../../models/report";
import { buildEmptyReportContent } from "../../models/report";
import FloatingCaptionInput from "../ui/floating_caption_input";
import StatsCard from "../ui/stats_card";
import { TableEditor, markdownTableToHtml } from "./table_editor";
import { tokens } from "../design/tokens";
import { renderStatusChip } from "../ui/table_helpers";
import CommentInput from "../comments/comment_input";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOTE_MAX_LENGTH = 25;
const NOTE_CONTROL_KEYS = new Set([
    "Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown",
    "Tab","Escape","Home","End","PageUp","PageDown",
]);

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getSessionContext() {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
    const branchId = localStorage.getItem("branch_id") || sessionStorage.getItem("branch_id") || "";
    const userId = localStorage.getItem("user_id") || sessionStorage.getItem("user_id") || "";
    return { token, tenantId, branchId, userId };
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const msg = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    return parsed as TRes;
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0]?.toUpperCase() ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0]?.toUpperCase() ?? "") : "";
    return first + last;
}

function getAvatarColor(name: string): string {
    const colors = ["#0f8b8d","#0c6f71","#2563eb","#7c3aed","#b45309","#065f46","#be185d","#1d4ed8"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function isCustomField(f: ReportBaseFieldConfig): f is ReportBaseFieldCustom {
    return (f as ReportBaseFieldCustom).is_custom === true;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const letterStyles = `
.report-page {
  width: 8.5in; min-height: 11in; margin: 16px auto;
  background: #ffffff; color: #000; position: relative;
  --header-top: 24pt; --header-bottom-space: 86pt;
  --footer-height: 72pt; --footer-side-pad: 24pt;
  padding-top: calc(var(--header-top) + var(--header-bottom-space));
  padding-bottom: calc(var(--footer-height) + 12pt);
  padding-left: 48pt; padding-right: 48pt;
  box-sizing: border-box; font-family: "Arial", sans-serif;
}
.report-header {
  position: absolute; top: var(--header-top); left: 24pt; right: 48pt;
  font-size: 8pt; font-weight: 700; color: #002060;
}
.report-footer {
  position: absolute; left: var(--footer-side-pad); right: var(--footer-side-pad);
  bottom: 0; height: var(--footer-height);
  display: flex; justify-content: space-between; align-items: center;
  font-size: 7pt; font-weight: 700; color: #002060;
}
.report-footer__logo { height: calc(var(--footer-height) - 8pt); max-width: 40%; object-fit: contain; }
.report-footer__subtitle { font-size: 7.5pt; line-height: 1.2; max-width: 55%; }
`;

const cardStyle: CSSProperties = {
    background: tokens.cardBg,
    borderRadius: tokens.radius,
    boxShadow: tokens.shadow,
    padding: 0,
};

const cardTitleStyle: CSSProperties = {
    marginTop: 0, marginBottom: 8,
    fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a",
};

// ---------------------------------------------------------------------------
// Quill toolbar with table support
// ---------------------------------------------------------------------------

const QUILL_MODULES_RICH = {
    toolbar: {
        container: [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link"],
            ["clean"],
        ],
    },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReportEditor: React.FC = () => {
    const { reportId } = useParams<{ reportId: string }>();
    const { search } = useLocation();
    const prefilledOrderId = useMemo(() => new URLSearchParams(search).get("orderId") ?? "", [search]);
    const navigate = useNavigate();
    const session = useMemo(() => getSessionContext(), []);

    // Full API response
    const [fullData, setFullData] = useState<ReportFullResponse | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Template (snapshot at creation time or fetched from study type)
    const [template, setTemplate] = useState<ReportTemplateJSON | null>(null);

    // Report title (editable field)
    const [reportTitle, setReportTitle] = useState("");
    const [titleWasManuallySet, setTitleWasManuallySet] = useState(false);

    // Content state: mirrors template_json but with filled values
    // base values for custom fields
    const [baseValues, setBaseValues] = useState<Record<string, string>>({});
    // section content: key → string for text/richtext/table/numeric, or TemplateImageItem[] for images
    const [sectionContent, setSectionContent] = useState<Record<string, string | TemplateImageItem[]>>({});

    // Images per section (derived from sectionContent for type=images)
    const [reportImages, setReportImages] = useState<ReportImage[]>([]);
    const [reportPreview, setReportPreview] = useState<{ visible: boolean; index: number }>({ visible: false, index: 0 });

    // Existing envelope (for editing)
    const [envelope, setEnvelope] = useState<ReportEnvelope | null>(null);

    // User info
    const [userRole, setUserRole] = useState<string>("");

    // Study type name (for display)
    const [studyTypeName, setStudyTypeName] = useState<string>("");

    // Modals
    const [isApproveModalVisible, setIsApproveModalVisible] = useState(false);
    const [approveComment, setApproveComment] = useState("");
    const [isChangesModalVisible, setIsChangesModalVisible] = useState(false);
    const [changesComment, setChangesComment] = useState("");

    // Modal for table section editing
    const [tableModal, setTableModal] = useState<{ key: string; label: string } | null>(null);
    const [tableDraft, setTableDraft] = useState("");

    // Preview ref
    const previewPagesRef = useRef<ReportPreviewPagesRef>(null);
    const leftColumnRef = useRef<HTMLDivElement>(null);
    const previewColumnRef = useRef<HTMLDivElement>(null);

    const { exportToPDF } = usePdfExport();

    // Read-only when not DRAFT
    const isReadOnly = useMemo(
        () => Boolean(envelope?.status && envelope.status !== "DRAFT"),
        [envelope?.status]
    );

    // Custom base fields (from template)
    const customBaseFields = useMemo(() => {
        if (!template) return [];
        return Object.entries(template.base)
            .filter(([, v]) => isCustomField(v))
            .map(([k, v]) => ({ key: k, field: v as ReportBaseFieldCustom }));
    }, [template]);

    const hasCustomFields = customBaseFields.length > 0;

    // Sections from template
    const templateSections = useMemo(() => {
        if (!template) return [];
        return Object.entries(template.sections)
            .filter(([, v]) => v.is_visible);
    }, [template]);

    // Images section key
    const imagesSectionKey = useMemo(
        () => templateSections.find(([, v]) => v.type === "images")?.[0] ?? null,
        [templateSections]
    );

    // ---------------------------------------------------------------------------
    // Load data
    // ---------------------------------------------------------------------------

    useEffect(() => {
        (async () => {
            setLoadingData(true);
            setLoadError(null);
            try {
                if (reportId) {
                    // ---- Edit existing report ----
                    let full: ReportFullResponse;
                    try {
                        full = await getReportFull(reportId);
                    } catch {
                        // Fallback: the /full endpoint may not exist yet; build from simple get + order
                        const simpleReport = await getJSON<ReportEnvelope>(`/v1/reports/${reportId}`);
                        let orderData: ReportFullResponse["order"] | null = null;
                        let patientData: ReportFullResponse["patient"] | null = null;
                        let samplesData: ReportFullResponse["samples"] = [];
                        if (simpleReport.order_id) {
                            try {
                                const oFull = await getJSON<{
                                    order: ReportFullResponse["order"];
                                    patient: ReportFullResponse["patient"];
                                    samples: ReportFullResponse["samples"];
                                }>(`/v1/laboratory/orders/${simpleReport.order_id}/full`);
                                orderData = oFull.order;
                                patientData = oFull.patient;
                                samplesData = oFull.samples;
                            } catch { /* ignore */ }
                        }
                        full = {
                            order: orderData ?? {
                                id: simpleReport.order_id, order_code: "", status: "",
                                patient_id: "", tenant_id: simpleReport.tenant_id, branch_id: simpleReport.branch_id,
                            },
                            patient: patientData ?? {
                                id: "", tenant_id: "", branch_id: "", patient_code: "",
                            },
                            samples: samplesData,
                            report: simpleReport,
                            template: (simpleReport as unknown as Record<string, unknown>).template as ReportTemplateJSON ?? null,
                        };
                    }

                    setFullData(full);
                    setEnvelope(full.report);
                    if (full.report?.title) {
                        setReportTitle(full.report.title);
                        setTitleWasManuallySet(true);
                    }

                    // Determine the template: from report snapshot, from response, or fetch from study type
                    let tmpl: ReportTemplateJSON | null =
                        full.report?.template ?? full.template ?? null;

                    // If no template in the report, try fetching from the order's study type
                    if (!tmpl || (!tmpl.base && !tmpl.sections) || (Object.keys(tmpl.base ?? {}).length === 0 && Object.keys(tmpl.sections ?? {}).length === 0)) {
                        if (full.order?.study_type_id) {
                            try {
                                const st = await getStudyType(full.order.study_type_id);
                                setStudyTypeName(st.name);
                                if (st.default_report_template_id) {
                                    const tpl = await getReportTemplateById(st.default_report_template_id);
                                    tmpl = tpl.template_json;
                                }
                            } catch { /* ignore */ }
                        }
                    } else {
                        // Template exists, still try to get study type name
                        if (full.order?.study_type_id) {
                            try {
                                const st = await getStudyType(full.order.study_type_id);
                                setStudyTypeName(st.name);
                            } catch { /* ignore */ }
                        }
                    }

                    if (!tmpl || !tmpl.base || !tmpl.sections) {
                        tmpl = { base: {}, sections: {} };
                    }
                    setTemplate(tmpl);

                    // Populate base custom values
                    const savedBase = full.report?.report?.base ?? {};
                    const bv: Record<string, string> = {};
                    Object.entries(tmpl.base).forEach(([k, v]) => {
                        if (isCustomField(v)) bv[k] = (savedBase[k]?.value as string) || "";
                    });
                    setBaseValues(bv);

                    // Populate section content from saved report or template defaults
                    const savedSections = full.report?.report?.sections ?? {};
                    const sc: Record<string, string | TemplateImageItem[]> = {};
                    Object.entries(tmpl.sections).forEach(([k, v]) => {
                        if (v.type === "images") {
                            const saved = savedSections[k];
                            sc[k] = (saved && Array.isArray(saved.content) ? saved.content : []) as TemplateImageItem[];
                        } else {
                            const saved = savedSections[k];
                            sc[k] = (saved?.content as string) || (v as ReportSectionText).content || "";
                        }
                    });
                    setSectionContent(sc);

                } else if (prefilledOrderId) {
                    // ---- Create new report from order ----
                    const orderFull = await getJSON<{
                        order: ReportFullResponse["order"];
                        patient: ReportFullResponse["patient"];
                        samples: ReportFullResponse["samples"];
                    }>(`/v1/laboratory/orders/${prefilledOrderId}/full`);

                    const pseudoFull: ReportFullResponse = {
                        order: orderFull.order,
                        patient: orderFull.patient,
                        samples: orderFull.samples,
                        report: null as unknown as ReportEnvelope,
                        template: null,
                    };
                    setFullData(pseudoFull);

                    // Load template via study type → template
                    let tmpl: ReportTemplateJSON = { base: {}, sections: {} };
                    if (orderFull.order.study_type_id) {
                        try {
                            const st = await getStudyType(orderFull.order.study_type_id);
                            setStudyTypeName(st.name);
                            if (st.default_report_template_id) {
                                const tpl = await getReportTemplateById(st.default_report_template_id);
                                tmpl = tpl.template_json;
                            }
                        } catch { /* ignore, use empty template */ }
                    }
                    setTemplate(tmpl);

                    // Initialize section content with template defaults
                    const sc: Record<string, string | TemplateImageItem[]> = {};
                    Object.entries(tmpl.sections).forEach(([k, v]) => {
                        if (v.type === "images") {
                            sc[k] = [];
                        } else {
                            sc[k] = (v as ReportSectionText).content || "";
                        }
                    });
                    setSectionContent(sc);
                }
            } catch (err) {
                setLoadError(err instanceof Error ? err.message : "No se pudo cargar el reporte");
            } finally {
                setLoadingData(false);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportId, prefilledOrderId]);

    // Load user role
    useEffect(() => {
        getJSON<{ role: string }>("/v1/auth/me").then((u) => setUserRole(u.role)).catch(() => {});
    }, []);

    // Keep reportImages in sync with the images section
    useEffect(() => {
        if (!imagesSectionKey) return;
        const imgs = (sectionContent[imagesSectionKey] ?? []) as TemplateImageItem[];
        setReportImages(imgs.map((i) => ({ id: i.id, url: i.url, caption: i.caption, thumbnailUrl: i.url })));
    }, [imagesSectionKey, sectionContent]);

    // Sync reportPreview index with images count
    useEffect(() => {
        setReportPreview((prev) => {
            if (reportImages.length === 0) return { visible: false, index: 0 };
            if (prev.index >= reportImages.length) return { ...prev, index: reportImages.length - 1 };
            return prev;
        });
    }, [reportImages.length]);

    // ---------------------------------------------------------------------------
    // Build envelope for save/preview
    // ---------------------------------------------------------------------------

    const buildEnvelope = useCallback((): ReportEnvelope => {
        const tmpl = template ?? { base: {}, sections: {} };
        const report = buildEmptyReportContent(tmpl);

        // Fill predefined base values from full data
        if (fullData) {
            const patient = fullData.patient;
            const order = fullData.order;
            if (report.base["patient"]) report.base["patient"].value =
                `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || patient.patient_code;
            if (report.base["order_code"]) report.base["order_code"].value = order.order_code || "";
            if (report.base["study_type"]) report.base["study_type"].value = studyTypeName || "";
            if (report.base["patient_age"]) {
                let age: number | null = null;
                if (patient.dob) {
                    const birth = new Date(patient.dob);
                    const today = new Date();
                    age = today.getFullYear() - birth.getFullYear();
                    const m = today.getMonth() - birth.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                }
                report.base["patient_age"].value = age !== null ? `${age} años` : "";
            }
        }

        // Fill custom base values
        customBaseFields.forEach(({ key }) => {
            if (report.base[key]) report.base[key].value = baseValues[key] || "";
        });

        // Fill sections
        Object.entries(sectionContent).forEach(([k, v]) => {
            if (!report.sections[k]) return;
            if (Array.isArray(v)) {
                (report.sections[k] as { content: TemplateImageItem[] }).content = v;
            } else {
                (report.sections[k] as { content: string }).content = v;
            }
        });

        return {
            id: envelope?.id ?? "",
            version_no: envelope?.version_no ?? 1,
            status: envelope?.status ?? "DRAFT",
            order_id: fullData?.order.id ?? envelope?.order_id ?? "",
            tenant_id: fullData?.order.tenant_id ?? session.tenantId,
            branch_id: fullData?.order.branch_id ?? session.branchId,
            title: reportTitle || "Reporte sin título",
            published_at: envelope?.published_at ?? null,
            created_by: session.userId || envelope?.created_by || "",
            signed_by: envelope?.signed_by ?? null,
            signed_at: envelope?.signed_at ?? null,
            template: tmpl,
            report,
        };
    }, [template, fullData, customBaseFields, baseValues, sectionContent, envelope, session, reportTitle, studyTypeName]);

    // Live preview envelope
    const previewEnvelope = useMemo(() => {
        if (!template) return null;
        try { return buildEnvelope(); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template, baseValues, sectionContent, reportTitle, studyTypeName, fullData, envelope]);

    // ---------------------------------------------------------------------------
    // Handlers
    // ---------------------------------------------------------------------------

    const handleSave = async () => {
        try {
            const env = buildEnvelope();
            let saved: ReportEnvelope;
            if (!env.id) {
                saved = await saveReport(env);
                setEnvelope(saved);
            } else {
                await saveReportVersion(env);
                saved = { ...env, status: "DRAFT" as ReportStatus };
                setEnvelope(saved);
            }
            message.success("Reporte guardado");
            if (saved.order_id) navigate(`/orders/${saved.order_id}`);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "No se pudo guardar el reporte");
        }
    };

    const handleExportPDF = async () => {
        await exportToPDF(previewPagesRef, reportTitle || "reporte");
    };

    const handleSubmit = async () => {
        if (!envelope?.id) { message.warning("Guarda el reporte primero"); return; }
        try {
            const result = await submitReport(envelope.id);
            setEnvelope((e) => e ? { ...e, status: result.status as ReportStatus } : e);
            message.success(result.message);
        } catch (err) { message.error(err instanceof Error ? err.message : "Error al enviar"); }
    };

    const handleApprove = async () => {
        if (!envelope?.id) return;
        try {
            const result = await approveReport(envelope.id, approveComment || undefined);
            setEnvelope((e) => e ? { ...e, status: result.status as ReportStatus } : e);
            setIsApproveModalVisible(false);
            setApproveComment("");
            message.success(result.message);
        } catch (err) { message.error(err instanceof Error ? err.message : "Error al aprobar"); }
    };

    const handleRequestChanges = async () => {
        if (!envelope?.id || !changesComment.trim()) { message.warning("Ingresa un comentario"); return; }
        try {
            const result = await requestChanges(envelope.id, changesComment);
            setEnvelope((e) => e ? { ...e, status: result.status as ReportStatus } : e);
            setIsChangesModalVisible(false);
            setChangesComment("");
            message.success(result.message);
        } catch (err) { message.error(err instanceof Error ? err.message : "Error al solicitar cambios"); }
    };

    const handleSign = async () => {
        if (!envelope?.id) return;
        try {
            const result = await signReport(envelope.id);
            message.success(result.message);
            const full = await getReportFull(envelope.id);
            setEnvelope(full.report);
        } catch (err) { message.error(err instanceof Error ? err.message : "Error al firmar"); }
    };

    const updateImageCaption = (sectionKey: string, index: number, caption: string) => {
        setSectionContent((prev) => {
            const imgs = [...((prev[sectionKey] ?? []) as TemplateImageItem[])];
            imgs[index] = { ...imgs[index], caption };
            return { ...prev, [sectionKey]: imgs };
        });
    };

    const removeImage = (sectionKey: string, index: number) => {
        setSectionContent((prev) => {
            const imgs = ((prev[sectionKey] ?? []) as TemplateImageItem[]).filter((_, i) => i !== index);
            return { ...prev, [sectionKey]: imgs };
        });
    };

    // ---------------------------------------------------------------------------
    // Derived values (must be before any early return to respect hooks order)
    // ---------------------------------------------------------------------------

    const order = fullData?.order;
    const patient = fullData?.patient;
    const samples = fullData?.samples ?? [];
    const patientName = patient
        ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || patient.patient_code
        : "";

    const patientAge = useMemo(() => {
        if (!patient?.dob) return null;
        const birth = new Date(patient.dob);
        const today = new Date();
        let y = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) y--;
        return y;
    }, [patient?.dob]);

    const columnGapValue = typeof tokens.gap === "number" ? `${tokens.gap}px` : tokens.gap || "16px";

    // Set default report title once data is loaded (only if the user hasn't set one manually)
    useEffect(() => {
        if (!fullData) return;
        if (titleWasManuallySet) return;
        if (!studyTypeName && !patientName) return;
        const defaultTitle = studyTypeName && patientName
            ? `Reporte ${studyTypeName} - ${patientName}`
            : studyTypeName
                ? `Reporte ${studyTypeName}`
                : `Reporte ${patientName}`;
        setReportTitle(defaultTitle);
    }, [fullData, studyTypeName, patientName, titleWasManuallySet]);

    // ---------------------------------------------------------------------------
    // Loading / error / empty states
    // ---------------------------------------------------------------------------

    if (loadingData) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
                <Typography.Text type="secondary">Cargando reporte...</Typography.Text>
            </div>
        );
    }

    if (loadError) {
        return (
            <div style={{ padding: 24 }}>
                <Typography.Text type="danger">{loadError}</Typography.Text>
            </div>
        );
    }

    if (!fullData && !reportId && !prefilledOrderId) {
        return (
            <div style={{
                display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                minHeight: 400, gap: 16, padding: 40,
            }}>
                <FileTextOutlined style={{ fontSize: 48, color: "#d1d5db" }} />
                <Typography.Title level={4} style={{ color: "#6b7280", margin: 0 }}>
                    No hay reporte seleccionado
                </Typography.Title>
                <Typography.Text type="secondary" style={{ textAlign: "center", maxWidth: 400 }}>
                    Para crear un reporte, dirígete a una orden y selecciona la opción de crear reporte desde ahí.
                    También puedes acceder a un reporte existente desde la lista de reportes.
                </Typography.Text>
                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <Button type="primary" onClick={() => navigate("/orders")}>Ver órdenes</Button>
                    <Button onClick={() => navigate("/reports")}>Ver reportes</Button>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <>
            <style>{letterStyles}</style>
            <style>{`
              .re-two-column { display: grid; gap: ${columnGapValue}; grid-template-columns: minmax(0, 1fr); align-items: start; }
              @media (min-width: 1280px) { .re-two-column { grid-template-columns: 520px minmax(0, 1fr); } }
              .re-editor-col { min-width: 0; }
              .re-editor-col > .ant-card { display: flex; flex-direction: column; max-height: calc(11in + 90px); }
              .re-editor-col > .ant-card > .ant-card-body { flex: 1; overflow-y: auto; min-height: 0; }
              .re-preview-col { min-width: 0; }
              .re-preview-col > .ant-card { display: flex; flex-direction: column; }
              .re-preview-col > .ant-card > .ant-card-body { overflow-y: auto; max-height: calc(11in + 90px); }
              .re-grid-2 { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
              @media (max-width: 768px) { .re-grid-2 { grid-template-columns: 1fr; } }
              .quill-table-editor .ql-container { min-height: 120px; }
            `}</style>

            <div style={{ display: "grid", gap: tokens.gap }}>

                {/* ============================================================
                    CARD 1 — Detalles del reporte
                ============================================================ */}
                <StatsCard
                    title="Detalles del reporte"
                    extra={
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {order?.order_code && (
                                <span style={{ fontFamily: tokens.titleFont, fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>
                                    {order.order_code}
                                </span>
                            )}
                            {studyTypeName && (
                                <div style={{ padding: "4px 10px", borderRadius: 12, background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: 11, display: "flex", alignItems: "center" }}>
                                    {studyTypeName}
                                </div>
                            )}
                            {renderStatusChip(envelope?.status ?? "DRAFT", "report")}
                        </div>
                    }
                >
                    {/* Patient row — clicable */}
                        <div
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 10,
                                cursor: patient?.id ? "pointer" : "default",
                                padding: "8px 12px", borderRadius: 8,
                                marginLeft: -12, marginBottom: 16,
                                transition: "background 0.15s ease",
                            }}
                            onClick={() => patient?.id && navigate(`/patients/${patient.id}`)}
                            title={patient?.id ? "Ver paciente" : undefined}
                            onMouseEnter={(e) => { if (patient?.id) e.currentTarget.style.background = "#f3f4f6"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <Avatar
                                size={40}
                                style={{ backgroundColor: getAvatarColor(patientName || "P"), flexShrink: 0, fontSize: 15, fontWeight: 600 }}
                                icon={!patientName ? <UserOutlined /> : undefined}
                            >
                                {patientName ? getInitials(patientName) : undefined}
                            </Avatar>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14, color: tokens.primary }}>
                                    {patientName || <em style={{ color: "#9ca3af" }}>Sin paciente</em>}
                                </div>
                                <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                                    {[patient?.patient_code, patientAge !== null ? `${patientAge} años` : null].filter(Boolean).join(" · ")}
                                </div>
                            </div>
                        </div>

                    {/* Info rows */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", color: tokens.textSecondary, fontSize: 13 }}>
                        {order?.requested_by && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <UserOutlined />
                                <span>Solicitante:</span>
                                <span style={{ fontWeight: 500, color: tokens.textPrimary }}>{order.requested_by}</span>
                            </div>
                        )}
                        {order?.id && (
                            <div
                                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                                onClick={() => navigate(`/orders/${order.id}`)}
                            >
                                <FileTextOutlined />
                                <span style={{ fontWeight: 500, color: tokens.primary }}>Ver orden</span>
                            </div>
                        )}
                        {order?.id && (
                            <div
                                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                                onClick={() => navigate(`/orders/${order.id}#samples`)}
                            >
                                <ExperimentOutlined />
                                <span style={{ fontWeight: 500, color: tokens.primary }}>Ver muestras</span>
                            </div>
                        )}
                    </div>
                </StatsCard>

                {/* ============================================================
                    CARD 2 — Detalles del estudio (solo si hay campos custom)
                ============================================================ */}
                {hasCustomFields && (
                    <div style={cardStyle}>
                        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}>
                            <h2 style={{ ...cardTitleStyle, marginBottom: 0 }}>Detalles del estudio</h2>
                        </div>
                        <div style={{ padding: "16px 24px 20px 24px" }}>
                            <div className="re-grid-2">
                                {customBaseFields.map(({ key, field }) => (
                                    <FloatingCaptionInput
                                        key={key}
                                        label={field.label}
                                        value={baseValues[key] ?? ""}
                                        disabled={isReadOnly}
                                        type={field.type === "numeric" ? "number" : "text"}
                                        onChange={(e) =>
                                            setBaseValues((prev) => ({ ...prev, [key]: e.target.value }))
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ============================================================
                    CARD 3 — Muestras
                ============================================================ */}
                {samples.length > 0 && (
                    <div style={cardStyle}>
                        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}>
                            <h2 style={{ ...cardTitleStyle, marginBottom: 0 }}>Muestras</h2>
                        </div>
                        <div style={{ padding: "16px 24px 20px 24px" }}>
                            <Tabs
                                destroyInactiveTabPane
                                items={samples.map((s, idx) => ({
                                    key: s.id,
                                    label: `Muestra ${idx + 1} · ${s.sample_code}`,
                                    children: (
                                        <div style={{ display: "grid", gap: 12 }}>
                                            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                                                <span><b>Código:</b> {s.sample_code}</span>
                                                <span><b>Tipo:</b> {s.type}</span>
                                                <span>
                                                    <b>Fecha recepción:</b>{" "}
                                                    {s.received_at
                                                        ? new Date(s.received_at).toLocaleDateString("es-MX")
                                                        : <em style={{ color: "#9ca3af" }}>Sin especificar</em>}
                                                </span>
                                                <span><b>Estado:</b> <Tag color="#94a3b8">{s.state}</Tag></span>
                                            </div>
                                            {imagesSectionKey && (
                                                <SampleImagesPicker
                                                    sampleId={s.id}
                                                    selectedIds={
                                                        ((sectionContent[imagesSectionKey] ?? []) as TemplateImageItem[])
                                                            .filter((i) => !!i.id)
                                                            .map((i) => i.id)
                                                    }
                                                    allowDelete={false}
                                                    onToggleSelect={(img, selected) => {
                                                        setSectionContent((prev) => {
                                                            const imgs = [...((prev[imagesSectionKey] ?? []) as TemplateImageItem[])];
                                                            const exists = imgs.some((p) => p.id === img.id);
                                                            if (selected) {
                                                                if (exists) return prev;
                                                                return { ...prev, [imagesSectionKey]: [...imgs, { id: img.id, url: img.url, caption: img.caption ?? "" }] };
                                                            }
                                                            return { ...prev, [imagesSectionKey]: imgs.filter((p) => p.id !== img.id) };
                                                        });
                                                    }}
                                                />
                                            )}
                                        </div>
                                    ),
                                }))}
                            />
                        </div>
                    </div>
                )}

                {/* ============================================================
                    CARDS 4 + 5 — Contenido + Vista previa (dos columnas)
                ============================================================ */}
                <div className="re-two-column">
                    {/* --- Left column: Content editor --- */}
                    <div ref={leftColumnRef} className="re-editor-col">
                        <Card
                            title={<span style={cardTitleStyle}>Contenido del reporte</span>}
                            styles={{ body: { padding: "16px 24px 20px 24px", overflowY: "auto" } }}
                            style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow }}
                        >
                            {isReadOnly && (
                                <div style={{ marginBottom: 16, padding: 12, background: "#f0f0f0", borderRadius: 8 }}>
                                    <Typography.Text type="secondary">
                                        Este reporte está en modo solo lectura porque se encuentra en revisión o ya ha sido publicado.
                                    </Typography.Text>
                                </div>
                            )}

                            <Form layout="vertical" style={{ display: "grid", gap: 20 }}>
                                {/* Report title */}
                                <div>
                                    <FloatingCaptionInput
                                        label="Nombre del reporte"
                                        value={reportTitle}
                                        disabled={isReadOnly}
                                        onChange={(e) => { setReportTitle(e.target.value); setTitleWasManuallySet(true); }}
                                    />
                                </div>

                                {/* Dynamic sections */}
                                {templateSections.map(([key, section]) => {
                                    if (section.type === "images") return null; // images handled in Card 3
                                    const val = (sectionContent[key] ?? "") as string;

                                    if (section.type === "richtext") {
                                        return (
                                            <Form.Item key={key} label={section.label} style={{ marginBottom: 0 }}>
                                                <ReactQuill
                                                    theme="snow"
                                                    value={val}
                                                    onChange={(html) =>
                                                        setSectionContent((prev) => ({ ...prev, [key]: html }))
                                                    }
                                                    modules={QUILL_MODULES_RICH}
                                                    readOnly={isReadOnly}
                                                />
                                            </Form.Item>
                                        );
                                    }

                                    if (section.type === "table") {
                                        return (
                                            <Form.Item key={key} label={section.label} style={{ marginBottom: 0 }}>
                                                <div>
                                                    {val ? (
                                                        <div
                                                            style={{ marginBottom: 8, fontSize: 13, overflowX: "auto" }}
                                                            dangerouslySetInnerHTML={{ __html: markdownTableToHtml(val) }}
                                                        />
                                                    ) : (
                                                        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
                                                            Sin datos. Abre el editor para añadir contenido.
                                                        </Typography.Text>
                                                    )}
                                                    {!isReadOnly && (
                                                        <Button
                                                            size="small"
                                                            icon={<EditOutlined />}
                                                            onClick={() => {
                                                                setTableDraft(val);
                                                                setTableModal({ key, label: section.label });
                                                            }}
                                                        >
                                                            {val ? "Editar tabla" : "Crear tabla"}
                                                        </Button>
                                                    )}
                                                </div>
                                            </Form.Item>
                                        );
                                    }

                                    if (section.type === "text") {
                                        return (
                                            <Form.Item key={key} label={section.label} style={{ marginBottom: 0 }}>
                                                <Input.TextArea
                                                    value={val}
                                                    disabled={isReadOnly}
                                                    autoSize={{ minRows: 3, maxRows: 8 }}
                                                    onChange={(e) =>
                                                        setSectionContent((prev) => ({ ...prev, [key]: e.target.value }))
                                                    }
                                                />
                                            </Form.Item>
                                        );
                                    }

                                    if (section.type === "numeric") {
                                        return (
                                            <Form.Item key={key} label={section.label} style={{ marginBottom: 0 }}>
                                                <Input
                                                    type="number"
                                                    value={val}
                                                    disabled={isReadOnly}
                                                    onChange={(e) =>
                                                        setSectionContent((prev) => ({ ...prev, [key]: e.target.value }))
                                                    }
                                                />
                                            </Form.Item>
                                        );
                                    }

                                    return null;
                                })}

                                {/* Image gallery for the images section */}
                                {imagesSectionKey && (
                                    <div>
                                        <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
                                            {template?.sections[imagesSectionKey]?.label ?? "Imágenes"}
                                        </Typography.Text>
                                        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                                            Selecciona imágenes desde las muestras. Eliminar aquí las desasocia del reporte.
                                        </Typography.Text>

                                        {reportImages.length > 0 ? (
                                            <Image.PreviewGroup
                                                preview={{
                                                    visible: reportPreview.visible,
                                                    current: reportPreview.index,
                                                    onVisibleChange: (v) => setReportPreview((p) => ({ ...p, visible: v })),
                                                    onChange: (c) => setReportPreview((p) => ({ ...p, index: c })),
                                                    toolbarRender: (_node, info) => {
                                                        const ci = typeof info.current === "number" ? info.current : reportPreview.index;
                                                        return (
                                                            <div className="ant-image-preview-operations" style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                                                    {info.icons.zoomOutIcon}
                                                                    {info.icons.zoomInIcon}
                                                                </div>
                                                                {imagesSectionKey && reportImages[ci] && (
                                                                    <Popconfirm title="Quitar imagen" okText="Sí" cancelText="No"
                                                                        onConfirm={() => removeImage(imagesSectionKey, ci)}>
                                                                        <Button size="small" type="text" icon={<DeleteOutlined />}
                                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                                                                            Eliminar
                                                                        </Button>
                                                                    </Popconfirm>
                                                                )}
                                                            </div>
                                                        );
                                                    },
                                                }}
                                            >
                                                <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
                                                    {reportImages.map((img, idx) => {
                                                        const note = img.caption ?? "";
                                                        const counterId = `img-note-${img.id ?? idx}`;
                                                        return (
                                                            <Card key={img.id ?? idx} size="small" hoverable
                                                                style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}
                                                                bodyStyle={{ padding: 0 }}>
                                                                <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "center" }}>
                                                                    <div style={{ flex: "0 0 25%", aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", background: "#0f172a" }}>
                                                                        <Image
                                                                            src={img.thumbnailUrl || img.url}
                                                                            alt={img.caption || `Figura ${idx + 1}`}
                                                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                                            fallback={img.url}
                                                                            preview={{ src: img.url }}
                                                                            onClick={() => setReportPreview({ visible: true, index: idx })}
                                                                        />
                                                                    </div>
                                                                    <div style={{ flex: "1 1 0", minWidth: 0, background: "#f8fafc", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, border: "1px solid #e2e8f0" }}>
                                                                        <Typography.Text strong>{`Figura ${idx + 1}`}</Typography.Text>
                                                                        <Input.TextArea
                                                                            placeholder="Nota para esta imagen"
                                                                            autoSize={{ minRows: 1, maxRows: 2 }}
                                                                            maxLength={NOTE_MAX_LENGTH}
                                                                            aria-describedby={counterId}
                                                                            value={note}
                                                                            onChange={(e) => {
                                                                                if (imagesSectionKey) updateImageCaption(imagesSectionKey, idx, e.target.value.slice(0, NOTE_MAX_LENGTH));
                                                                            }}
                                                                            onKeyDown={(e) => {
                                                                                if (e.metaKey || e.ctrlKey || e.altKey) return;
                                                                                if (note.length < NOTE_MAX_LENGTH) return;
                                                                                if (NOTE_CONTROL_KEYS.has(e.key)) return;
                                                                                e.preventDefault();
                                                                            }}
                                                                            style={{ background: "#fff", fontSize: 13 }}
                                                                        />
                                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                                                                            <span id={counterId} style={{ fontSize: 12, color: "#475569" }}>{note.length}/{NOTE_MAX_LENGTH}</span>
                                                                            {imagesSectionKey && (
                                                                                <Popconfirm title="Quitar imagen" okText="Sí" cancelText="No"
                                                                                    onConfirm={() => removeImage(imagesSectionKey, idx)}>
                                                                                    <Button danger type="text" icon={<DeleteOutlined />}
                                                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                                                                                        Eliminar
                                                                                    </Button>
                                                                                </Popconfirm>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                            </Image.PreviewGroup>
                                        ) : (
                                            <Typography.Text type="secondary">No hay imágenes seleccionadas.</Typography.Text>
                                        )}
                                    </div>
                                )}

                                <Divider />

                                {/* Action buttons */}
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    {!isReadOnly && (
                                        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
                                            Guardar reporte
                                        </Button>
                                    )}
                                    <Button icon={<FilePdfOutlined />} onClick={handleExportPDF}>
                                        Exportar a PDF
                                    </Button>
                                    {envelope?.status === "DRAFT" && (
                                        <Button onClick={handleSubmit}>Enviar a Revisión</Button>
                                    )}
                                    {envelope?.status === "IN_REVIEW" && userRole === "pathologist" && (
                                        <>
                                            <Button style={{ background: "#52c41a", color: "white", borderColor: "#52c41a" }}
                                                onClick={() => setIsApproveModalVisible(true)}>Aprobar</Button>
                                            <Button style={{ background: "#f59e0b", color: "white", borderColor: "#f59e0b" }}
                                                onClick={() => setIsChangesModalVisible(true)}>Solicitar Cambios</Button>
                                        </>
                                    )}
                                    {envelope?.status === "APPROVED" && userRole === "pathologist" && (
                                        <Button style={{ background: "#1890ff", color: "white", borderColor: "#1890ff" }}
                                            onClick={handleSign}>Firmar y Publicar</Button>
                                    )}
                                </div>
                            </Form>
                        </Card>
                    </div>

                    {/* --- Right column: Preview --- */}
                    <div ref={previewColumnRef} className="re-preview-col">
                        <Card
                            title={<span style={cardTitleStyle}>Vista previa</span>}
                            styles={{ body: { padding: 16 } }}
                            style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow }}
                        >
                            {previewEnvelope ? (
                                <ReportPreviewPages ref={previewPagesRef} report={previewEnvelope} />
                            ) : (
                                <Typography.Text type="secondary">Cargando vista previa...</Typography.Text>
                            )}
                        </Card>
                    </div>
                </div>
            </div>

            {/* Table section edit modal */}
            <Modal
                title={`Editar tabla — ${tableModal?.label ?? ""}`}
                open={tableModal !== null}
                onCancel={() => setTableModal(null)}
                onOk={() => {
                    if (tableModal) {
                        setSectionContent((prev) => ({ ...prev, [tableModal.key]: tableDraft }));
                    }
                    setTableModal(null);
                }}
                okText="Guardar"
                cancelText="Cancelar"
                width={720}
                destroyOnClose
            >
                <div style={{ marginTop: 16 }}>
                    <TableEditor
                        value={tableDraft}
                        onChange={setTableDraft}
                    />
                </div>
            </Modal>

            {/* Approve modal */}
            <Modal
                title={<div style={{ fontSize: 18, fontWeight: 600 }}>Aprobar Reporte</div>}
                open={isApproveModalVisible}
                onCancel={() => { setIsApproveModalVisible(false); setApproveComment(""); }}
                width={600}
                footer={[
                    <Button key="cancel" onClick={() => { setIsApproveModalVisible(false); setApproveComment(""); }}>Cancelar</Button>,
                    <Button key="approve" type="primary" onClick={handleApprove}
                        style={{ background: "#52c41a", borderColor: "#52c41a" }}>Aprobar</Button>,
                ]}
            >
                <Typography.Paragraph style={{ color: "#475569", marginBottom: 16 }}>
                    Puedes agregar un comentario opcional al aprobar el reporte:
                </Typography.Paragraph>
                <CommentInput value={approveComment} onChange={setApproveComment}
                    onSubmit={async (text) => setApproveComment(text)}
                    placeholder="Comentario opcional..." rows={4} hideSubmitButton />
            </Modal>

            {/* Request changes modal */}
            <Modal
                title={<div style={{ fontSize: 18, fontWeight: 600 }}>Solicitar Cambios</div>}
                open={isChangesModalVisible}
                onCancel={() => { setIsChangesModalVisible(false); setChangesComment(""); }}
                width={600}
                footer={[
                    <Button key="cancel" onClick={() => { setIsChangesModalVisible(false); setChangesComment(""); }}>Cancelar</Button>,
                    <Button key="send" type="primary" disabled={!changesComment.trim()}
                        style={{ background: "#f59e0b", borderColor: "#f59e0b" }}
                        onClick={handleRequestChanges}>Solicitar Cambios</Button>,
                ]}
            >
                <CommentInput value={changesComment} onChange={setChangesComment}
                    onSubmit={async (text) => setChangesComment(text)}
                    placeholder="Describe los cambios necesarios..." rows={4} hideSubmitButton />
            </Modal>
        </>
    );
};

export default ReportEditor;
