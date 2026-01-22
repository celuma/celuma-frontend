import { useState } from "react";
import { Avatar, Dropdown, Input, Button as AntButton, Spin } from "antd";
import { SettingOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { UserRef, LabUser } from "../../services/collaboration_service";
import { tokens } from "../design/tokens";

type ReviewersSectionProps = {
    reviewers: UserRef[];
    allUsers: LabUser[];
    onUpdate: (userIds: string[]) => Promise<void>;
    disabled?: boolean;
    orderStatus?: string;
};

const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0]?.toUpperCase() || "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0]?.toUpperCase() : "";
    return first + last || "U";
};

const getAvatarColor = (name: string): string => {
    const colors = [
        "#0f8b8d", "#3b82f6", "#8b5cf6", "#ec4899", 
        "#f59e0b", "#10b981", "#ef4444", "#6366f1"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export default function ReviewersSection({ reviewers, allUsers, onUpdate, disabled, orderStatus }: ReviewersSectionProps) {
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(reviewers.map(r => r.id))
    );

    const showWarning = reviewers.length === 0 && orderStatus === "REVIEW";

    const filteredUsers = allUsers.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.username && user.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );

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

    const handleClear = async () => {
        setLoading(true);
        try {
            await onUpdate([]);
            setSelectedIds(new Set());
            setDropdownOpen(false);
        } catch (error) {
            console.error("Failed to clear reviewers:", error);
        } finally {
            setLoading(false);
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
                    placeholder="Buscar usuario..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ 
                        borderRadius: 6,
                        fontSize: 14,
                    }}
                    autoFocus
                />
            </div>

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
                        Limpiar revisores
                    </span>
                </div>
            )}

            <div style={{ 
                maxHeight: 300, 
                overflowY: "auto",
                padding: "4px 0",
            }}>
                {/* Selected users first */}
                {filteredUsers.filter(user => selectedIds.has(user.id)).map(user => {
                    const isSelected = true;
                    return (
                        <div
                            key={user.id}
                            style={{
                                padding: "6px 12px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                transition: "background 0.15s",
                                position: "relative",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            onClick={() => {
                                setSelectedIds(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(user.id);
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

                            <Avatar
                                size={28}
                                src={user.avatar_url}
                                style={{
                                    backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name),
                                    fontSize: 12,
                                }}
                            >
                                {!user.avatar_url && getInitials(user.name)}
                            </Avatar>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                    fontWeight: 500, 
                                    fontSize: 14,
                                    color: tokens.textPrimary,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    {user.name}
                                </div>
                                <div style={{ 
                                    fontSize: 12, 
                                    color: tokens.textSecondary,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    @{user.username || user.email.split("@")[0]}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Separator if there are both selected and unselected */}
                {filteredUsers.filter(user => selectedIds.has(user.id)).length > 0 &&
                 filteredUsers.filter(user => !selectedIds.has(user.id)).length > 0 && (
                    <div style={{ 
                        borderBottom: "1px solid #e5e7eb",
                        margin: "4px 0",
                    }} />
                )}

                {/* Unselected users */}
                {filteredUsers.filter(user => !selectedIds.has(user.id)).map(user => {
                    const isSelected = false;
                    return (
                        <div
                            key={user.id}
                            style={{
                                padding: "6px 12px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                transition: "background 0.15s",
                                position: "relative",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f5f5f5"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            onClick={() => {
                                setSelectedIds(prev => {
                                    const newSet = new Set(prev);
                                    newSet.add(user.id);
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

                            <Avatar
                                size={28}
                                src={user.avatar_url}
                                style={{
                                    backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name),
                                    fontSize: 12,
                                }}
                            >
                                {!user.avatar_url && getInitials(user.name)}
                            </Avatar>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                    fontWeight: 500, 
                                    fontSize: 14,
                                    color: tokens.textPrimary,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    {user.name}
                                </div>
                                <div style={{ 
                                    fontSize: 12, 
                                    color: tokens.textSecondary,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}>
                                    @{user.username || user.email.split("@")[0]}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {filteredUsers.length === 0 && (
                    <div style={{ 
                        padding: 20, 
                        textAlign: "center", 
                        color: tokens.textSecondary,
                        fontSize: 13,
                    }}>
                        No se encontraron usuarios
                    </div>
                )}
            </div>

            <div style={{ 
                borderTop: "1px solid #e5e7eb",
                padding: "8px 12px",
                display: "flex", 
                gap: 8, 
                justifyContent: "flex-end" 
            }}>
                <AntButton size="small" onClick={() => setDropdownOpen(false)}>
                    Cancelar
                </AntButton>
                <AntButton size="small" type="primary" onClick={handleApply} loading={loading}>
                    Aplicar
                </AntButton>
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
                    Revisores
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
            ) : reviewers.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {reviewers.map(reviewer => (
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
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                    {showWarning ? "Sin revisores — se requiere al menos 1 revisión" : "Sin revisores"}
                </div>
            )}
        </>
    );
}
