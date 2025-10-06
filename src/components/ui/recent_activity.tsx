import React from "react";
import { Card, List, Tag, Empty } from "antd";
import { tokens } from "../design/tokens";

interface RecentActivityItem {
    id: string;
    title: string;
    description: string;
    timestamp: string;
    type: "order" | "report" | "sample" | "patient";
    status?: string;
}

interface RecentActivityProps {
    title: string;
    items: RecentActivityItem[];
    loading?: boolean;
    onItemClick?: (item: RecentActivityItem) => void;
}

export default function RecentActivity({ title, items, loading = false, onItemClick }: RecentActivityProps) {
    const cardStyle: React.CSSProperties = {
        borderRadius: tokens.radius,
        boxShadow: tokens.shadow,
        background: tokens.cardBg,
        border: "none",
        height: "100%",
    };

    const headerStyle: React.CSSProperties = {
        fontFamily: tokens.titleFont,
        fontSize: 18,
        fontWeight: 800,
        color: "#0d1b2a",
        margin: 0,
        marginBottom: 16,
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case "order": return "#3b82f6";
            case "report": return "#10b981";
            case "sample": return "#f59e0b";
            case "patient": return "#8b5cf6";
            default: return "#6b7280";
        }
    };

    const getStatusColor = (status: string) => {
        switch (status?.toUpperCase()) {
            case "PUBLISHED": return "#22c55e";
            case "DRAFT": return "#f59e0b";
            case "RECEIVED": return "#3b82f6";
            case "PROCESSING": return "#8b5cf6";
            case "COMPLETED": return "#10b981";
            default: return "#94a3b8";
        }
    };

    return (
        <Card
            loading={loading}
            style={cardStyle}
            bodyStyle={{ padding: 20 }}
        >
            <h3 style={headerStyle}>{title}</h3>
            <List
                dataSource={items}
                locale={{ emptyText: <Empty description="Sin actividad reciente" /> }}
                renderItem={(item) => (
                    <List.Item
                        style={{ 
                            padding: "12px 0", 
                            cursor: onItemClick ? "pointer" : "default",
                            borderBottom: "1px solid #f3f4f6"
                        }}
                        onClick={() => onItemClick?.(item)}
                    >
                        <List.Item.Meta
                            title={
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontFamily: tokens.textFont, fontSize: 14, fontWeight: 600 }}>
                                        {item.title}
                                    </span>
                                    <Tag color={getTypeColor(item.type)} style={{ fontSize: 11, margin: 0 }}>
                                        {item.type.toUpperCase()}
                                    </Tag>
                                    {item.status && (
                                        <Tag color={getStatusColor(item.status)} style={{ fontSize: 11, margin: 0 }}>
                                            {item.status}
                                        </Tag>
                                    )}
                                </div>
                            }
                            description={
                                <div>
                                    <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 4 }}>
                                        {item.description}
                                    </div>
                                    <div style={{ color: "#9ca3af", fontSize: 12 }}>
                                        {new Date(item.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            }
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
}
