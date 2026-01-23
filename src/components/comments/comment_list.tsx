import React, { forwardRef } from "react";
import { Empty } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import { CommentItem, type CommentData } from "./comment_item";

export type CommentListProps = {
    comments: CommentData[];
    loading?: boolean;
    emptyMessage?: string;
    emptyIcon?: React.ReactNode;
    emptyDescription?: string;
};

export const CommentList = forwardRef<HTMLDivElement, CommentListProps>(({
    comments,
    loading = false,
    emptyMessage = "Sin comentarios",
    emptyIcon,
    emptyDescription = "Sé el primero en comentar",
}, ref) => {
    // Sort comments chronologically (oldest first, newest at bottom)
    const sortedComments = [...comments].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    if (loading && comments.length === 0) {
        return (
            <div style={{ textAlign: "center", padding: 40 }}>
                <Empty description="Cargando conversación..." />
            </div>
        );
    }

    if (comments.length === 0) {
        return (
            <div style={{ 
                padding: 40, 
                textAlign: "center",
                background: "#f9fafb",
                borderRadius: tokens.radius,
                border: "1px solid #e5e7eb",
                marginBottom: 16
            }}>
                {emptyIcon || <MessageOutlined style={{ fontSize: 48, color: "#9ca3af", marginBottom: 16 }} />}
                <div style={{ fontSize: 16, fontWeight: 600, color: tokens.textPrimary, marginBottom: 8 }}>
                    {emptyMessage}
                </div>
                <div style={{ color: tokens.textSecondary }}>
                    {emptyDescription}
                </div>
            </div>
        );
    }

    return (
        <div 
            ref={ref}
            style={{ 
                display: "flex", 
                flexDirection: "column", 
                height: "100%", 
                overflowY: "auto",
                paddingRight: 8
            }}
        >
            <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
                {sortedComments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} />
                ))}
            </div>
        </div>
    );
});

CommentList.displayName = "CommentList";

export default CommentList;
