import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Spin, message, Upload, InputNumber, ColorPicker, Divider, Typography, Select as AntSelect } from "antd";
import { UploadOutlined, DeleteOutlined, FileTextOutlined, PictureOutlined, SafetyCertificateOutlined, BgColorsOutlined } from "@ant-design/icons";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { RcFile } from "antd/es/upload/interface";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import CelumaModal from "../components/ui/celuma_modal";
import CelumaSwitch from "../components/ui/celuma_switch";
import Panel from "../components/ui/panel";
import SectionTitle from "../components/ui/section_title";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import CelumaTextArea from "../components/ui/textarea_field";
import ReportRendererResolver from "../components/report/report_renderer_resolver";
import { buildPreviewReportEnvelope } from "../components/report/versioned/editor_preview_fixture";
import { validatePresentationDraft } from "../components/report/versioned/report_presentation_editor_schema";
import type {
    ReportPresentationSnapshotV2,
    ReportMarginsCm,
    DividerConfig,
    ReportLogoMode,
} from "../components/report/versioned/versioned_report_types";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import { useTemplateEditorDraft } from "../hooks/use_template_editor_draft";
import { extractUploadedFile } from "../lib/upload_helpers";
import type { LetterheadResolvedResources } from "../models/report_letterhead";
import {
    getReportLetterhead,
    getReportLetterheadVersion,
    getActiveReportLetterheadVersion,
    createReportLetterheadVersion,
    saveCurrentReportLetterheadVersion,
    uploadReportLetterheadLogo,
} from "../services/report_letterhead_service";

const { Text } = Typography;

const DEFAULT_DIVIDER: DividerConfig = {
    enabled: true,
    style: "SINGLE",
    primary_width_px: 1,
    secondary_width_px: 1,
    gap_mm: 1,
    color: null,
};

const BLANK_PRESENTATION: ReportPresentationSnapshotV2 = {
    paper: {
        size: "LETTER",
        orientation: "PORTRAIT",
        margins_cm: { top: 1.0, right: 1.0, bottom: 1.0, left: 1.0 },
    },
    header: {
        enabled: true,
        logo_storage_id: null,
        institution_name: null,
        subtitle: null,
        address: null,
        phone: null,
        email: null,
        logo_position: "LEFT",
        content_alignment: "CENTER",
        height_mm: null,
        divider: DEFAULT_DIVIDER,
        // Fourth remediation: a NEW letterhead starts without a logo or a
        // substitute. The Céluma isotipo no longer slips into a clinical
        // document just because nobody has uploaded a logo yet—see
        // v2-legacy-parity-capabilities.md, "logo_mode".
        logo_mode: "NONE",
    },
    footer: {
        enabled: true,
        custom_text: null,
        show_page_number: true,
        logo_storage_id: null,
        logo_position: "LEFT",
        content_alignment: "CENTER",
        height_mm: null,
        divider: DEFAULT_DIVIDER,
        logo_mode: "NONE",
    },
    style: { primary_color: "#4A4A4A", secondary_color: null, typography: undefined },
    signer: null,
};

/**
 * Fourth remediation—when OPENING an existing letterhead without
 * `logo_mode` (all saves from before this remediation), derive the mode that
 * reproduces what its author sees today, not the one we would prefer it had:
 *
 *   - with `logo_storage_id` -> CUSTOM
 *   - header without logo    -> CELUMA_DEFAULT (the renderer fell back to the
 *                              neutral isotipo, and saving must not change it
 *                              abruptly unless requested)
 *   - footer without logo    -> NONE (the footer never had that substitute)
 *
 * From there, the mode is explicit in the new version, and the administrator
 * can change it in the editor itself.
 */
function deriveLogoMode(
    explicit: ReportLogoMode | null | undefined,
    logoStorageId: string | null | undefined,
    neutralFallbackWhenAbsent: boolean,
): ReportLogoMode {
    if (explicit) return explicit;
    if (logoStorageId) return "CUSTOM";
    return neutralFallbackWhenAbsent ? "CELUMA_DEFAULT" : "NONE";
}

const HEADER_LOGO_MODE_OPTIONS = [
    { value: "NONE", label: "Sin logotipo" },
    { value: "CUSTOM", label: "Logotipo propio" },
    { value: "CELUMA_DEFAULT", label: "Isotipo de Céluma" },
];

const LOGO_POSITION_OPTIONS = [
    { value: "LEFT", label: "Izquierda" },
    { value: "CENTER", label: "Centro" },
    { value: "RIGHT", label: "Derecha" },
];

const FONT_FAMILY_OPTIONS = [
    { value: "ARIAL", label: "Arial" },
    { value: "HELVETICA", label: "Helvetica" },
    { value: "TIMES", label: "Times" },
    { value: "CALIBRI", label: "Calibri" },
];

const MARGIN_LABELS: Record<keyof ReportMarginsCm, string> = {
    top: "Superior",
    right: "Derecho",
    bottom: "Inferior",
    left: "Izquierdo",
};

function getTenantId(): string {
    return localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
}

interface ReportLetterheadEditorProps {
    embedded?: boolean;
}

/**
 * Editor for a new immutable letterhead version—post-Phase 2 remediation.
 * Absorbs the presentation functionality formerly in
 * report_template_editor.tsx (a "template editor" that actually only edited
 * branding); unlike that screen, this one never touches clinical structure:
 * it neither receives nor publishes a `template`, only `presentation`. See
 * report-letterhead-version-contract.md.
 */
function ReportLetterheadEditor({ embedded = false }: ReportLetterheadEditorProps) {
    const navigate = useNavigate();
    const { letterheadId } = useParams<{ letterheadId: string }>();
    const [searchParams] = useSearchParams();
    const fromVersionId = searchParams.get("from");
    // Second post-Phase 2 remediation (UX): "normal" is the primary flow
    // ("Edit" from the letterhead list)—it atomically saves and activates
    // without exposing versioning. "publish" is the secondary history/rollback
    // flow ("New version"/"New version from this" on the versions screen)—it
    // remains unchanged and publishes without automatically activating. See
    // report-letterhead-domain-contract.md.
    const mode = searchParams.get("mode") === "publish" ? "publish" : "normal";
    const { hasPermission } = useUserProfile();
    const canManage = hasPermission(PERMS.MANAGE_TEMPLATES);
    const tenantId = getTenantId();

    const [loading, setLoading] = useState(true);
    const [letterheadName, setLetterheadName] = useState("");
    const [presentation, setPresentation] = useState<ReportPresentationSnapshotV2>(BLANK_PRESENTATION);
    const [initialPresentation, setInitialPresentation] = useState<ReportPresentationSnapshotV2>(BLANK_PRESENTATION);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    // Third post-Phase 2 remediation—single logo-preview contract (see
    // letterhead-logo-persistence-contract.md):
    //
    //     1. Newly uploaded logo URL     (returned by POST .../logo)
    //     2. Backend-resolved URL         (resolved_resources.*_logo_url)
    //     3. Neutral logo                 (ONLY when no logo is configured)
    //
    // These two states hold either (1) or (2)—the renderer need not know
    // which. The root cause of issues B and C was that they were populated
    // only in case (1): when reopening the editor, they remained `null` and
    // fell back to case (3) even though `logo_storage_id` was persisted.
    const [previewLogoUrl, setPreviewLogoUrl] = useState<string | null>(null);
    const [previewFooterLogoUrl, setPreviewFooterLogoUrl] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingFooterLogo, setUploadingFooterLogo] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishModalOpen, setPublishModalOpen] = useState(false);

    const baseline = mode === "publish" ? (fromVersionId ?? "new") : "current";
    const dirty = JSON.stringify(presentation) !== JSON.stringify(initialPresentation);
    const { loadDraft, clearDraft, confirmNavigateAway } = useTemplateEditorDraft({
        tenantId,
        templateId: letterheadId ?? "",
        baseline,
        value: presentation,
        dirty,
    });

    useEffect(() => {
        const load = async () => {
            if (!letterheadId) return;
            setLoading(true);
            try {
                const letterhead = await getReportLetterhead(letterheadId);
                setLetterheadName(letterhead.name);

                let seed = BLANK_PRESENTATION;
                let seedResources: LetterheadResolvedResources | null | undefined;
                if (fromVersionId) {
                    const version = await getReportLetterheadVersion(letterheadId, fromVersionId);
                    seed = version.configuration;
                    seedResources = version.resolved_resources;
                } else if (mode === "normal") {
                    // Primary "Edit" flow: preload the current ACTIVE
                    // configuration—if none exists yet (newly created
                    // letterhead), start blank.
                    const active = await getActiveReportLetterheadVersion(letterheadId);
                    if (active) {
                        seed = active.configuration;
                        seedResources = active.resolved_resources;
                    }
                }
                // Third remediation: initialize the preview with URLs already
                // resolved by the backend for persisted logos. Without this,
                // the editor always started without URLs and showed Céluma's
                // neutral logo even when the letterhead had a saved logo—the
                // exact symptom of issues B and C.
                setPreviewLogoUrl(seedResources?.header_logo_url ?? null);
                setPreviewFooterLogoUrl(seedResources?.footer_logo_url ?? null);
                // Fourth remediation: materialize `logo_mode` on opening with
                // the value that reproduces the letterhead's current display
                // (see deriveLogoMode). From here, the mode is explicit and
                // editable, never dependent on an implicit renderer rule.
                seed = {
                    ...seed,
                    header: {
                        ...seed.header,
                        logo_mode: deriveLogoMode(seed.header.logo_mode, seed.header.logo_storage_id, true),
                    },
                    footer: {
                        ...seed.footer,
                        logo_mode: deriveLogoMode(seed.footer.logo_mode, seed.footer.logo_storage_id, false),
                    },
                };
                const draft = loadDraft();
                setPresentation(draft ?? seed);
                setInitialPresentation(seed);
            } catch (err) {
                message.error(err instanceof Error ? err.message : "Error al cargar el membrete");
            } finally {
                setLoading(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [letterheadId, fromVersionId, mode]);

    const updateMargin = (field: keyof ReportMarginsCm, value: number) => {
        setPresentation((prev) => ({
            ...prev,
            paper: { ...prev.paper, margins_cm: { ...prev.paper.margins_cm, [field]: value } },
        }));
    };
    const updateHeader = (patch: Partial<ReportPresentationSnapshotV2["header"]>) =>
        setPresentation((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));
    const updateFooter = (patch: Partial<ReportPresentationSnapshotV2["footer"]>) =>
        setPresentation((prev) => ({ ...prev, footer: { ...prev.footer, ...patch } }));
    const updateStyle = (patch: Partial<ReportPresentationSnapshotV2["style"]>) =>
        setPresentation((prev) => ({ ...prev, style: { ...prev.style, ...patch } }));
    const updateHeaderDivider = (patch: Partial<DividerConfig>) =>
        setPresentation((prev) => ({
            ...prev,
            header: { ...prev.header, divider: { ...(prev.header.divider ?? DEFAULT_DIVIDER), ...patch } },
        }));
    const updateFooterDivider = (patch: Partial<DividerConfig>) =>
        setPresentation((prev) => ({
            ...prev,
            footer: { ...prev.footer, divider: { ...(prev.footer.divider ?? DEFAULT_DIVIDER), ...patch } },
        }));
    const updateTypography = (patch: Partial<NonNullable<ReportPresentationSnapshotV2["style"]["typography"]>>) =>
        setPresentation((prev) => ({
            ...prev,
            style: {
                ...prev.style,
                typography: {
                    font_family: "ARIAL",
                    base_font_size_pt: 10,
                    header_font_size_pt: 10,
                    footer_font_size_pt: 7,
                    ...prev.style.typography,
                    ...patch,
                },
            },
        }));
    const updateSigner = (patch: Partial<NonNullable<ReportPresentationSnapshotV2["signer"]>>) =>
        setPresentation((prev) => ({
            ...prev,
            signer: prev.signer
                ? { ...prev.signer, ...patch }
                : { display_name: null, specialty: null, license_number: null, affiliation: null, ...patch },
        }));
    const toggleSignerBlock = (enabled: boolean) =>
        setPresentation((prev) => ({
            ...prev,
            signer: enabled
                ? prev.signer ?? { display_name: null, specialty: null, license_number: null, affiliation: null }
                : null,
        }));

    /**
     * Third post-Phase 2 remediation: selecting (or dragging) a file uploads
     * it immediately instead of leaving it in an intermediate state awaiting a
     * second "Upload logo" button.
     *
     * That intermediate step caused two real failures: drag-and-drop never
     * showed the newly dropped asset (nothing updated the preview until the
     * second button was pressed), and users who selected a file then clicked
     * "Save" silently lost the logo—the `File` remained in memory and never
     * became a `logo_storage_id`. When `handleSelectLogo` completes,
     * `logo_storage_id` is final and "Save" never depends on a `File` object.
     */
    const handleSelectLogo = async (file: RcFile) => {
        const fileObject = extractUploadedFile(file);
        if (!fileObject || !letterheadId) return;
        setUploadingLogo(true);
        try {
            const resp = await uploadReportLetterheadLogo(letterheadId, fileObject);
            // Uploading a logo IS how users request a "custom logo": set the
            // mode automatically so no one uploads an image and then cannot
            // see it because the mode remains NONE.
            updateHeader({ logo_storage_id: resp.storage_object_id, logo_mode: "CUSTOM" });
            setPreviewLogoUrl(resp.url);
            message.success("Logo actualizado");
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al subir el logo");
        } finally {
            setUploadingLogo(false);
        }
    };
    const handleRemoveLogo = () => {
        // Removing the logo means "no logo", not "use Céluma's": if the mode
        // remained CUSTOM/CELUMA_DEFAULT, the document would end up with an
        // image nobody requested.
        updateHeader({ logo_storage_id: null, logo_mode: "NONE" });
        setPreviewLogoUrl(null);
    };

    const handleSelectFooterLogo = async (file: RcFile) => {
        const fileObject = extractUploadedFile(file);
        if (!fileObject || !letterheadId) return;
        setUploadingFooterLogo(true);
        try {
            const resp = await uploadReportLetterheadLogo(letterheadId, fileObject);
            updateFooter({ logo_storage_id: resp.storage_object_id, logo_mode: "CUSTOM" });
            setPreviewFooterLogoUrl(resp.url);
            message.success("Logo de pie actualizado");
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al subir el logo de pie");
        } finally {
            setUploadingFooterLogo(false);
        }
    };
    const handleRemoveFooterLogo = () => {
        updateFooter({ logo_storage_id: null, logo_mode: "NONE" });
        setPreviewFooterLogoUrl(null);
    };

    // Saving remains blocked while an upload is in flight: publishing then
    // would persist configuration without the imminent `logo_storage_id`.
    const uploadInFlight = uploadingLogo || uploadingFooterLogo;

    const previewReport = useMemo(
        () => buildPreviewReportEnvelope(presentation, previewLogoUrl, previewFooterLogoUrl),
        [presentation, previewLogoUrl, previewFooterLogoUrl]
    );

    const handleBack = () => {
        if (!confirmNavigateAway()) return;
        navigate(mode === "normal" ? "/config/report-letterheads" : `/config/report-letterheads/${letterheadId}/versions`);
    };

    const handleOpenPublishModal = () => {
        if (uploadInFlight) {
            message.warning("Espera a que termine de subirse el logo antes de guardar.");
            return;
        }
        const result = validatePresentationDraft(presentation);
        if (!result.valid) {
            setFieldErrors(result.fieldErrors);
            message.error("Corrige los errores marcados antes de publicar");
            return;
        }
        setFieldErrors({});
        setPublishModalOpen(true);
    };

    const handlePublish = async () => {
        if (!letterheadId) return;
        setPublishing(true);
        try {
            if (mode === "normal") {
                // Second post-Phase 2 remediation (UX): "Save changes"
                // atomically creates and activates, replacing the historical
                // "Publish version", which remained PUBLISHED without activation.
                await saveCurrentReportLetterheadVersion(letterheadId, { configuration: presentation });
                message.success("Membrete actualizado. La configuración anterior se conserva en el historial.");
                clearDraft();
                setPublishModalOpen(false);
                navigate("/config/report-letterheads");
            } else {
                const version = await createReportLetterheadVersion(letterheadId, {
                    configuration: presentation,
                });
                message.success(`Versión ${version.version_number} publicada`);
                clearDraft();
                setPublishModalOpen(false);
                navigate(`/config/report-letterheads/${letterheadId}/versions`);
            }
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al guardar el membrete");
            setPublishModalOpen(false);
        } finally {
            setPublishing(false);
        }
    };

    const nullableStr = (v: string | null | undefined) => v ?? "";

    const configPanel = (
        <div style={{ display: "grid", gap: 20 }}>
            {!canManage && (
                <Panel style={{ background: "#fffbeb", border: "2px solid #fde68a" }}>
                    <Text style={{ fontSize: 13, color: "#92400e" }}>
                        Solo lectura — se requiere el permiso <strong>reports:manage_templates</strong> para publicar.
                    </Text>
                </Panel>
            )}

            <section>
                <SectionTitle icon={<FileTextOutlined />}>Papel y márgenes</SectionTitle>
                <Panel style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 24, fontSize: 13, color: tokens.textSecondary }}>
                        <span>Tamaño: <strong>Carta (LETTER)</strong></span>
                        <span>Orientación: <strong>Vertical</strong></span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {(Object.keys(MARGIN_LABELS) as (keyof ReportMarginsCm)[]).map((side) => (
                            <div key={side}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: tokens.textSecondary, display: "block", marginBottom: 4 }}>
                                    {MARGIN_LABELS[side]} (cm)
                                </label>
                                <InputNumber
                                    min={0.5}
                                    max={4.0}
                                    step={0.1}
                                    value={presentation.paper.margins_cm[side]}
                                    onChange={(v) => updateMargin(side, typeof v === "number" ? v : 1.0)}
                                    style={{ width: "100%" }}
                                    status={fieldErrors[`paper.margins_cm.${side}`] ? "error" : undefined}
                                    disabled={!canManage}
                                />
                                {fieldErrors[`paper.margins_cm.${side}`] && (
                                    <Text type="danger" style={{ fontSize: 12 }}>{fieldErrors[`paper.margins_cm.${side}`]}</Text>
                                )}
                            </div>
                        ))}
                    </div>
                </Panel>
            </section>

            <section>
                <SectionTitle
                    icon={<PictureOutlined />}
                    extra={<CelumaSwitch checked={presentation.header.enabled} onChange={(v) => updateHeader({ enabled: v })} disabled={!canManage} />}
                >
                    Encabezado
                </SectionTitle>
                {presentation.header.enabled && (
                    <div style={{ display: "grid", gap: 16, opacity: canManage ? 1 : 0.7 }}>
                        <Panel style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ width: 72, height: 72, borderRadius: tokens.radius, border: "2px dashed #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                                {previewLogoUrl ? (
                                    <img src={previewLogoUrl} alt="Logo" style={{ maxWidth: 64, maxHeight: 64, objectFit: "contain" }} />
                                ) : (
                                    <PictureOutlined style={{ fontSize: 24, color: "#cbd5e1" }} />
                                )}
                            </div>
                            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <Upload
                                        beforeUpload={(file) => { void handleSelectLogo(file); return false; }}
                                        showUploadList={false}
                                        accept="image/png,image/jpeg,image/webp"
                                        maxCount={1}
                                        disabled={!canManage || uploadingLogo}
                                    >
                                        <CelumaButton
                                            size="xsmall"
                                            icon={<UploadOutlined />}
                                            loading={uploadingLogo}
                                            disabled={!canManage}
                                            data-testid="header-logo-upload-button"
                                        >
                                            {presentation.header.logo_storage_id ? "Cambiar logo" : "Subir logo"}
                                        </CelumaButton>
                                    </Upload>
                                    {presentation.header.logo_storage_id && canManage && (
                                        <CelumaButton size="xsmall" danger icon={<DeleteOutlined />} onClick={handleRemoveLogo}>
                                            Quitar
                                        </CelumaButton>
                                    )}
                                </div>
                                <Text style={{ fontSize: 11, color: tokens.textSecondary }}>
                                    PNG, JPEG o WEBP. Máximo 5MB. No se admite SVG.
                                </Text>
                            </div>
                        </Panel>

                        <FloatingCaptionInput label="Nombre institucional" maxLength={255} disabled={!canManage}
                            value={nullableStr(presentation.header.institution_name)}
                            onChange={(e) => updateHeader({ institution_name: e.target.value || null })}
                            error={fieldErrors["header.institution_name"]} />
                        <FloatingCaptionInput label="Subtítulo" maxLength={255} disabled={!canManage}
                            value={nullableStr(presentation.header.subtitle)}
                            onChange={(e) => updateHeader({ subtitle: e.target.value || null })}
                            error={fieldErrors["header.subtitle"]} />
                        <FloatingCaptionInput label="Dirección" maxLength={500} disabled={!canManage}
                            value={nullableStr(presentation.header.address)}
                            onChange={(e) => updateHeader({ address: e.target.value || null })}
                            error={fieldErrors["header.address"]} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <FloatingCaptionInput label="Teléfono" maxLength={50} disabled={!canManage}
                                value={nullableStr(presentation.header.phone)}
                                onChange={(e) => updateHeader({ phone: e.target.value || null })}
                                error={fieldErrors["header.phone"]} />
                            <FloatingCaptionInput label="Correo" maxLength={255} disabled={!canManage}
                                value={nullableStr(presentation.header.email)}
                                onChange={(e) => updateHeader({ email: e.target.value || null })}
                                error={fieldErrors["header.email"]} />
                        </div>

                        {/* Second post-Phase 2 remediation (UX) — Legacy parity */}
                        <Panel style={{ display: "grid", gap: 10 }}>
                            <Text style={{ fontSize: 12, fontWeight: 600, color: tokens.textSecondary }}>Diseño avanzado</Text>
                            {/* Fourth remediation: the header logo is no longer
                                an implicit consequence of uploading (or not
                                uploading) a file. "No logo" reserves no space
                                and renders nothing—what the Legacy letterhead
                                needs, because its logo lives in the footer. */}
                            <div>
                                <label style={{ fontSize: 12, color: tokens.textSecondary, display: "block", marginBottom: 4 }}>Logotipo del encabezado</label>
                                <AntSelect
                                    value={presentation.header.logo_mode ?? "CELUMA_DEFAULT"}
                                    onChange={(v: ReportLogoMode) => updateHeader({ logo_mode: v })}
                                    options={HEADER_LOGO_MODE_OPTIONS}
                                    disabled={!canManage}
                                    style={{ width: "100%" }}
                                    data-testid="header-logo-mode"
                                />
                                {presentation.header.logo_mode === "CUSTOM" && !presentation.header.logo_storage_id && (
                                    <Text type="warning" style={{ fontSize: 11 }}>
                                        Selecciona "Logotipo propio" solo si subes una imagen: sin ella el
                                        encabezado saldrá sin logotipo (nunca con uno sustituto).
                                    </Text>
                                )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: 12, color: tokens.textSecondary, display: "block", marginBottom: 4 }}>Posición del logo</label>
                                    <AntSelect
                                        value={presentation.header.logo_position ?? "LEFT"}
                                        onChange={(v) => updateHeader({ logo_position: v })}
                                        options={LOGO_POSITION_OPTIONS}
                                        disabled={!canManage}
                                        style={{ width: "100%" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: tokens.textSecondary, display: "block", marginBottom: 4 }}>Alineación vertical</label>
                                    <AntSelect
                                        value={presentation.header.content_alignment ?? "CENTER"}
                                        onChange={(v) => updateHeader({ content_alignment: v })}
                                        options={[{ value: "TOP", label: "Superior" }, { value: "CENTER", label: "Centro" }, { value: "BOTTOM", label: "Inferior" }]}
                                        disabled={!canManage}
                                        style={{ width: "100%" }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 13 }}>Línea divisoria bajo el encabezado</Text>
                                <CelumaSwitch
                                    checked={presentation.header.divider?.enabled ?? true}
                                    onChange={(v) => updateHeaderDivider({ enabled: v })}
                                    disabled={!canManage}
                                />
                            </div>
                            {(presentation.header.divider?.enabled ?? true) && (
                                <AntSelect
                                    value={presentation.header.divider?.style ?? "SINGLE"}
                                    onChange={(v) => updateHeaderDivider({ style: v })}
                                    options={[{ value: "SINGLE", label: "Línea sencilla" }, { value: "DOUBLE", label: "Línea doble" }]}
                                    disabled={!canManage}
                                    style={{ width: "100%" }}
                                />
                            )}
                        </Panel>
                    </div>
                )}
            </section>

            <section>
                <SectionTitle
                    icon={<SafetyCertificateOutlined />}
                    extra={<CelumaSwitch checked={!!presentation.signer} onChange={toggleSignerBlock} disabled={!canManage} />}
                >
                    Firmante institucional
                </SectionTitle>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                    Datos institucionales mostrados en el membrete. No representa necesariamente a quien
                    firma electrónicamente el reporte (esa firma se muestra por separado, en el bloque de firma).
                </Text>
                {presentation.signer && (
                    <div style={{ display: "grid", gap: 12, opacity: canManage ? 1 : 0.7 }}>
                        <FloatingCaptionInput label="Nombre mostrado" maxLength={255} disabled={!canManage}
                            value={nullableStr(presentation.signer.display_name)}
                            onChange={(e) => updateSigner({ display_name: e.target.value || null })}
                            error={fieldErrors["signer.display_name"]} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <FloatingCaptionInput label="Especialidad" maxLength={255} disabled={!canManage}
                                value={nullableStr(presentation.signer.specialty)}
                                onChange={(e) => updateSigner({ specialty: e.target.value || null })}
                                error={fieldErrors["signer.specialty"]} />
                            <FloatingCaptionInput label="Número de cédula" maxLength={100} disabled={!canManage}
                                value={nullableStr(presentation.signer.license_number)}
                                onChange={(e) => updateSigner({ license_number: e.target.value || null })}
                                error={fieldErrors["signer.license_number"]} />
                        </div>
                        <FloatingCaptionInput label="Afiliación" maxLength={255} disabled={!canManage}
                            value={nullableStr(presentation.signer.affiliation)}
                            onChange={(e) => updateSigner({ affiliation: e.target.value || null })}
                            error={fieldErrors["signer.affiliation"]} />
                    </div>
                )}
            </section>

            <section>
                <SectionTitle
                    extra={<CelumaSwitch checked={presentation.footer.enabled} onChange={(v) => updateFooter({ enabled: v })} disabled={!canManage} />}
                >
                    Pie de página
                </SectionTitle>
                {presentation.footer.enabled && (
                    <div style={{ display: "grid", gap: 12, opacity: canManage ? 1 : 0.7 }}>
                        {/* Second post-Phase 2 remediation (UX): footer logo—
                            required for Legacy parity (its logo lives in the
                            footer, not the header). */}
                        <Panel style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ width: 72, height: 72, borderRadius: tokens.radius, border: "2px dashed #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                                {previewFooterLogoUrl ? (
                                    <img src={previewFooterLogoUrl} alt="Logo de pie" style={{ maxWidth: 64, maxHeight: 64, objectFit: "contain" }} />
                                ) : (
                                    <PictureOutlined style={{ fontSize: 24, color: "#cbd5e1" }} />
                                )}
                            </div>
                            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <Upload
                                        beforeUpload={(file) => { void handleSelectFooterLogo(file); return false; }}
                                        showUploadList={false}
                                        accept="image/png,image/jpeg,image/webp"
                                        maxCount={1}
                                        disabled={!canManage || uploadingFooterLogo}
                                    >
                                        <CelumaButton
                                            size="xsmall"
                                            icon={<UploadOutlined />}
                                            loading={uploadingFooterLogo}
                                            disabled={!canManage}
                                            data-testid="footer-logo-upload-button"
                                        >
                                            {presentation.footer.logo_storage_id ? "Cambiar logo de pie" : "Subir logo de pie"}
                                        </CelumaButton>
                                    </Upload>
                                    {presentation.footer.logo_storage_id && canManage && (
                                        <CelumaButton size="xsmall" danger icon={<DeleteOutlined />} onClick={handleRemoveFooterLogo}>
                                            Quitar
                                        </CelumaButton>
                                    )}
                                </div>
                                <Text style={{ fontSize: 11, color: tokens.textSecondary }}>
                                    PNG, JPEG o WEBP. Máximo 5MB. No se admite SVG.
                                </Text>
                            </div>
                        </Panel>

                        <CelumaTextArea
                            value={nullableStr(presentation.footer.custom_text)}
                            onChange={(v) => updateFooter({ custom_text: v || null })}
                            placeholder="Texto personalizado del pie de página"
                            rows={2}
                            maxLength={1000}
                        />
                        {fieldErrors["footer.custom_text"] && <Text type="danger" style={{ fontSize: 12 }}>{fieldErrors["footer.custom_text"]}</Text>}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 13 }}>Mostrar número de página</Text>
                            <CelumaSwitch checked={presentation.footer.show_page_number} onChange={(v) => updateFooter({ show_page_number: v })} disabled={!canManage} />
                        </div>

                        <Panel style={{ display: "grid", gap: 10 }}>
                            <Text style={{ fontSize: 12, fontWeight: 600, color: tokens.textSecondary }}>Diseño avanzado</Text>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: 12, color: tokens.textSecondary, display: "block", marginBottom: 4 }}>Posición del logo</label>
                                    <AntSelect
                                        value={presentation.footer.logo_position ?? "LEFT"}
                                        onChange={(v) => updateFooter({ logo_position: v })}
                                        options={LOGO_POSITION_OPTIONS}
                                        disabled={!canManage}
                                        style={{ width: "100%" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: tokens.textSecondary, display: "block", marginBottom: 4 }}>Alineación del texto</label>
                                    <AntSelect
                                        value={presentation.footer.content_alignment ?? "CENTER"}
                                        onChange={(v) => updateFooter({ content_alignment: v })}
                                        options={LOGO_POSITION_OPTIONS}
                                        disabled={!canManage}
                                        style={{ width: "100%" }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 13 }}>Línea divisoria sobre el pie de página</Text>
                                <CelumaSwitch
                                    checked={presentation.footer.divider?.enabled ?? true}
                                    onChange={(v) => updateFooterDivider({ enabled: v })}
                                    disabled={!canManage}
                                />
                            </div>
                            {(presentation.footer.divider?.enabled ?? true) && (
                                <AntSelect
                                    value={presentation.footer.divider?.style ?? "SINGLE"}
                                    onChange={(v) => updateFooterDivider({ style: v })}
                                    options={[{ value: "SINGLE", label: "Línea sencilla" }, { value: "DOUBLE", label: "Línea doble" }]}
                                    disabled={!canManage}
                                    style={{ width: "100%" }}
                                />
                            )}
                        </Panel>
                    </div>
                )}
            </section>

            <section>
                <SectionTitle icon={<BgColorsOutlined />}>Estilo</SectionTitle>
                <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <ColorPicker
                            value={presentation.style.primary_color}
                            disabledAlpha
                            disabled={!canManage}
                            onChangeComplete={(color) => updateStyle({ primary_color: `#${color.toHex().toUpperCase()}` })}
                        />
                        <FloatingCaptionInput
                            label="Color principal (hex)"
                            value={presentation.style.primary_color}
                            onChange={(e) => updateStyle({ primary_color: e.target.value })}
                            disabled={!canManage}
                            style={{ flex: 1 }}
                            error={fieldErrors["style.primary_color"]}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <ColorPicker
                            value={presentation.style.secondary_color ?? presentation.style.primary_color}
                            disabledAlpha
                            disabled={!canManage}
                            onChangeComplete={(color) => updateStyle({ secondary_color: `#${color.toHex().toUpperCase()}` })}
                        />
                        <FloatingCaptionInput
                            label="Color secundario (hex, opcional)"
                            value={nullableStr(presentation.style.secondary_color)}
                            onChange={(e) => updateStyle({ secondary_color: e.target.value || null })}
                            disabled={!canManage}
                            style={{ flex: 1 }}
                            error={fieldErrors["style.secondary_color"]}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: 12, color: tokens.textSecondary, display: "block", marginBottom: 4 }}>Tipografía</label>
                        <AntSelect
                            value={presentation.style.typography?.font_family ?? "ARIAL"}
                            onChange={(v) => updateTypography({ font_family: v })}
                            options={FONT_FAMILY_OPTIONS}
                            disabled={!canManage}
                            style={{ width: "100%" }}
                        />
                    </div>
                </div>
            </section>
        </div>
    );

    const previewPanel = (
        <Card style={{ ...cardStyle, position: "sticky", top: 16 }} styles={{ body: { padding: 16 } }}>
            <SectionTitle>Previsualización</SectionTitle>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                Usa datos sintéticos anonimizados — nunca información real de pacientes.
            </Text>
            <div style={{ maxHeight: "calc(100vh - 220px)", overflow: "auto", background: "#e5e7eb", padding: 16, borderRadius: tokens.radius }}>
                <ReportRendererResolver report={previewReport} />
            </div>
        </Card>
    );

    if (loading) {
        return (
            <Layout style={{ minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
                <Spin size="large" />
            </Layout>
        );
    }

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <style>{`
              .rle-grid { display: grid; grid-template-columns: 2fr 3fr; gap: 24px; align-items: start; }
              @media (max-width: 960px) { .rle-grid { grid-template-columns: 1fr; } }
            `}</style>
            <PageHeader
                title={
                    mode === "normal"
                        ? `Editar membrete — ${letterheadName}`
                        : fromVersionId
                            ? `Nueva versión — ${letterheadName}`
                            : `Nueva configuración — ${letterheadName}`
                }
                subtitle="Los cambios sin guardar se conservan localmente en este navegador."
                extra={
                    <div style={{ display: "flex", gap: 8 }}>
                        <CelumaButton onClick={handleBack}>Cancelar</CelumaButton>
                        <CelumaButton
                            type="primary"
                            onClick={handleOpenPublishModal}
                            disabled={!canManage || uploadInFlight}
                            loading={uploadInFlight}
                        >
                            {mode === "normal" ? "Guardar cambios" : "Publicar versión"}
                        </CelumaButton>
                    </div>
                }
            />
            <div className="rle-grid">
                <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                    {configPanel}
                </Card>
                {previewPanel}
            </div>
        </div>
    );

    const page = embedded ? (
        content
    ) : (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 1400, margin: "0 auto" }}>{content}</div>
            </Layout.Content>
        </Layout>
    );

    return (
        <>
            {page}
            <CelumaModal
                title={mode === "normal" ? "Guardar cambios del membrete" : "Publicar nueva versión"}
                open={publishModalOpen}
                onCancel={() => setPublishModalOpen(false)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setPublishModalOpen(false)}>Cancelar</CelumaButton>
                        <CelumaButton size="xsmall" type="primary" loading={publishing} onClick={handlePublish}>
                            {mode === "normal" ? "Guardar" : "Publicar"}
                        </CelumaButton>
                    </div>
                }
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <Text>
                        {mode === "normal"
                            ? "Internamente se crea una nueva revisión inmutable y se activa de inmediato. La configuración anterior se conserva en el historial por si necesitas restaurarla."
                            : "Esta acción creará una nueva versión inmutable de este membrete. Una vez publicada, esta configuración no podrá editarse — para corregirla deberás publicar otra versión nueva."}
                    </Text>
                    <Divider style={{ margin: "4px 0" }} />
                    <Text style={{ fontSize: 13 }}>
                        Márgenes: {presentation.paper.margins_cm.top}cm / {presentation.paper.margins_cm.right}cm /
                        {" "}{presentation.paper.margins_cm.bottom}cm / {presentation.paper.margins_cm.left}cm
                    </Text>
                    <Text style={{ fontSize: 13 }}>
                        Encabezado: {presentation.header.enabled ? "habilitado" : "deshabilitado"} — Pie de página:
                        {" "}{presentation.footer.enabled ? "habilitado" : "deshabilitado"}
                    </Text>
                    {mode === "publish" && (
                        <Text style={{ fontSize: 13 }}>
                            Esta nueva versión <strong>no se activará automáticamente</strong> ni se asociará a
                            ningún reporte. Podrás activarla desde el historial cuando quieras que se use como
                            membrete predeterminado.
                        </Text>
                    )}
                </div>
            </CelumaModal>
        </>
    );
}

export default ReportLetterheadEditor;
