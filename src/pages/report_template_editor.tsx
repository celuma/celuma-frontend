import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Spin, message, Upload, InputNumber, ColorPicker, Divider, Typography } from "antd";
import { UploadOutlined, DeleteOutlined, FileTextOutlined, PictureOutlined, SafetyCertificateOutlined, BgColorsOutlined } from "@ant-design/icons";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { UploadFile } from "antd/es/upload/interface";
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
} from "../components/report/versioned/versioned_report_types";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import { useTemplateEditorDraft } from "../hooks/use_template_editor_draft";
import {
    getReportTemplateById,
    getReportTemplateVersion,
    createReportTemplateVersion,
    uploadReportTemplateLogo,
} from "../services/report_service";

const { Text } = Typography;

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
    },
    footer: { enabled: true, custom_text: null, show_page_number: true },
    style: { primary_color: "#4A4A4A" },
    signer: null,
};

const MARGIN_LABELS: Record<keyof ReportMarginsCm, string> = {
    top: "Superior",
    right: "Derecho",
    bottom: "Inferior",
    left: "Izquierdo",
};

function getTenantId(): string {
    return localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
}

interface ReportTemplateEditorProps {
    embedded?: boolean;
}

function ReportTemplateEditor({ embedded = false }: ReportTemplateEditorProps) {
    const navigate = useNavigate();
    const { templateId } = useParams<{ templateId: string }>();
    const [searchParams] = useSearchParams();
    const fromVersionId = searchParams.get("from");
    const { hasPermission } = useUserProfile();
    const canManage = hasPermission(PERMS.MANAGE_TEMPLATES);
    const tenantId = getTenantId();

    const [loading, setLoading] = useState(true);
    const [templateName, setTemplateName] = useState("");
    const [clinicalTemplate, setClinicalTemplate] = useState<Record<string, unknown> | null>(null);
    const [presentation, setPresentation] = useState<ReportPresentationSnapshotV2>(BLANK_PRESENTATION);
    const [initialPresentation, setInitialPresentation] = useState<ReportPresentationSnapshotV2>(BLANK_PRESENTATION);
    const [carriedForwardLogo, setCarriedForwardLogo] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [logoFile, setLogoFile] = useState<UploadFile | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [previewLogoUrl, setPreviewLogoUrl] = useState<string | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [publishModalOpen, setPublishModalOpen] = useState(false);

    const baseline = fromVersionId ?? "new";
    const dirty = JSON.stringify(presentation) !== JSON.stringify(initialPresentation);
    const { loadDraft, clearDraft, confirmNavigateAway } = useTemplateEditorDraft({
        tenantId,
        templateId: templateId ?? "",
        baseline,
        value: presentation,
        dirty,
    });

    useEffect(() => {
        const load = async () => {
            if (!templateId) return;
            setLoading(true);
            try {
                const template = await getReportTemplateById(templateId);
                setTemplateName(template.name);
                setClinicalTemplate(template.template_json as unknown as Record<string, unknown>);

                let seed = BLANK_PRESENTATION;
                if (fromVersionId) {
                    const version = await getReportTemplateVersion(templateId, fromVersionId);
                    const configPresentation = (version.configuration as { presentation?: unknown })?.presentation;
                    if (configPresentation) {
                        seed = configPresentation as ReportPresentationSnapshotV2;
                        setCarriedForwardLogo(!!seed.header.logo_storage_id);
                    }
                }
                const draft = loadDraft();
                setPresentation(draft ?? seed);
                setInitialPresentation(seed);
            } catch (err) {
                message.error(err instanceof Error ? err.message : "Error al cargar la plantilla");
            } finally {
                setLoading(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, fromVersionId]);

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

    const handleUploadLogo = async () => {
        const fileObject = logoFile?.originFileObj;
        if (!fileObject || !templateId) return;
        setUploadingLogo(true);
        try {
            const resp = await uploadReportTemplateLogo(templateId, fileObject as File);
            updateHeader({ logo_storage_id: resp.storage_object_id });
            setPreviewLogoUrl(resp.url);
            setCarriedForwardLogo(false);
            setLogoFile(null);
            message.success("Logo subido");
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al subir el logo");
        } finally {
            setUploadingLogo(false);
        }
    };
    const handleRemoveLogo = () => {
        updateHeader({ logo_storage_id: null });
        setPreviewLogoUrl(null);
        setCarriedForwardLogo(false);
    };

    const previewReport = useMemo(
        () => buildPreviewReportEnvelope(presentation, previewLogoUrl),
        [presentation, previewLogoUrl]
    );

    const handleBack = () => {
        if (!confirmNavigateAway()) return;
        navigate(`/config/report-templates/${templateId}/versions`);
    };

    const handleOpenPublishModal = () => {
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
        if (!templateId || !clinicalTemplate) return;
        setPublishing(true);
        try {
            const version = await createReportTemplateVersion(templateId, {
                configuration: { schema_version: 2, template: clinicalTemplate, presentation },
            });
            message.success(`Versión ${version.version_number} publicada`);
            clearDraft();
            setPublishModalOpen(false);
            navigate(`/config/report-templates/${templateId}/versions`);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al publicar la versión");
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
                                {carriedForwardLogo && (
                                    <Text style={{ fontSize: 12, color: tokens.textSecondary }}>
                                        Esta versión heredó un logotipo configurado. No es posible mostrar su vista previa
                                        aquí — sube uno nuevo para reemplazarlo, o publica sin cambiar el logo.
                                    </Text>
                                )}
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <Upload
                                        beforeUpload={(file) => { setLogoFile(file); return false; }}
                                        fileList={logoFile ? [logoFile] : []}
                                        onRemove={() => setLogoFile(null)}
                                        accept="image/png,image/jpeg,image/webp"
                                        maxCount={1}
                                        disabled={!canManage}
                                    >
                                        <CelumaButton size="xsmall" icon={<UploadOutlined />} disabled={!canManage}>
                                            Seleccionar logo
                                        </CelumaButton>
                                    </Upload>
                                    {logoFile && canManage && (
                                        <CelumaButton size="xsmall" type="primary" onClick={handleUploadLogo} loading={uploadingLogo}>
                                            Subir logo
                                        </CelumaButton>
                                    )}
                                    {(previewLogoUrl || presentation.header.logo_storage_id) && canManage && (
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
                    </div>
                )}
            </section>

            <section>
                <SectionTitle icon={<BgColorsOutlined />}>Estilo</SectionTitle>
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
              .rte-grid { display: grid; grid-template-columns: 2fr 3fr; gap: 24px; align-items: start; }
              @media (max-width: 960px) { .rte-grid { grid-template-columns: 1fr; } }
            `}</style>
            <PageHeader
                title={fromVersionId ? `Nueva versión — ${templateName}` : `Nueva configuración — ${templateName}`}
                subtitle="Los cambios no publicados se guardan localmente en este navegador."
                extra={
                    <div style={{ display: "flex", gap: 8 }}>
                        <CelumaButton onClick={handleBack}>Cancelar</CelumaButton>
                        <CelumaButton type="primary" onClick={handleOpenPublishModal} disabled={!canManage}>
                            Publicar versión
                        </CelumaButton>
                    </div>
                }
            />
            <div className="rte-grid">
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
                title="Publicar nueva versión"
                open={publishModalOpen}
                onCancel={() => setPublishModalOpen(false)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setPublishModalOpen(false)}>Cancelar</CelumaButton>
                        <CelumaButton size="xsmall" type="primary" loading={publishing} onClick={handlePublish}>
                            Publicar
                        </CelumaButton>
                    </div>
                }
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <Text>
                        Esta acción creará una <strong>nueva versión inmutable</strong> de la plantilla. Una vez
                        publicada, esta configuración no podrá editarse — para corregirla deberás publicar otra
                        versión nueva.
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
                    <Text style={{ fontSize: 13 }}>
                        Esta nueva versión <strong>no se activará automáticamente</strong>. Podrás activarla desde
                        la lista de versiones cuando quieras que se use en reportes nuevos.
                    </Text>
                </div>
            </CelumaModal>
        </>
    );
}

export default ReportTemplateEditor;
