import React from "react";
import { Avatar, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import { ORDER_STATUS_CONFIG, SAMPLE_STATE_CONFIG, REPORT_STATUS_CONFIG, LABEL_COLORS } from "./status_configs";

// Re-export utility functions from comment_utils for consistency
export { getInitials, getAvatarColor } from "../comments/comment_utils";

/**
 * Formats a date string to display only date (without time)
 * @param dateString ISO date string or null
 * @returns Formatted date (DD/MM/YYYY) or "—" if null
 */
export const formatDateOnly = (dateString: string | null | undefined): string => {
    if (!dateString) return "—";
    try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch {
        return "—";
    }
};

/**
 * Renders a date cell with only date (no time)
 */
export const renderDateCell = (dateString: string | null | undefined) => {
    return formatDateOnly(dateString);
};

/**
 * Renders a code with optional subtext (e.g., "Sample Code" with "Order: XXX" below)
 */
export const renderCodeWithSubtext = (
    code: string,
    subtext?: string,
    subtextLink?: string,
    onSubtextClick?: () => void
) => {
    return (
        <div>
            <div style={{ fontWeight: 600 }}>{code}</div>
            {subtext && (
                <div 
                    style={{ 
                        fontSize: 11, 
                        color: "#888",
                        cursor: subtextLink || onSubtextClick ? "pointer" : "default",
                    }}
                    onClick={(e) => {
                        if (onSubtextClick) {
                            e.stopPropagation();
                            onSubtextClick();
                        }
                    }}
                >
                    {subtext}
                </div>
            )}
        </div>
    );
};

/**
 * Component for rendering a patient cell with avatar and name, clickeable to patient detail
 */
export const PatientCell: React.FC<{
    patientId: string;
    patientName: string;
    patientCode?: string;
}> = ({ patientId, patientName, patientCode }) => {
    const navigate = useNavigate();
    
    // Import getInitials and getAvatarColor from comment_utils
    const getInitials = (fullName?: string): string => {
        if (!fullName) return "P";
        const parts = fullName.trim().split(/\s+/);
        const first = parts[0]?.[0]?.toUpperCase() || "";
        const last = parts.length > 1 ? parts[parts.length - 1]?.[0]?.toUpperCase() : "";
        return first + last || "P";
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

    const initials = getInitials(patientName);
    const color = getAvatarColor(patientName);

    return (
        <div 
            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
            onClick={(e) => {
                e.stopPropagation();
                navigate(`/patients/${patientId}`);
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.7";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
            }}
        >
            <Avatar
                size={32}
                style={{
                    backgroundColor: color,
                    fontSize: 13,
                    fontWeight: 600,
                    flexShrink: 0,
                }}
            >
                {initials}
            </Avatar>
            <div>
                <div style={{ fontWeight: 500 }}>{patientName}</div>
                {patientCode && (
                    <div style={{ fontSize: 11, color: "#888" }}>{patientCode}</div>
                )}
            </div>
        </div>
    );
};

/**
 * Renders a status chip with consistent styling
 */
export const renderStatusChip = (
    status: string,
    configType: "order" | "sample" | "report" = "order"
) => {
    let config;
    switch (configType) {
        case "order":
            config = ORDER_STATUS_CONFIG[status] || { color: "#6b7280", bg: "#f3f4f6", label: status };
            break;
        case "sample":
            config = SAMPLE_STATE_CONFIG[status] || { color: "#6b7280", bg: "#f3f4f6", label: status };
            break;
        case "report":
            config = REPORT_STATUS_CONFIG[status] || { color: "#6b7280", bg: "#f3f4f6", label: status };
            break;
        default:
            config = { color: "#6b7280", bg: "#f3f4f6", label: status };
    }

    return (
        <div style={{
            backgroundColor: config.bg,
            color: config.color,
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            padding: "4px 10px",
            display: "inline-block",
        }}>
            {config.label}
        </div>
    );
};

/**
 * Renders labels as chips (only own labels, not inherited)
 */
export const renderLabels = (
    labels: Array<{ id: string; name: string; color: string; inherited?: boolean }>
) => {
    // Filter to show only non-inherited labels
    const ownLabels = labels.filter(label => !label.inherited);
    
    if (ownLabels.length === 0) {
        return <span style={{ color: "#888", fontSize: 12 }}>—</span>;
    }

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ownLabels.map(label => {
                const colorConfig = LABEL_COLORS.find(c => c.color === label.color) || { color: label.color, bg: label.color + "20" };
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
                        }}
                    >
                        {label.name}
                    </div>
                );
            })}
        </div>
    );
};

/**
 * Helper to create a sorter function for dates
 */
export const dateSorter = (field: string) => {
    return (a: any, b: any) => {
        const dateA = a[field] ? new Date(a[field]).getTime() : 0;
        const dateB = b[field] ? new Date(b[field]).getTime() : 0;
        return dateA - dateB;
    };
};

/**
 * Helper to create a sorter function for strings
 */
export const stringSorter = (field: string) => {
    return (a: any, b: any) => {
        const valA = a[field] || "";
        const valB = b[field] || "";
        return valA.localeCompare(valB);
    };
};

/**
 * Helper to get nested field value for sorting
 */
export const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
};

/**
 * Helper to create a sorter function for nested fields
 */
export const nestedStringSorter = (path: string) => {
    return (a: any, b: any) => {
        const valA = getNestedValue(a, path) || "";
        const valB = getNestedValue(b, path) || "";
        return String(valA).localeCompare(String(valB));
    };
};
