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
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import CelumaTextArea from "../components/ui/textarea_field";
import Panel from "../components/ui/panel";
import ModalFormFooter from "../components/ui/modal_form_footer";
import { renderActiveChip, activeFilter, renderDateCell } from "../components/ui/table_helpers";
import { matchesQuery } from "../lib/search";
import type { ColumnsType } from "antd/es/table";

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

    const { control, handleSubmit, reset } = useForm<StudyTypeFormData>({
        resolver: zodResolver(studyTypeSchema),
        defaultValues: { code: "", name: "", description: "", default_report_template_id: undefined, is_active: true },
        mode: "onTouched",
    });

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        reset();
    };

    useEffect(() => {
        loadStudyTypes();
        loadTemplates();
    }, []);

    const loadStudyTypes = async () => {
        setLoading(true);
        try {
            const data = await getJSON<StudyTypesListResponse>("/v1/study-types/?active_only=false");
            setStudyTypes(data.study_types);
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
        setSubmitting(true);
        try {
            const payload = {
                code: data.code,
                name: data.name,
                description: data.description || undefined,
                default_report_template_id: data.default_report_template_id || undefined,
                is_active: data.is_active ?? true,
            };
            if (editingId) {
                await putJSON(`/v1/study-types/${editingId}`, payload);
                message.success("Tipo de estudio actualizado");
            } else {
                await postJSON("/v1/study-types/", payload);
                message.success("Tipo de estudio creado");
            }
            closeModal();
            loadStudyTypes();
        } catch (err) {
            message.error("Error al guardar tipo de estudio");
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    });

    const handleDelete = async (id: string) => {
        try {
            await deleteJSON(`/v1/study-types/${id}`);
            message.success("Tipo de estudio eliminado");
            loadStudyTypes();
        } catch {
            message.error("Error al eliminar tipo de estudio");
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
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        size="small"
                        title="Editar"
                    />
                    <Popconfirm
                        title="¿Desactivar este tipo de estudio?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Sí"
                        cancelText="No"
                    >
                        <Button 
                            type="text" 
                            danger 
                            icon={<DeleteOutlined />}
                            size="small"
                            title="Desactivar"
                        />
                    </Popconfirm>
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
                        <CelumaButton type="primary" onClick={handleCreate}>
                            Nuevo Tipo de Estudio
                        </CelumaButton>
                    }
                />
                <Card style={cardStyle}>
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
                            <FloatingCaptionSelect
                                label="Plantilla de reporte por defecto"
                                value={typeof p.value === "string" ? p.value : undefined}
                                onChange={(v) => p.onChange(v ?? "")}
                                placeholder="Seleccionar plantilla"
                                options={templates.map((t) => ({ value: t.id, label: t.name }))}
                                showSearch
                                error={p.error}
                            />
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
                    <ModalFormFooter onCancel={closeModal} submitLabel={editingId ? "Guardar cambios" : "Crear"} loading={submitting} />
                </form>
            </CelumaModal>
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
