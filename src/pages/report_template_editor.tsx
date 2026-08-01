import { useEffect, useMemo, useState } from "react";
import { Layout, Card, Spin, message, Divider, Typography } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import CelumaModal from "../components/ui/celuma_modal";
import Panel from "../components/ui/panel";
import SectionTitle from "../components/ui/section_title";
import ReportRendererResolver from "../components/report/report_renderer_resolver";
import { buildPreviewReportEnvelope } from "../components/report/versioned/editor_preview_fixture";
import type { ReportPresentationSnapshotV2 } from "../components/report/versioned/versioned_report_types";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import {
    getReportTemplateById,
    createReportTemplateVersion,
} from "../services/report_service";
import {
    listReportLetterheads,
    listReportLetterheadVersions,
    getReportLetterheadVersion,
} from "../services/report_letterhead_service";

const { Text } = Typography;

interface ReportTemplateEditorProps {
    embedded?: boolean;
}

/**
 * Post-Fase-2 remediation: this screen used to be a full "membrete" editor
 * (papel/márgenes/logo/firmante/color) bundled with clinical-template
 * publishing. That editing surface moved to
 * report_letterhead_editor.tsx (`/config/report-letterheads/...`) — a
 * membrete is now a shared, independently-versioned tenant resource, never
 * owned by a single template.
 *
 * What remains here is a much smaller flow: publish a new immutable
 * `ReportTemplateVersion` whenever the *clinical structure*
 * (`template_json`) changes. The backend's `ReportTemplateVersionCreate`
 * contract still requires a `presentation` block (unchanged, for
 * compatibility with existing V2 reports/renderer — see
 * remediation-architecture-decision.md), so this flow resolves the
 * tenant's default letterhead automatically and carries its
 * `presentation` forward transparently — no visual editor, no logo upload,
 * no risk of this screen being mistaken for a full template/membrete editor.
 */
function ReportTemplateEditor({ embedded = false }: ReportTemplateEditorProps) {
    const navigate = useNavigate();
    const { templateId } = useParams<{ templateId: string }>();
    const { hasPermission } = useUserProfile();
    const canManage = hasPermission(PERMS.MANAGE_TEMPLATES);

    const [loading, setLoading] = useState(true);
    const [templateName, setTemplateName] = useState("");
    const [clinicalTemplate, setClinicalTemplate] = useState<Record<string, unknown> | null>(null);
    const [resolvedPresentation, setResolvedPresentation] = useState<ReportPresentationSnapshotV2 | null>(null);
    const [resolvedLetterheadName, setResolvedLetterheadName] = useState<string | null>(null);
    const [blockedReason, setBlockedReason] = useState<string | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [publishModalOpen, setPublishModalOpen] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!templateId) return;
            setLoading(true);
            setBlockedReason(null);
            try {
                const template = await getReportTemplateById(templateId);
                setTemplateName(template.name);
                setClinicalTemplate(template.template_json as unknown as Record<string, unknown>);

                // Post-Fase-2 remediation: resolve the tenant's default
                // letterhead for this publish. A template's own
                // `preferred_letterhead_version_id` (if set) is honored by
                // the backend at report-creation time (create_report) —
                // this flow only needs *a* valid presentation to keep the
                // ReportTemplateVersion contract satisfied, so the tenant
                // default is a safe, simple choice here.
                const { letterheads } = await listReportLetterheads();
                const defaultLetterhead = letterheads.find((l) => l.is_default);
                if (!defaultLetterhead) {
                    setBlockedReason(
                        "Este tenant aún no tiene un membrete predeterminado. Crea uno en " +
                        "Configuración → Membretes y márcalo como predeterminado antes de publicar " +
                        "una nueva versión de esta plantilla."
                    );
                    return;
                }
                const { versions } = await listReportLetterheadVersions(defaultLetterhead.id);
                const active = versions.find((v) => v.status === "ACTIVE");
                if (!active) {
                    setBlockedReason(
                        `El membrete predeterminado ("${defaultLetterhead.name}") no tiene una versión activa. ` +
                        "Activa una versión en Configuración → Membretes antes de publicar."
                    );
                    return;
                }
                const versionDetail = await getReportLetterheadVersion(defaultLetterhead.id, active.id);
                setResolvedPresentation(versionDetail.configuration);
                setResolvedLetterheadName(defaultLetterhead.name);
            } catch (err) {
                message.error(err instanceof Error ? err.message : "Error al cargar la plantilla");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [templateId]);

    const previewReport = useMemo(
        () => (resolvedPresentation ? buildPreviewReportEnvelope(resolvedPresentation) : null),
        [resolvedPresentation]
    );

    const handleBack = () => navigate(`/config/report-templates/${templateId}/versions`);

    const handlePublish = async () => {
        if (!templateId || !clinicalTemplate || !resolvedPresentation) return;
        setPublishing(true);
        try {
            const version = await createReportTemplateVersion(templateId, {
                configuration: { schema_version: 2, template: clinicalTemplate, presentation: resolvedPresentation },
            });
            message.success(`Versión ${version.version_number} publicada`);
            setPublishModalOpen(false);
            navigate(`/config/report-templates/${templateId}/versions`);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al publicar la versión");
            setPublishModalOpen(false);
        } finally {
            setPublishing(false);
        }
    };

    if (loading) {
        return (
            <Layout style={{ minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
                <Spin size="large" />
            </Layout>
        );
    }

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <PageHeader
                title={`Publicar nueva versión — ${templateName}`}
                subtitle="Congela la estructura clínica actual de esta plantilla como una versión inmutable."
                extra={
                    <div style={{ display: "flex", gap: 8 }}>
                        <CelumaButton onClick={handleBack}>Volver</CelumaButton>
                        <CelumaButton
                            type="primary"
                            onClick={() => setPublishModalOpen(true)}
                            disabled={!canManage || !!blockedReason}
                        >
                            Publicar versión
                        </CelumaButton>
                    </div>
                }
            />

            {blockedReason ? (
                <Panel style={{ background: "#fffbeb", border: "2px solid #fde68a" }}>
                    <Text style={{ fontSize: 13, color: "#92400e" }}>{blockedReason}</Text>
                </Panel>
            ) : (
                <>
                    <Panel>
                        <Text style={{ fontSize: 13 }}>
                            Esta versión usará el membrete <strong>{resolvedLetterheadName}</strong> (predeterminado
                            del tenant). Para cambiar el membrete de esta plantilla, usa la sección
                            {" "}<strong>Membrete predeterminado</strong> en la lista de plantillas, o administra
                            membretes en Configuración → Membretes.
                        </Text>
                    </Panel>
                    <Card style={{ ...cardStyle }} styles={{ body: { padding: 16 } }}>
                        <SectionTitle>Previsualización</SectionTitle>
                        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                            Usa datos sintéticos anonimizados — nunca información real de pacientes.
                        </Text>
                        <div style={{ maxHeight: "70vh", overflow: "auto", background: "#e5e7eb", padding: 16, borderRadius: tokens.radius }}>
                            {previewReport && <ReportRendererResolver report={previewReport} />}
                        </div>
                    </Card>
                </>
            )}
        </div>
    );

    const page = embedded ? (
        content
    ) : (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 1100, margin: "0 auto" }}>{content}</div>
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
                        Esta acción creará una <strong>nueva versión inmutable</strong> de la estructura clínica de
                        esta plantilla. Una vez publicada, no podrá editarse — para corregirla deberás publicar
                        otra versión nueva.
                    </Text>
                    <Divider style={{ margin: "4px 0" }} />
                    <Text style={{ fontSize: 13 }}>
                        Membrete: <strong>{resolvedLetterheadName}</strong> (predeterminado del tenant al momento
                        de publicar).
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
