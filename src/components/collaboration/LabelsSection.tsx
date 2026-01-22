import { useState } from "react";
import { Dropdown, Input, Button as AntButton, Spin, Modal, Tooltip } from "antd";
import { SettingOutlined, PlusOutlined, LinkOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { Label, LabelWithInheritance } from "../../services/collaboration_service";
import { tokens } from "../design/tokens";

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

    const handleClear = async () => {
        setLoading(true);
        try {
            await onUpdate([]);
            setSelectedIds(new Set());
            setDropdownOpen(false);
        } catch (error) {
            console.error("Failed to clear labels:", error);
        } finally {
            setLoading(false);
        }
    };

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

    const dropdownMenu = (
        <div style={{ 
            background: "#fff", 
            borderRadius: 8, 
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            padding: "8px 0",
            minWidth: 300,
            maxWidth: 320,
        }}>
            <div style={{ padding: "0 12px 8px 12px" }}>
                <Input
                    placeholder="Buscar etiqueta..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ 
                        borderRadius: 6,
                        fontSize: 14,
                    }}
                    autoFocus
                />
            </div>

            {/* Info message if there are inherited labels */}
            {inheritedLabelIds.size > 0 && (
                <div
                    style={{
                        padding: "8px 12px",
                        background: "#f0f9ff",
                        borderBottom: "1px solid #e5e7eb",
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

            {/* Clear Button */}
            {selectedIds.size > 0 && (
                <div
                    style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        borderBottom: "1px solid #e5e7eb",
                        transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    onClick={handleClear}
                >
                    <CloseOutlined style={{ fontSize: 14, color: tokens.textSecondary }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                        Limpiar etiquetas
                    </span>
                </div>
            )}

            <div style={{ 
                maxHeight: 300, 
                overflowY: "auto",
                padding: "4px 0",
            }}>
                {/* Selected labels first */}
                {filteredLabels.filter(label => selectedIds.has(label.id)).map(label => {
                    const isSelected = true;
                    const colorConfig = predefinedColors.find(c => c.color === label.color) || { color: label.color, bg: label.color + "20" };
                    return (
                        <div
                            key={label.id}
                            style={{
                                padding: "6px 12px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            onClick={() => {
                                setSelectedIds(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(label.id);
                                    return newSet;
                                });
                            }}
                        >
                            {/* Checkmark Icon */}
                            <div style={{ 
                                width: 16, 
                                height: 16,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}>
                                {isSelected && (
                                    <CheckOutlined style={{ 
                                        fontSize: 14, 
                                        color: tokens.primary,
                                        fontWeight: 700,
                                    }} />
                                )}
                            </div>

                            <div
                                style={{ 
                                    padding: "2px 8px",
                                    borderRadius: 4,
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
                })}

                {/* Separator if there are both selected and unselected */}
                {filteredLabels.filter(label => selectedIds.has(label.id)).length > 0 &&
                 filteredLabels.filter(label => !selectedIds.has(label.id)).length > 0 && (
                    <div style={{ 
                        borderBottom: "1px solid #e5e7eb",
                        margin: "4px 0",
                    }} />
                )}

                {/* Unselected labels */}
                {filteredLabels.filter(label => !selectedIds.has(label.id)).map(label => {
                    const isSelected = false;
                    const colorConfig = predefinedColors.find(c => c.color === label.color) || { color: label.color, bg: label.color + "20" };
                    return (
                        <div
                            key={label.id}
                            style={{
                                padding: "6px 12px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            onClick={() => {
                                setSelectedIds(prev => {
                                    const newSet = new Set(prev);
                                    newSet.add(label.id);
                                    return newSet;
                                });
                            }}
                        >
                            {/* Checkmark Icon */}
                            <div style={{ 
                                width: 16, 
                                height: 16,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}>
                                {isSelected && (
                                    <CheckOutlined style={{ 
                                        fontSize: 14, 
                                        color: tokens.primary,
                                        fontWeight: 700,
                                    }} />
                                )}
                            </div>

                            <div
                                style={{ 
                                    padding: "2px 8px",
                                    borderRadius: 4,
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
                })}
                {filteredLabels.length === 0 && (
                    <div style={{ 
                        padding: 20, 
                        textAlign: "center", 
                        color: tokens.textSecondary,
                        fontSize: 13,
                    }}>
                        No se encontraron etiquetas
                    </div>
                )}
            </div>

            <div style={{ 
                borderTop: "1px solid #e5e7eb",
                padding: "8px 12px",
                display: "flex", 
                gap: 8, 
                justifyContent: "space-between",
            }}>
                <AntButton 
                    size="small" 
                    icon={<PlusOutlined />}
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent dropdown from closing
                        setCreateModalOpen(true);
                    }}
                >
                    Nueva
                </AntButton>
                <div style={{ display: "flex", gap: 8 }}>
                    <AntButton size="small" onClick={() => setDropdownOpen(false)}>
                        Cancelar
                    </AntButton>
                    <AntButton size="small" type="primary" onClick={handleApply} loading={loading}>
                        Aplicar
                    </AntButton>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
            }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Etiquetas
                </span>
                <Dropdown
                    open={dropdownOpen}
                    onOpenChange={setDropdownOpen}
                    trigger={["click"]}
                    dropdownRender={() => dropdownMenu}
                    disabled={disabled}
                >
                    <SettingOutlined style={{ color: tokens.textSecondary, cursor: "pointer" }} />
                </Dropdown>
            </div>

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
                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                    Ninguna
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
        </>
    );
}
