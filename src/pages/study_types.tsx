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
import { getErrorMessage } from "../lib/api_error";
import { useUserProfile } from "../hooks/use_user_profile";
import CatalogTransferModal from "../components/catalog/catalog_transfer_modal";
import { exportCatalog, saveDownload } from "../services/sample_type_service";
import type { ColumnsType } from "antd/es/table";
import TypeNumberingSection from "../components/numbering/type_numbering_section";
import ConfirmDialog from "../components/ui/confirm_dialog";

const captionLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: tokens.primary, marginBottom: 6 };

const studyTypeSchema = z.object({
    code: z.string().trim().nonempty("El código es requerido.").max(50, "Máximo 50 caracteres"),
    name: z.string().trim().nonempty("El nombre es requerido.").max(255, "Máximo 255 caracteres"),
    description: z.string().trim().max(1000, "Máximo 1000 caracteres").optional(),
    default_report_template_id: z.string().optional(),
    is_active: z.boolean().optional(),
});

type StudyTypeFormData = z.infer<typeof studyTypeSchema>;


function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
}

async function postJSON<TRes>(path: string, body: unknown): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
    }
    return await res.json();
}

async function putJSON<TRes>(path: string, body: unknown): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
    }
    return await res.json();
}

async function deleteJSON(path: string): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "DELETE",
        headers,
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
    }
}

interface StudyType {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    default_report_template_id?: string;
    default_template?: {
        id: string;
        name: string;
    };
    /** Céluma 1.5 (#94): removed from the catalog; listed only with «Mostrar eliminados». */
    is_removed?: boolean;
    removed_at?: string | null;
    /** #94: the removal freed its code (no orders, withdrawn included). */
    code_released?: boolean;
}

interface StudyTypesListResponse {
    study_types: StudyType[];
}

interface ReportTemplate {
    id: string;
    name: string;
    is_active: boolean;
}

interface ReportTemplatesListResponse {
    templates: ReportTemplate[];
}

interface StudyTypesProps {
    embedded?: boolean;
}

function StudyTypes({ embedded = false }: StudyTypesProps) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [studyTypes, setStudyTypes] = useState<StudyType[]>([]);
    const [templates, setTemplates] = useState<ReportTemplate[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    // Catalog JSON export and "copy to sample types" (issue #17) need the same
    // permission the API enforces for them; the API remains the authority.
    const { hasPermission } = useUserProfile();
    const canManageCatalog = hasPermission("admin:manage_catalog");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyDone, setCopyDone] = useState(false);
    const [exporting, setExporting] = useState(false);
    // Céluma 1.5 (#64): the Numeración section of the editor has its own save boundary.
    const [numberingDirty, setNumberingDirty] = useState(false);
    const [confirmDropNumbering, setConfirmDropNumbering] = useState(false);
    const [startNumbering, setStartNumbering] = useState(false);
    const configureAfterCreate = useRef(false);
    // Céluma 1.5 (#94): deactivation and removal are two different, separately confirmed actions.
    const [deactivating, setDeactivating] = useState<StudyType | null>(null);
    const [deactivateBusy, setDeactivateBusy] = useState(false);
    const [removing, setRemoving] = useState<StudyType | null>(null);
    const [showRemoved, setShowRemoved] = useState(false);
    // Read by the loader without making it depend on state (it also runs from the mount effect).
    const showRemovedRef = useRef(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            saveDownload(await exportCatalog("study_types"));
        } catch (err) {
            message.error(getErrorMessage(err));
        } finally {
            setExporting(false);
        }
    };

    const { control, handleSubmit, reset } = useForm<StudyTypeFormData>({
        resolver: zodResolver(studyTypeSchema),
        defaultValues: { code: "", name: "", description: "", default_report_template_id: undefined, is_active: true },
        mode: "onTouched",
    });

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        setNumberingDirty(false);
        setStartNumbering(false);
        reset();
    };

    useEffect(() => {
        loadStudyTypes();
        loadTemplates();
    }, []);

    const loadStudyTypes = async (withRemoved = showRemovedRef.current) => {
        setLoading(true);
        try {
            const data = await getJSON<StudyTypesListResponse>(
                `/v1/study-types/?active_only=false${withRemoved ? "&include_removed=true" : ""}`);
            setStudyTypes(data.study_types);
            // A removed type cannot be copied: drop it from a pending selection.
            setSelectedIds((ids) => ids.filter((id) => data.study_types.some((t) => t.id === id && !t.is_removed)));
        } catch {
            message.error("Error al cargar tipos de estudio");
        } finally {
            setLoading(false);
        }
    };

    const loadTemplates = async () => {
        try {
            const data = await getJSON<ReportTemplatesListResponse>("/v1/reports/templates/?active_only=true");
            setTemplates(data.templates);
        } catch {
            // Silently fail - templates are optional
        }
    };

    const handleCreate = () => {
        setEditingId(null);
        reset({ code: "", name: "", description: "", default_report_template_id: undefined, is_active: true });
        setModalVisible(true);
    };

    const handleEdit = (record: StudyType) => {
        setEditingId(record.id);
        reset({
            code: record.code,
            name: record.name,
            description: record.description || "",
            is_active: record.is_active,
            default_report_template_id: record.default_report_template_id || undefined,
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
                description: data.description || undefined,
                // Céluma 1.4.1: optional and clearable. `null`, not undefined: JSON drops undefined, and an omitted
                // field means "unchanged" to the API, so an emptied selector would silently keep the template.
                default_report_template_id: data.default_report_template_id || null,
                is_active: data.is_active ?? true,
            };
            if (editingId) {
                await putJSON(`/v1/study-types/${editingId}`, payload);
                message.success("Tipo de estudio actualizado");
            } else {
                const created = await postJSON<StudyType>("/v1/study-types/", payload);
                message.success("Tipo de estudio creado");
                if (configureAfterCreate.current && created?.id) {
                    // #64: stay in the editor of the new type, with its numbering editor open.
                    configureAfterCreate.current = false;
                    setEditingId(created.id);
                    setStartNumbering(true);
                    reset({ ...data, description: data.description || "", is_active: data.is_active ?? true });
                    loadStudyTypes();
                    return;
                }
            }
            closeModal();
            loadStudyTypes();
        } catch (err) {
            configureAfterCreate.current = false;
            // #94: say why (e.g. a code reserved by a removed type) instead of a generic failure.
            showCelumaApiError(err, "Error al guardar tipo de estudio");
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    });

    // `DELETE` without `hard_delete` deactivates (the type stays in the catalog); it never removed anything,
    // so its confirmation used to be mislabelled «eliminado». Removal is `RemoveCatalogTypeDialog` (#94).
    const handleDeactivate = async () => {
        if (!deactivating) return;
        setDeactivateBusy(true);
        try {
            await deleteJSON(`/v1/study-types/${deactivating.id}`);
            showCelumaSuccess("Tipo de estudio desactivado", "Sigue en el catálogo; puedes reactivarlo desde «Editar».");
            setDeactivating(null);
            loadStudyTypes();
        } catch (err) {
            showCelumaApiError(err, "No se pudo desactivar el tipo de estudio.");
        } finally {
            setDeactivateBusy(false);
        }
    };

    const columns: ColumnsType<StudyType> = [
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
            title: "Plantilla por defecto",
            dataIndex: "default_template",
            key: "default_template",
            width: 200,
            render: (template?: { id: string; name: string }) => 
                template ? (
                    <div style={{
                        backgroundColor: "#eff6ff",
                        color: "#3b82f6",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "4px 10px",
                        display: "inline-block",
                    }}>
                        {template.name}
                    </div>
                ) : (
                    <span style={{ color: "#888", fontSize: 12 }}>—</span>
                ),
        },
        {
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            width: 110,
            ...catalogStateFilter<StudyType>(),
            render: (_: boolean, record: StudyType) => renderCatalogStateChip(record),
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
                    title="Tipos de Estudio"
                    subtitle="Configura los tipos de estudio disponibles en el laboratorio"
                    extra={
                        <Space wrap>
                            {canManageCatalog && (
                                <>
                                    <CelumaButton onClick={handleExport} loading={exporting}>Exportar JSON</CelumaButton>
                                    <CelumaButton onClick={() => setCopyOpen(true)} disabled={selectedIds.length === 0}>
                                        {`Copiar a tipos de muestra${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
                                    </CelumaButton>
                                </>
                            )}
                            <CelumaButton type="primary" onClick={handleCreate}>
                                Nuevo Tipo de Estudio
                            </CelumaButton>
                        </Space>
                    }
                />
                <Card style={cardStyle}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: tokens.textSecondary, marginBottom: 12 }}>
                        <CelumaSwitch
                            size="small" checked={showRemoved} aria-label="Mostrar tipos eliminados" data-testid="show-removed-study-types"
                            onChange={(checked) => { showRemovedRef.current = checked; setShowRemoved(checked); void loadStudyTypes(checked); }}
                        />
                        Mostrar eliminados (solo consulta)
                    </label>
                    <CelumaTable
                        columns={columns}
                        dataSource={studyTypes}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                        emptyText="Sin tipos de estudio"
                        searchable
                        searchPlaceholder="Buscar tipos de estudio"
                        searchFilter={(r, q) => matchesQuery([r.code, r.name, r.description, r.default_template?.name], q)}
                        rowSelection={canManageCatalog ? {
                            selectedRowKeys: selectedIds,
                            onChange: (keys) => setSelectedIds(keys as string[]),
                            // #94: a removed type cannot be copied to sample types (the API refuses it too).
                            getCheckboxProps: (record: StudyType) => ({ disabled: !!record.is_removed }),
                        } : undefined}
                    />
                </Card>
            </div>
            <CelumaModal
                title={editingId ? "Editar Tipo de Estudio" : "Nuevo Tipo de Estudio"}
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
                                <CelumaTextArea value={String(p.value ?? "")} onChange={(v) => p.onChange(v)} rows={3} maxLength={1000} error={p.error} placeholder="Descripción opcional del tipo de estudio" />
                            </div>
                        )}
                    />
                    <FormField
                        control={control}
                        name="default_report_template_id"
                        render={(p) => (
                            <div style={{ display: "grid", gap: 6 }}>
                                <FloatingCaptionSelect
                                    label="Plantilla de reporte predeterminada (opcional)"
                                    value={typeof p.value === "string" && p.value ? p.value : undefined}
                                    onChange={(v) => p.onChange(v ?? "")}
                                    placeholder="Sin plantilla"
                                    options={templates.map((t) => ({ value: t.id, label: t.name }))}
                                    showSearch
                                    allowClear
                                    error={p.error}
                                    data-testid="study-type-template-select"
                                />
                                <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                                    Se usa solo si las muestras de la orden no sugieren otra plantilla y nadie eligió una al registrar.
                                </div>
                            </div>
                        )}
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
                                        <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>Define si está disponible para nuevas órdenes.</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: active ? tokens.primary : tokens.textSecondary }}>{active ? "Activo" : "Inactivo"}</span>
                                        <Switch checked={active} onChange={(checked) => p.onChange(checked)} />
                                    </div>
                                </Panel>
                            );
                        }}
                    />
                    <Panel style={{ background: "#fff" }} data-testid="study-type-numbering-panel">
                        <TypeNumberingSection
                            key={editingId ?? "new"}
                            kind="order"
                            typeId={editingId}
                            typeCode={studyTypes.find((t) => t.id === editingId)?.code ?? ""}
                            typeName={studyTypes.find((t) => t.id === editingId)?.name}
                            canManage={canManageCatalog}
                            onDirtyChange={setNumberingDirty}
                            startEditing={startNumbering}
                            onCreateAndConfigure={() => { configureAfterCreate.current = true; void handleSave(); }}
                            creating={submitting}
                            testId="study-type-numbering"
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
                description="Deja de estar disponible para órdenes nuevas, pero sigue en el catálogo y puedes reactivarlo cuando quieras desde «Editar»."
                confirmText="Desactivar"
                cancelText="Cancelar"
                loading={deactivateBusy}
                onCancel={() => setDeactivating(null)}
                onConfirm={() => void handleDeactivate()}
            >
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: tokens.textSecondary }}>
                    <li>Las órdenes existentes lo conservan.</li>
                    <li>Para quitarlo del catálogo de forma definitiva usa «Eliminar del catálogo».</li>
                </ul>
            </ConfirmDialog>
            <RemoveCatalogTypeDialog
                kind="study_types"
                target={removing}
                onCancel={() => setRemoving(null)}
                onRemoved={(result) => {
                    setRemoving(null);
                    showCelumaSuccess(result.already_removed
                        ? "El tipo de estudio ya estaba eliminado del catálogo"
                        : "Tipo de estudio eliminado del catálogo",
                        result.code_released
                            ? `No tenía órdenes: el código «${result.code}» queda libre para otro tipo de estudio.`
                            : `Sus órdenes lo conservan; el código «${result.code}» sigue reservado.`);
                    loadStudyTypes();
                }}
            />
            {canManageCatalog && (
                <CatalogTransferModal
                    open={copyOpen}
                    source={{ mode: "copy", studyTypeIds: selectedIds }}
                    onClose={() => {
                        setCopyOpen(false);
                        // The selection is cleared only once the copy happened, and only
                        // after the result was shown (the modal is keyed on it).
                        if (copyDone) setSelectedIds([]);
                        setCopyDone(false);
                    }}
                    onDone={() => setCopyDone(true)}
                />
            )}
        </>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/study-types"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default StudyTypes;
