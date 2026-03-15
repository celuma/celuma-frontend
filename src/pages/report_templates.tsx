import { useEffect, useRef, useState } from "react";
import {
    Layout,
    Card,
    Button,
    Form,
    Input,
    Modal,
    message,
    Space,
    Popconfirm,
    Switch,
    Checkbox,
    Select,
    Divider,
    Typography,
    Tag,
    Empty,
    Spin,
    Tooltip,
} from "antd";
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    CloseOutlined,
    SaveOutlined,
    FileTextOutlined,
    HolderOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import {
    getReportTemplates,
    getReportTemplateById,
    createReportTemplate,
    updateReportTemplate,
    deleteReportTemplate,
} from "../services/report_service";
import type {
    ReportTemplateListItem,
    ReportTemplateJSON,
    ReportBaseFieldConfig,
    ReportBaseFieldCustom,
    ReportSectionConfig,
    ReportSectionCustom,
    TemplateFieldType,
} from "../models/report";
import { buildDefaultTemplateJSON, DEFAULT_BASE_FIELDS, DEFAULT_SECTIONS } from "../models/report";

const { TextArea } = Input;
const { Text, Title } = Typography;

const PREDEFINED_BASE_KEYS = Object.keys(DEFAULT_BASE_FIELDS);
const PREDEFINED_SECTION_KEYS = Object.keys(DEFAULT_SECTIONS);

// Tipos para campos base: solo texto y numérico
const BASE_FIELD_TYPE_OPTIONS: { value: TemplateFieldType; label: string }[] = [
    { value: "text",    label: "Texto" },
    { value: "numeric", label: "Numérico" },
];

// Tipos para secciones: todos
const SECTION_TYPE_OPTIONS: { value: TemplateFieldType; label: string }[] = [
    { value: "text",     label: "Texto" },
    { value: "numeric",  label: "Numérico" },
    { value: "richtext", label: "Texto enriquecido" },
    { value: "table",    label: "Tabla" },
];

const BASE_FIELD_LABELS: Record<string, string> = {
    order_code:          "Código de orden",
    patient_code:        "Código de paciente",
    study_type_name:     "Tipo de estudio",
    samples_description: "Descripción de muestra",
    diagnosis_text:      "Diagnóstico de envío",
    patient_age:         "Edad",
    received_at_sample:  "Fecha de recepción",
};

const SECTION_LABELS: Record<string, string> = {
    section_macroscopic: "Macroscópica",
    section_microscopic: "Microscópica",
    images:              "Imágenes",
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
interface DraggableItem {
    key: string;
    cfg: ReportBaseFieldConfig | ReportSectionConfig;
}

function reorder<T>(list: T[], from: number, to: number): T[] {
    const result = [...list];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
}

// ---------------------------------------------------------------------------
// Inline-edit row component
// ---------------------------------------------------------------------------
interface EditableRowProps {
    itemKey: string;
    label: string;
    isVisible: boolean;
    isPredefined: boolean;
    type?: TemplateFieldType;
    isSection?: boolean;
    dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
    onToggleVisible: (key: string, checked: boolean) => void;
    onRename: (key: string, newLabel: string) => void;
    onChangeType?: (key: string, newType: TemplateFieldType) => void;
    onRemove: (key: string) => void;
}

function EditableRow({
    itemKey,
    label,
    isVisible,
    isPredefined,
    type,
    isSection = false,
    dragHandleProps,
    onToggleVisible,
    onRename,
    onChangeType,
    onRemove,
}: EditableRowProps) {
    const [editing, setEditing] = useState(false);
    const [draftLabel, setDraftLabel] = useState(label);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const commitRename = () => {
        const trimmed = draftLabel.trim();
        if (trimmed && trimmed !== label) onRename(itemKey, trimmed);
        setEditing(false);
    };

    const typeOptions = isSection ? SECTION_TYPE_OPTIONS : BASE_FIELD_TYPE_OPTIONS;

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 8,
                background: "#fafafa",
                border: "1px solid #f0f0f0",
                transition: "background 0.15s",
            }}
        >
            {/* Drag handle */}
            <span
                {...dragHandleProps}
                style={{
                    cursor: "grab",
                    color: "#bbb",
                    fontSize: 14,
                    lineHeight: 1,
                    userSelect: "none",
                    flexShrink: 0,
                }}
            >
                <HolderOutlined />
            </span>

            {/* Visibility checkbox */}
            <Checkbox
                checked={isVisible}
                onChange={(e) => onToggleVisible(itemKey, e.target.checked)}
            />

            {/* Label — click to rename (custom only) */}
            {editing ? (
                <input
                    ref={inputRef}
                    value={draftLabel}
                    autoFocus
                    onChange={(e) => setDraftLabel(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") { setDraftLabel(label); setEditing(false); }
                    }}
                    style={{
                        flex: 1,
                        fontSize: 14,
                        border: "none",
                        borderBottom: `2px solid ${tokens.primary}`,
                        outline: "none",
                        background: "transparent",
                        minWidth: 60,
                    }}
                />
            ) : (
                <Text
                    style={{ flex: 1, cursor: isPredefined ? "default" : "pointer" }}
                    onClick={() => { if (!isPredefined) { setDraftLabel(label); setEditing(true); } }}
                >
                    {label}
                    {!isPredefined && (
                        <EditOutlined style={{ marginLeft: 5, fontSize: 11, color: "#bbb" }} />
                    )}
                </Text>
            )}

            {/* Type badge / select for custom */}
            {!isPredefined && type && onChangeType && (
                <Select
                    size="small"
                    value={type}
                    style={{ minWidth: 110 }}
                    onChange={(v) => onChangeType(itemKey, v as TemplateFieldType)}
                    options={typeOptions}
                    bordered={false}
                    dropdownMatchSelectWidth={false}
                />
            )}
            {!isPredefined && (
                <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>
                    {isSection ? "Personalizada" : "Personalizado"}
                </Tag>
            )}

            {/* Remove (custom only) */}
            {!isPredefined && (
                <Tooltip title="Eliminar">
                    <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => onRemove(itemKey)}
                    />
                </Tooltip>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// DraggableList component
// ---------------------------------------------------------------------------
interface DraggableListProps {
    items: DraggableItem[];
    isPredefined: (key: string) => boolean;
    isSection?: boolean;
    onReorder: (newItems: DraggableItem[]) => void;
    onToggleVisible: (key: string, checked: boolean) => void;
    onRename: (key: string, newLabel: string) => void;
    onChangeType?: (key: string, newType: TemplateFieldType) => void;
    onRemove: (key: string) => void;
}

function DraggableList({
    items,
    isPredefined,
    isSection = false,
    onReorder,
    onToggleVisible,
    onRename,
    onChangeType,
    onRemove,
}: DraggableListProps) {
    const dragIndex = useRef<number | null>(null);
    const dragOverIndex = useRef<number | null>(null);

    const handleDragStart = (idx: number) => {
        dragIndex.current = idx;
    };
    const handleDragEnter = (idx: number) => {
        dragOverIndex.current = idx;
    };
    const handleDragEnd = () => {
        const from = dragIndex.current;
        const to = dragOverIndex.current;
        if (from !== null && to !== null && from !== to) {
            onReorder(reorder(items, from, to));
        }
        dragIndex.current = null;
        dragOverIndex.current = null;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item, idx) => {
                const cfg = item.cfg;
                const custom = cfg as ReportBaseFieldCustom & ReportSectionCustom;
                const predefined = isPredefined(item.key);
                const label = predefined
                    ? (isSection ? SECTION_LABELS[item.key] : BASE_FIELD_LABELS[item.key]) ?? item.key
                    : custom.label;
                const type: TemplateFieldType | undefined = !predefined ? custom.type : undefined;

                return (
                    <div
                        key={item.key}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragEnter={() => handleDragEnter(idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        style={{ opacity: dragIndex.current === idx ? 0.5 : 1 }}
                    >
                        <EditableRow
                            itemKey={item.key}
                            label={label}
                            isVisible={cfg.is_visible}
                            isPredefined={predefined}
                            type={type}
                            isSection={isSection}
                            onToggleVisible={onToggleVisible}
                            onRename={onRename}
                            onChangeType={onChangeType}
                            onRemove={onRemove}
                        />
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface ReportTemplatesProps {
    embedded?: boolean;
}

function ReportTemplates({ embedded = false }: ReportTemplatesProps) {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    // ---- Lista ----
    const [loadingList, setLoadingList] = useState(false);
    const [templates, setTemplates] = useState<ReportTemplateListItem[]>([]);

    // ---- Panel derecho ----
    const [editingId, setEditingId] = useState<string | null>(null);
    const [panelVisible, setPanelVisible] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);

    // ---- Form ----
    const [form] = Form.useForm();

    // ---- template_json as ordered arrays ----
    const [baseItems, setBaseItems] = useState<DraggableItem[]>([]);
    const [sectionItems, setSectionItems] = useState<DraggableItem[]>([]);

    // ---- Modals ----
    const [baseFieldModalOpen, setBaseFieldModalOpen] = useState(false);
    const [baseFieldForm] = Form.useForm();
    const [sectionModalOpen, setSectionModalOpen] = useState(false);
    const [sectionForm] = Form.useForm();

    // ---------------------------------------------------------------------------
    // Convert template_json ↔ ordered arrays
    // ---------------------------------------------------------------------------
    const templateJSONFromArrays = (): ReportTemplateJSON => ({
        base: Object.fromEntries(baseItems.map(({ key, cfg }) => [key, cfg])) as ReportTemplateJSON["base"],
        sections: Object.fromEntries(sectionItems.map(({ key, cfg }) => [key, cfg])) as ReportTemplateJSON["sections"],
    });

    const arraysFromTemplateJSON = (json: ReportTemplateJSON) => {
        setBaseItems(
            Object.entries(json.base).map(([key, cfg]) => ({ key, cfg: cfg as ReportBaseFieldConfig }))
        );
        setSectionItems(
            Object.entries(json.sections).map(([key, cfg]) => ({ key, cfg: cfg as ReportSectionConfig }))
        );
    };

    // ---------------------------------------------------------------------------
    // Load list
    // ---------------------------------------------------------------------------
    const loadTemplates = async () => {
        setLoadingList(true);
        try {
            const data = await getReportTemplates(false);
            setTemplates(data.templates);
        } catch {
            message.error("Error al cargar plantillas de reporte");
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        loadTemplates();
    }, []);

    // Init arrays from defaults
    useEffect(() => {
        arraysFromTemplateJSON(buildDefaultTemplateJSON());
    }, []);

    // ---------------------------------------------------------------------------
    // Panel helpers
    // ---------------------------------------------------------------------------
    const openNewPanel = () => {
        setEditingId(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        arraysFromTemplateJSON(buildDefaultTemplateJSON());
        setPanelVisible(true);
    };

    const openEditPanel = async (id: string) => {
        setEditingId(id);
        setPanelVisible(true);
        setLoadingDetail(true);
        try {
            const detail = await getReportTemplateById(id);
            form.setFieldsValue({
                name:        detail.name,
                description: detail.description,
                is_active:   detail.is_active,
            });
            const stored = detail.template_json ?? {};
            const defaults = buildDefaultTemplateJSON();

            // Merge: start from stored order but ensure all predefined keys exist
            const mergedBase: ReportTemplateJSON["base"] = {};
            const mergedSections: ReportTemplateJSON["sections"] = {};

            // Keep stored order first
            if (stored.base) Object.entries(stored.base).forEach(([k, v]) => { mergedBase[k] = v; });
            if (stored.sections) Object.entries(stored.sections).forEach(([k, v]) => { mergedSections[k] = v; });

            // Add missing predefined keys at the end
            Object.entries(defaults.base).forEach(([k, v]) => { if (!mergedBase[k]) mergedBase[k] = v; });
            Object.entries(defaults.sections).forEach(([k, v]) => { if (!mergedSections[k]) mergedSections[k] = v; });

            arraysFromTemplateJSON({ base: mergedBase, sections: mergedSections });
        } catch {
            message.error("Error al cargar la plantilla");
            setPanelVisible(false);
        } finally {
            setLoadingDetail(false);
        }
    };

    const closePanel = () => {
        setPanelVisible(false);
        setEditingId(null);
        form.resetFields();
    };

    // ---------------------------------------------------------------------------
    // Save
    // ---------------------------------------------------------------------------
    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const templateJSON = templateJSONFromArrays();
            if (editingId) {
                await updateReportTemplate(editingId, {
                    name:          values.name,
                    description:   values.description,
                    template_json: templateJSON,
                    is_active:     values.is_active,
                });
                message.success("Plantilla actualizada");
            } else {
                await createReportTemplate({
                    name:          values.name,
                    description:   values.description,
                    template_json: templateJSON,
                });
                message.success("Plantilla creada");
            }
            closePanel();
            loadTemplates();
        } catch (err) {
            if (err instanceof Error) {
                message.error(`Error al guardar: ${err.message}`);
            }
        } finally {
            setSaving(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Delete template
    // ---------------------------------------------------------------------------
    const handleDelete = async (id: string) => {
        try {
            await deleteReportTemplate(id);
            message.success("Plantilla eliminada");
            if (editingId === id) closePanel();
            loadTemplates();
        } catch {
            message.error("Error al eliminar la plantilla");
        }
    };

    // ---------------------------------------------------------------------------
    // Base field mutations
    // ---------------------------------------------------------------------------
    const toggleBaseVisible = (key: string, checked: boolean) => {
        setBaseItems((prev) =>
            prev.map((item) =>
                item.key === key ? { ...item, cfg: { ...item.cfg, is_visible: checked } } : item
            )
        );
    };

    const renameBaseField = (key: string, newLabel: string) => {
        setBaseItems((prev) =>
            prev.map((item) =>
                item.key === key ? { ...item, cfg: { ...item.cfg, label: newLabel } } : item
            )
        );
    };

    const changeBaseFieldType = (key: string, newType: TemplateFieldType) => {
        setBaseItems((prev) =>
            prev.map((item) =>
                item.key === key ? { ...item, cfg: { ...item.cfg, type: newType } } : item
            )
        );
    };

    const removeBaseField = (key: string) => {
        setBaseItems((prev) => prev.filter((item) => item.key !== key));
    };

    const handleAddBaseField = async () => {
        try {
            const values = await baseFieldForm.validateFields();
            const key = values.label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
            if (!key) { message.warning("Nombre inválido"); return; }
            if (baseItems.some((i) => i.key === key)) { message.warning("Ya existe un campo con ese nombre"); return; }

            const newField: ReportBaseFieldCustom = {
                is_visible: true,
                label: values.label.trim(),
                type: values.type,
                is_custom: true,
            };
            setBaseItems((prev) => [...prev, { key, cfg: newField }]);
            baseFieldForm.resetFields();
            setBaseFieldModalOpen(false);
        } catch { /* validation */ }
    };

    // ---------------------------------------------------------------------------
    // Section mutations
    // ---------------------------------------------------------------------------
    const toggleSectionVisible = (key: string, checked: boolean) => {
        setSectionItems((prev) =>
            prev.map((item) =>
                item.key === key ? { ...item, cfg: { ...item.cfg, is_visible: checked } } : item
            )
        );
    };

    const renameSection = (key: string, newLabel: string) => {
        setSectionItems((prev) =>
            prev.map((item) =>
                item.key === key ? { ...item, cfg: { ...item.cfg, label: newLabel } } : item
            )
        );
    };

    const changeSectionType = (key: string, newType: TemplateFieldType) => {
        setSectionItems((prev) =>
            prev.map((item) =>
                item.key === key ? { ...item, cfg: { ...item.cfg, type: newType } } : item
            )
        );
    };

    const removeSection = (key: string) => {
        setSectionItems((prev) => prev.filter((item) => item.key !== key));
    };

    const handleAddSection = async () => {
        try {
            const values = await sectionForm.validateFields();
            const key = values.label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
            if (!key) { message.warning("Nombre inválido"); return; }
            if (sectionItems.some((i) => i.key === key)) { message.warning("Ya existe una sección con ese nombre"); return; }

            const newSection: ReportSectionCustom = {
                is_visible: true,
                label: values.label.trim(),
                type: values.type,
                is_custom: true,
            };
            setSectionItems((prev) => [...prev, { key, cfg: newSection }]);
            sectionForm.resetFields();
            setSectionModalOpen(false);
        } catch { /* validation */ }
    };

    // ---------------------------------------------------------------------------
    // Left panel — list
    // ---------------------------------------------------------------------------
    const listPanel = (
        <Card
            title={<span style={cardTitleStyle}>Plantillas de Reporte</span>}
            style={{ ...cardStyle, maxHeight: "calc(100vh - 96px)", overflow: "hidden", display: "flex", flexDirection: "column" }}
            styles={{ body: { overflowY: "auto", flex: 1 } }}
            extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={openNewPanel}>
                    Nuevo
                </Button>
            }
        >
            <Spin spinning={loadingList}>
                {templates.length === 0 && !loadingList ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Sin plantillas aún"
                    />
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {templates.map((t) => (
                            <div
                                key={t.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 12px",
                                    borderRadius: tokens.radius,
                                    border: editingId === t.id
                                        ? `2px solid ${tokens.primary}`
                                        : "1px solid #f0f0f0",
                                    background: editingId === t.id ? "#f0fdfd" : "#fafafa",
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                }}
                                onClick={() => openEditPanel(t.id)}
                            >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        <FileTextOutlined style={{ color: tokens.primary }} />
                                        <Text strong ellipsis style={{ maxWidth: 160 }}>{t.name}</Text>
                                        <Tag
                                            color={t.is_active ? "success" : "default"}
                                            style={{ fontSize: 10, lineHeight: "16px", padding: "0 6px" }}
                                        >
                                            {t.is_active ? "Activo" : "Inactivo"}
                                        </Tag>
                                    </div>
                                    {t.description && (
                                        <Text
                                            type="secondary"
                                            style={{ fontSize: 12, display: "block", marginTop: 2 }}
                                            ellipsis
                                        >
                                            {t.description}
                                        </Text>
                                    )}
                                </div>
                                <Space onClick={(e) => e.stopPropagation()}>
                                    <Tooltip title="Editar">
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<EditOutlined />}
                                            onClick={() => openEditPanel(t.id)}
                                        />
                                    </Tooltip>
                                    <Popconfirm
                                        title="¿Eliminar esta plantilla?"
                                        onConfirm={() => handleDelete(t.id)}
                                        okText="Sí"
                                        cancelText="No"
                                    >
                                        <Tooltip title="Eliminar">
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                            />
                                        </Tooltip>
                                    </Popconfirm>
                                </Space>
                            </div>
                        ))}
                    </div>
                )}
            </Spin>
        </Card>
    );

    // ---------------------------------------------------------------------------
    // Right panel — editor
    // ---------------------------------------------------------------------------
    const editorPanel = panelVisible ? (
        <Card
            title={
                <span style={cardTitleStyle}>
                    {editingId ? "Editar Plantilla" : "Crear Plantilla"}
                </span>
            }
            style={{ ...cardStyle, marginLeft: tokens.gap * 2, maxHeight: "calc(100vh - 96px)", overflow: "hidden", display: "flex", flexDirection: "column" }}
            styles={{ body: { overflowY: "auto", flex: 1 } }}
            extra={
                <Button type="text" icon={<CloseOutlined />} onClick={closePanel} />
            }
        >
                <Spin spinning={loadingDetail}>
                    <Form form={form} layout="vertical">
                        {/* ---- Nombre / descripción / estado ---- */}
                        <Form.Item
                            name="name"
                            label="Nombre"
                            rules={[{ required: true, message: "El nombre es requerido" }]}
                        >
                            <Input placeholder="Ej. Plantilla de Biopsia Estándar" maxLength={255} />
                        </Form.Item>

                        <Form.Item name="description" label="Descripción">
                            <TextArea
                                placeholder="Descripción opcional"
                                rows={2}
                                maxLength={1000}
                            />
                        </Form.Item>

                        {editingId && (
                            <Form.Item name="is_active" label="Estado" valuePropName="checked">
                                <Switch checkedChildren="Activo" unCheckedChildren="Inactivo" />
                            </Form.Item>
                        )}

                        <Divider />

                        {/* ---- Campos base ---- */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <Title level={5} style={{ margin: 0, fontFamily: tokens.titleFont }}>
                                Campos base
                            </Title>
                            <Button
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => { baseFieldForm.resetFields(); setBaseFieldModalOpen(true); }}
                            >
                                Nuevo
                            </Button>
                        </div>

                        <DraggableList
                            items={baseItems}
                            isPredefined={(k) => PREDEFINED_BASE_KEYS.includes(k)}
                            isSection={false}
                            onReorder={setBaseItems}
                            onToggleVisible={toggleBaseVisible}
                            onRename={renameBaseField}
                            onChangeType={changeBaseFieldType}
                            onRemove={removeBaseField}
                        />

                        <Divider />

                        {/* ---- Secciones ---- */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <Title level={5} style={{ margin: 0, fontFamily: tokens.titleFont }}>
                                Secciones
                            </Title>
                            <Button
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => { sectionForm.resetFields(); setSectionModalOpen(true); }}
                            >
                                Nuevo
                            </Button>
                        </div>

                        <DraggableList
                            items={sectionItems}
                            isPredefined={(k) => PREDEFINED_SECTION_KEYS.includes(k)}
                            isSection
                            onReorder={setSectionItems}
                            onToggleVisible={toggleSectionVisible}
                            onRename={renameSection}
                            onChangeType={changeSectionType}
                            onRemove={removeSection}
                        />

                        <Divider />

                        {/* ---- Acciones ---- */}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <Button onClick={closePanel} icon={<CloseOutlined />}>
                                Cancelar
                            </Button>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={saving}
                                onClick={handleSave}
                            >
                                {editingId ? "Guardar Cambios" : "Crear Plantilla"}
                            </Button>
                        </div>
                    </Form>
                </Spin>
            </Card>
    ) : null;

    // ---------------------------------------------------------------------------
    // Content
    // ---------------------------------------------------------------------------
    const content = (
        <>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: panelVisible ? "1fr 1.4fr" : "1fr",
                    alignItems: "start",
                    gap: tokens.gap * 2,
                }}
            >
                {listPanel}
                {editorPanel}
            </div>

            {/* ---- Modal: crear campo base custom ---- */}
            <Modal
                title="Crear campo"
                open={baseFieldModalOpen}
                onCancel={() => { setBaseFieldModalOpen(false); baseFieldForm.resetFields(); }}
                onOk={handleAddBaseField}
                okText="Agregar"
                cancelText="Cancelar"
                destroyOnClose
            >
                <Form form={baseFieldForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        name="label"
                        label="Nombre del campo"
                        rules={[{ required: true, message: "El nombre es requerido" }]}
                    >
                        <Input placeholder="Ej. Número de expediente" maxLength={100} />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        label="Tipo de campo"
                        rules={[{ required: true, message: "El tipo es requerido" }]}
                    >
                        <Select placeholder="Seleccionar tipo" options={BASE_FIELD_TYPE_OPTIONS} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* ---- Modal: crear sección custom ---- */}
            <Modal
                title="Crear sección"
                open={sectionModalOpen}
                onCancel={() => { setSectionModalOpen(false); sectionForm.resetFields(); }}
                onOk={handleAddSection}
                okText="Agregar"
                cancelText="Cancelar"
                destroyOnClose
            >
                <Form form={sectionForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        name="label"
                        label="Nombre de la sección"
                        rules={[{ required: true, message: "El nombre es requerido" }]}
                    >
                        <Input placeholder="Ej. Inmunohistoquímica" maxLength={100} />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        label="Tipo de contenido"
                        rules={[{ required: true, message: "El tipo es requerido" }]}
                    >
                        <Select placeholder="Seleccionar tipo" options={SECTION_TYPE_OPTIONS} />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/report-templates"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content
                style={{
                    padding: tokens.contentPadding,
                    background: tokens.bg,
                    fontFamily: tokens.textFont,
                }}
            >
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default ReportTemplates;
