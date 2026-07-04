import { useState } from "react";
import { Dropdown, Spin, Tooltip } from "antd";
import { PlusOutlined, LinkOutlined, CheckOutlined, DeleteOutlined, TagsOutlined, ArrowLeftOutlined } from "@ant-design/icons";
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

    // Inline create view (replaces the old antd Modal so nothing closes the dropdown).
    const [view, setView] = useState<"list" | "create">("list");
    const [newLabelName, setNewLabelName] = useState("");
    const [newLabelColor, setNewLabelColor] = useState("#3b82f6");
    const [creating, setCreating] = useState(false);
    const [nameFocused, setNameFocused] = useState(false);

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

    const trimmedSearch = searchTerm.trim();
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

    // Open the inline create view, optionally prefilled (e.g. from the search term).
    const startCreate = (prefill = "") => {
        setNewLabelName(prefill);
        setNewLabelColor("#3b82f6");
        setView("create");
    };

    const handleCreateLabel = async () => {
        if (!newLabelName.trim()) return;

        setCreating(true);
        try {
            const { createLabel } = await import("../../services/collaboration_service");
            const newLabel = await createLabel({ name: newLabelName.trim(), color: newLabelColor });
            await onLabelsRefresh();

            // Auto-select the newly created label — the user created it to use it.
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.add(newLabel.id);
                return newSet;
            });

            // Back to the list (dropdown stays open) so they can keep editing / Apply.
            setNewLabelName("");
            setNewLabelColor("#3b82f6");
            setSearchTerm("");
            setView("list");
        } catch (error) {
            console.error("Failed to create label:", error);
        } finally {
            setCreating(false);
        }
    };

    const labelActions: ActionButtonItem[] = [
        {
            icon: <PlusOutlined />,
            tooltip: "Nueva etiqueta",
            ariaLabel: "Nueva etiqueta",
            onClick: () => startCreate(""),
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
    const previewColorConfig = predefinedColors.find(c => c.color === newLabelColor) || { color: newLabelColor, bg: newLabelColor + "20" };

    const containerStyle: React.CSSProperties = {
        background: "#fff",
        borderRadius: 14,
        boxShadow: tokens.shadow,
        border: "1px solid #eef1f0",
        width: 320,
        maxWidth: "92vw",
        overflow: "hidden",
    };

    // Inline "create label" view — lives inside the dropdown so it never closes it.
    const createView = (
        <div style={containerStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 6px" }}>
                <button
                    type="button"
                    aria-label="Volver"
                    onClick={() => setView("list")}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#eaf7f5")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    style={{
                        width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent",
                        color: tokens.primary, cursor: "pointer", display: "inline-flex", alignItems: "center",
                        justifyContent: "center", fontSize: 14, transition: "background .15s ease", flexShrink: 0,
                    }}
                >
                    <ArrowLeftOutlined />
                </button>
                <span style={{ fontFamily: tokens.titleFont, fontSize: 15, fontWeight: 700, color: tokens.textPrimary }}>
                    Nueva etiqueta
                </span>
            </div>

            <div style={{ padding: "6px 14px 14px", display: "grid", gap: 12 }}>
                <input
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newLabelName.trim() && !creating) handleCreateLabel(); }}
                    placeholder="Nombre de la etiqueta"
                    maxLength={100}
                    autoFocus
                    style={{
                        height: 40,
                        padding: "0 12px",
                        border: `2px solid ${nameFocused ? "#3da8a0" : "#49b6ad"}`,
                        borderRadius: 10,
                        background: "#fff",
                        boxShadow: nameFocused ? "0 0 0 3px rgba(73,182,173,.20)" : "none",
                        outline: "none",
                        fontSize: 14,
                        color: tokens.textPrimary,
                        fontFamily: "inherit",
                        transition: "border-color .2s, box-shadow .2s",
                    }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                    {predefinedColors.map((opt) => {
                        const sel = newLabelColor === opt.color;
                        return (
                            <button
                                key={opt.color}
                                type="button"
                                aria-label={opt.name}
                                onClick={() => setNewLabelColor(opt.color)}
                                style={{
                                    height: 30,
                                    borderRadius: 8,
                                    background: opt.bg,
                                    border: sel ? `2px solid ${opt.color}` : "2px solid transparent",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    position: "relative",
                                    transition: "border-color .15s ease",
                                }}
                            >
                                <span style={{ width: 16, height: 16, borderRadius: 5, background: opt.color }} />
                                {sel && <CheckOutlined style={{ position: "absolute", color: "#fff", fontSize: 10 }} />}
                            </button>
                        );
                    })}
                </div>

                {/* Live preview */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>Vista previa:</span>
                    <span
                        style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            background: previewColorConfig.bg,
                            color: previewColorConfig.color,
                            fontWeight: 600,
                            fontSize: 11,
                            display: "inline-flex",
                            alignItems: "center",
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {newLabelName.trim() || "Etiqueta"}
                    </span>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
                    <CelumaButton size="xsmall" danger onClick={() => setView("list")} disabled={creating}>
                        Cancelar
                    </CelumaButton>
                    <CelumaButton size="xsmall" type="primary" loading={creating} disabled={!newLabelName.trim()} onClick={handleCreateLabel}>
                        Crear
                    </CelumaButton>
                </div>
            </div>
        </div>
    );

    const listView = (
        <div style={containerStyle}>
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
                    trimmedSearch ? (
                        // No match → offer to create a label with the searched name.
                        <button
                            type="button"
                            onClick={() => startCreate(trimmedSearch)}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#eaf7f5")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "10px 10px",
                                border: "none",
                                background: "transparent",
                                borderRadius: 10,
                                cursor: "pointer",
                                color: tokens.primary,
                                fontSize: 13,
                                fontWeight: 600,
                                transition: "background .15s ease",
                            }}
                        >
                            <span
                                style={{
                                    width: 22, height: 22, borderRadius: 7, background: "#eaf7f5", color: tokens.primary,
                                    display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0,
                                }}
                            >
                                <PlusOutlined />
                            </span>
                            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: tokens.textPrimary, fontWeight: 500 }}>
                                Crear etiqueta “<strong style={{ color: tokens.primary }}>{trimmedSearch}</strong>”
                            </span>
                        </button>
                    ) : (
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
                                    width: 40, height: 40, borderRadius: "50%", background: "#f5f3ff", color: "#8b5cf6",
                                    display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                                }}
                            >
                                <TagsOutlined />
                            </span>
                            <span style={{ fontSize: 13 }}>Aún no hay etiquetas</span>
                        </div>
                    )
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
                        onOpenChange={(open) => {
                            setDropdownOpen(open);
                            setView("list");
                            setSearchTerm("");
                            // Sync selection with the order's currently-applied labels on open
                            // (props may have loaded/changed after mount). This is what makes
                            // creating a label additive: existing selections are preserved.
                            if (open) setSelectedIds(new Set(ownLabels.map(l => l.id)));
                        }}
                        trigger={["click"]}
                        dropdownRender={() => (view === "create" ? createView : listView)}
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
