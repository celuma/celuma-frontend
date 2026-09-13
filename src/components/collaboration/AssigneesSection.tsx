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
                // Céluma 1.3.1 manual-validation remediation (R5, CEL-131-08).
                //
                // The product rule: a user who LACKS THE AUTHORIZATION for an
                // action does not see that action; a user who HAS it but is
                // blocked by the object's current lifecycle sees it disabled.
                // `disabled` here is the authorization case — the caller
                // passes it from `hasPermission(...)` — so the trigger is not
                // rendered at all. It used to render as a greyed-out gear,
                // which offered a control that could never work and read as a
                // temporary state rather than a permanent boundary.
                //
                // The read-only list below is deliberately NOT hidden: seeing
                // who is assigned is part of reading the order, and the
                // backend grants that with `lab:read`.
                trigger={disabled ? undefined : (
                    <Dropdown
                        open={dropdownOpen}
                        onOpenChange={(open) => {
                            setDropdownOpen(open);
                            // Sync selection with what's currently applied on open (props may have
                            // loaded/changed after mount), so applying never wipes existing assignees.
                            if (open) setSelectedIds(new Set(assignees.map(a => a.id)));
                            else setSearchTerm("");
                        }}
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
                    >
                        {/* Reached only when `disabled` is false — the branch
                            above is the authorization gate now. */}
                        <RailConfigButton />
                    </Dropdown>
                )}
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
