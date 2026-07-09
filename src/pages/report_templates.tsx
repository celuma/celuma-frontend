import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Layout, Card, Button, DatePicker, Form, message, Space, Popconfirm, Typography, Empty, Spin, Select as AntSelect, Divider } from "antd";
import CelumaButton from "../components/ui/button";
import CelumaModal from "../components/ui/celuma_modal";
import CelumaSwitch from "../components/ui/celuma_switch";
import CelumaRichText from "../components/ui/celuma_rich_text";
import SectionTitle from "../components/ui/section_title";
import ActionButtonPanel from "../components/ui/action_button_panel";
import Checkbox from "../components/ui/checkbox";
import Tooltip from "../components/ui/tooltip";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import { PlusOutlined, EditOutlined, DeleteOutlined, CloseOutlined, SaveOutlined, FileTextOutlined, FormOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate, useLocation } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import SearchField from "../components/ui/search_field";
import CelumaSortableList from "../components/ui/celuma_sortable_list";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import CelumaTextArea from "../components/ui/textarea_field";
import Panel from "../components/ui/panel";
import { renderActiveChip } from "../components/ui/table_helpers";
import { matchesQuery } from "../lib/search";
import { getReportTemplates, getReportTemplateById, createReportTemplate, updateReportTemplate, deleteReportTemplate } from "../services/report_service";
import type {
    ReportTemplateListItem,
    ReportTemplateJSON,
    ReportBaseFieldConfig,
    ReportBaseFieldCustom,
    ReportSectionConfig,
    ReportSectionTextCustom,
    TemplateFieldType,
    TemplateOrderInput,
} from "../models/report";
import { buildDefaultTemplateJSON, DEFAULT_BASE_FIELDS, DEFAULT_SECTIONS, LEGACY_PREDEFINED_BASE_HIDDEN, resolveBaseOrder, resolveSectionOrder, resolveSignatureMetadata } from "../models/report";
import { TableEditor } from "../components/report/table_editor";

const { Text } = Typography;
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
    order_code:           "Código de orden",
    patient:              "Paciente",
    study_type:           "Tipo de estudio",
    patient_age:          "Edad",
    requesting_physician: "Médico solicitante",
};

const SECTION_LABELS: Record<string, string> = {
    section_macroscopic: "Macroscópica",
    section_microscopic: "Microscópica",
    images:              "Imágenes",
};

interface DraggableItem {
    key: string;
    cfg: ReportBaseFieldConfig | ReportSectionConfig;
}

// Inline-edit row component
interface EditableRowProps {
    itemKey: string;
    label: string;
    isVisible: boolean;
    isPredefined: boolean;
    type?: TemplateFieldType;
    effectiveType?: TemplateFieldType | "date";
    currentValue?: string;
    isSection?: boolean;
    onToggleVisible: (key: string, checked: boolean) => void;
    onRename: (key: string, newLabel: string) => void;
    onChangeType?: (key: string, newType: TemplateFieldType) => void;
    onRemove: (key: string) => void;
    onEditDefaultValue?: (key: string, label: string, type: TemplateFieldType | "date", value: string) => void;
}

function EditableRow({
    itemKey,
    label,
    isVisible,
    isPredefined,
    type,
    effectiveType,
    currentValue,
    isSection = false,
    onToggleVisible,
    onRename,
    onChangeType,
    onRemove,
    onEditDefaultValue,
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
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                width: "100%",
            }}
        >
            {/* Grupo izquierdo: checkbox + label */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto", maxWidth: "100%" }}>
                <Checkbox
                    checked={isVisible}
                    onChange={(e) => onToggleVisible(itemKey, e.target.checked)}
                    style={{ marginTop: 0 }}
                />

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
                    style={{ cursor: isPredefined ? "default" : "pointer", wordBreak: "break-word" }}
                        onClick={() => { if (!isPredefined) { setDraftLabel(label); setEditing(true); } }}
                    >
                        {label}
                        {!isPredefined && (
                            <EditOutlined style={{ marginLeft: 5, fontSize: 11, color: "#bbb" }} />
                        )}
                    </Text>
                )}
            </div>

            {/* Grupo derecho: tipo + tags + botones de acción */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                {isPredefined && type && (
                    <span style={FIELD_TYPE_CHIP_STYLE}>
                        {type === "images" ? "Imágenes" : type === "richtext" ? "Texto enriquecido" : type === "numeric" ? "Numérico" : "Texto"}
                    </span>
                )}
                {!isPredefined && type && onChangeType && (
                    <TypePillSelect
                        value={type}
                        onChange={(v) => onChangeType(itemKey, v)}
                        options={typeOptions}
                    />
                )}
                {!isPredefined && (
                    <span style={CUSTOM_CHIP_STYLE}>
                        {isSection ? "Personalizada" : "Personalizado"}
                    </span>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {effectiveType !== undefined && onEditDefaultValue && (
                        <ActionButtonPanel
                            size="xxsmall"
                            actions={[{
                                icon: <FormOutlined />,
                                tooltip: `${isSection ? "Contenido" : "Valor"} por defecto`,
                                ariaLabel: `${isSection ? "Contenido" : "Valor"} por defecto`,
                                active: !!currentValue,
                                onClick: () => onEditDefaultValue(itemKey, label, effectiveType, currentValue ?? ""),
                            }]}
                        />
                    )}

                    {!isPredefined && (
                        <ActionButtonPanel
                            size="xxsmall"
                            actions={[{
                                icon: <DeleteOutlined />,
                                tooltip: "Eliminar",
                                ariaLabel: "Eliminar",
                                danger: true,
                                onClick: () => onRemove(itemKey),
                            }]}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Shared row chip styles (predefined type = teal tint, custom = salmon tint) ──
const FIELD_TYPE_CHIP_STYLE: React.CSSProperties = {
    background: `${tokens.primary}14`,
    color: tokens.primary,
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 999,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
};

const CUSTOM_CHIP_STYLE: React.CSSProperties = {
    background: tokens.secondaryTint,
    color: tokens.secondary,
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 999,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
};

/** A compact, pill-shaped antd Select re-skinned to the Céluma language for
 * inline use inside a row (teal ring on hover/focus, tinted at rest). */
function TypePillSelect({
    value,
    onChange,
    options,
}: {
    value: TemplateFieldType;
    onChange: (v: TemplateFieldType) => void;
    options: { value: TemplateFieldType; label: string }[];
}) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    return (
        <>
            <style>{`
                .tps-${uid} .ant-select-selector {
                    background: #f8fafc !important;
                    border: 1.5px solid #e5e7eb !important;
                    border-radius: 999px !important;
                    height: 26px !important;
                    padding: 0 10px !important;
                    display: flex !important;
                    align-items: center !important;
                }
                .tps-${uid}:hover .ant-select-selector,
                .tps-${uid}.ant-select-focused .ant-select-selector {
                    border-color: ${tokens.primary} !important;
                }
                .tps-${uid} .ant-select-selection-item {
                    font-size: 11px !important;
                    font-weight: 600;
                    line-height: 22px !important;
                    color: ${tokens.textPrimary};
                }
                .tps-${uid} .ant-select-arrow { color: ${tokens.primary}; font-size: 9px; }
            `}</style>
            <AntSelect
                className={`tps-${uid}`}
                size="small"
                value={value}
                style={{ minWidth: 118 }}
                onChange={(v) => onChange(v as TemplateFieldType)}
                options={options}
                dropdownMatchSelectWidth={false}
                dropdownStyle={{ borderRadius: 12 }}
            />
        </>
    );
}

// DraggableList component
interface DraggableListProps {
    items: DraggableItem[];
    isPredefined: (key: string) => boolean;
    isSection?: boolean;
    onReorder: (newItems: DraggableItem[]) => void;
    onToggleVisible: (key: string, checked: boolean) => void;
    onRename: (key: string, newLabel: string) => void;
    onChangeType?: (key: string, newType: TemplateFieldType) => void;
    onRemove: (key: string) => void;
    onEditDefaultValue?: (key: string, label: string, type: TemplateFieldType | "date", value: string) => void;
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
    onEditDefaultValue,
}: DraggableListProps) {
    return (
        <CelumaSortableList
            items={items}
            onReorder={onReorder}
            gap={8}
            renderItem={(item) => {
                const cfg = item.cfg;
                const custom = cfg as ReportBaseFieldCustom & ReportSectionTextCustom;
                const predefined = isPredefined(item.key);
                const label = predefined
                    ? (isSection ? SECTION_LABELS[item.key] : BASE_FIELD_LABELS[item.key]) ?? item.key
                    : custom.label;
                const cfgType = (cfg as { type?: TemplateFieldType }).type;
                const type: TemplateFieldType | undefined = isSection ? cfgType : (!predefined ? custom.type : undefined);

                // Effective type for the default value button.
                // Predefined base fields are filled from the DB at report time, so no default allowed.
                let effectiveType: TemplateFieldType | "date" | undefined;
                if (isSection) {
                    effectiveType = cfgType !== "images" ? cfgType : undefined;
                } else {
                    // Only custom base fields can have a predefined default value
                    effectiveType = predefined
                        ? undefined
                        : (custom.type as "text" | "numeric");
                }

                // Current default value string
                const currentValue: string = isSection
                    ? ((cfgType !== "images" ? (cfg as { content?: string }).content : undefined) ?? "")
                    : ((cfg as { value?: string }).value ?? "");

                return (
                    <EditableRow
                        itemKey={item.key}
                        label={label}
                        isVisible={cfg.is_visible}
                        isPredefined={predefined}
                        type={type}
                        effectiveType={effectiveType}
                        currentValue={currentValue}
                        isSection={isSection}
                        onToggleVisible={onToggleVisible}
                        onRename={onRename}
                        onChangeType={onChangeType}
                        onRemove={onRemove}
                        onEditDefaultValue={onEditDefaultValue}
                    />
                );
            }}
        />
    );
}

// Main component
interface ReportTemplatesProps {
    embedded?: boolean;
}

function ReportTemplates({ embedded = false }: ReportTemplatesProps) {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    // ---- Lista ----
    const [loadingList, setLoadingList] = useState(false);
    const [templates, setTemplates] = useState<ReportTemplateListItem[]>([]);
    const [templateSearch, setTemplateSearch] = useState("");

    // ---- Panel derecho ----
    const [editingId, setEditingId] = useState<string | null>(null);
    const [panelVisible, setPanelVisible] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);

    // ---- Form ----
    const [form] = Form.useForm();
    const isActiveWatch = Form.useWatch("is_active", form);

    // ---- template_json as ordered arrays ----
    const [baseItems, setBaseItems] = useState<DraggableItem[]>([]);
    const [sectionItems, setSectionItems] = useState<DraggableItem[]>([]);

    // ---- Signature metadata flags (T7) ----
    const [showSignatureSection, setShowSignatureSection] = useState(false);
    const [requireDigitalSignature, setRequireDigitalSignature] = useState(false);

    // ---- Modals ----
    const [baseFieldModalOpen, setBaseFieldModalOpen] = useState(false);
    const [baseFieldForm] = Form.useForm();
    const [sectionModalOpen, setSectionModalOpen] = useState(false);
    const [sectionForm] = Form.useForm();

    // ---- Default value modal ----
    const [defaultValueModal, setDefaultValueModal] = useState<{
        key: string;
        isSection: boolean;
        label: string;
        type: TemplateFieldType | "date";
        currentValue: string;
    } | null>(null);
    const [defaultDraftValue, setDefaultDraftValue] = useState<string>("");

    // Convert template_json ↔ ordered arrays
    const templateJSONFromArrays = (): ReportTemplateJSON => ({
        base: Object.fromEntries(baseItems.map(({ key, cfg }) => [key, cfg])) as ReportTemplateJSON["base"],
        sections: Object.fromEntries(sectionItems.map(({ key, cfg }) => [key, cfg])) as ReportTemplateJSON["sections"],
        base_order: baseItems.map(({ key }) => key),
        section_order: sectionItems.map(({ key }) => key),
        signatureMetadata: {
            show_signature_section: showSignatureSection,
            require_digital_signature: showSignatureSection && requireDigitalSignature,
        },
    });

    const arraysFromTemplateJSON = (json: ReportTemplateJSON | TemplateOrderInput) => {
        const bo = resolveBaseOrder(json);
        const so = resolveSectionOrder(json);
        setBaseItems(
            bo.map((key) => ({ key, cfg: json.base[key] as ReportBaseFieldConfig }))
        );
        setSectionItems(
            so.map((key) => ({ key, cfg: json.sections[key] as ReportSectionConfig }))
        );
        const sig = resolveSignatureMetadata(json as { signatureMetadata?: ReportTemplateJSON["signatureMetadata"] });
        setShowSignatureSection(sig.show_signature_section);
        setRequireDigitalSignature(sig.require_digital_signature);
    };

    // Load list
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

    // Panel helpers
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
            // and all fields have the required value/content properties
            const mergedBase: ReportTemplateJSON["base"] = {};
            const mergedSections: ReportTemplateJSON["sections"] = {};

            // Keep stored order, filling in missing fields from defaults
            if (stored.base) {
                Object.entries(stored.base).forEach(([k, v]) => {
                    mergedBase[k] = { ...v, value: (v as ReportBaseFieldConfig & { value?: string }).value ?? "" } as ReportBaseFieldConfig;
                });
            }
            if (stored.sections) {
                Object.entries(stored.sections).forEach(([k, v]) => {
                    mergedSections[k] = { ...v, content: (v as ReportSectionConfig & { content?: string }).content ?? "" } as ReportSectionConfig;
                });
            }

            // Add missing predefined keys at the end.
            // Fields in LEGACY_PREDEFINED_BASE_HIDDEN are hidden by default in existing
            // templates because they didn't exist when those templates were created.
            Object.entries(defaults.base).forEach(([k, v]) => {
                if (!mergedBase[k]) {
                    mergedBase[k] = LEGACY_PREDEFINED_BASE_HIDDEN.has(k) ? { ...v, is_visible: false } : v;
                }
            });
            Object.entries(defaults.sections).forEach(([k, v]) => { if (!mergedSections[k]) mergedSections[k] = v; });

            const storedLoose = stored as ReportTemplateJSON;

            arraysFromTemplateJSON({
                base: mergedBase,
                sections: mergedSections,
                base_order: storedLoose.base_order,
                section_order: storedLoose.section_order,
                // Required so Switch UI reflects persisted flags (arraysFromTemplateJSON
                // derives toggle state exclusively from signatureMetadata).
                signatureMetadata: storedLoose.signatureMetadata,
            });
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

    // Save
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

    // Delete template
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

    // Base field mutations
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
                item.key === key
                    ? { ...item, cfg: { ...item.cfg, type: newType } as ReportBaseFieldConfig }
                    : item
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
                type: values.type as "text" | "numeric",
                value: "",
                is_custom: true,
            };
            setBaseItems((prev) => [...prev, { key, cfg: newField }]);
            baseFieldForm.resetFields();
            setBaseFieldModalOpen(false);
        } catch { /* validation */ }
    };

    // Section mutations
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
                item.key === key
                    ? { ...item, cfg: { ...item.cfg, type: newType } as ReportSectionConfig }
                    : item
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

            const newSection: ReportSectionTextCustom = {
                is_visible: true,
                label: values.label.trim(),
                type: values.type,
                content: "",
                is_custom: true,
            };
            setSectionItems((prev) => [...prev, { key, cfg: newSection }]);
            sectionForm.resetFields();
            setSectionModalOpen(false);
        } catch { /* validation */ }
    };

    // Default value handlers
    const openDefaultValueModal = useCallback(
        (key: string, isSection: boolean, label: string, type: TemplateFieldType | "date", value: string) => {
            setDefaultValueModal({ key, isSection, label, type, currentValue: value });
            setDefaultDraftValue(value);
        },
        []
    );

    const applyBaseDefaultValue = useCallback((key: string, value: string) => {
        setBaseItems((prev) =>
            prev.map((item) =>
                item.key === key
                    ? { ...item, cfg: { ...item.cfg, value } as ReportBaseFieldConfig }
                    : item
            )
        );
    }, []);

    const applySectionDefaultValue = useCallback((key: string, value: string) => {
        setSectionItems((prev) =>
            prev.map((item) =>
                item.key === key
                    ? { ...item, cfg: { ...item.cfg, content: value } as ReportSectionConfig }
                    : item
            )
        );
    }, []);

    const saveDefaultValue = useCallback(() => {
        if (!defaultValueModal) return;
        if (defaultValueModal.isSection) {
            applySectionDefaultValue(defaultValueModal.key, defaultDraftValue);
        } else {
            applyBaseDefaultValue(defaultValueModal.key, defaultDraftValue);
        }
        setDefaultValueModal(null);
    }, [defaultValueModal, defaultDraftValue, applyBaseDefaultValue, applySectionDefaultValue]);

    // Left panel — list
    const listPanel = (
        <Card
            style={{ ...cardStyle, maxHeight: "calc(100vh - 96px)", overflow: "hidden", display: "flex", flexDirection: "column" }}
            styles={{ body: { overflowY: "auto", flex: 1 } }}
        >
            <Spin spinning={loadingList}>
                <SearchField
                    small
                    value={templateSearch}
                    onChange={setTemplateSearch}
                    placeholder="Buscar plantillas"
                    style={{ marginBottom: 12 }}
                />
                {templates.length === 0 && !loadingList ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Sin plantillas aún"
                    />
                ) : (
                    (() => {
                        const visibleTemplates = templates.filter((t) => matchesQuery([t.name, t.description], templateSearch));
                        if (visibleTemplates.length === 0) {
                            return (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Sin coincidencias"
                                />
                            );
                        }
                        return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {visibleTemplates.map((t) => (
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
                                        {renderActiveChip(t.is_active)}
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
                        );
                    })()
                )}
            </Spin>
        </Card>
    );

    // Right panel — editor
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
                <CelumaButton type="text" icon={<CloseOutlined />} onClick={closePanel} />
            }
        >
                <Spin spinning={loadingDetail}>
                    <Form form={form} layout="vertical">
                        {/* ---- Nombre / descripción / estado ---- */}
                        <Form.Item
                            name="name"
                            rules={[{ required: true, message: "El nombre es requerido" }]}
                            style={{ marginBottom: 16 }}
                        >
                            <FloatingCaptionInput label="Nombre" requiredMark maxLength={255} />
                        </Form.Item>

                        <Form.Item name="description" style={{ marginBottom: 16 }}>
                            <CelumaTextArea value="" onChange={() => {}} placeholder="Descripción opcional" rows={2} maxLength={1000} />
                        </Form.Item>

                        {editingId && (
                            <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>Estado</div>
                                    <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>Define si la plantilla está disponible para nuevos reportes.</div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: isActiveWatch ? tokens.primary : tokens.textSecondary }}>{isActiveWatch ? "Activo" : "Inactivo"}</span>
                                    <Form.Item name="is_active" valuePropName="checked" noStyle>
                                        <CelumaSwitch />
                                    </Form.Item>
                                </div>
                            </Panel>
                        )}

                        <Divider />

                        {/* ---- Campos base ---- */}
                        <SectionTitle
                            extra={
                                <CelumaButton
                                    size="xsmall"
                                    icon={<PlusOutlined />}
                                    onClick={() => { baseFieldForm.resetFields(); setBaseFieldModalOpen(true); }}
                                >
                                    Nuevo
                                </CelumaButton>
                            }
                        >
                            Campos base
                        </SectionTitle>

                        <DraggableList
                            items={baseItems}
                            isPredefined={(k) => PREDEFINED_BASE_KEYS.includes(k)}
                            isSection={false}
                            onReorder={setBaseItems}
                            onToggleVisible={toggleBaseVisible}
                            onRename={renameBaseField}
                            onChangeType={changeBaseFieldType}
                            onRemove={removeBaseField}
                            onEditDefaultValue={(key, label, type, value) =>
                                openDefaultValueModal(key, false, label, type, value)
                            }
                        />

                        <Divider />

                        {/* ---- Secciones ---- */}
                        <SectionTitle
                            extra={
                                <CelumaButton
                                    size="xsmall"
                                    icon={<PlusOutlined />}
                                    onClick={() => { sectionForm.resetFields(); setSectionModalOpen(true); }}
                                >
                                    Nuevo
                                </CelumaButton>
                            }
                        >
                            Secciones
                        </SectionTitle>

                        <DraggableList
                            items={sectionItems}
                            isPredefined={(k) => PREDEFINED_SECTION_KEYS.includes(k)}
                            isSection
                            onReorder={setSectionItems}
                            onToggleVisible={toggleSectionVisible}
                            onRename={renameSection}
                            onChangeType={changeSectionType}
                            onRemove={removeSection}
                            onEditDefaultValue={(key, label, type, value) =>
                                openDefaultValueModal(key, true, label, type, value)
                            }
                        />

                        <Divider />

                        {/* ---- Firma (T7) ---- */}
                        <SectionTitle icon={<SafetyCertificateOutlined />}>Firma</SectionTitle>
                        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                            Estos valores se usan como predeterminados al crear nuevos informes con esta plantilla.
                        </Text>
                        <Panel style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 500 }}>
                                        Incluir sección de firma en el reporte
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Agrega un bloque al final del informe con espacio para la firma del revisor.
                                    </Text>
                                </div>
                                <CelumaSwitch
                                    checked={showSignatureSection}
                                    onChange={(checked) => {
                                        setShowSignatureSection(checked);
                                        if (!checked) setRequireDigitalSignature(false);
                                    }}
                                />
                            </div>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, opacity: showSignatureSection ? 1 : 0.5 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 500 }}>
                                        Firma digital (imagen PNG)
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Inserta la firma digital del revisor al firmar el reporte.
                                    </Text>
                                </div>
                                <CelumaSwitch
                                    checked={requireDigitalSignature}
                                    disabled={!showSignatureSection}
                                    onChange={setRequireDigitalSignature}
                                />
                            </div>
                        </Panel>

                        <Divider />

                        {/* ---- Acciones ---- */}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <CelumaButton size="small" onClick={closePanel} icon={<CloseOutlined />}>
                                Cancelar
                            </CelumaButton>
                            <CelumaButton
                                size="small"
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={saving}
                                onClick={handleSave}
                            >
                                {editingId ? "Guardar Cambios" : "Crear Plantilla"}
                            </CelumaButton>
                        </div>
                    </Form>
                </Spin>
            </Card>
    ) : null;

    // Content
    const content = (
        <>
            <div style={{ display: "grid", gap: tokens.gap }}>
                <PageHeader
                    title="Plantillas de Reporte"
                    subtitle="Diseña y gestiona las plantillas para los reportes de laboratorio"
                    extra={
                        <CelumaButton type="primary" onClick={openNewPanel}>
                            Nueva Plantilla
                        </CelumaButton>
                    }
                />
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
            </div>

            {/* ---- Modal: crear campo base custom ---- */}
            <CelumaModal
                title="Crear campo"
                open={baseFieldModalOpen}
                onCancel={() => { setBaseFieldModalOpen(false); baseFieldForm.resetFields(); }}
                destroyOnClose
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => { setBaseFieldModalOpen(false); baseFieldForm.resetFields(); }}>
                            Cancelar
                        </CelumaButton>
                        <CelumaButton size="xsmall" type="primary" onClick={handleAddBaseField}>
                            Agregar
                        </CelumaButton>
                    </div>
                }
            >
                <Form form={baseFieldForm} layout="vertical">
                    <Form.Item
                        name="label"
                        rules={[{ required: true, message: "El nombre es requerido" }]}
                        style={{ marginBottom: 16 }}
                    >
                        <FloatingCaptionInput label="Nombre del campo" requiredMark maxLength={100} />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        rules={[{ required: true, message: "El tipo es requerido" }]}
                        style={{ marginBottom: 4 }}
                    >
                        <FloatingCaptionSelect label="Tipo de campo" requiredMark options={BASE_FIELD_TYPE_OPTIONS} />
                    </Form.Item>
                </Form>
            </CelumaModal>

            {/* ---- Modal: crear sección custom ---- */}
            <CelumaModal
                title="Crear sección"
                open={sectionModalOpen}
                onCancel={() => { setSectionModalOpen(false); sectionForm.resetFields(); }}
                destroyOnClose
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => { setSectionModalOpen(false); sectionForm.resetFields(); }}>
                            Cancelar
                        </CelumaButton>
                        <CelumaButton size="xsmall" type="primary" onClick={handleAddSection}>
                            Agregar
                        </CelumaButton>
                    </div>
                }
            >
                <Form form={sectionForm} layout="vertical">
                    <Form.Item
                        name="label"
                        rules={[{ required: true, message: "El nombre es requerido" }]}
                        style={{ marginBottom: 16 }}
                    >
                        <FloatingCaptionInput label="Nombre de la sección" requiredMark maxLength={100} />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        rules={[{ required: true, message: "El tipo es requerido" }]}
                        style={{ marginBottom: 4 }}
                    >
                        <FloatingCaptionSelect label="Tipo de contenido" requiredMark options={SECTION_TYPE_OPTIONS} />
                    </Form.Item>
                </Form>
            </CelumaModal>

            {/* ---- Modal: valor / contenido por defecto ---- */}
            <CelumaModal
                title={
                    defaultValueModal
                        ? `${defaultValueModal.isSection ? "Contenido" : "Valor"} por defecto — ${defaultValueModal.label}`
                        : "Valor por defecto"
                }
                open={defaultValueModal !== null}
                onCancel={() => setDefaultValueModal(null)}
                width={
                    defaultValueModal?.type === "richtext" || defaultValueModal?.type === "table"
                        ? 700
                        : 480
                }
                destroyOnClose
                styles={{
                    body: { padding: "8px 24px", background: tokens.cardBg },
                    footer: { padding: "8px 16px 16px", background: tokens.cardBg },
                }}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <CelumaButton size="xsmall" onClick={() => setDefaultValueModal(null)}>
                            Cancelar
                        </CelumaButton>
                        <CelumaButton size="xsmall" type="primary" onClick={saveDefaultValue}>
                            Guardar
                        </CelumaButton>
                    </div>
                }
            >
                {defaultValueModal && (
                    <div>
                        {defaultValueModal.type === "text" && (
                            <CelumaTextArea
                                value={defaultDraftValue}
                                onChange={setDefaultDraftValue}
                                rows={4}
                                placeholder="Texto por defecto..."
                                autoFocus
                            />
                        )}
                        {defaultValueModal.type === "numeric" && (
                            <FloatingCaptionInput
                                label="Valor numérico por defecto"
                                value={defaultDraftValue}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "" || /^-?\d*\.?\d*$/.test(val)) {
                                        setDefaultDraftValue(val);
                                    }
                                }}
                            />
                        )}
                        {defaultValueModal.type === "date" && (
                            <DatePicker
                                value={defaultDraftValue ? dayjs(defaultDraftValue, "YYYY-MM-DD") : null}
                                onChange={(_, dateStr) =>
                                    setDefaultDraftValue(Array.isArray(dateStr) ? dateStr[0] : dateStr)
                                }
                                style={{ width: "100%" }}
                                format="DD/MM/YYYY"
                                placeholder="Fecha por defecto..."
                            />
                        )}
                        {defaultValueModal.type === "richtext" && (
                            <CelumaRichText
                                value={defaultDraftValue}
                                onChange={setDefaultDraftValue}
                                placeholder="Contenido por defecto..."
                                minHeight={180}
                            />
                        )}
                        {defaultValueModal.type === "table" && (
                            <TableEditor
                                value={defaultDraftValue}
                                onChange={setDefaultDraftValue}
                            />
                        )}
                    </div>
                )}
            </CelumaModal>
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
