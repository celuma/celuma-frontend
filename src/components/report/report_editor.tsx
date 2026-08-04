import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
    message, Typography, Card, Image, Modal, Avatar, Divider, Form,
} from "antd";
import {
    UserOutlined, FileTextOutlined,
    DeleteOutlined, FilePdfOutlined, SaveOutlined, EditOutlined, SafetyCertificateOutlined,
    ExclamationCircleOutlined, CalendarOutlined, ContainerOutlined,
    AuditOutlined, CheckCircleOutlined, SendOutlined, PrinterOutlined,
} from "@ant-design/icons";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import {
    getReportFull, getStudyType, getReportTemplateById,
    saveReport, saveReportVersion,
    submitReport, approveReport, requestChanges, signAndPublishReport,
    getReportTemplateVersion,
    getOfficialPdfDownloadUrl,
    OfficialPdfDownloadError,
    triggerBrowserDownload,
    officialPdfFilename,
    getStudyTypeReportDefaults,
} from "../../services/report_service";
import {
    listReportLetterheads,
    listReportLetterheadVersions,
    getReportLetterheadVersion,
} from "../../services/report_letterhead_service";
import type { ReportPresentationSnapshotV2 } from "./versioned/versioned_report_types";
import type {
    LetterheadResolutionSource,
    LetterheadResolvedResources,
    V2BlockedReason,
} from "../../models/report_letterhead";
import {
    getSignature,
    NO_SIGNATURE_TITLE,
    NO_SIGNATURE_DESCRIPTION,
    isSignatureMissingError,
} from "../../services/signature_service";
import { showCelumaWarning, showCelumaApiError } from "../../lib/celuma_feedback";
import type { ReportImage } from "./report_images";
import SampleImagesPicker from "./sample_images_picker";
import ReportPreviewPages, { type ReportRendererRef as ReportPreviewPagesRef } from "./report_renderer_resolver";
import { useLocalPrint, localPrintMarkForStatus } from "../../hooks/use_local_print";
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
import FloatingCaptionSelect from "../ui/floating_caption_select";
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

/** Third post-Phase 2 remediation: blocked-state messages, one per reason
 *  returned by `report-defaults`. Each states what is missing and where to
 *  fix it—Legacy is never rendered as a substitute (see
 *  deterministic-letterhead-resolution-contract.md, "Never Legacy"). */
const V2_BLOCKED_COPY: Record<V2BlockedReason, { title: string; admin: string; user: string }> = {
    NO_TEMPLATE: {
        title: "Este tipo de estudio no tiene plantilla de reporte",
        admin: "Asigna una plantilla de reporte al tipo de estudio antes de crear reportes.",
        user: "Contacta a un administrador para asignar una plantilla de reporte a este tipo de estudio.",
    },
    NO_ACTIVE_TEMPLATE_VERSION: {
        title: "La plantilla de este estudio no está publicada",
        admin: "Abre la plantilla en Plantillas de Reporte y guarda su configuración para activarla.",
        user: "Contacta a un administrador para publicar la plantilla de este estudio.",
    },
    NO_LETTERHEAD: {
        title: "Falta el membrete predeterminado del laboratorio",
        admin: "Ve a Configuración → Membretes, guarda el diseño de un membrete y márcalo como predeterminado.",
        user: "Contacta a un administrador para configurar el membrete del laboratorio.",
    },
    LETTERHEAD_MISCONFIGURED: {
        title: "La configuración de membretes es inconsistente",
        admin: "Revisa Configuración → Membretes: hay que dejar exactamente un predeterminado con una configuración activa.",
        user: "Contacta a un administrador para revisar la configuración de membretes.",
    },
};

/** Post-Phase-2 remediation: one selectable "Membrete" option — the ACTIVE
 * version of a shared, tenant-owned letterhead. `letterheadId` is carried
 * alongside `value` (the version id) because fetching a version's full
 * configuration requires both (GET .../report-letterheads/{letterheadId}/versions/{versionId}). */
interface LetterheadVersionOption {
    value: string;
    label: string;
    letterheadId: string;
}

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

    // Céluma 1.3 Phase 2, Block D, Story D10 / post-Phase 2 remediation:
    // resolved (never user-selected) clinical template + its single ACTIVE
    // version, for new V2 reports only. Only ever populated when creating a
    // new report (prefilledOrderId branch) — never touched when editing an
    // existing report, whose template_version_id (if any) is frozen on
    // `envelope`. The clinical template is determined exclusively by
    // StudyType.default_report_template_id — there is no user-facing
    // control to change it here (see report-editor-letterhead-selection-contract.md).
    const [resolvedTemplateId, setResolvedTemplateId] = useState<string | null>(null);
    const [resolvedTemplateVersionId, setResolvedTemplateVersionId] = useState<string | null>(null);
    // Post-Phase-2 remediation: the "Membrete" selector — this is the only
    // thing the user may change before first save. Switching it never
    // touches `template`/`baseValues`/`sectionContent` (see
    // handleChangeLetterheadVersion below).
    const [selectedLetterheadVersionId, setSelectedLetterheadVersionId] = useState<string | null>(null);
    const [selectedLetterheadPresentation, setSelectedLetterheadPresentation] =
        useState<ReportPresentationSnapshotV2 | null>(null);
    const [availableLetterheadVersions, setAvailableLetterheadVersions] = useState<LetterheadVersionOption[]>([]);
    // True when reports_v2_enabled is on for this tenant but the resolved
    // template has no ACTIVE version to select — creation must block rather
    // than silently falling back to Legacy (Céluma1.3-Phase2.md §D10).
    const [v2ConfigBlocked, setV2ConfigBlocked] = useState(false);
    // Third post-Phase 2 remediation: the EXACT blocking reason as returned
    // by `report-defaults`, so the UI can say what is missing and where to
    // fix it instead of showing a generic message.
    const [v2BlockedReason, setV2BlockedReason] = useState<V2BlockedReason | null>(null);
    const [v2BlockedDetail, setV2BlockedDetail] = useState<string | null>(null);
    // Where the resolved letterhead originated—shown in administrative mode
    // (§6.3 of the brief), translated and without technical IDs.
    const [selectedLetterheadName, setSelectedLetterheadName] = useState<string | null>(null);
    const [letterheadResolutionSource, setLetterheadResolutionSource] =
        useState<LetterheadResolutionSource | null>(null);
    // Ephemeral URLs for resolved letterhead logos. A NEW report has no
    // `envelope` to inherit them from, so without this the preview lacked
    // `resolved_resources` and the renderer fell back to Céluma's neutral
    // logo even when the letterhead configured logos—found during this
    // remediation's manual browser verification, not in tests.
    const [selectedLetterheadResources, setSelectedLetterheadResources] =
        useState<LetterheadResolvedResources | null>(null);
    // Fifth post-Phase 2 remediation (Observation A): true as soon as the
    // user chooses a letterhead DIFFERENT from the one saved on the report.
    // It simultaneously makes the preview use the new presentation, marks
    // the form modified (§4.4), and warns before leaving with unsaved changes.
    // It is cleared on save.
    const [letterheadDirty, setLetterheadDirty] = useState(false);
    const [letterheadChanging, setLetterheadChanging] = useState(false);

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

    // Second post-Phase 2 remediation (UX): "Sign and publish" is the only
    // APPROVED-state action—it orchestrates generation, signing, and
    // publication in one call (POST .../sign-and-publish), replacing the
    // former separate hooks/buttons (usePdfGeneration + handleSign).
    const [isSigningAndPublishing, setIsSigningAndPublishing] = useState(false);
    // Fifth post-Phase 2 remediation (§9.1): official PDF version number as
    // returned by `sign-and-publish`. Avoids making the UI derive it from a
    // refreshed `/full`, as it did previously, which risked requesting the
    // wrong version.
    const [officialPdfVersionNo, setOfficialPdfVersionNo] = useState<number | null>(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    // Fourth post-Phase 2 remediation (Observation 1): local printing returns
    // as a SECONDARY action explicitly distinct from the official PDF. It
    // reuses the renderer mounted in the preview (`previewPagesRef.getPages()`);
    // there is no second renderer and no official-PDF endpoint is touched. See
    // local-print-contract.md.
    const { printLocalCopy } = useLocalPrint();

    // Read-only when not DRAFT
    const isReadOnly = useMemo(
        () => Boolean(envelope?.status && envelope.status !== "DRAFT"),
        [envelope?.status]
    );

    // Fifth post-Phase 2 remediation (Observation A / §4.1). The letterhead
    // immutability boundary. It was previously `!reportId`—"the report has no
    // ID yet"—which froze the letterhead on first save, long before business
    // rules made the document immutable. It now matches the rest of the
    // editor: it can change while the report remains DRAFT (or does not yet
    // exist) and is fixed upon submission for review. The backend applies the
    // same rule and returns 409 for payload attempts. See
    // letterhead-freeze-at-review-contract.md.
    const canChangeLetterhead = useMemo(
        () => !envelope?.status || envelope.status === "DRAFT",
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
                                const templateId = st.default_report_template_id;
                                setResolvedTemplateId(templateId);
                                const tpl = await getReportTemplateById(templateId);
                                tmplRaw = tpl.template_json;

                                // Céluma 1.3 Phase 2, Block D, Story D10: with
                                // reports_v2_enabled on, prefer the template's
                                // ACTIVE version — its frozen `configuration.template`
                                // is what VersionedReportRendererV2 actually renders
                                // (see versioned_report_renderer_v2.tsx), so the editor
                                // should reflect that structure, not the live/mutable
                                // ReportTemplate.template_json. No ACTIVE version means
                                // V2 creation is blocked below, never silently Legacy.
                                //
                                // Post-Phase 2 remediation: also resolves the letterhead
                                // (letterhead) to use for the live preview — this is
                                // the actual fix for "preview shows Legacy initially"
                                // (bug 2): previously nothing here ever set
                                // `selectedLetterheadPresentation`, so buildEnvelope()
                                // had no rendering_snapshot to seed before first save.
                                //
                                // Third post-Phase 2 remediation—issue F: two paths
                                // rendered Legacy silently. (1) A `catch {}` swallowed
                                // any network failure and "continued as Legacy". (2) The
                                // list-letterheads -> list-versions -> read-version chain
                                // reconstructed `presentation`: if the resolved letterhead
                                // did not appear in `options` (for example, deactivated or
                                // due to a failed N+1 request), selectedLetterheadPresentation
                                // remained null, buildEnvelope() produced no
                                // `rendering_snapshot`, and the resolver chose Legacy.
                                //
                                // `report-defaults` now returns the resolved
                                // `presentation` in one call, and every failure leads to
                                // an explicit BLOCKED state. With reports_v2_enabled=true,
                                // Legacy is never rendered.
                                let tenantV2Enabled = false;
                                try {
                                    const tenantInfo = await getJSON<{ reports_v2_enabled?: boolean }>(
                                        `/v1/tenants/${session.tenantId}`
                                    );
                                    tenantV2Enabled = !!tenantInfo.reports_v2_enabled;
                                } catch {
                                    // The tenant flag could not be read: this is a network
                                    // failure, not evidence that the tenant is Legacy.
                                    // Keep `tenantV2Enabled=false` and follow the Legacy
                                    // path—the same behavior as a tenant without V2,
                                    // without inventing a partial V2 state.
                                }

                                if (tenantV2Enabled) {
                                    try {
                                        const defaults = await getStudyTypeReportDefaults(
                                            orderFull.order.study_type_id
                                        );
                                        if (
                                            defaults.v2_blocked_reason ||
                                            !defaults.active_template_version_id ||
                                            !defaults.letterhead_presentation
                                        ) {
                                            setV2BlockedReason(defaults.v2_blocked_reason ?? "NO_LETTERHEAD");
                                            setV2BlockedDetail(defaults.v2_blocked_detail ?? null);
                                            setV2ConfigBlocked(true);
                                        } else {
                                            const detail = await getReportTemplateVersion(
                                                templateId,
                                                defaults.active_template_version_id
                                            );
                                            const cfg = detail.configuration as { template?: TemplateOrderInput };
                                            if (cfg.template) tmplRaw = cfg.template;
                                            setResolvedTemplateVersionId(defaults.active_template_version_id);

                                            // The resolved presentation arrives in the same
                                            // response—without chaining calls that can
                                            // partially fail.
                                            setSelectedLetterheadVersionId(defaults.letterhead_version_id);
                                            setSelectedLetterheadPresentation(defaults.letterhead_presentation);
                                            setSelectedLetterheadName(defaults.letterhead_name ?? null);
                                            setLetterheadResolutionSource(
                                                defaults.letterhead_resolution_source ?? null
                                            );
                                            setSelectedLetterheadResources(
                                                defaults.letterhead_resolved_resources ?? null
                                            );

                                            // The letterhead selector is secondary: if it
                                            // fails to load, the user simply cannot change
                                            // letterheads—V2 creation with the resolved one
                                            // still works.
                                            try {
                                                const { letterheads } = await listReportLetterheads();
                                                const options: LetterheadVersionOption[] = [];
                                                for (const lh of letterheads) {
                                                    const { versions: lhVersions } =
                                                        await listReportLetterheadVersions(lh.id);
                                                    const activeLh = lhVersions.find((v) => v.status === "ACTIVE");
                                                    if (activeLh) {
                                                        options.push({
                                                            value: activeLh.id,
                                                            label: lh.name,
                                                            letterheadId: lh.id,
                                                        });
                                                    }
                                                }
                                                setAvailableLetterheadVersions(options);
                                            } catch { /* selector opcional */ }
                                        }
                                    } catch {
                                        // With V2 enabled, a configuration-resolution
                                        // failure is a blocked state, never an excuse to
                                        // render Legacy.
                                        setV2BlockedReason("NO_LETTERHEAD");
                                        setV2BlockedDetail(
                                            "No se pudo consultar la configuración de reportes V2. " +
                                            "Revisa tu conexión e inténtalo de nuevo."
                                        );
                                        setV2ConfigBlocked(true);
                                    }
                                }
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
    }, [reportId, prefilledOrderId, session.tenantId]);

    // Fifth post-Phase 2 remediation (Observation A). The bootstrap above
    // loads letterheads only in the NEW-report (`prefilledOrderId`) branch.
    // A reopened saved report never loaded them, so even if the selector
    // appeared it had nothing to offer or show as the current letterhead name.
    // This effect covers that branch.
    //
    // It also runs in non-editable statuses: §4.5 requires displaying the
    // fixed letterhead as a read-only value, which requires its logical name
    // (never its version number, §4.3).
    useEffect(() => {
        if (!reportId || loadingData) return;
        if (envelope?.schema_version !== 2) return;  // Legacy has no letterhead.
        let cancelled = false;
        (async () => {
            try {
                const { letterheads } = await listReportLetterheads();
                const options: LetterheadVersionOption[] = [];
                for (const lh of letterheads) {
                    const { versions: lhVersions } = await listReportLetterheadVersions(lh.id);
                    const activeLh = lhVersions.find((v) => v.status === "ACTIVE");
                    if (activeLh) {
                        options.push({ value: activeLh.id, label: lh.name, letterheadId: lh.id });
                    }
                }
                if (cancelled) return;
                setAvailableLetterheadVersions(options);
                const currentId = envelope?.letterhead_version_id ?? null;
                if (currentId) {
                    setSelectedLetterheadVersionId(currentId);
                    const current = options.find((o) => o.value === currentId);
                    // If the current letterhead is no longer active (it was
                    // deactivated or its version was archived), preserve the
                    // report unchanged and merely lose its display name:
                    // historical snapshots are never rewritten.
                    if (current) setSelectedLetterheadName(current.label);
                }
            } catch {
                // The selector is secondary: if it fails to load, the report
                // remains fully editable with its current letterhead.
            }
        })();
        return () => { cancelled = true; };
    }, [reportId, loadingData, envelope?.schema_version, envelope?.letterhead_version_id]);

    // Fifth remediation (§4.4): warn before leaving with an unsaved letterhead
    // change. The editor had no dirty-state tracking; this covers exactly the
    // case introduced by this remediation without attempting to track the
    // entire form.
    useEffect(() => {
        if (!letterheadDirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [letterheadDirty]);

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

        // Céluma 1.3 Phase 2, Block C, Story C9: this function rebuilds
        // `report` from scratch from the template definition, which has no
        // notion of `schema_version`/`rendering_snapshot` — those live only
        // on the previously loaded V2 envelope. Without this, saving edited
        // clinical content on a V2 report would submit a body missing both
        // keys. The backend (create_report_new_version) now independently
        // re-attaches the frozen snapshot regardless of what is sent here —
        // see versioned-renderer-v2-contract.md — but preserving it here too
        // keeps the live preview correct while editing, before any save
        // round-trip, and keeps this payload honest about what the report
        // actually is.
        //
        // Post-Phase-2 remediation, bug 2 fix: for a brand-new report,
        // `envelope` is null, so the block above never had anything to
        // copy — schema_version/rendering_snapshot stayed undefined and
        // the preview always resolved to Legacy, even after a V2 template
        // + letterhead had already been resolved by the bootstrap effect.
        // This is the missing fallback: seed both directly from the
        // resolved/selected bootstrap state whenever there is no envelope
        // yet to inherit from.
        const existingSchemaVersion = envelope?.report?.schema_version;
        const existingRenderingSnapshot = envelope?.report?.rendering_snapshot;
        if (existingSchemaVersion !== undefined) {
            report.schema_version = existingSchemaVersion;
        } else if (resolvedTemplateVersionId && selectedLetterheadPresentation) {
            report.schema_version = 2;
        }
        if (existingRenderingSnapshot !== undefined) {
            // Fifth post-Phase 2 remediation: if the user just changed the
            // letterhead of an already saved DRAFT, the preview must reflect
            // it NOW, without waiting for saving. Replace only `presentation`
            // on the frozen snapshot—`template` and clinical content remain
            // byte-for-byte unchanged, precisely the §3.3 invariant. This is
            // preview-only: the backend authoritatively resolves presentation
            // from `letterhead_version_id` and never trusts the client snapshot.
            report.rendering_snapshot =
                letterheadDirty && selectedLetterheadPresentation
                    ? {
                        ...(existingRenderingSnapshot as Record<string, unknown>),
                        presentation: selectedLetterheadPresentation,
                    }
                    : existingRenderingSnapshot;
        } else if (resolvedTemplateVersionId && selectedLetterheadPresentation) {
            report.rendering_snapshot = {
                schema_version: 2,
                template: tmplWithSavedOrder as unknown as Record<string, unknown>,
                presentation: selectedLetterheadPresentation,
            };
        }

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
            // V2 metadata is server-authoritative (see B6/C9) — carried
            // through only for the live preview's benefit, never trusted by
            // the backend as an instruction to change these. For a brand-new
            // report, `envelope` is still null, so `resolvedTemplateVersionId`/
            // `selectedLetterheadVersionId` (Block D Story D10 / post-Phase-2
            // remediation) are what actually reach the backend; once a report
            // exists, its own template_version_id/letterhead_version_id always
            // win and are never reconsidered (D10: "do not re-query the active version").
            schema_version: envelope?.schema_version ?? (resolvedTemplateVersionId ? 2 : undefined),
            template_version_id: envelope?.template_version_id ?? resolvedTemplateVersionId ?? undefined,
            // Fifth post-Phase 2 remediation (Observation A): the user's
            // selection wins over the saved value. The order was reversed, so
            // a persisted report's envelope always reinstated its own
            // letterhead and the backend never saw the new choice. For a
            // non-DRAFT report, selectedLetterheadVersionId is initialized
            // from the envelope and the selector is disabled, so this cannot
            // bypass the freeze—the backend also rejects it with 409.
            letterhead_version_id: selectedLetterheadVersionId ?? envelope?.letterhead_version_id ?? undefined,
            generated_by_renderer_version: envelope?.generated_by_renderer_version,
            // A saved report has its own backend-resolved URLs. A new report
            // does not yet exist, so use those of the resolved/selected
            // letterhead—otherwise the preview renders the neutral logo even
            // when the letterhead configures logos.
            //
            // Fifth remediation: after an unsaved letterhead change, envelope
            // URLs belong to the PREVIOUS letterhead; the preview must use the
            // new ones (including no-logo cases, which is why `letterheadDirty`
            // decides instead of a chained `??`).
            resolved_resources: letterheadDirty
                ? (selectedLetterheadResources ?? undefined)
                : (envelope?.resolved_resources ?? selectedLetterheadResources ?? undefined),
        };
    }, [
        template, fullData, customBaseFields, baseValues, sectionContent, envelope, session,
        reportTitle, studyTypeName, showSignatureSection, requireDigitalSignature,
        resolvedTemplateVersionId, selectedLetterheadVersionId, selectedLetterheadPresentation,
        selectedLetterheadResources, letterheadDirty,
    ]);

    // Live preview envelope
    const previewEnvelope = useMemo(() => {
        if (!template) return null;
        try { return buildEnvelope(); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        template, baseValues, sectionContent, reportTitle, studyTypeName, fullData, envelope,
        showSignatureSection, requireDigitalSignature,
        // Post-Phase-2 remediation: without these, switching the "Membrete"
        // selector updated selectedLetterheadPresentation but this memo
        // never recomputed, so the preview kept showing the old branding
        // (a real bug caught during live verification, not just a fix on
        // paper — see remediation-local-validation-report.md).
        resolvedTemplateVersionId, selectedLetterheadVersionId, selectedLetterheadPresentation,
        selectedLetterheadResources, letterheadDirty,
    ]);

    // Post-Phase 2 remediation (bug 3 fix): the "Letterhead" selector. Unlike
    // the old "Template version" selector it replaces, this NEVER touches
    // `template`/`baseValues`/`sectionContent`: a letterhead change is a pure
    // presentation swap. Only `selectedLetterheadPresentation` changes,
    // which flows into `buildEnvelope()`'s `rendering_snapshot.presentation`
    // and re-renders the preview immediately — clinical content already
    // typed by the user is never rebuilt or reset.
    //
    // Fifth post-Phase 2 remediation: this is no longer limited to a new
    // report. It still saves nothing on its own (§4.4: "do not save
    // automatically"): it marks the form modified and the change is sent with
    // visible content on the next "Save".
    const handleChangeLetterheadVersion = async (option: LetterheadVersionOption) => {
        setLetterheadChanging(true);
        try {
            const versionDetail = await getReportLetterheadVersion(option.letterheadId, option.value);
            setSelectedLetterheadVersionId(option.value);
            setSelectedLetterheadPresentation(versionDetail.configuration);
            setSelectedLetterheadName(option.label);
            setLetterheadResolutionSource("EXPLICIT");
            setSelectedLetterheadResources(versionDetail.resolved_resources ?? null);
            setLetterheadDirty(option.value !== (envelope?.letterhead_version_id ?? null));
        } catch {
            message.error("Error al cargar el membrete seleccionado");
        } finally {
            setLetterheadChanging(false);
        }
    };

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
            // Fifth remediation: the letterhead change is persisted, so it is
            // no longer pending (and the "leave without saving" warning ends).
            setLetterheadDirty(false);
            message.success("Reporte guardado");
            if (saved.order_id) navigate(`/orders/${saved.order_id}`);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "No se pudo guardar el reporte");
        }
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

    /**
     * Fifth post-Phase 2 remediation (Observation B, §9.2/§9.3).
     *
     * Two changes from the previous version:
     *
     *  1. The requested version is the one announced by `sign-and-publish`
     *     (`officialPdfVersionNo`), not `envelope.version_no` derived from a
     *     refreshed `/full`. See sign-and-publish-response-contract.md.
     *
     *  2. Download uses a synthetic `<a download>` instead of
     *     `window.open(url, "_blank")`. `window.open` ran AFTER awaiting the
     *     presigned URL promise, so Safari no longer associated it with the
     *     user gesture and treated it as a popup: empty tab or silent block.
     *     See safari-pdf-download-contract.md.
     *
     * Errors are distinguished instead of displayed raw: this remediation's
     * actual failure was a 403 that the UI presented using the backend's
     * `detail` without identifying the problem type.
     */
    const handleDownloadOfficialPdf = async () => {
        const versionNo = officialPdfVersionNo ?? envelope?.version_no ?? null;
        if (!envelope?.id || versionNo == null) return;
        setIsDownloadingPdf(true);
        try {
            const { pdf_url, version_no } = await getOfficialPdfDownloadUrl(envelope.id, versionNo);
            triggerBrowserDownload(
                pdf_url,
                officialPdfFilename(fullData?.order?.order_code, version_no ?? versionNo)
            );
        } catch (err) {
            if (err instanceof OfficialPdfDownloadError) {
                if (err.status === 403) {
                    message.error("No tienes permiso para descargar este reporte.");
                } else if (err.status === 404) {
                    message.error("El reporte o su PDF oficial no está disponible.");
                } else if (err.status === 409) {
                    message.error("El PDF oficial aún no está listo. Inténtalo de nuevo en unos segundos.");
                } else {
                    message.error(err.message || "No se pudo obtener el enlace de descarga del PDF oficial.");
                }
                return;
            }
            message.error(
                err instanceof Error ? err.message : "Error al descargar el PDF oficial"
            );
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    /**
     * Fourth remediation (Observation 1)—LOCAL printing. It never touches the
     * official PDF: does not call `getOfficialPdfDownloadUrl`, invoke
     * `sign-and-publish`, persist anything, or alter report status. The
     * visible mark (DRAFT / RETRACTED) ALWAYS derives from the envelope's real
     * status—this screen cannot print an unpublished report without a mark.
     */
    const handlePrintLocalCopy = async () => {
        await printLocalCopy(previewPagesRef, {
            filename: reportTitle || "reporte",
            mark: localPrintMarkForStatus(envelope?.status),
        });
    };

    const handleSignAndPublish = async () => {
        if (!envelope?.id || isSigningAndPublishing) return;
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
        setIsSigningAndPublishing(true);
        try {
            const result = await signAndPublishReport(envelope.id);
            // Fifth remediation (§9.1): status and official version come from
            // the publication response ITSELF, so "Download official PDF"
            // appears immediately and targets the correct version without
            // depending on the refresh below or a manual reload.
            if (result.version_no != null) setOfficialPdfVersionNo(result.version_no);
            setEnvelope((e) =>
                e
                    ? {
                        ...e,
                        status: (result.status as ReportStatus) ?? e.status,
                        version_no: result.version_no ?? e.version_no,
                    }
                    : e
            );
            message.success(result.message || "Reporte firmado y publicado. PDF oficial disponible.");
            try {
                const full = await getReportFull(envelope.id);
                // §8: the refresh enriches (signature, resolved resources,
                // PDF metadata) but NEVER degrades what publication itself
                // just confirmed. A lagging read replica still returning
                // APPROVED would otherwise hide the download button for an
                // already published report.
                setEnvelope({
                    ...full.report,
                    status: (result.status as ReportStatus) ?? full.report?.status,
                    version_no: result.version_no ?? full.report?.version_no,
                });
                if (result.version_no == null && full.report?.version_no != null) {
                    setOfficialPdfVersionNo(full.report.version_no);
                }
            } catch {
                // The report is ALREADY signed and published: a refresh failure
                // must not appear as a publication failure or hide the download.
            }
        } catch (err) {
            if (isSignatureMissingError(err)) {
                promptUploadSignature();
                return;
            }
            showCelumaApiError(err, "Error al firmar y publicar el reporte.");
        } finally {
            setIsSigningAndPublishing(false);
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

    if (v2ConfigBlocked) {
        // Third post-Phase 2 remediation—issue F: explicit, actionable
        // BLOCKED status. Never render Legacy as a substitute: a report with
        // the wrong letterhead is worse than one that cannot yet be created.
        const canManageTemplates = userHasPermission(PERMS.MANAGE_TEMPLATES);
        const copy = V2_BLOCKED_COPY[v2BlockedReason ?? "NO_LETTERHEAD"];
        const isLetterheadProblem =
            v2BlockedReason === "NO_LETTERHEAD" || v2BlockedReason === "LETTERHEAD_MISCONFIGURED";
        return (
            <EmptyState
                icon={<ExclamationCircleOutlined />}
                color="#e5484d"
                title={copy.title}
                description={
                    v2BlockedDetail
                        ? `${canManageTemplates ? copy.admin : copy.user} ${v2BlockedDetail}`
                        : canManageTemplates
                            ? copy.admin
                            : copy.user
                }
                action={
                    <div style={{ display: "flex", gap: 12 }}>
                        {canManageTemplates && isLetterheadProblem && (
                            <CelumaButton
                                type="primary"
                                onClick={() => navigate("/config/report-letterheads")}
                            >
                                Ir a Membretes
                            </CelumaButton>
                        )}
                        {canManageTemplates && !isLetterheadProblem && resolvedTemplateId && (
                            <CelumaButton
                                type="primary"
                                onClick={() => navigate(`/config/report-templates/${resolvedTemplateId}/versions`)}
                            >
                                Ir a administración de plantillas
                            </CelumaButton>
                        )}
                        <CelumaButton onClick={() => navigate(-1)}>Volver</CelumaButton>
                    </div>
                }
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
                        {/*
                          * Second post-Phase 2 remediation (UX): in APPROVED,
                          * "Sign and publish" is the ONLY action—it generates
                          * the official PDF (already reflecting the signature)
                          * and publishes in one call. "Generate PDF" is not
                          * shown separately. In PUBLISHED, download always
                          * displays with only reports:read (bug 4 from the
                          * first remediation; unchanged here—see
                          * pdf-download-authorization-contract.md).
                          */}
                        {envelope?.status === "APPROVED" && userHasPermission(PERMS.REPORTS_SIGN) && (
                            <CelumaButton
                                type="primary"
                                size="small"
                                icon={<SafetyCertificateOutlined />}
                                loading={isSigningAndPublishing}
                                disabled={isSigningAndPublishing}
                                onClick={handleSignAndPublish}
                            >
                                {isSigningAndPublishing ? "Firmando y generando PDF oficial…" : "Firmar y publicar"}
                            </CelumaButton>
                        )}
                        {envelope?.status === "PUBLISHED" && userHasPermission(PERMS.REPORTS_READ) && (
                            <CelumaButton
                                type="primary"
                                size="small"
                                icon={<FilePdfOutlined />}
                                loading={isDownloadingPdf}
                                disabled={isDownloadingPdf}
                                onClick={handleDownloadOfficialPdf}
                                data-testid="download-official-pdf"
                            >
                                Descargar PDF oficial
                            </CelumaButton>
                        )}
                        {/*
                          * Fourth post-Phase 2 remediation (Observation 1)—
                          * local printing returns as a SECONDARY action with a
                          * label that can never be confused with the official
                          * document:
                          *
                          *   unpublished -> "Print draft"
                          *   PUBLISHED   -> "Print local copy" (alongside
                          *                  "Download official PDF", the
                          *                  primary action)
                          *   RETRACTED   -> "Print local copy", marked
                          *                  RETRACTED in output
                          *
                          * Permission: reports:read only. Anyone legitimately
                          * able to view the report can print their own copy;
                          * requiring reports:sign or reports:generate_pdf here
                          * would require permissions from a separate flow. See
                          * local-print-contract.md.
                          */}
                        {/*
                          * The report need not be saved: a report without an
                          * `id` already has a rendered preview, and "print a
                          * draft before publishing" includes that moment.
                          * Without `status`, `localPrintMarkForStatus`
                          * returns DRAFT, so output remains marked.
                          */}
                        {userHasPermission(PERMS.REPORTS_READ) && (
                            <CelumaButton
                                size="small"
                                icon={<PrinterOutlined />}
                                onClick={handlePrintLocalCopy}
                                data-testid="print-local-copy"
                                title={
                                    envelope?.status === "PUBLISHED"
                                        ? "Copia local impresa por el navegador — no sustituye al PDF oficial firmado"
                                        : "Copia local de trabajo — se marca como BORRADOR y no genera ningún documento oficial"
                                }
                            >
                                {envelope?.status === "PUBLISHED" || envelope?.status === "RETRACTED"
                                    ? "Imprimir copia local"
                                    : "Imprimir borrador"}
                            </CelumaButton>
                        )}
                    </div>
                    {userHasPermission(PERMS.REPORTS_READ) && envelope?.status !== "PUBLISHED" && (
                        <div style={{ marginTop: 8 }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {envelope?.status === "RETRACTED"
                                    ? "La copia local se imprime marcada como RETRACTADO."
                                    : "La copia local se imprime marcada como BORRADOR — DOCUMENTO NO OFICIAL y no genera ni reemplaza el PDF oficial."}
                            </Typography.Text>
                        </div>
                    )}
                    {envelope?.status === "APPROVED" && envelope?.pdf_error_message && (
                        <div style={{ marginTop: 8 }}>
                            <Typography.Text type="danger" style={{ fontSize: 12 }}>
                                No se pudo firmar y publicar: {envelope.pdf_error_message}
                            </Typography.Text>
                        </div>
                    )}
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
                    CARDS 4 + 5 — Content + preview (two columns)
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

                            {/*
                              * Fifth post-Phase 2 remediation (Observation A, §4).
                              *
                              * The condition was `!reportId`, meaning "only before the
                              * first save"—the direct root cause of "I save the draft
                              * and can no longer change the letterhead". The panel now
                              * appears whenever a letterhead can be named; EDITING is
                              * what closes upon submission for review (§4.5: in IN_REVIEW
                              * and later, the fixed letterhead remains visible as a
                              * read-only value).
                              */}
                            {selectedLetterheadName && (
                                <Panel
                                    style={{ marginBottom: 16, display: "grid", gap: 8 }}
                                    data-testid="letterhead-panel"
                                >
                                    {/* §4.2: even if only one letterhead exists, display
                                        the field (disabled); never hide it. §4.3: list
                                        logical names; the version number does not appear
                                        in the normal flow. */}
                                    <FloatingCaptionSelect
                                        label="Membrete"
                                        value={selectedLetterheadVersionId ?? undefined}
                                        disabled={
                                            !canChangeLetterhead ||
                                            letterheadChanging ||
                                            availableLetterheadVersions.length <= 1
                                        }
                                        loading={letterheadChanging}
                                        onChange={(v) => {
                                            const option = availableLetterheadVersions.find((o) => o.value === v);
                                            if (option) handleChangeLetterheadVersion(option);
                                        }}
                                        options={
                                            availableLetterheadVersions.length > 0
                                                ? availableLetterheadVersions
                                                : [{
                                                    value: selectedLetterheadVersionId ?? "current",
                                                    label: selectedLetterheadName,
                                                }]
                                        }
                                        allowClear={false}
                                        data-testid="letterhead-select"
                                    />
                                    {!canChangeLetterhead && (
                                        <div
                                            style={{ fontSize: 12, color: "#6b7280" }}
                                            data-testid="letterhead-frozen-note"
                                        >
                                            El membrete quedó fijado al enviar el reporte a revisión.
                                        </div>
                                    )}
                                    {canChangeLetterhead && letterheadDirty && (
                                        <div
                                            style={{ fontSize: 12, color: "#b45309" }}
                                            data-testid="letterhead-dirty-note"
                                        >
                                            Membrete cambiado — guarda el reporte para aplicarlo.
                                        </div>
                                    )}
                                    {/* Third remediation (§6.3 of the brief): why THIS
                                        letterhead was selected, in business language—
                                        never IDs or version numbers. */}
                                    {canChangeLetterhead && letterheadResolutionSource && (
                                        <div style={{ fontSize: 12, color: "#6b7280" }} data-testid="letterhead-resolution-source">
                                            {letterheadResolutionSource === "TENANT_DEFAULT" &&
                                                "Predeterminado del laboratorio"}
                                            {letterheadResolutionSource === "TEMPLATE_PREFERRED" &&
                                                "Configurado en esta plantilla"}
                                            {letterheadResolutionSource === "EXPLICIT" &&
                                                "Seleccionado para este reporte"}
                                        </div>
                                    )}
                                </Panel>
                            )}

                            <Form layout="vertical" style={{ display: "grid", gap: 20 }}>
                                {/* Report details — report name + custom base fields, grouped */}
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
