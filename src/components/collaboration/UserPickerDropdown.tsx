import { useMemo } from "react";
import { Avatar } from "antd";
import { DeleteOutlined, TeamOutlined } from "@ant-design/icons";
import type { LabUser } from "../../services/collaboration_service";
import { tokens } from "../design/tokens";
import { getInitials, getAvatarColor } from "../comments/comment_utils";
import SearchField from "../ui/search_field";
import SelectionCheckbox from "../ui/selection_checkbox";
import CelumaButton from "../ui/button";
import ActionButtonPanel from "../ui/action_button_panel";

type UserPickerDropdownProps = {
    users: LabUser[];
    selectedIds: Set<string>;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onToggle: (id: string) => void;
    onClear: () => void;
    onApply: () => void;
    onCancel: () => void;
    loading: boolean;
    /** e.g. "Limpiar revisores" / "Limpiar asignados" */
    clearLabel: string;
    searchPlaceholder?: string;
    emptyText?: string;
};

/**
 * Céluma-styled picker used by the order rail (Revisores / Asignados). Same
 * visual language as the rest of the app: rounded card + brand shadow, teal
 * SearchField, soft teal-tinted rows with a pill checkbox, and CelumaButton
 * footer. Presentational — selection/search state lives in the parent section.
 */
export default function UserPickerDropdown({
    users,
    selectedIds,
    searchTerm,
    onSearchChange,
    onToggle,
    onClear,
    onApply,
    onCancel,
    loading,
    clearLabel,
    searchPlaceholder = "Buscar usuario…",
    emptyText = "No se encontraron usuarios",
}: UserPickerDropdownProps) {
    const filtered = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return users.filter(
            (u) =>
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                (u.username && u.username.toLowerCase().includes(q))
        );
    }, [users, searchTerm]);

    const selected = filtered.filter((u) => selectedIds.has(u.id));
    const unselected = filtered.filter((u) => !selectedIds.has(u.id));

    const renderRow = (user: LabUser) => {
        const isSelected = selectedIds.has(user.id);
        const baseBg = isSelected ? "#eaf7f5" : "transparent";
        return (
            <div
                key={user.id}
                role="button"
                onClick={() => onToggle(user.id)}
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

                <Avatar
                    size={28}
                    src={user.avatar_url}
                    style={{
                        backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name),
                        fontSize: 12,
                        flexShrink: 0,
                    }}
                >
                    {!user.avatar_url && getInitials(user.name)}
                </Avatar>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontWeight: 600,
                            fontSize: 13.5,
                            color: tokens.textPrimary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {user.name}
                    </div>
                    <div
                        style={{
                            fontSize: 12,
                            color: tokens.textSecondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        @{user.username || user.email.split("@")[0]}
                    </div>
                </div>
            </div>
        );
    };

    return (
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
                <SearchField small value={searchTerm} onChange={onSearchChange} placeholder={searchPlaceholder} />
            </div>

            <div style={{ maxHeight: 288, overflowY: "auto", padding: "6px 8px", display: "grid", gap: 2 }}>
                {selected.map(renderRow)}
                {selected.length > 0 && unselected.length > 0 && (
                    <div style={{ borderBottom: "1px solid #eef1f0", margin: "4px 6px" }} />
                )}
                {unselected.map(renderRow)}
                {filtered.length === 0 && (
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
                                background: "#eaf7f5",
                                color: tokens.primary,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                            }}
                        >
                            <TeamOutlined />
                        </span>
                        <span style={{ fontSize: 13 }}>{emptyText}</span>
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
                <div>
                    {selectedIds.size > 0 && (
                        <ActionButtonPanel
                            size="xsmall"
                            actions={[
                                { icon: <DeleteOutlined />, tooltip: clearLabel, ariaLabel: clearLabel, danger: true, onClick: onClear },
                            ]}
                        />
                    )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <CelumaButton size="xsmall" danger onClick={onCancel}>
                        Cancelar
                    </CelumaButton>
                    <CelumaButton size="xsmall" type="primary" onClick={onApply} loading={loading}>
                        Aplicar
                    </CelumaButton>
                </div>
            </div>
        </div>
    );
}
