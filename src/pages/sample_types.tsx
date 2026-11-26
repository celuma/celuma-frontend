import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Layout, Card, Button, message, Space, Switch } from "antd";
import { EditOutlined, DeleteOutlined, StopOutlined } from "@ant-design/icons";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useLocation } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import { CelumaTable } from "../components/ui/table";
import CelumaButton from "../components/ui/button";
import CelumaModal from "../components/ui/celuma_modal";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import CelumaTextArea from "../components/ui/textarea_field";
import Panel from "../components/ui/panel";
import ModalFormFooter from "../components/ui/modal_form_footer";
import { renderCatalogStateChip, catalogStateFilter, renderDateCell } from "../components/ui/table_helpers";
import CelumaSwitch from "../components/ui/celuma_switch";
import RemoveCatalogTypeDialog from "../components/catalog/remove_catalog_type_dialog";
// #94: antd's static `message` does not render under React 19 here; these context-aware toasts do.
import { showCelumaApiError, showCelumaSuccess } from "../lib/celuma_feedback";
import { matchesQuery } from "../lib/search";
import type { ColumnsType } from "antd/es/table";
import { getErrorMessage } from "../lib/api_error";
import CatalogTransferModal from "../components/catalog/catalog_transfer_modal";
import {
    createSampleType,
    deactivateSampleType,
    exportCatalog,
    listSampleTypes,
    saveDownload,
    updateSampleType,
} from "../services/sample_type_service";
import type { SampleType } from "../models/sample_type";
import { getReportTemplates } from "../services/report_service";
import { useUserProfile } from "../hooks/use_user_profile";
import TypeNumberingSection from "../components/numbering/type_numbering_section";
import ConfirmDialog from "../components/ui/confirm_dialog";

const captionLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: tokens.primary, marginBottom: 6 };

const sampleTypeSchema = z.object({
    code: z.string().trim().nonempty("El código es requerido.").max(50, "Máximo 50 caracteres"),
    name: z.string().trim().nonempty("El nombre es requerido.").max(255, "Máximo 255 caracteres"),
    description: z.string().trim().max(2000, "Máximo 2000 caracteres").optional(),
    is_active: z.boolean().optional(),
    // Céluma 1.4.1: optional; orders with samples of this type get it suggested as their report template.
    default_report_template_id: z.string().optional(),
});

type SampleTypeFormData = z.infer<typeof sampleTypeSchema>;

interface SampleTypesProps {
    embedded?: boolean;
}

/**
 * Sample-type catalog administration (Céluma 1.4, issue #17), following the
 * study-type administration pattern: list (active and inactive), create,
 * edit, deactivate — plus the catalog's JSON export and the JSON import that
 * can bring in an exported study-type (or sample-type) catalog.
 *
 * Reached from Configuración → Tipos de Muestra, which is gated on
 * `admin:manage_catalog` — the permission every write, export and import
 * endpoint enforces.
 */
function SampleTypes({ embedded = false }: SampleTypesProps) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [sampleTypes, setSampleTypes] = useState<SampleType[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
    // Céluma 1.5 (#64): the Numeración section of the editor has its own save boundary. The page is gated on
    // `admin:manage_catalog`; the section still asks, and the API enforces it on every write.
    const { hasPermission } = useUserProfile();
    const canManageCatalog = hasPermission("admin:manage_catalog");
    const [numberingDirty, setNumberingDirty] = useState(false);
    const [confirmDropNumbering, setConfirmDropNumbering] = useState(false);
    const [startNumbering, setStartNumbering] = useState(false);
    const configureAfterCreate = useRef(false);
    // Céluma 1.5 (#94): deactivation and removal are two different, separately confirmed actions.
    const [deactivating, setDeactivating] = useState<SampleType | null>(null);
    const [deactivateBusy, setDeactivateBusy] = useState(false);
    const [removing, setRemoving] = useState<SampleType | null>(null);
    const [showRemoved, setShowRemoved] = useState(false);
    // Read by the loader without making it depend on state (it also runs from the mount effect).
    const showRemovedRef = useRef(false);

    const { control, handleSubmit, reset } = useForm<SampleTypeFormData>({
        resolver: zodResolver(sampleTypeSchema),
        defaultValues: { code: "", name: "", description: "", is_active: true, default_report_template_id: "" },
        mode: "onTouched",
    });

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        setNumberingDirty(false);
        setStartNumbering(false);
        reset();
    };

    const load = async (withRemoved = showRemovedRef.current) => {
        setLoading(true);
        try {
            setSampleTypes(await listSampleTypes(false, withRemoved));
        } catch {
            message.error("Error al cargar tipos de muestra");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // Active templates only: a deactivated one cannot be suggested for new reports anyway.
        getReportTemplates(true)
            .then(({ templates: rows }) => setTemplates((rows ?? []).map((t) => ({ id: t.id, name: t.name }))))
            .catch(() => message.error("No se pudieron cargar las plantillas de reporte"));
    }, []);

    const handleCreate = () => {
        setEditingId(null);
        reset({ code: "", name: "", description: "", is_active: true, default_report_template_id: "" });
        setModalVisible(true);
    };

    const handleEdit = (record: SampleType) => {
        setEditingId(record.id);
        reset({
            code: record.code,
            name: record.name,
            description: record.description || "",
            is_active: record.is_active,
            default_report_template_id: record.default_report_template_id || "",
        });
        setModalVisible(true);
    };

    const handleSave = handleSubmit(async (data) => {
        // #64: «Guardar cambios» never saves the numbering section; say so before its edits are dropped.
        if (numberingDirty && !confirmDropNumbering) {
            setConfirmDropNumbering(true);
            return;
        }
        setConfirmDropNumbering(false);
        setSubmitting(true);
        try {
            const payload = {
                code: data.code,
                name: data.name,
                // null, not undefined: JSON drops undefined, and an omitted description means
                // "unchanged" to the API, so a cleared field would silently keep the old text.
                description: data.description?.trim() ? data.description : null,
                is_active: data.is_active ?? true,
                // Same rule: `null` clears the link (omitting it would keep the old template).
                default_report_template_id: data.default_report_template_id || null,
            };
            if (editingId) {
                await updateSampleType(editingId, payload);
                message.success("Tipo de muestra actualizado");
            } else {
                const created = await createSampleType(payload);
                message.success("Tipo de muestra creado");
                if (configureAfterCreate.current && created?.id) {
                    // #64: stay in the editor of the new type, with its numbering editor open.
                    configureAfterCreate.current = false;
                    setEditingId(created.id);
                    setStartNumbering(true);
                    reset({ ...data, description: data.description || "", is_active: data.is_active ?? true });
                    load();
                    return;
                }
            }
            closeModal();
            load();
        } catch (err) {
            configureAfterCreate.current = false;
            showCelumaApiError(err, "Error al guardar tipo de muestra");
        } finally {
            setSubmitting(false);
        }
    });

    const handleDeactivate = async () => {
        if (!deactivating) return;
        setDeactivateBusy(true);
        try {
            await deactivateSampleType(deactivating.id);
            showCelumaSuccess("Tipo de muestra desactivado", "Sigue en el catálogo; puedes reactivarlo desde «Editar».");
            setDeactivating(null);
            load();
        } catch (err) {
            showCelumaApiError(err, "No se pudo desactivar el tipo de muestra.");
        } finally {
            setDeactivateBusy(false);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            saveDownload(await exportCatalog("sample_types"));
        } catch (err) {
            message.error(getErrorMessage(err));
        } finally {
            setExporting(false);
        }
    };

    const columns: ColumnsType<SampleType> = [
        {
            title: "Código",
            dataIndex: "code",
            key: "code",
            width: 150,
            sorter: (a, b) => a.code.localeCompare(b.code),
            defaultSortOrder: "ascend",
            render: (code: string) => <span style={{ fontWeight: 600, color: tokens.primary }}>{code}</span>,
        },
        {
            title: "Nombre",
            dataIndex: "name",
            key: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
        },
        {
            title: "Descripción",
            dataIndex: "description",
            key: "description",
            ellipsis: true,
            render: (text) => text || <span style={{ color: "#888" }}>—</span>,
        },
        {
            title: "Plantilla de reporte",
            key: "default_template",
            ellipsis: true,
            render: (_, record) => record.default_template?.name || <span style={{ color: "#888" }}>—</span>,
        },
        {
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            width: 110,
            ...catalogStateFilter<SampleType>(),
            render: (_: boolean, record: SampleType) => renderCatalogStateChip(record),
        },
        {
            title: "Fecha de creación",
            dataIndex: "created_at",
            key: "created_at",
            width: 150,
            sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            render: (date: string) => renderDateCell(date),
        },
        {
            title: "Acciones",
            key: "actions",
            width: 140,
            render: (_, record) => record.is_removed ? (
                <span style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={`code-state-${record.code}`}>
                    {record.code_released ? "Código liberado para otro tipo" : "Código reservado por su historial"}
                </span>
            ) : (
                <Space>
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small"
                        title="Editar" aria-label={`Editar ${record.name}`} />
                    {record.is_active && (
                        <Button type="text" icon={<StopOutlined />} onClick={() => setDeactivating(record)} size="small"
                            title="Desactivar" aria-label={`Desactivar ${record.name}`} data-testid={`deactivate-${record.code}`} />
                    )}
                    {canManageCatalog && (
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setRemoving(record)} size="small"
                            title="Eliminar del catálogo" aria-label={`Eliminar ${record.name} del catálogo`} data-testid={`remove-${record.code}`} />
                    )}
                </Space>
            ),
        },
    ];

    const content = (
        <>
            <div style={{ display: "grid", gap: tokens.gap }}>
                <PageHeader
                    title="Tipos de Muestra"
                    subtitle="Catálogo de tipos de muestra del laboratorio. Toda muestra nueva requiere un tipo activo."
                    extra={
                        <Space wrap>
                            <CelumaButton onClick={handleExport} loading={exporting}>Exportar JSON</CelumaButton>
                            <CelumaButton onClick={() => setImportOpen(true)}>Importar JSON</CelumaButton>
                            <CelumaButton type="primary" onClick={handleCreate}>Nuevo Tipo de Muestra</CelumaButton>
                        </Space>
                    }
                />
                <Card style={cardStyle}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: tokens.textSecondary, marginBottom: 12 }}>
                        <CelumaSwitch
                            size="small" checked={showRemoved} aria-label="Mostrar tipos eliminados" data-testid="show-removed-sample-types"
                            onChange={(checked) => { showRemovedRef.current = checked; setShowRemoved(checked); void load(checked); }}
                        />
                        Mostrar eliminados (solo consulta)
                    </label>
                    <CelumaTable
                        columns={columns}
                        dataSource={sampleTypes}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                        emptyText="Sin tipos de muestra. Crea uno o impórtalo desde un archivo JSON de tipos de estudio."
                        searchable
                        searchPlaceholder="Buscar tipos de muestra"
                        searchFilter={(r, q) => matchesQuery([r.code, r.name, r.description], q)}
                    />
                </Card>
            </div>
            <CelumaModal
                title={editingId ? "Editar Tipo de Muestra" : "Nuevo Tipo de Muestra"}
                open={modalVisible}
                onCancel={closeModal}
                footer={null}
                width={600}
                destroyOnHidden
            >
                <form onSubmit={handleSave} noValidate style={{ display: "grid", gap: 18 }}>
                    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
                        <FormField control={control} name="code" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Código" requiredMark maxLength={50} />} />
                        <FormField control={control} name="name" render={(p) => <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Nombre" requiredMark maxLength={255} />} />
                    </div>
                    <FormField
                        control={control}
                        name="description"
                        render={(p) => (
                            <div>
                                <div style={captionLabelStyle}>Descripción</div>
                                <CelumaTextArea value={String(p.value ?? "")} onChange={(v) => p.onChange(v)} rows={3} maxLength={2000} error={p.error} placeholder="Descripción opcional del tipo de muestra" />
                            </div>
                        )}
                    />
                    <FormField
                        control={control}
                        name="default_report_template_id"
                        render={(p) => {
                            const current = typeof p.value === "string" && p.value ? p.value : undefined;
                            const record = sampleTypes.find((t) => t.id === editingId);
                            // A linked template that is no longer active still shows by name until changed.
                            const options = templates.map((t) => ({ value: t.id, label: t.name }));
                            if (current && !templates.some((t) => t.id === current) && record?.default_template?.id === current) {
                                options.push({ value: current, label: `${record.default_template.name} (desactivada)` });
                            }
                            return (
                                <div style={{ display: "grid", gap: 6 }}>
                                    <FloatingCaptionSelect
                                        label="Plantilla de reporte (opcional)"
                                        value={current}
                                        onChange={(v) => p.onChange(v ?? "")}
                                        placeholder="Sin plantilla"
                                        options={options}
                                        showSearch
                                        allowClear
                                        error={p.error}
                                        data-testid="sample-type-template-select"
                                    />
                                    <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                                        Se sugiere al registrar órdenes con muestras de este tipo; quien registra puede elegir otra. Cambiarla no modifica reportes ya creados.
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <FormField
                        control={control}
                        name="is_active"
                        render={(p) => {
                            const active = p.value !== false;
                            return (
                                <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>Estado</div>
                                        <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>Define si se puede elegir para muestras nuevas. Las muestras existentes lo conservan.</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: active ? tokens.primary : tokens.textSecondary }}>{active ? "Activo" : "Inactivo"}</span>
                                        <Switch checked={active} onChange={(checked) => p.onChange(checked)} />
                                    </div>
                                </Panel>
                            );
                        }}
                    />
                    <Panel style={{ background: "#fff" }} data-testid="sample-type-numbering-panel">
                        <TypeNumberingSection
                            key={editingId ?? "new"}
                            kind="sample"
                            typeId={editingId}
                            typeCode={sampleTypes.find((t) => t.id === editingId)?.code ?? ""}
                            typeName={sampleTypes.find((t) => t.id === editingId)?.name}
                            canManage={canManageCatalog}
                            onDirtyChange={setNumberingDirty}
                            startEditing={startNumbering}
                            onCreateAndConfigure={() => { configureAfterCreate.current = true; void handleSave(); }}
                            creating={submitting}
                            testId="sample-type-numbering"
                        />
                    </Panel>
                    <ModalFormFooter onCancel={closeModal} submitLabel={editingId ? "Guardar cambios" : "Crear"} loading={submitting} />
                </form>
            </CelumaModal>
            <ConfirmDialog
                open={confirmDropNumbering}
                title="Hay cambios de numeración sin guardar"
                description="«Guardar cambios» guarda los datos del tipo, no su numeración. Si continúas, los cambios de numeración se descartan."
                confirmText="Guardar sin la numeración"
                cancelText="Volver"
                onCancel={() => setConfirmDropNumbering(false)}
                onConfirm={() => { setNumberingDirty(false); void handleSave(); }}
            />
            <ConfirmDialog
                open={deactivating !== null}
                title={`¿Desactivar «${deactivating?.name ?? ""}»?`}
                description="Deja de poder elegirse para muestras nuevas, pero sigue en el catálogo y puedes reactivarlo cuando quieras desde «Editar»."
                confirmText="Desactivar"
                cancelText="Cancelar"
                loading={deactivateBusy}
                onCancel={() => setDeactivating(null)}
                onConfirm={() => void handleDeactivate()}
            >
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: tokens.textSecondary }}>
                    <li>Las muestras existentes lo conservan y lo muestran como inactivo.</li>
                    <li>Para quitarlo del catálogo de forma definitiva usa «Eliminar del catálogo».</li>
                </ul>
            </ConfirmDialog>
            <RemoveCatalogTypeDialog
                kind="sample_types"
                target={removing}
                onCancel={() => setRemoving(null)}
                onRemoved={(result) => {
                    setRemoving(null);
                    showCelumaSuccess(result.already_removed
                        ? "El tipo de muestra ya estaba eliminado del catálogo"
                        : "Tipo de muestra eliminado del catálogo",
                        result.code_released
                            ? `No tenía muestras: el código «${result.code}» queda libre para otro tipo de muestra.`
                            : `Sus muestras lo conservan; el código «${result.code}» sigue reservado.`);
                    load();
                }}
            />
            <CatalogTransferModal
                open={importOpen}
                source={{ mode: "import" }}
                onClose={() => setImportOpen(false)}
                onDone={() => load()}
            />
        </>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/config/sample-types"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default SampleTypes;
