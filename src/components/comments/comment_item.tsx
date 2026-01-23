import React from "react";
import { Card, Avatar } from "antd";
import { tokens, cardStyle } from "../design/tokens";
import { getInitials, getAvatarColor, renderTextWithMentions, formatLocalDateTime } from "./comment_utils";

export type CommentData = {
    id: string;
    user_id: string;
    user_name: string;
    user_avatar?: string | null;
    text: string;
    mentions: string[];
    mentioned_users?: Array<{
        user_id: string;
        username: string;
        name: string;
        avatar?: string | null;
    }>;
    created_at: string;
};

export type CommentItemProps = {
    comment: CommentData;
};

export const CommentItem: React.FC<CommentItemProps> = ({ comment }) => {
    return (
        <Card 
            key={comment.id}
            size="small"
            style={{ ...cardStyle }}
            bodyStyle={{ padding: 0 }}
        >
            {/* Comment Header */}
            <div style={{ 
                padding: "12px 16px",
                background: "#f9fafb",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                gap: 10
            }}>
                <Avatar 
                    size={28}
                    src={comment.user_avatar}
                    style={{ 
                        backgroundColor: comment.user_avatar ? undefined : getAvatarColor(comment.user_name),
                        fontSize: 12,
                        flexShrink: 0
                    }}
                >
                    {!comment.user_avatar && getInitials(comment.user_name)}
                </Avatar>
                <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, color: tokens.textPrimary }}>
                        {comment.user_name}
                    </span>
                    <span style={{ color: tokens.textSecondary, marginLeft: 8, fontSize: 12 }}>
                        {formatLocalDateTime(comment.created_at)}
                    </span>
                </div>
            </div>
            {/* Comment Body */}
            <div style={{ 
                padding: 16,
                color: tokens.textPrimary,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap"
            }}>
                {renderTextWithMentions(comment.text, comment.mentioned_users)}
            </div>
        </Card>
    );
};

export default CommentItem;
