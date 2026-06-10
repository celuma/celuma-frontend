import { useState } from "react";
import { Avatar, Dropdown, Spin } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import type { UserRef, LabUser } from "../../services/collaboration_service";
import { tokens } from "../design/tokens";
import { getInitials, getAvatarColor } from "../comments/comment_utils";
import { RailSectionHeader, RailConfigButton } from "./RailSectionHeader";
import UserPickerDropdown from "./UserPickerDropdown";
import ConfirmDialog from "../ui/confirm_dialog";

type AssigneesSectionProps = {
    assignees: UserRef[];
    allUsers: LabUser[];
    onUpdate: (userIds: string[]) => Promise<void>;
    disabled?: boolean;
};

export default function AssigneesSection({ assignees, allUsers, onUpdate, disabled }: AssigneesSectionProps) {
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(assignees.map(a => a.id))
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
            console.error("Failed to update assignees:", error);
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
            console.error("Failed to clear assignees:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <RailSectionHeader
                icon={<TeamOutlined />}
                color={tokens.primary}
                title="Asignados"
                count={assignees.length}
                trigger={
                    <Dropdown
                        open={dropdownOpen}
                        onOpenChange={setDropdownOpen}
                        trigger={["click"]}
                        dropdownRender={() => (
                            <UserPickerDropdown
                                users={allUsers}
                                selectedIds={selectedIds}
                                searchTerm={searchTerm}
                                onSearchChange={setSearchTerm}
                                onToggle={handleToggle}
                                onClear={() => setConfirmClearOpen(true)}
                                onApply={handleApply}
                                onCancel={() => setDropdownOpen(false)}
                                loading={loading}
                                clearLabel="Limpiar asignados"
                            />
                        )}
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
            ) : assignees.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {assignees.map(assignee => (
                        <div
                            key={assignee.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            <Avatar
                                size={24}
                                src={assignee.avatar_url}
                                style={{
                                    backgroundColor: assignee.avatar_url ? undefined : getAvatarColor(assignee.name),
                                    fontSize: 11,
                                }}
                            >
                                {!assignee.avatar_url && getInitials(assignee.name)}
                            </Avatar>
                            <span style={{
                                flex: 1,
                                fontSize: 13,
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}>
                                {assignee.name}
                            </span>
                        </div>
                    ))}
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
                    Sin asignar
                </div>
            )}

            <ConfirmDialog
                open={confirmClearOpen}
                danger
                title="Quitar asignados"
                description="Se quitarán todas las personas asignadas a esta orden."
                confirmText="Quitar"
                cancelText="Cancelar"
                loading={loading}
                onConfirm={handleClearConfirmed}
                onCancel={() => setConfirmClearOpen(false)}
            />
        </>
    );
}
