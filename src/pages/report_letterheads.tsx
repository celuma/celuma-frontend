import { useEffect, useState } from "react";
import { Layout, Card, message, Typography, Tag, Upload, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import {
    EditOutlined, DeleteOutlined, CopyOutlined, HistoryOutlined,
    StarOutlined, StarFilled, PlusOutlined, UploadOutlined, DownloadOutlined, MoreOutlined,
    StopOutlined, UndoOutlined,
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
    exportReportLetterheadVersion,
    getActiveReportLetterheadVersion,
} from "../services/report_letterhead_service";
import type { ReportLetterheadSummary } from "../models/report_letterhead";
import { normalizeLetterheadDescription } from "../models/report_letterhead";

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

    // "Nuevo membrete": captura solo el nombre mínimo, luego crea la
    // identidad y redirige de inmediato al editor visual — segunda
    // remediación post-Fase 2 (UX). Nunca deja al usuario "varado" en la
    // lista teniendo que buscar manualmente el botón de editar.
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [saving, setSaving] = useState(false);

    // "Renombrar": edición ligera de nombre/descripción únicamente — vive
    // en el menú secundario, separada del editor visual.
    const [renamingLetterhead, setRenamingLetterhead] = useState<ReportLetterheadSummary | null>(null);
    const [renameName, setRenameName] = useState("");
    const [renameDescription, setRenameDescription] = useState("");
    const [renaming, setRenaming] = useState(false);

    // Confirmaciones de eliminar/desactivar — ver `confirmHardDelete`.
    const [confirmingDelete, setConfirmingDelete] = useState<ReportLetterheadSummary | null>(null);
    const [confirmingDeactivate, setConfirmingDeactivate] = useState<ReportLetterheadSummary | null>(null);

    const [importing, setImporting] = useState(false);
    const [exportingLegacy, setExportingLegacy] = useState(false);
    const [exportingId, setExportingId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            // Tercera remediación: la pantalla de administración lista TODOS
            // los membretes, incluidos los desactivados — si no, "Desactivar"
            // los haría desaparecer y "Reactivar" sería inalcanzable. Lo que
            // un membrete desactivado sí deja de hacer es aparecer en las
            // selecciones de reportes nuevos (ese selector sigue pidiendo
            // solo los activos).
            const resp = await listReportLetterheads(false);
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
        setFormName("");
        setFormDescription("");
        setCreateModalOpen(true);
    };

    // Crea la identidad ReportLetterhead y redirige inmediatamente al
    // editor visual — el primer "Guardar" ahí crea+activa la versión 1.
    const handleCreateAndEdit = async () => {
        if (!formName.trim()) {
            message.error("El nombre es obligatorio");
            return;
        }
        setSaving(true);
        try {
            // Cuarta remediación (Observación 2): `formDescription ||
            // undefined` omitía el campo cuando estaba vacío. Se envía
            // `null` explícito — "membrete sin descripción" es un estado
            // válido, no un campo que falte por llenar.
            const created = await createReportLetterhead({
                name: formName.trim(),
                description: normalizeLetterheadDescription(formDescription),
            });
            setCreateModalOpen(false);
            navigate(`/config/report-letterheads/${created.id}/versions/new`);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al crear el membrete");
        } finally {
            setSaving(false);
        }
    };

    const openRenameModal = (letterhead: ReportLetterheadSummary) => {
        setRenamingLetterhead(letterhead);
        setRenameName(letterhead.name);
        setRenameDescription(letterhead.description ?? "");
    };

    const handleRename = async () => {
        if (!renamingLetterhead) return;
        if (!renameName.trim()) {
            message.error("El nombre es obligatorio");
            return;
        }
        setRenaming(true);
        try {
            // Cuarta remediación (Observación 2): el `|| undefined` de antes
            // hacía imposible limpiar una descripción existente — el campo
            // no viajaba y el backend conservaba el texto anterior.
            await updateReportLetterhead(renamingLetterhead.id, {
                name: renameName.trim(),
                description: normalizeLetterheadDescription(renameDescription),
            });
            message.success("Membrete actualizado");
            setRenamingLetterhead(null);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al actualizar el membrete");
        } finally {
            setRenaming(false);
        }
    };

    /**
     * Tercera remediación post-Fase 2 — política de eliminación segura (ver
     * letterhead-delete-deactivate-contract.md). "Eliminar" borra de verdad
     * y solo se ofrece cuando el backend ya dijo que es seguro
     * (`can_hard_delete`); "Desactivar" es la vía cuando hay historial que
     * conservar. Antes había una sola acción "Eliminar" que en realidad
     * desactivaba: el usuario pedía borrar, el membrete seguía ahí y nada
     * explicaba por qué.
     *
     * La confirmación usa `CelumaModal` (un componente React normal) y no
     * `Modal.confirm` de antd: la API estática de antd v5 se apoya en el
     * `ReactDOM.render` heredado, que en React 19 —la versión de este
     * proyecto— no monta nada. El diálogo simplemente no aparecía y el clic
     * en "Eliminar" no hacía absolutamente nada, lo que explica el síntoma
     * "la UI no permite eliminar membretes" incluso con el endpoint
     * disponible. Ver la advertencia "[antd: compatible] antd v5 support
     * React is 16 ~ 18" en consola.
     */
    const confirmHardDelete = async () => {
        if (!confirmingDelete) return;
        setBusyId(confirmingDelete.id);
        try {
            await deleteReportLetterhead(confirmingDelete.id, true);
            message.success("Membrete eliminado");
            setConfirmingDelete(null);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al eliminar el membrete");
        } finally {
            setBusyId(null);
        }
    };

    const confirmDeactivate = async () => {
        if (!confirmingDeactivate) return;
        setBusyId(confirmingDeactivate.id);
        try {
            await deleteReportLetterhead(confirmingDeactivate.id, false);
            message.success("Membrete desactivado");
            setConfirmingDeactivate(null);
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al desactivar el membrete");
        } finally {
            setBusyId(null);
        }
    };

    const handleReactivate = async (letterhead: ReportLetterheadSummary) => {
        setBusyId(letterhead.id);
        try {
            await updateReportLetterhead(letterhead.id, { is_active: true });
            message.success("Membrete reactivado");
            await load();
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al reactivar el membrete");
        } finally {
            setBusyId(null);
        }
    };

    const handleExportActive = async (letterhead: ReportLetterheadSummary) => {
        setExportingId(letterhead.id);
        try {
            const active = await getActiveReportLetterheadVersion(letterhead.id);
            if (!active) {
                message.warning("Este membrete todavía no tiene ninguna versión guardada.");
                return;
            }
            await exportReportLetterheadVersion(
                letterhead.id,
                active.id,
                `${letterhead.name.replace(/\s+/g, "-")}-v${active.version_number}.cell`
            );
        } catch (err) {
            message.error(err instanceof Error ? err.message : "Error al exportar el membrete");
        } finally {
            setExportingId(null);
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

    // Post-Fase-2 remediation, R12/R13. Tercera remediación: el membrete
    // importado llega con su configuración ya activa (visible y editable de
    // inmediato), pero NUNCA como predeterminado del tenant — eso sigue
    // siendo una decisión explícita del administrador.
    const handleImport = async (file: File) => {
        setImporting(true);
        try {
            await importReportLetterhead(file);
            message.success(
                "Membrete importado. Ábrelo para revisarlo; márcalo como predeterminado cuando quieras usarlo."
            );
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
            render: (_: unknown, record) => {
                // Tercera remediación: solo se ofrecen las acciones que de
                // verdad son válidas para ESTE membrete. `can_hard_delete` y
                // `has_active_version` los precalcula el backend con las
                // mismas reglas que aplicaría al ejecutarlas, así que el menú
                // y el resultado no pueden discrepar.
                const canHardDelete = record.can_hard_delete === true;
                const menuItems: MenuProps["items"] = [
                    {
                        key: "history",
                        icon: <HistoryOutlined />,
                        label: "Ver historial",
                        onClick: () => navigate(`/config/report-letterheads/${record.id}/versions`),
                    },
                    ...(!record.is_default && record.is_active
                        ? [{
                            key: "default",
                            icon: <StarOutlined />,
                            label: "Marcar como predeterminado",
                            // Un membrete sin configuración guardada no puede
                            // resolverse, así que tampoco puede ser el
                            // predeterminado — el backend lo rechaza con 409.
                            disabled: !canManage || record.has_active_version === false,
                            onClick: () => handleSetDefault(record),
                        }]
                        : []),
                    {
                        key: "rename",
                        icon: <EditOutlined />,
                        label: "Renombrar",
                        disabled: !canManage,
                        onClick: () => openRenameModal(record),
                    },
                    { type: "divider" },
                    ...(record.is_active
                        ? [{
                            key: "deactivate",
                            icon: <StopOutlined />,
                            label: "Desactivar",
                            disabled: !canManage || record.is_default,
                            onClick: () => setConfirmingDeactivate(record),
                        }]
                        : [{
                            key: "reactivate",
                            icon: <UndoOutlined />,
                            label: "Reactivar",
                            disabled: !canManage,
                            onClick: () => handleReactivate(record),
                        }]),
                    ...(canHardDelete
                        ? [{
                            key: "delete",
                            icon: <DeleteOutlined />,
                            label: "Eliminar",
                            danger: true,
                            disabled: !canManage,
                            onClick: () => setConfirmingDelete(record),
                        }]
                        : []),
                ];
                return (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {record.is_default && (
                            <Tooltip title="Este es el membrete predeterminado del laboratorio">
                                <StarFilled style={{ color: "#eab308", fontSize: 16 }} />
                            </Tooltip>
                        )}
                        <Tooltip title="Editar">
                            <CelumaButton
                                size="xsmall"
                                icon={<EditOutlined />}
                                disabled={!canManage}
                                onClick={() => navigate(`/config/report-letterheads/${record.id}/versions/new`)}
                            >
                                Editar
                            </CelumaButton>
                        </Tooltip>
                        <Tooltip title="Duplicar">
                            <CelumaButton
                                size="xsmall"
                                icon={<CopyOutlined />}
                                disabled={!canManage}
                                loading={busyId === record.id}
                                onClick={() => handleDuplicate(record)}
                            />
                        </Tooltip>
                        <Tooltip title="Exportar (.cell)">
                            <CelumaButton
                                size="xsmall"
                                icon={<DownloadOutlined />}
                                loading={exportingId === record.id}
                                onClick={() => handleExportActive(record)}
                            />
                        </Tooltip>
                        {/* El disparador va envuelto en un <span>: CelumaButton
                            es un componente de función sin forwardRef, y antd
                            Dropdown necesita un nodo real al que engancharse. */}
                        <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
                            <span>
                                <CelumaButton size="xsmall" icon={<MoreOutlined />} aria-label="Más acciones" />
                            </span>
                        </Dropdown>
                    </div>
                );
            },
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
                            accept=".cell,.clm,.celuma,application/json"
                            showUploadList={false}
                            disabled={!canManage || importing}
                            beforeUpload={(file) => handleImport(file)}
                        >
                            <CelumaButton icon={<UploadOutlined />} loading={importing} disabled={!canManage}>
                                Importar .cell
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
            {/* Segunda remediación post-Fase 2 (UX): captura solo el nombre
                mínimo — al guardar crea la identidad y redirige de
                inmediato al editor visual (nunca deja al usuario "varado"
                en la lista). */}
            <CelumaModal
                title="Nuevo membrete"
                open={createModalOpen}
                onCancel={() => setCreateModalOpen(false)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setCreateModalOpen(false)}>Cancelar</CelumaButton>
                        <CelumaButton size="xsmall" type="primary" loading={saving} onClick={handleCreateAndEdit}>
                            Crear y continuar
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

            {/* Confirmación de borrado FÍSICO — solo alcanzable cuando el
                backend marcó `can_hard_delete`. */}
            <CelumaModal
                title="Eliminar membrete"
                open={confirmingDelete !== null}
                onCancel={() => setConfirmingDelete(null)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setConfirmingDelete(null)}>Cancelar</CelumaButton>
                        <CelumaButton
                            size="xsmall"
                            type="primary"
                            danger
                            loading={busyId === confirmingDelete?.id}
                            onClick={confirmHardDelete}
                        >
                            Sí, eliminar
                        </CelumaButton>
                    </div>
                }
            >
                <Text>
                    «{confirmingDelete?.name}» se borrará junto con todo su historial de
                    configuraciones. Esta acción no se puede deshacer.
                </Text>
            </CelumaModal>

            {/* Confirmación de desactivación — la vía cuando hay historial
                que conservar; explica qué impide eliminarlo. */}
            <CelumaModal
                title="Desactivar membrete"
                open={confirmingDeactivate !== null}
                onCancel={() => setConfirmingDeactivate(null)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setConfirmingDeactivate(null)}>Cancelar</CelumaButton>
                        <CelumaButton
                            size="xsmall"
                            type="primary"
                            loading={busyId === confirmingDeactivate?.id}
                            onClick={confirmDeactivate}
                        >
                            Sí, desactivar
                        </CelumaButton>
                    </div>
                }
            >
                <div style={{ display: "grid", gap: 8 }}>
                    {!!confirmingDeactivate?.blocking_references?.length && (
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            No puede eliminarse porque {confirmingDeactivate.blocking_references.join("; ")}.
                        </Text>
                    )}
                    <Text>
                        «{confirmingDeactivate?.name}» dejará de ofrecerse para reportes nuevos, pero se
                        conserva su historial y los reportes ya creados con él no cambian.
                    </Text>
                </div>
            </CelumaModal>

            {/* "Renombrar" — edición ligera de nombre/descripción, separada
                del editor visual de presentación. */}
            <CelumaModal
                title="Renombrar membrete"
                open={renamingLetterhead !== null}
                onCancel={() => setRenamingLetterhead(null)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setRenamingLetterhead(null)}>Cancelar</CelumaButton>
                        <CelumaButton size="xsmall" type="primary" loading={renaming} onClick={handleRename}>
                            Guardar
                        </CelumaButton>
                    </div>
                }
            >
                <div style={{ display: "grid", gap: 12 }}>
                    <FloatingCaptionInput
                        label="Nombre"
                        maxLength={255}
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                    />
                    <CelumaTextArea
                        value={renameDescription}
                        onChange={setRenameDescription}
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
