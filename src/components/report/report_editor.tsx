import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
    message, Typography, Card, Image, Modal, Avatar, Divider, Form,
} from "antd";
import {
    UserOutlined, FileTextOutlined,
    DeleteOutlined, FilePdfOutlined, SaveOutlined, EditOutlined, SafetyCertificateOutlined,
    ExclamationCircleOutlined, CalendarOutlined, ContainerOutlined,
    AuditOutlined, CheckCircleOutlined, SendOutlined,
} from "@ant-design/icons";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import {
    getReportFull, getStudyType, getReportTemplateById,
    saveReport, saveReportVersion,
    submitReport, approveReport, requestChanges, signReport,
} from "../../services/report_service";
import {
    getSignature,
    NO_SIGNATURE_TITLE,
    NO_SIGNATURE_DESCRIPTION,
    isSignatureMissingError,
} from "../../services/signature_service";
import { showCelumaWarning, showCelumaApiError } from "../../lib/celuma_feedback";
import type { ReportImage } from "./report_images";
import SampleImagesPicker from "./sample_images_picker";
import ReportPreviewPages, { type ReportPreviewPagesRef } from "./report_preview_pages";
import { usePdfExport } from "../../hooks/use_pdf_export";
import type {
    ReportEnvelope, ReportFullResponse, ReportStatus,
    ReportTemplateJSON, ReportSectionText,
    ReportBaseFieldConfig, ReportBaseFieldCustom, TemplateImageItem,
    TemplateOrderInput,
} from "../../models/report";
import {
    buildEmptyReportContent,
    normalizeReportTemplateJSON,
    mergePersistedContentIntoTemplateSnapshot,
    resolveBaseOrder,
    resolveSectionOrder,
    resolveDisplayOrder,
    resolveSignatureMetadata,
} from "../../models/report";
import FloatingCaptionInput from "../ui/floating_caption_input";
import RecordCard, { codeChipStyle, statusChipStyle, MetaItem } from "../ui/record_card";
import CelumaTabs from "../ui/celuma_tabs";
import CelumaButton from "../ui/button";
import ActionButtonPanel from "../ui/action_button_panel";
import CelumaSteps, { type CelumaStep } from "../ui/celuma_steps";
import CelumaModal from "../ui/celuma_modal";
import Panel from "../ui/panel";
import EmptyState from "../ui/empty_state";
import CelumaTextArea from "../ui/textarea_field";
import CelumaRichText from "../ui/celuma_rich_text";
import CelumaSwitch from "../ui/celuma_switch";
import SectionTitle from "../ui/section_title";
import { TableEditor } from "./table_editor";
import { markdownTableToHtml } from "./table_utils";
import { tokens } from "../design/tokens";
import { renderStatusChip, getSampleTypeConfig } from "../ui/table_helpers";
import { getInitials, getAvatarColor } from "../comments/comment_utils";
import CommentInput from "../comments/comment_input";
import { useUserProfile } from "../../hooks/use_user_profile";
import { PERMS } from "../../lib/rbac";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOTE_MAX_LENGTH = 25;

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

function isCustomField(f: ReportBaseFieldConfig): f is ReportBaseFieldCustom {
    return (f as ReportBaseFieldCustom).is_custom === true;
}

const EMPTY_TEMPLATE_JSON: ReportTemplateJSON = normalizeReportTemplateJSON({ base: {}, sections: {} });

// Report lifecycle for the CelumaSteps bar (colors mirror REPORT_STATUS_CONFIG chips).
const REPORT_STEPS: CelumaStep[] = [
    { key: "DRAFT", title: "Borrador", icon: <EditOutlined />, color: "#f59e0b", bg: "#fffbeb" },
    { key: "IN_REVIEW", title: "En Revisión", icon: <AuditOutlined />, color: "#3b82f6", bg: "#eff6ff" },
    { key: "APPROVED", title: "Aprobado", icon: <CheckCircleOutlined />, color: "#10b981", bg: "#ecfdf5" },
    { key: "PUBLISHED", title: "Publicado", icon: <SendOutlined />, color: "#22c55e", bg: "#f0fdf4" },
];

function getReportStep(status?: string): number {
    const i = REPORT_STEPS.findIndex((s) => s.key === status);
    return i >= 0 ? i : 0;
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

// Caption above a content field (section label), Céluma form language.
const fieldCaptionStyle: CSSProperties = {
    fontSize: 13, fontWeight: 600, color: tokens.textPrimary, marginBottom: 8,
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

    // Existing envelope (for editing)
    const [envelope, setEnvelope] = useState<ReportEnvelope | null>(null);

    // User permissions (RBAC)
    const { hasPermission: userHasPermission } = useUserProfile();

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

    // Signature metadata flags (T7) — persisted at the document root in the JSON body.
    const [showSignatureSection, setShowSignatureSection] = useState(false);
    const [requireDigitalSignature, setRequireDigitalSignature] = useState(false);

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

    // Custom base fields (from template), ordered by template.base_order
    const customBaseFields = useMemo(() => {
        if (!template) return [];
        return resolveBaseOrder(template)
            .map((k) => {
                const v = template.base[k];
                return v && isCustomField(v) ? { key: k, field: v as ReportBaseFieldCustom } : null;
            })
            .filter((x): x is { key: string; field: ReportBaseFieldCustom } => x !== null);
    }, [template]);

    const hasCustomFields = customBaseFields.length > 0;

    // Sections from template, ordered by template.section_order
    const templateSections = useMemo(() => {
        if (!template) return [];
        return resolveSectionOrder(template)
            .map((k) => [k, template.sections[k]] as const)
            .filter(([, v]) => v?.is_visible);
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

                    const normalized =
                        !tmpl || !tmpl.base || !tmpl.sections
                            ? EMPTY_TEMPLATE_JSON
                            : normalizeReportTemplateJSON(tmpl);

                    const savedReport = full.report?.report;
                    const baseTmpl = mergePersistedContentIntoTemplateSnapshot(
                        normalized,
                        savedReport ?? undefined,
                    );

                    // Fuse the saved report's order arrays into the template state so the
                    // editor panel and buildEnvelope both use the same effective order.
                    const { baseOrder: savedBO, sectionOrder: savedSO } = resolveDisplayOrder(baseTmpl, savedReport);
                    const effectiveTmpl: ReportTemplateJSON = {
                        ...baseTmpl,
                        base_order: savedBO,
                        section_order: savedSO,
                    };
                    setTemplate(effectiveTmpl);

                    // Populate base custom values (saved value → template default → "")
                    const savedBase = full.report?.report?.base ?? {};
                    const bv: Record<string, string> = {};
                    Object.entries(effectiveTmpl.base).forEach(([k, v]) => {
                        if (isCustomField(v)) {
                            bv[k] = (savedBase[k]?.value as string) || (v as ReportBaseFieldCustom).value || "";
                        }
                    });
                    setBaseValues(bv);

                    // Populate section content from saved report or template defaults
                    const savedSections = full.report?.report?.sections ?? {};
                    const sc: Record<string, string | TemplateImageItem[]> = {};
                    Object.entries(effectiveTmpl.sections).forEach(([k, v]) => {
                        if (v.type === "images") {
                            const saved = savedSections[k];
                            sc[k] = (saved && Array.isArray(saved.content) ? saved.content : []) as TemplateImageItem[];
                        } else {
                            const saved = savedSections[k];
                            sc[k] = (saved?.content as string) || (v as ReportSectionText).content || "";
                        }
                    });
                    setSectionContent(sc);

                    // Initialize signature toggles: prefer saved content, fall back to template defaults.
                    const savedSig = resolveSignatureMetadata(full.report?.report ?? null);
                    const tmplSig = resolveSignatureMetadata(effectiveTmpl);
                    const showInit = full.report?.report?.signatureMetadata !== undefined
                        ? savedSig.show_signature_section
                        : tmplSig.show_signature_section;
                    const requireInit = full.report?.report?.signatureMetadata !== undefined
                        ? savedSig.require_digital_signature
                        : tmplSig.require_digital_signature;
                    setShowSignatureSection(showInit);
                    setRequireDigitalSignature(showInit && requireInit);

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
                    let tmplRaw: TemplateOrderInput | null = null;
                    if (orderFull.order.study_type_id) {
                        try {
                            const st = await getStudyType(orderFull.order.study_type_id);
                            setStudyTypeName(st.name);
                            if (st.default_report_template_id) {
                                const tpl = await getReportTemplateById(st.default_report_template_id);
                                tmplRaw = tpl.template_json;
                            }
                        } catch { /* ignore, use empty template */ }
                    }
                    const tmplNew = tmplRaw ? normalizeReportTemplateJSON(tmplRaw) : EMPTY_TEMPLATE_JSON;
                    setTemplate(tmplNew);

                    // Initialize base custom values with template defaults
                    const bv: Record<string, string> = {};
                    Object.entries(tmplNew.base).forEach(([k, v]) => {
                        if (isCustomField(v)) bv[k] = (v as ReportBaseFieldCustom).value || "";
                    });
                    setBaseValues(bv);

                    // Initialize section content with template defaults
                    const sc: Record<string, string | TemplateImageItem[]> = {};
                    Object.entries(tmplNew.sections).forEach(([k, v]) => {
                        if (v.type === "images") {
                            sc[k] = [];
                        } else {
                            sc[k] = (v as ReportSectionText).content || "";
                        }
                    });
                    setSectionContent(sc);

                    // Inherit signature toggles from the template defaults for new reports.
                    const tmplSig = resolveSignatureMetadata(tmplNew);
                    setShowSignatureSection(tmplSig.show_signature_section);
                    setRequireDigitalSignature(tmplSig.require_digital_signature);
                }
            } catch (err) {
                setLoadError(err instanceof Error ? err.message : "No se pudo cargar el reporte");
            } finally {
                setLoadingData(false);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportId, prefilledOrderId]);

    // User role fetched via useUserProfile hook above (no separate effect needed)

    // Keep reportImages in sync with the images section
    useEffect(() => {
        if (!imagesSectionKey) return;
        const imgs = (sectionContent[imagesSectionKey] ?? []) as TemplateImageItem[];
        setReportImages(imgs.map((i) => ({ id: i.id, url: i.url, caption: i.caption, thumbnailUrl: i.url })));
    }, [imagesSectionKey, sectionContent]);

    // ---------------------------------------------------------------------------
    // Build envelope for save/preview
    // ---------------------------------------------------------------------------

    const buildEnvelope = useCallback((): ReportEnvelope => {
        const tmpl = template ?? EMPTY_TEMPLATE_JSON;
        // When a report has already been saved, preserve its stored order.
        const { baseOrder, sectionOrder } = resolveDisplayOrder(tmpl, envelope?.report);
        const tmplWithSavedOrder = { ...tmpl, base_order: baseOrder, section_order: sectionOrder };
        const report = buildEmptyReportContent(tmplWithSavedOrder);

        // Fill predefined base values from full data
        if (fullData) {
            const patient = fullData.patient;
            const order = fullData.order;
            if (patient && report.base["patient"]) report.base["patient"].value =
                `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || patient.patient_code;
            if (report.base["order_code"]) report.base["order_code"].value = order.order_code || "";
            if (report.base["study_type"]) report.base["study_type"].value = studyTypeName || "";
            if (patient && report.base["patient_age"]) {
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
            if (report.base["requesting_physician"]) {
                const physician = order.requesting_physician;
                report.base["requesting_physician"].value =
                    physician?.full_name || order.requested_by || "";
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

        // Preserve any signature_url the backend embedded at sign-time so saving
        // a draft after signing does not strip it from the JSON body.
        const preservedSignatureUrl = envelope?.report?.signatureMetadata?.signature_url ?? null;
        report.signatureMetadata = {
            show_signature_section: showSignatureSection,
            require_digital_signature: showSignatureSection && requireDigitalSignature,
            ...(preservedSignatureUrl ? { signature_url: preservedSignatureUrl } : {}),
        };

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
    }, [template, fullData, customBaseFields, baseValues, sectionContent, envelope, session, reportTitle, studyTypeName, showSignatureSection, requireDigitalSignature]);

    // Live preview envelope
    const previewEnvelope = useMemo(() => {
        if (!template) return null;
        try { return buildEnvelope(); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template, baseValues, sectionContent, reportTitle, studyTypeName, fullData, envelope, showSignatureSection, requireDigitalSignature]);

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
        } catch (err) { showCelumaApiError(err, "Error al enviar el reporte."); }
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

    const promptUploadSignature = () => {
        showCelumaWarning(NO_SIGNATURE_TITLE, NO_SIGNATURE_DESCRIPTION);
        Modal.warning({
            title: "Firma digital requerida",
            content:
                "Este informe se va a firmar con firma digital, pero aún no tienes una imagen PNG cargada. Súbela en tu perfil para continuar.",
            okText: "Ir al perfil",
            okCancel: true,
            cancelText: "Más tarde",
            onOk: () => navigate("/profile"),
        });
    };

    const handleSign = async () => {
        if (!envelope?.id) return;
        // Use the live toggle state so an unsaved "Firma digital" change is honoured.
        // resolveSignatureMetadata mirrors the same precedence applied in buildEnvelope.
        const needsDigitalSignature = resolveSignatureMetadata({
            signatureMetadata: {
                show_signature_section: showSignatureSection,
                require_digital_signature: requireDigitalSignature,
            },
        }).require_digital_signature;

        if (needsDigitalSignature) {
            try {
                const sig = await getSignature();
                if (!sig?.has_signature) {
                    promptUploadSignature();
                    return;
                }
            } catch (err) {
                if (isSignatureMissingError(err)) {
                    promptUploadSignature();
                    return;
                }
                showCelumaApiError(err, "No pudimos verificar tu firma guardada. Inténtalo de nuevo.");
                return;
            }
        }
        try {
            const result = await signReport(envelope.id);
            message.success(result.message);
            const full = await getReportFull(envelope.id);
            setEnvelope(full.report);
        } catch (err) {
            if (isSignatureMissingError(err)) {
                promptUploadSignature();
                return;
            }
            showCelumaApiError(err, "Error al firmar el reporte.");
        }
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
            <EmptyState
                icon={<ExclamationCircleOutlined />}
                color="#e5484d"
                title="No se pudo cargar el reporte"
                description={loadError}
                action={<CelumaButton onClick={() => navigate("/reports")}>Ver reportes</CelumaButton>}
            />
        );
    }

    if (!fullData && !reportId && !prefilledOrderId) {
        return (
            <EmptyState
                icon={<FileTextOutlined />}
                title="No hay reporte seleccionado"
                description="Para crear un reporte, dirígete a una orden y selecciona la opción de crear reporte desde ahí. También puedes acceder a un reporte existente desde la lista de reportes."
                action={
                    <div style={{ display: "flex", gap: 12 }}>
                        <CelumaButton type="primary" onClick={() => navigate("/orders")}>Ver órdenes</CelumaButton>
                        <CelumaButton onClick={() => navigate("/reports")}>Ver reportes</CelumaButton>
                    </div>
                }
            />
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
                    CARD 1 — Reporte (Céluma ficha)
                ============================================================ */}
                <RecordCard
                    avatar={
                        <Avatar
                            size={104}
                            onClick={() => patient?.id && navigate(`/patients/${patient.id}`)}
                            style={{
                                backgroundColor: getAvatarColor(patientName || "P"),
                                fontSize: 38,
                                fontWeight: 700,
                                border: "2px solid #d1d5db",
                                flexShrink: 0,
                                cursor: patient?.id ? "pointer" : "default",
                            }}
                            icon={!patientName ? <UserOutlined /> : undefined}
                        >
                            {patientName ? getInitials(patientName) : undefined}
                        </Avatar>
                    }
                    chips={
                        <>
                            {order?.order_code && <span style={codeChipStyle}>{order.order_code}</span>}
                            {(() => {
                                const cfg = { color: "#0d9488", bg: "#f0fdfa" };
                                return renderStatusChip(envelope?.status ?? "DRAFT", "report") ?? (
                                    <span style={statusChipStyle(cfg)}>Borrador</span>
                                );
                            })()}
                        </>
                    }
                    title={
                        <h1
                            onClick={() => patient?.id && navigate(`/patients/${patient.id}`)}
                            style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 26, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1, cursor: patient?.id ? "pointer" : "default" }}
                        >
                            {patientName || "Sin paciente"}
                        </h1>
                    }
                    subtitle={[patient?.patient_code, patientAge !== null ? `${patientAge} años` : null].filter(Boolean).join(" · ") || undefined}
                    meta={
                        <>
                            {studyTypeName && (
                                <MetaItem icon={<FileTextOutlined />}>
                                    <span style={{ marginRight: 4 }}>Estudio:</span>
                                    <span style={{ fontWeight: 600, color: tokens.textPrimary }}>{studyTypeName}</span>
                                </MetaItem>
                            )}
                            {order?.requested_by && (
                                <MetaItem icon={<UserOutlined />}>
                                    <span style={{ marginRight: 4 }}>Solicitante:</span>
                                    <span style={{ fontWeight: 600, color: tokens.textPrimary }}>{order.requested_by}</span>
                                </MetaItem>
                            )}
                            {order?.id && (
                                <MetaItem icon={<ContainerOutlined />}>
                                    <a
                                        href={`/orders/${order.id}`}
                                        onClick={(e) => { e.preventDefault(); navigate(`/orders/${order.id}`); }}
                                        style={{ fontWeight: 600, color: tokens.primary }}
                                    >
                                        Ver orden
                                    </a>
                                </MetaItem>
                            )}
                        </>
                    }
                >
                    {/* Workflow — progress steps + status actions, integrated in the header */}
                    <Divider style={{ margin: "18px 0 16px" }} />
                    <CelumaSteps steps={REPORT_STEPS} current={getReportStep(envelope?.status)} />
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                        {!isReadOnly && (
                            <CelumaButton type="primary" size="small" icon={<SaveOutlined />} onClick={handleSave}>
                                Guardar reporte
                            </CelumaButton>
                        )}
                        <CelumaButton size="small" icon={<FilePdfOutlined />} onClick={handleExportPDF}>
                            Exportar a PDF
                        </CelumaButton>
                        {envelope?.status === "DRAFT" && (
                            <CelumaButton type="primary" size="small" icon={<SendOutlined />} onClick={handleSubmit}>
                                Enviar a Revisión
                            </CelumaButton>
                        )}
                        {envelope?.status === "IN_REVIEW" && userHasPermission(PERMS.REPORTS_APPROVE) && (
                            <>
                                <CelumaButton type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => setIsApproveModalVisible(true)}>
                                    Aprobar
                                </CelumaButton>
                                <CelumaButton danger size="small" icon={<EditOutlined />} onClick={() => setIsChangesModalVisible(true)}>
                                    Solicitar Cambios
                                </CelumaButton>
                            </>
                        )}
                        {envelope?.status === "APPROVED" && userHasPermission(PERMS.REPORTS_SIGN) && (
                            <CelumaButton type="primary" size="small" icon={<SafetyCertificateOutlined />} onClick={handleSign}>
                                Firmar y Publicar
                            </CelumaButton>
                        )}
                    </div>
                </RecordCard>

                {/* ============================================================
                    CARD 3 — Muestras
                ============================================================ */}
                {samples.length > 0 && (
                    <div style={cardStyle}>
                        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}>
                            <h2 style={{ ...cardTitleStyle, marginBottom: 0 }}>Muestras</h2>
                        </div>
                        <div style={{ padding: "16px 24px 20px 24px" }}>
                            <CelumaTabs
                                destroyInactiveTabPane
                                items={samples.map((s, idx) => {
                                    const typeCfg = getSampleTypeConfig(s.type);
                                    return {
                                    key: s.id,
                                    label: (
                                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ color: typeCfg.color, display: "inline-flex" }}>{typeCfg.icon}</span>
                                            {`Muestra ${idx + 1} · ${s.sample_code}`}
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ display: "grid", gap: 12 }}>
                                            <Panel style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                                                <MetaItem icon={typeCfg.icon}>
                                                    <span style={{ fontWeight: 600, color: tokens.textPrimary }}>{typeCfg.label}</span>
                                                </MetaItem>
                                                <MetaItem icon={<CalendarOutlined />}>
                                                    {s.received_at
                                                        ? new Date(s.received_at).toLocaleDateString("es-MX")
                                                        : <em style={{ color: "#9ca3af" }}>Sin fecha</em>}
                                                </MetaItem>
                                                {renderStatusChip(s.state, "sample")}
                                            </Panel>
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
                                    };
                                })}
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
                                <Panel style={{
                                    marginBottom: 16,
                                    background: "#fffbeb",
                                    border: "2px solid #fde68a",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 10,
                                    padding: 12,
                                }}>
                                    <ExclamationCircleOutlined style={{ color: "#d97706", fontSize: 18, flexShrink: 0, marginTop: 2 }} />
                                    <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.45 }}>
                                        Este reporte está en <b>modo solo lectura</b> porque se encuentra en revisión o ya ha sido publicado.
                                    </div>
                                </Panel>
                            )}

                            <Form layout="vertical" style={{ display: "grid", gap: 20 }}>
                                {/* Detalles del reporte — report name + custom base fields, grouped */}
                                <div>
                                    <SectionTitle style={{ marginBottom: 12 }}>Detalles del reporte</SectionTitle>
                                    <div style={{ display: "grid", gap: 16 }}>
                                        <FloatingCaptionInput
                                            label="Nombre del reporte"
                                            value={reportTitle}
                                            disabled={isReadOnly}
                                            onChange={(e) => { setReportTitle(e.target.value); setTitleWasManuallySet(true); }}
                                        />
                                        {hasCustomFields && (
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
                                        )}
                                    </div>
                                </div>

                                {/* Dynamic sections */}
                                {templateSections.map(([key, section]) => {
                                    if (section.type === "images") return null; // images handled in Card 3
                                    const val = (sectionContent[key] ?? "") as string;

                                    if (section.type === "richtext") {
                                        return (
                                            <div key={key}>
                                                <div style={fieldCaptionStyle}>{section.label}</div>
                                                <CelumaRichText
                                                    value={val}
                                                    onChange={(html) =>
                                                        setSectionContent((prev) => ({ ...prev, [key]: html }))
                                                    }
                                                    readOnly={isReadOnly}
                                                    placeholder={`Escribe ${section.label.toLowerCase()}…`}
                                                />
                                            </div>
                                        );
                                    }

                                    if (section.type === "table") {
                                        return (
                                            <div key={key}>
                                                <div style={fieldCaptionStyle}>{section.label}</div>
                                                <Panel>
                                                    {val ? (
                                                        <div
                                                            style={{ marginBottom: 10, fontSize: 13, overflowX: "auto" }}
                                                            dangerouslySetInnerHTML={{ __html: markdownTableToHtml(val) }}
                                                        />
                                                    ) : (
                                                        <div style={{ marginBottom: 10, fontSize: 13, color: tokens.textSecondary }}>
                                                            Sin datos. Abre el editor para añadir contenido.
                                                        </div>
                                                    )}
                                                    {!isReadOnly && (
                                                        <CelumaButton
                                                            size="xsmall"
                                                            icon={<EditOutlined />}
                                                            onClick={() => {
                                                                setTableDraft(val);
                                                                setTableModal({ key, label: section.label });
                                                            }}
                                                        >
                                                            {val ? "Editar tabla" : "Crear tabla"}
                                                        </CelumaButton>
                                                    )}
                                                </Panel>
                                            </div>
                                        );
                                    }

                                    if (section.type === "text") {
                                        return (
                                            <div key={key}>
                                                <div style={fieldCaptionStyle}>{section.label}</div>
                                                <CelumaTextArea
                                                    value={val}
                                                    disabled={isReadOnly}
                                                    rows={3}
                                                    onChange={(v) =>
                                                        setSectionContent((prev) => ({ ...prev, [key]: v }))
                                                    }
                                                    placeholder={`Escribe ${section.label.toLowerCase()}…`}
                                                />
                                            </div>
                                        );
                                    }

                                    if (section.type === "numeric") {
                                        return (
                                            <div key={key}>
                                                <FloatingCaptionInput
                                                    label={section.label}
                                                    type="number"
                                                    value={val}
                                                    disabled={isReadOnly}
                                                    onChange={(e) =>
                                                        setSectionContent((prev) => ({ ...prev, [key]: e.target.value }))
                                                    }
                                                />
                                            </div>
                                        );
                                    }

                                    return null;
                                })}

                                {/* Image gallery for the images section — Céluma figure cards */}
                                {imagesSectionKey && (
                                    <div>
                                        <SectionTitle style={{ marginBottom: 4 }}>
                                            {template?.sections[imagesSectionKey]?.label ?? "Imágenes"}
                                        </SectionTitle>
                                        <div style={{ fontSize: 12.5, color: tokens.textSecondary, marginBottom: 12 }}>
                                            Selecciona imágenes desde las muestras. Eliminar aquí las desasocia del reporte.
                                        </div>

                                        {reportImages.length > 0 ? (
                                            <Image.PreviewGroup>
                                                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
                                                    {reportImages.map((img, idx) => {
                                                        const note = img.caption ?? "";
                                                        return (
                                                            <Panel key={img.id ?? idx} style={{ display: "flex", gap: 12, padding: 12, alignItems: "stretch" }}>
                                                                <div style={{ flex: "0 0 30%", aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", background: "#f1f5f9", flexShrink: 0 }}>
                                                                    <Image
                                                                        src={img.thumbnailUrl || img.url}
                                                                        alt={img.caption || `Figura ${idx + 1}`}
                                                                        wrapperStyle={{ width: "100%", height: "100%", display: "block" }}
                                                                        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" }}
                                                                        fallback={img.url}
                                                                        preview={{ src: img.url }}
                                                                    />
                                                                </div>
                                                                <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                                                                        <span style={{ fontWeight: 700, color: tokens.textPrimary, fontFamily: tokens.titleFont }}>{`Figura ${idx + 1}`}</span>
                                                                        {!isReadOnly && (
                                                                            <ActionButtonPanel
                                                                                size="xxsmall"
                                                                                actions={[{
                                                                                    icon: <DeleteOutlined />,
                                                                                    tooltip: "Quitar del reporte",
                                                                                    ariaLabel: "Quitar imagen",
                                                                                    danger: true,
                                                                                    onClick: () => imagesSectionKey && removeImage(imagesSectionKey, idx),
                                                                                }]}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                    <CelumaTextArea
                                                                        value={note}
                                                                        disabled={isReadOnly}
                                                                        rows={2}
                                                                        maxLength={NOTE_MAX_LENGTH}
                                                                        placeholder="Nota para esta imagen"
                                                                        onChange={(v) => {
                                                                            if (imagesSectionKey) updateImageCaption(imagesSectionKey, idx, v.slice(0, NOTE_MAX_LENGTH));
                                                                        }}
                                                                    />
                                                                </div>
                                                            </Panel>
                                                        );
                                                    })}
                                                </div>
                                            </Image.PreviewGroup>
                                        ) : (
                                            <div style={{ fontSize: 13, color: tokens.textSecondary }}>No hay imágenes seleccionadas.</div>
                                        )}
                                    </div>
                                )}

                                <Divider />

                                {/* Signature configuration (T7) */}
                                <div style={{ marginBottom: 16 }}>
                                    <SectionTitle icon={<SafetyCertificateOutlined />}>Firma</SectionTitle>
                                    <Panel style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, color: tokens.textPrimary }}>
                                                    Incluir sección de firma en el reporte
                                                </div>
                                                <div style={{ fontSize: 12.5, color: tokens.textSecondary, marginTop: 2 }}>
                                                    Agrega un bloque al final del informe con espacio para la firma del revisor.
                                                </div>
                                            </div>
                                            <CelumaSwitch
                                                checked={showSignatureSection}
                                                disabled={isReadOnly}
                                                onChange={(checked) => {
                                                    setShowSignatureSection(checked);
                                                    if (!checked) setRequireDigitalSignature(false);
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, opacity: showSignatureSection ? 1 : 0.5 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, color: tokens.textPrimary }}>
                                                    Firma digital (imagen PNG)
                                                </div>
                                                <div style={{ fontSize: 12.5, color: tokens.textSecondary, marginTop: 2 }}>
                                                    Inserta la firma digital del revisor al firmar el reporte.
                                                </div>
                                            </div>
                                            <CelumaSwitch
                                                checked={requireDigitalSignature}
                                                disabled={isReadOnly || !showSignatureSection}
                                                onChange={setRequireDigitalSignature}
                                            />
                                        </div>
                                    </Panel>
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
                                <ReportPreviewPages
                                    ref={previewPagesRef}
                                    report={previewEnvelope}
                            signerLookup={(fullData?.order.reviewers ?? []).map((r) => ({
                                id: r.id,
                                name: r.name,
                            }))}
                                />
                            ) : (
                                <Typography.Text type="secondary">Cargando vista previa...</Typography.Text>
                            )}
                        </Card>
                    </div>
                </div>
            </div>

            {/* Table section edit modal */}
            <CelumaModal
                title={`Editar tabla — ${tableModal?.label ?? ""}`}
                open={tableModal !== null}
                onCancel={() => setTableModal(null)}
                width={720}
                destroyOnClose
                footer={[
                    <CelumaButton key="cancel" size="small" danger onClick={() => setTableModal(null)}>Cancelar</CelumaButton>,
                    <CelumaButton key="save" size="small" type="primary" onClick={() => {
                        if (tableModal) setSectionContent((prev) => ({ ...prev, [tableModal.key]: tableDraft }));
                        setTableModal(null);
                    }}>Guardar</CelumaButton>,
                ]}
            >
                <TableEditor value={tableDraft} onChange={setTableDraft} />
            </CelumaModal>

            {/* Approve modal */}
            <CelumaModal
                title="Aprobar Reporte"
                open={isApproveModalVisible}
                onCancel={() => { setIsApproveModalVisible(false); setApproveComment(""); }}
                width={600}
                footer={[
                    <CelumaButton key="cancel" size="small" danger onClick={() => { setIsApproveModalVisible(false); setApproveComment(""); }}>Cancelar</CelumaButton>,
                    <CelumaButton key="approve" size="small" type="primary" icon={<CheckCircleOutlined />} onClick={handleApprove}>Aprobar</CelumaButton>,
                ]}
            >
                <div style={{ color: tokens.textSecondary, marginBottom: 16 }}>
                    Puedes agregar un comentario opcional al aprobar el reporte:
                </div>
                <CommentInput value={approveComment} onChange={setApproveComment}
                    onSubmit={async (text) => setApproveComment(text)}
                    placeholder="Comentario opcional..." rows={4} hideSubmitButton />
            </CelumaModal>

            {/* Request changes modal */}
            <CelumaModal
                title="Solicitar Cambios"
                open={isChangesModalVisible}
                onCancel={() => { setIsChangesModalVisible(false); setChangesComment(""); }}
                width={600}
                footer={[
                    <CelumaButton key="cancel" size="small" danger onClick={() => { setIsChangesModalVisible(false); setChangesComment(""); }}>Cancelar</CelumaButton>,
                    <CelumaButton key="send" size="small" type="primary" disabled={!changesComment.trim()} onClick={handleRequestChanges}>Solicitar Cambios</CelumaButton>,
                ]}
            >
                <div style={{ color: tokens.textSecondary, marginBottom: 16 }}>
                    Describe los cambios necesarios para que el autor pueda ajustar el reporte:
                </div>
                <CommentInput value={changesComment} onChange={setChangesComment}
                    onSubmit={async (text) => setChangesComment(text)}
                    placeholder="Describe los cambios necesarios..." rows={4} hideSubmitButton />
            </CelumaModal>
        </>
    );
};

export default ReportEditor;
