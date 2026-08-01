import { useEffect, useState } from "react";
import { Layout, Card, message, Popconfirm, Typography, Tag, Upload } from "antd";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import {
    AppstoreOutlined, EditOutlined, DeleteOutlined, CopyOutlined,
    StarOutlined, StarFilled, PlusOutlined, UploadOutlined, DownloadOutlined,
} from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import CelumaModal from "../components/ui/celuma_modal";
import { CelumaTable } from "../components/ui/table";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import CelumaTextArea from "../components/ui/textarea_field";
import Tooltip from "../components/ui/tooltip";
import { renderActiveChip } from "../components/ui/table_helpers";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import {
    listReportLetterheads,
    createReportLetterhead,
    updateReportLetterhead,
    deleteReportLetterhead,
    duplicateReportLetterhead,
    setDefaultReportLetterhead,
    importReportLetterhead,
    exportLegacyLetterhead,
} from "../services/report_letterhead_service";
import type { ReportLetterheadSummary } from "../models/report_letterhead";

const { Text } = Typography;

interface ReportLetterheadsProps {
    embedded?: boolean;
}

/**
 * Administración de membretes compartidos del tenant — post-Fase-2
 * remediation ("Configuración → Membretes"). Un membrete es un recurso
 * compartido reutilizable entre plantillas clínicas; esta pantalla nunca
 * edita estructura clínica. Ver report-letterhead-domain-contract.md.
 */
function ReportLetterheads({ embedded = false }: ReportLetterheadsProps) {
    const navigate = useNavigate();
    const { hasPermission } = useUserProfile();
    const canManage = hasPermission(PERMS.MANAGE_TEMPLATES);

    const [loading, setLoading] = useState(false);
    const [letterheads, setLetterheads] = useState<ReportLetterheadSummary[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exportingLegacy, setExportingLegacy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const resp = await listReportLetterheads();
            setLetterheads(resp.letterheads);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al cargar los membretes");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const openCreateModal = () => {
        setEditingId(null);
        setFormName("");
        setFormDescription("");
        setModalOpen(true);
    };

    const openEditModal = (letterhead: ReportLetterheadSummary) => {
        setEditingId(letterhead.id);
        setFormName(letterhead.name);
        setFormDescription(letterhead.description ?? "");
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!formName.trim()) {
            message.error("El nombre es obligatorio");
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                await updateReportLetterhead(editingId, { name: formName, description: formDescription || undefined });
                message.success("Membrete actualizado");
            } else {
                await createReportLetterhead({ name: formName, description: formDescription || undefined });
                message.success("Membrete creado");
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al guardar el membrete");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (letterhead: ReportLetterheadSummary) => {
        setBusyId(letterhead.id);
        try {
            await deleteReportLetterhead(letterhead.id);
            message.success("Membrete desactivado");
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al eliminar el membrete");
        } finally {
            setBusyId(null);
        }
    };

    const handleDuplicate = async (letterhead: ReportLetterheadSummary) => {
        setBusyId(letterhead.id);
        try {
            await duplicateReportLetterhead(letterhead.id);
            message.success(`"${letterhead.name}" duplicado`);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al duplicar el membrete");
        } finally {
            setBusyId(null);
        }
    };

    const handleSetDefault = async (letterhead: ReportLetterheadSummary) => {
        setBusyId(letterhead.id);
        try {
            await setDefaultReportLetterhead(letterhead.id);
            message.success(`"${letterhead.name}" es ahora el membrete predeterminado del tenant`);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al marcar como predeterminado");
        } finally {
            setBusyId(null);
        }
    };

    // Post-Fase-2 remediation, R12/R13: import creates a new, unpublished-
    // to-default letterhead — the admin must still explicitly activate/
    // default it (never silently makes an imported membrete live).
    const handleImport = async (file: File) => {
        setImporting(true);
        try {
            await importReportLetterhead(file);
            message.success("Membrete importado. Revísalo en Versiones antes de activarlo.");
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al importar el membrete");
        } finally {
            setImporting(false);
        }
        return false; // prevent antd Upload's default upload behavior
    };

    const handleExportLegacy = async () => {
        setExportingLegacy(true);
        try {
            await exportLegacyLetterhead();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al exportar el membrete legado");
        } finally {
            setExportingLegacy(false);
        }
    };

    const columns: ColumnsType<ReportLetterheadSummary> = [
        {
            title: "Nombre",
            dataIndex: "name",
            key: "name",
            render: (name: string, record) => (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Text strong>{name}</Text>
                    {record.is_default && (
                        <Tag color="gold" style={{ margin: 0 }}>Predeterminado</Tag>
                    )}
                </div>
            ),
        },
        {
            title: "Descripción",
            dataIndex: "description",
            key: "description",
            render: (d: string | null) => d || <Text type="secondary">—</Text>,
        },
        {
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            render: (active: boolean) => renderActiveChip(active),
        },
        {
            title: "Acciones",
            key: "actions",
            render: (_: unknown, record) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Tooltip title="Versiones publicadas">
                        <CelumaButton
                            size="xsmall"
                            icon={<AppstoreOutlined />}
                            onClick={() => navigate(`/config/report-letterheads/${record.id}/versions`)}
                        >
                            Versiones
                        </CelumaButton>
                    </Tooltip>
                    {!record.is_default && (
                        <Tooltip title="Marcar como membrete predeterminado del tenant">
                            <CelumaButton
                                size="xsmall"
                                icon={<StarOutlined />}
                                disabled={!canManage}
                                loading={busyId === record.id}
                                onClick={() => handleSetDefault(record)}
                            >
                                Predeterminado
                            </CelumaButton>
                        </Tooltip>
                    )}
                    {record.is_default && (
                        <Tooltip title="Este es el membrete predeterminado del tenant">
                            <StarFilled style={{ color: "#eab308", fontSize: 16 }} />
                        </Tooltip>
                    )}
                    <Tooltip title="Duplicar">
                        <CelumaButton
                            size="xsmall"
                            icon={<CopyOutlined />}
                            disabled={!canManage}
                            loading={busyId === record.id}
                            onClick={() => handleDuplicate(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Editar nombre/descripción">
                        <CelumaButton
                            size="xsmall"
                            icon={<EditOutlined />}
                            disabled={!canManage}
                            onClick={() => openEditModal(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="¿Desactivar este membrete?"
                        description="Dejará de estar disponible para reportes nuevos. No afecta reportes ya creados."
                        onConfirm={() => handleDelete(record)}
                        okText="Sí"
                        cancelText="No"
                        disabled={!canManage}
                    >
                        <Tooltip title="Desactivar">
                            <CelumaButton size="xsmall" danger icon={<DeleteOutlined />} disabled={!canManage} />
                        </Tooltip>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <PageHeader
                title="Membretes"
                subtitle="Configuración visual de página (logo, encabezado, pie, márgenes, color, firmante institucional) compartida entre plantillas de reporte."
                extra={
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <CelumaButton
                            icon={<DownloadOutlined />}
                            loading={exportingLegacy}
                            onClick={handleExportLegacy}
                        >
                            Exportar membrete legado
                        </CelumaButton>
                        <Upload
                            accept=".celuma,application/json"
                            showUploadList={false}
                            disabled={!canManage || importing}
                            beforeUpload={(file) => handleImport(file)}
                        >
                            <CelumaButton icon={<UploadOutlined />} loading={importing} disabled={!canManage}>
                                Importar .celuma
                            </CelumaButton>
                        </Upload>
                        <CelumaButton type="primary" icon={<PlusOutlined />} disabled={!canManage} onClick={openCreateModal}>
                            Nuevo membrete
                        </CelumaButton>
                    </div>
                }
            />

            {!canManage && (
                <Tag color="warning" style={{ width: "fit-content" }}>
                    Solo lectura — se requiere el permiso reports:manage_templates para administrar membretes.
                </Tag>
            )}

            <Card style={cardStyle}>
                <CelumaTable
                    columns={columns}
                    dataSource={letterheads}
                    loading={loading}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    emptyText="Aún no hay membretes. Crea el primero para poder asociarlo a tus plantillas de reporte."
                    scroll={{ x: 760 }}
                />
            </Card>
        </div>
    );

    const page = embedded ? (
        content
    ) : (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>{content}</div>
            </Layout.Content>
        </Layout>
    );

    return (
        <>
            {page}
            <CelumaModal
                title={editingId ? "Editar membrete" : "Nuevo membrete"}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setModalOpen(false)}>Cancelar</CelumaButton>
                        <CelumaButton size="xsmall" type="primary" loading={saving} onClick={handleSave}>
                            Guardar
                        </CelumaButton>
                    </div>
                }
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <FloatingCaptionInput
                        label="Nombre"
                        maxLength={255}
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                    />
                    <CelumaTextArea
                        value={formDescription}
                        onChange={setFormDescription}
                        placeholder="Descripción (opcional)"
                        rows={3}
                        maxLength={500}
                    />
                </div>
            </CelumaModal>
        </>
    );
}

export default ReportLetterheads;
