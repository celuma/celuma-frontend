import { useEffect, useState, type CSSProperties } from "react";
import { Layout, Card, Button, message, Space, Popconfirm, Switch } from "antd";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
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
import CelumaTextArea from "../components/ui/textarea_field";
import Panel from "../components/ui/panel";
import ModalFormFooter from "../components/ui/modal_form_footer";
import { renderActiveChip, activeFilter, renderDateCell } from "../components/ui/table_helpers";
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

const captionLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: tokens.primary, marginBottom: 6 };

const sampleTypeSchema = z.object({
    code: z.string().trim().nonempty("El código es requerido.").max(50, "Máximo 50 caracteres"),
    name: z.string().trim().nonempty("El nombre es requerido.").max(255, "Máximo 255 caracteres"),
    description: z.string().trim().max(2000, "Máximo 2000 caracteres").optional(),
    is_active: z.boolean().optional(),
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

    const { control, handleSubmit, reset } = useForm<SampleTypeFormData>({
        resolver: zodResolver(sampleTypeSchema),
        defaultValues: { code: "", name: "", description: "", is_active: true },
        mode: "onTouched",
    });

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        reset();
    };

    const load = async () => {
        setLoading(true);
        try {
            setSampleTypes(await listSampleTypes(false));
        } catch {
            message.error("Error al cargar tipos de muestra");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleCreate = () => {
        setEditingId(null);
        reset({ code: "", name: "", description: "", is_active: true });
        setModalVisible(true);
    };

    const handleEdit = (record: SampleType) => {
        setEditingId(record.id);
        reset({
            code: record.code,
            name: record.name,
            description: record.description || "",
            is_active: record.is_active,
        });
        setModalVisible(true);
    };

    const handleSave = handleSubmit(async (data) => {
        setSubmitting(true);
        try {
            const payload = {
                code: data.code,
                name: data.name,
                // null, not undefined: JSON drops undefined, and an omitted description means
                // "unchanged" to the API, so a cleared field would silently keep the old text.
                description: data.description?.trim() ? data.description : null,
                is_active: data.is_active ?? true,
            };
            if (editingId) {
                await updateSampleType(editingId, payload);
                message.success("Tipo de muestra actualizado");
            } else {
                await createSampleType(payload);
                message.success("Tipo de muestra creado");
            }
            closeModal();
            load();
        } catch (err) {
            message.error(getErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    });

    const handleDeactivate = async (id: string) => {
        try {
            await deactivateSampleType(id);
            message.success("Tipo de muestra desactivado");
            load();
        } catch (err) {
            message.error(getErrorMessage(err));
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
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            width: 100,
            ...activeFilter(),
            render: (is_active: boolean) => renderActiveChip(is_active),
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
            width: 120,
            render: (_, record) => (
                <Space>
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" title="Editar" />
                    <Popconfirm
                        title="¿Desactivar este tipo de muestra? Las muestras existentes lo conservan."
                        onConfirm={() => handleDeactivate(record.id)}
                        okText="Sí"
                        cancelText="No"
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" title="Desactivar" />
                    </Popconfirm>
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
                    <ModalFormFooter onCancel={closeModal} submitLabel={editingId ? "Guardar cambios" : "Crear"} loading={submitting} />
                </form>
            </CelumaModal>
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
