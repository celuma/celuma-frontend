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
 * Administration of shared tenant-owned letterheads — post-Phase 2
 * remediation ("Configuration → Letterheads"). A letterhead is a shared
 * resource reusable across clinical templates; this screen never edits
 * clinical structure. See report-letterhead-domain-contract.md.
 */
function ReportLetterheads({ embedded = false }: ReportLetterheadsProps) {
    const navigate = useNavigate();
    const { hasPermission } = useUserProfile();
    const canManage = hasPermission(PERMS.MANAGE_TEMPLATES);

    const [loading, setLoading] = useState(false);
    const [letterheads, setLetterheads] = useState<ReportLetterheadSummary[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);

    // "New letterhead": captures only the minimum name, then creates the
    // identity and immediately redirects to the visual editor—second
    // post-Phase 2 remediation (UX). It never leaves the user stranded in
    // the list searching manually for the edit button.
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [saving, setSaving] = useState(false);

    // "Rename": lightweight name/description editing only—lives in the
    // secondary menu, separate from the visual editor.
    const [renamingLetterhead, setRenamingLetterhead] = useState<ReportLetterheadSummary | null>(null);
    const [renameName, setRenameName] = useState("");
    const [renameDescription, setRenameDescription] = useState("");
    const [renaming, setRenaming] = useState(false);

    // Delete/deactivate confirmations — see `confirmHardDelete`.
    const [confirmingDelete, setConfirmingDelete] = useState<ReportLetterheadSummary | null>(null);
    const [confirmingDeactivate, setConfirmingDeactivate] = useState<ReportLetterheadSummary | null>(null);

    const [importing, setImporting] = useState(false);
    const [exportingLegacy, setExportingLegacy] = useState(false);
    const [exportingId, setExportingId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            // Third remediation: the administration screen lists ALL
            // letterheads, including deactivated ones—otherwise "Deactivate"
            // would make them disappear and "Reactivate" would be unreachable.
            // A deactivated letterhead only stops appearing in new-report
            // selections (that selector still requests active ones only).
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

    // Creates the ReportLetterhead identity and immediately redirects to the
    // visual editor—the first "Save" there creates and activates version 1.
    const handleCreateAndEdit = async () => {
        if (!formName.trim()) {
            message.error("El nombre es obligatorio");
            return;
        }
        setSaving(true);
        try {
            // Fourth remediation (Observation 2): `formDescription ||
            // undefined` omitted the field when empty. Send explicit `null`:
            // a "letterhead without a description" is a valid state, not a
            // field left to fill in.
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
            // Fourth remediation (Observation 2): the previous `|| undefined`
            // made clearing an existing description impossible—the field was
            // not sent and the backend retained the old text.
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
     * Third post-Phase 2 remediation—safe deletion policy (see
     * letterhead-delete-deactivate-contract.md). "Delete" actually deletes
     * and is offered only when the backend has confirmed it is safe
     * (`can_hard_delete`); "Deactivate" is the path when history must be
     * preserved. Previously, there was one "Delete" action that actually
     * deactivated: the user requested deletion, the letterhead remained, and
     * nothing explained why.
     *
     * The confirmation uses `CelumaModal` (a normal React component), not
     * antd's `Modal.confirm`: antd v5's static API relies on legacy
     * `ReactDOM.render`, which mounts nothing in this project's React 19.
     * The dialog did not appear and clicking "Delete" did nothing, explaining
     * the "the UI does not allow deleting letterheads" symptom even with the
     * endpoint available. See the console warning "[antd: compatible] antd
     * v5 support React is 16 ~ 18".
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

    // Post-Phase 2 remediation, R12/R13. Third remediation: the imported
    // letterhead arrives with its configuration already active (visible and
    // editable immediately), but NEVER as the tenant default—that remains an
    // explicit administrator decision.
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
                // Third remediation: offer only actions that are actually
                // valid for THIS letterhead. The backend precomputes
                // `can_hard_delete` and `has_active_version` with the same
                // rules it would apply when executing them, so the menu and
                // result cannot disagree.
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
                            // A letterhead without saved configuration cannot
                            // be resolved and therefore cannot be the default;
                            // the backend rejects it with 409.
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
                        {/* The trigger is wrapped in a <span>: CelumaButton is
                            a function component without forwardRef, and antd
                            Dropdown needs a real node to attach to. */}
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
            {/* Second post-Phase 2 remediation (UX): captures only the minimum
                name—saving creates the identity and immediately redirects to
                the visual editor (never leaving the user stranded in the list). */}
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

            {/* PHYSICAL deletion confirmation—reachable only when the backend
                marked `can_hard_delete`. */}
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

            {/* Deactivation confirmation—the path when history must be
                preserved; explains what prevents deletion. */}
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

            {/* "Rename"—lightweight name/description editing, separate from
                the visual presentation editor. */}
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
