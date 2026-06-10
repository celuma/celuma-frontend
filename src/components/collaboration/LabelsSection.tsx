import { useState } from "react";
import { Dropdown, Input, Spin, Modal, Tooltip } from "antd";
import { PlusOutlined, LinkOutlined, CheckOutlined, DeleteOutlined, TagsOutlined } from "@ant-design/icons";
import type { Label, LabelWithInheritance } from "../../services/collaboration_service";
import { tokens } from "../design/tokens";
import { RailSectionHeader, RailConfigButton } from "./RailSectionHeader";
import SearchField from "../ui/search_field";
import SelectionCheckbox from "../ui/selection_checkbox";
import CelumaButton from "../ui/button";
import ActionButtonPanel, { type ActionButtonItem } from "../ui/action_button_panel";
import ConfirmDialog from "../ui/confirm_dialog";

type LabelsSectionProps = {
    labels: (Label | LabelWithInheritance)[];
    allLabels: Label[];
    onUpdate: (labelIds: string[]) => Promise<void>;
    onLabelsRefresh: () => Promise<void>;
    disabled?: boolean;
    showInheritance?: boolean;
};

export default function LabelsSection({
    labels,
    allLabels,
    onUpdate,
    onLabelsRefresh,
    disabled,
    showInheritance = false
}: LabelsSectionProps) {
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);

    // Get only the "own" labels (not inherited) for selectedIds
    const ownLabels = labels.filter(label => !showInheritance || !("inherited" in label) || !label.inherited);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(ownLabels.map(l => l.id))
    );

    // Modal for creating new label
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newLabelName, setNewLabelName] = useState("");
    const [newLabelColor, setNewLabelColor] = useState("#3b82f6");
    const [creating, setCreating] = useState(false);

    // Predefined colors similar to status colors
    const predefinedColors = [
        { color: "#3b82f6", bg: "#eff6ff", name: "Azul" },
        { color: "#f59e0b", bg: "#fffbeb", name: "Naranja" },
        { color: "#8b5cf6", bg: "#f5f3ff", name: "Púrpura" },
        { color: "#ec4899", bg: "#fdf2f8", name: "Rosa" },
        { color: "#10b981", bg: "#ecfdf5", name: "Verde" },
        { color: "#ef4444", bg: "#fef2f2", name: "Rojo" },
        { color: "#06b6d4", bg: "#ecfeff", name: "Cyan" },
        { color: "#84cc16", bg: "#f7fee7", name: "Lima" },
        { color: "#6366f1", bg: "#eef2ff", name: "Índigo" },
        { color: "#a855f7", bg: "#faf5ff", name: "Violeta" },
        { color: "#f97316", bg: "#fff7ed", name: "Naranja Oscuro" },
        { color: "#14b8a6", bg: "#f0fdfa", name: "Teal" },
    ];

    // Get inherited label IDs to exclude from dropdown
    const inheritedLabelIds = new Set(
        labels
            .filter(label => showInheritance && "inherited" in label && label.inherited)
            .map(label => label.id)
    );

    // Filter out inherited labels from available labels
    const availableLabels = allLabels.filter(label => !inheritedLabelIds.has(label.id));

    const filteredLabels = availableLabels.filter(label =>
        label.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleToggle = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleApply = async () => {
        setLoading(true);
        try {
            await onUpdate(Array.from(selectedIds));
            setDropdownOpen(false);
            setSearchTerm("");
        } catch (error) {
            console.error("Failed to update labels:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleClearConfirmed = async () => {
        setLoading(true);
        try {
            await onUpdate([]);
            setSelectedIds(new Set());
            setConfirmClearOpen(false);
            setDropdownOpen(false);
        } catch (error) {
            console.error("Failed to clear labels:", error);
        } finally {
            setLoading(false);
        }
    };

    const labelActions: ActionButtonItem[] = [
        {
            icon: <PlusOutlined />,
            tooltip: "Nueva etiqueta",
            ariaLabel: "Nueva etiqueta",
            onClick: (e) => {
                e.stopPropagation(); // keep the picker dropdown open behind the modal
                setCreateModalOpen(true);
            },
        },
    ];
    if (selectedIds.size > 0) {
        labelActions.push({
            icon: <DeleteOutlined />,
            tooltip: "Limpiar etiquetas",
            ariaLabel: "Limpiar etiquetas",
            danger: true,
            onClick: () => setConfirmClearOpen(true),
        });
    }

    const handleCreateLabel = async () => {
        if (!newLabelName.trim()) return;

        setCreating(true);
        try {
            const { createLabel } = await import("../../services/collaboration_service");
            const newLabel = await createLabel({ name: newLabelName.trim(), color: newLabelColor });
            await onLabelsRefresh();

            // Auto-select the newly created label
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.add(newLabel.id);
                return newSet;
            });

            setCreateModalOpen(false);
            setNewLabelName("");
            setNewLabelColor("#3b82f6");
        } catch (error) {
            console.error("Failed to create label:", error);
        } finally {
            setCreating(false);
        }
    };

    const renderLabelRow = (label: Label) => {
        const isSelected = selectedIds.has(label.id);
        const colorConfig = predefinedColors.find(c => c.color === label.color) || { color: label.color, bg: label.color + "20" };
        const baseBg = isSelected ? "#eaf7f5" : "transparent";
        return (
            <div
                key={label.id}
                role="button"
                onClick={() => handleToggle(label.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1faf8")}
                onMouseLeave={(e) => (e.currentTarget.style.background = baseBg)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: baseBg,
                    transition: "background .15s ease",
                }}
            >
                <SelectionCheckbox checked={isSelected} />

                <div
                    style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: colorConfig.bg,
                        color: colorConfig.color,
                        fontWeight: 600,
                        fontSize: 11,
                        display: "inline-flex",
                        alignItems: "center",
                        whiteSpace: "nowrap",
                    }}
                >
                    {label.name}
                </div>
            </div>
        );
    };

    const selectedRows = filteredLabels.filter(label => selectedIds.has(label.id));
    const unselectedRows = filteredLabels.filter(label => !selectedIds.has(label.id));

    const dropdownMenu = (
        <div
            style={{
                background: "#fff",
                borderRadius: 14,
                boxShadow: tokens.shadow,
                border: "1px solid #eef1f0",
                width: 320,
                maxWidth: "92vw",
                overflow: "hidden",
            }}
        >
            <div style={{ padding: "12px 12px 8px" }}>
                <SearchField small value={searchTerm} onChange={setSearchTerm} placeholder="Buscar etiqueta…" />
            </div>

            {/* Info message if there are inherited labels */}
            {inheritedLabelIds.size > 0 && (
                <div
                    style={{
                        padding: "8px 14px",
                        background: "#eff6ff",
                        borderBottom: "1px solid #eef1f0",
                        fontSize: 12,
                        color: "#0369a1",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <LinkOutlined style={{ fontSize: 11 }} />
                    <span>Las etiquetas heredadas no se pueden modificar</span>
                </div>
            )}

            <div style={{ maxHeight: 288, overflowY: "auto", padding: "6px 8px", display: "grid", gap: 2 }}>
                {selectedRows.map(renderLabelRow)}
                {selectedRows.length > 0 && unselectedRows.length > 0 && (
                    <div style={{ borderBottom: "1px solid #eef1f0", margin: "4px 6px" }} />
                )}
                {unselectedRows.map(renderLabelRow)}
                {filteredLabels.length === 0 && (
                    <div
                        style={{
                            display: "grid",
                            justifyItems: "center",
                            gap: 8,
                            padding: "22px 12px",
                            color: tokens.textSecondary,
                        }}
                    >
                        <span
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: "50%",
                                background: "#f5f3ff",
                                color: "#8b5cf6",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                            }}
                        >
                            <TagsOutlined />
                        </span>
                        <span style={{ fontSize: 13 }}>No se encontraron etiquetas</span>
                    </div>
                )}
            </div>

            <div
                style={{
                    borderTop: "1px solid #eef1f0",
                    padding: "10px 12px",
                    display: "flex",
                    gap: 8,
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fbfdfc",
                }}
            >
                <ActionButtonPanel size="xsmall" actions={labelActions} />
                <div style={{ display: "flex", gap: 8 }}>
                    <CelumaButton size="xsmall" danger onClick={() => setDropdownOpen(false)}>
                        Cancelar
                    </CelumaButton>
                    <CelumaButton size="xsmall" type="primary" onClick={handleApply} loading={loading}>
                        Aplicar
                    </CelumaButton>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <RailSectionHeader
                icon={<TagsOutlined />}
                color="#8b5cf6"
                title="Etiquetas"
                count={labels.length}
                trigger={
                    <Dropdown
                        open={dropdownOpen}
                        onOpenChange={setDropdownOpen}
                        trigger={["click"]}
                        dropdownRender={() => dropdownMenu}
                        disabled={disabled}
                    >
                        <RailConfigButton disabled={disabled} />
                    </Dropdown>
                }
            />

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <Spin size="small" />
                </div>
            ) : labels.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {/* Sort labels: inherited first, then own labels */}
                    {[...labels].sort((a, b) => {
                        const aInherited = showInheritance && "inherited" in a && a.inherited;
                        const bInherited = showInheritance && "inherited" in b && b.inherited;
                        if (aInherited && !bInherited) return -1;
                        if (!aInherited && bInherited) return 1;
                        return 0;
                    }).map(label => {
                        const isInherited = showInheritance && "inherited" in label && label.inherited;
                        const colorConfig = predefinedColors.find(c => c.color === label.color) || { color: label.color, bg: label.color + "20" };
                        return (
                            <div
                                key={label.id}
                                style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    background: colorConfig.bg,
                                    color: colorConfig.color,
                                    fontWeight: 600,
                                    fontSize: 11,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                {isInherited && (
                                    <Tooltip title="Heredada de la orden">
                                        <LinkOutlined style={{ fontSize: 10 }} />
                                    </Tooltip>
                                )}
                                {label.name}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    textAlign: "center",
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: "#fafbfc",
                    border: "1px dashed #e5e7eb",
                    color: tokens.textSecondary,
                }}>
                    Sin etiquetas
                </div>
            )}

            {/* Create Label Modal */}
            <Modal
                title="Crear Nueva Etiqueta"
                open={createModalOpen}
                onOk={handleCreateLabel}
                onCancel={() => {
                    setCreateModalOpen(false);
                    setNewLabelName("");
                    setNewLabelColor("#3b82f6");
                }}
                okText="Crear"
                cancelText="Cancelar"
                confirmLoading={creating}
                okButtonProps={{ disabled: !newLabelName.trim() }}
                mask={false}
                modalRender={(modal) => (
                    <div onClick={(e) => e.stopPropagation()}>
                        {modal}
                    </div>
                )}
            >
                <div style={{ display: "grid", gap: 16 }}>
                    <div>
                        <label style={{
                            display: "block",
                            marginBottom: 8,
                            fontWeight: 500,
                            fontSize: 13,
                        }}>
                            Nombre
                        </label>
                        <Input
                            placeholder="Ej: Urgente, Especial..."
                            value={newLabelName}
                            onChange={(e) => setNewLabelName(e.target.value)}
                            maxLength={100}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label style={{
                            display: "block",
                            marginBottom: 8,
                            fontWeight: 500,
                            fontSize: 13,
                        }}>
                            Color
                        </label>
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: 8,
                        }}>
                            {predefinedColors.map((colorOption) => (
                                <div
                                    key={colorOption.color}
                                    onClick={() => setNewLabelColor(colorOption.color)}
                                    style={{
                                        cursor: "pointer",
                                        padding: "8px 12px",
                                        borderRadius: 6,
                                        background: colorOption.bg,
                                        border: newLabelColor === colorOption.color ? `2px solid ${colorOption.color}` : "2px solid transparent",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        transition: "all 0.15s",
                                        position: "relative",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: 4,
                                            background: colorOption.color,
                                        }}
                                    />
                                    {newLabelColor === colorOption.color && (
                                        <CheckOutlined
                                            style={{
                                                position: "absolute",
                                                color: "#fff",
                                                fontSize: 12,
                                                fontWeight: 700,
                                            }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <div
                                style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    background: predefinedColors.find(c => c.color === newLabelColor)?.bg || newLabelColor + "20",
                                    color: newLabelColor,
                                    fontWeight: 600,
                                    fontSize: 11,
                                    display: "inline-flex",
                                    alignItems: "center",
                                }}
                            >
                                {newLabelName || "Vista Previa"}
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                open={confirmClearOpen}
                danger
                title="Quitar etiquetas"
                description="Se quitarán todas las etiquetas de esta orden."
                confirmText="Quitar"
                cancelText="Cancelar"
                loading={loading}
                onConfirm={handleClearConfirmed}
                onCancel={() => setConfirmClearOpen(false)}
            />
        </>
    );
}
