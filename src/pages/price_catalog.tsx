import { useEffect, useState } from "react";
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
import FloatingCaptionDate from "../components/ui/floating_caption_date";
import Panel from "../components/ui/panel";
import ModalFormFooter from "../components/ui/modal_form_footer";
import { renderActiveChip, activeFilter, renderDateCell } from "../components/ui/table_helpers";
import { matchesQuery } from "../lib/search";
import type { ColumnsType } from "antd/es/table";

const priceSchema = z.object({
    study_type_id: z.string().trim().nonempty("El tipo de estudio es requerido."),
    unit_price: z.string().trim().nonempty("El precio es requerido.").refine(
        (v) => { const n = Number(v); return !isNaN(n) && n >= 0 && n <= 9999999999.99; },
        "Precio inválido (0 – 9,999,999,999.99)",
    ),
    effective_from: z.string().optional(),
    effective_to: z.string().optional(),
    is_active: z.boolean().optional(),
});

type PriceFormData = z.infer<typeof priceSchema>;

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
    code: string;
    name: string;
}

interface PriceCatalogEntry {
    id: string;
    study_type_id: string;
    unit_price: number;
    currency: string;
    is_active: boolean;
    effective_from?: string;
    effective_to?: string;
    created_at: string;
    study_type?: StudyType;
}

interface PriceCatalogListResponse {
    prices: PriceCatalogEntry[];
}

interface StudyTypesListResponse {
    study_types: StudyType[];
}

interface PriceCatalogProps {
    embedded?: boolean;
}

function PriceCatalog({ embedded = false }: PriceCatalogProps) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [prices, setPrices] = useState<PriceCatalogEntry[]>([]);
    const [studyTypes, setStudyTypes] = useState<StudyType[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const { control, handleSubmit, reset } = useForm<PriceFormData>({
        resolver: zodResolver(priceSchema),
        defaultValues: { study_type_id: "", unit_price: "", effective_from: "", effective_to: "", is_active: true },
        mode: "onTouched",
    });

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        reset();
    };

    useEffect(() => {
        loadPrices();
        loadStudyTypes();
    }, []);

    const loadPrices = async () => {
        setLoading(true);
        try {
            const data = await getJSON<PriceCatalogListResponse>("/v1/price-catalog/?active_only=false");
            setPrices(data.prices);
        } catch {
            message.error("Error al cargar catálogo de precios");
        } finally {
            setLoading(false);
        }
    };

    const loadStudyTypes = async () => {
        try {
            const data = await getJSON<StudyTypesListResponse>("/v1/study-types/?active_only=true");
            setStudyTypes(data.study_types);
        } catch {
            message.error("Error al cargar tipos de estudio");
        }
    };

    const handleCreate = () => {
        setEditingId(null);
        reset({ study_type_id: "", unit_price: "", effective_from: "", effective_to: "", is_active: true });
        setModalVisible(true);
    };

    const handleEdit = (record: PriceCatalogEntry) => {
        setEditingId(record.id);
        reset({
            study_type_id: record.study_type_id,
            unit_price: String(record.unit_price),
            is_active: record.is_active,
            effective_from: record.effective_from || "",
            effective_to: record.effective_to || "",
        });
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteJSON(`/v1/price-catalog/${id}`);
            message.success("Precio desactivado");
            await loadPrices();
        } catch {
            message.error("Error al desactivar precio");
        }
    };

    const onSubmit = handleSubmit(async (data) => {
        setSubmitting(true);
        try {
            const payload = {
                study_type_id: data.study_type_id,
                unit_price: Number(data.unit_price),
                is_active: data.is_active ?? true,
                effective_from: data.effective_from ? new Date(data.effective_from).toISOString() : null,
                effective_to: data.effective_to ? new Date(data.effective_to).toISOString() : null,
            };

            if (editingId) {
                await putJSON(`/v1/price-catalog/${editingId}`, payload);
                message.success("Precio actualizado");
            } else {
                await postJSON("/v1/price-catalog/", payload);
                message.success("Precio creado");
            }
            closeModal();
            await loadPrices();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al guardar precio");
        } finally {
            setSubmitting(false);
        }
    });

    const columns: ColumnsType<PriceCatalogEntry> = [
        {
            title: "Tipo de Estudio",
            key: "study_type",
            sorter: (a, b) => (a.study_type?.code || "").localeCompare(b.study_type?.code || ""),
            defaultSortOrder: "ascend",
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600, color: tokens.primary }}>
                        {record.study_type?.code || "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                        {record.study_type?.name || "—"}
                    </div>
                </div>
            ),
        },
        {
            title: "Precio Unitario",
            dataIndex: "unit_price",
            key: "unit_price",
            width: 150,
            sorter: (a, b) => a.unit_price - b.unit_price,
            render: (price: number) => (
                <span style={{ fontWeight: 500 }}>${price.toFixed(2)} MXN</span>
            ),
        },
        {
            title: "Vigencia Desde",
            dataIndex: "effective_from",
            key: "effective_from",
            width: 130,
            sorter: (a, b) => (a.effective_from ? new Date(a.effective_from).getTime() : 0) - (b.effective_from ? new Date(b.effective_from).getTime() : 0),
            render: (date?: string) => date ? renderDateCell(date) : <span style={{ color: "#888" }}>—</span>,
        },
        {
            title: "Vigencia Hasta",
            dataIndex: "effective_to",
            key: "effective_to",
            width: 130,
            render: (date?: string) => date ? renderDateCell(date) : <span style={{ color: "#888" }}>—</span>,
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
                    {record.is_active && (
                        <Popconfirm
                            title="¿Desactivar este precio?"
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
                    )}
                </Space>
            ),
        },
    ];

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <PageHeader
                title="Catálogo de Precios"
                subtitle="Define los precios por tipo de estudio y vigencia"
                extra={
                    <CelumaButton type="primary" onClick={handleCreate}>
                        Nuevo Precio
                    </CelumaButton>
                }
            />
            <Card style={cardStyle}>
                <CelumaTable
                    columns={columns}
                    dataSource={prices}
                    loading={loading}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                    emptyText="Sin precios registrados"
                    searchable
                    searchPlaceholder="Buscar precios"
                    searchFilter={(r, q) => matchesQuery([r.study_type?.code, r.study_type?.name, r.unit_price], q)}
                />
            </Card>

            <CelumaModal
                title={editingId ? "Editar Precio" : "Nuevo Precio"}
                open={modalVisible}
                onCancel={closeModal}
                footer={null}
                width={600}
                destroyOnHidden
            >
                <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 18 }}>
                    <FormField
                        control={control}
                        name="study_type_id"
                        render={(p) => (
                            <FloatingCaptionSelect
                                label="Tipo de estudio"
                                requiredMark
                                value={typeof p.value === "string" ? p.value : undefined}
                                onChange={(v) => p.onChange(v ?? "")}
                                placeholder="Seleccionar tipo de estudio"
                                options={studyTypes.map((st) => ({ value: st.id, label: `${st.code} - ${st.name}` }))}
                                showSearch
                                error={p.error}
                            />
                        )}
                    />
                    <FormField
                        control={control}
                        name="unit_price"
                        render={(p) => (
                            <FloatingCaptionInput
                                {...p}
                                value={String(p.value ?? "")}
                                label="Precio unitario (MXN)"
                                requiredMark
                                inputMode="decimal"
                                prefixNode={<span style={{ color: tokens.textSecondary }}>$</span>}
                            />
                        )}
                    />
                    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
                        <FormField
                            control={control}
                            name="effective_from"
                            render={(p) => (
                                <FloatingCaptionDate label="Vigencia desde" value={typeof p.value === "string" ? p.value : undefined} onChange={(v) => p.onChange(v)} error={p.error} />
                            )}
                        />
                        <FormField
                            control={control}
                            name="effective_to"
                            render={(p) => (
                                <FloatingCaptionDate label="Vigencia hasta" value={typeof p.value === "string" ? p.value : undefined} onChange={(v) => p.onChange(v)} error={p.error} />
                            )}
                        />
                    </div>
                    <FormField
                        control={control}
                        name="is_active"
                        render={(p) => {
                            const active = p.value !== false;
                            return (
                                <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>Estado</div>
                                        <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>Define si el precio está vigente y disponible.</div>
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
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/catalog"} onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default PriceCatalog;
