import { useState } from "react";
import { Avatar, Dropdown, Spin, Tooltip } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, AuditOutlined } from "@ant-design/icons";
import type { LabUser } from "../../services/collaboration_service";
import type { ReviewerWithStatus } from "../../services/worklist_service";
import { tokens } from "../design/tokens";
import { getInitials, getAvatarColor } from "../comments/comment_utils";
import { RailSectionHeader, RailConfigButton } from "./RailSectionHeader";
import UserPickerDropdown from "./UserPickerDropdown";
import ConfirmDialog from "../ui/confirm_dialog";

type ReviewersSectionProps = {
    reviewers: ReviewerWithStatus[];
    allUsers: LabUser[];
    onUpdate: (userIds: string[]) => Promise<void>;
    disabled?: boolean;
    orderStatus?: string;
};

export default function ReviewersSection({ reviewers, allUsers, onUpdate, disabled, orderStatus }: ReviewersSectionProps) {
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(reviewers.map(r => r.id))
    );

    const showWarning = reviewers.length === 0 && orderStatus === "REVIEW";

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
            console.error("Failed to update reviewers:", error);
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
            console.error("Failed to clear reviewers:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <RailSectionHeader
                icon={<AuditOutlined />}
                color="#ec4899"
                title="Revisores"
                count={reviewers.length}
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
                                clearLabel="Limpiar revisores"
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
            ) : reviewers.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {reviewers.map(reviewer => {
                        // Determine status icon and color
                        let statusIcon = null;
                        let statusColor = "#faad14"; // yellow for pending
                        let statusTooltip = "Revisión pendiente";

                        if (reviewer.status === "approved") {
                            statusIcon = <CheckCircleOutlined />;
                            statusColor = "#52c41a"; // green
                            statusTooltip = "Revisión aprobada";
                        } else if (reviewer.status === "rejected") {
                            statusIcon = <CloseCircleOutlined />;
                            statusColor = "#ff4d4f"; // red
                            statusTooltip = "Cambios solicitados";
                        } else {
                            statusIcon = <ClockCircleOutlined />;
                            statusColor = "#faad14"; // yellow
                            statusTooltip = "Revisión pendiente";
                        }

                        return (
                            <div
                                key={reviewer.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <Avatar
                                    size={24}
                                    src={reviewer.avatar_url}
                                    style={{
                                        backgroundColor: reviewer.avatar_url ? undefined : getAvatarColor(reviewer.name),
                                        fontSize: 11,
                                    }}
                                >
                                    {!reviewer.avatar_url && getInitials(reviewer.name)}
                                </Avatar>
                                <span style={{
                                    flex: 1,
                                    fontSize: 13,
                                    fontWeight: 500,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    {reviewer.name}
                                </span>
                                <Tooltip title={statusTooltip}>
                                    <span style={{
                                        fontSize: 16,
                                        color: statusColor,
                                        display: "flex",
                                        alignItems: "center",
                                    }}>
                                        {statusIcon}
                                    </span>
                                </Tooltip>
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
                    background: showWarning ? "#fffbeb" : "#fafbfc",
                    border: `1px dashed ${showWarning ? "#fde68a" : "#e5e7eb"}`,
                    color: showWarning ? "#b45309" : tokens.textSecondary,
                }}>
                    {showWarning ? "Sin revisores — se requiere al menos 1 revisión" : "Sin revisores asignados"}
                </div>
            )}

            <ConfirmDialog
                open={confirmClearOpen}
                danger
                title="Quitar revisores"
                description="Se quitarán todos los revisores de esta orden."
                confirmText="Quitar"
                cancelText="Cancelar"
                loading={loading}
                onConfirm={handleClearConfirmed}
                onCancel={() => setConfirmClearOpen(false)}
            />
        </>
    );
}
