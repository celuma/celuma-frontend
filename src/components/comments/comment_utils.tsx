import React from "react";
import { Avatar, Tooltip } from "antd";

/**
 * Comment utilities - Helper functions for comment components
 */

// Generate initials from full name
export const getInitials = (fullName?: string): string => {
    if (!fullName) return "P";
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0]?.toUpperCase() || "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0]?.toUpperCase() : "";
    return first + last || "P";
};

// Generate a consistent color based on name
export const getAvatarColor = (name: string): string => {
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

// Extract mention IDs from commentText using mentionMap
export const extractMentionIdsFromMap = (
    text: string, 
    mentionMap: Record<string, { id: string; name: string; avatar?: string | null }>
): string[] => {
    const idsSet = new Set<string>();
    const mentionRegex = /@\w+/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
        const mentionText = match[0];
        if (mentionMap[mentionText]) {
            idsSet.add(mentionMap[mentionText].id);
        }
    }
    return Array.from(idsSet);
};

// Render text with parsed mentions - simple @username format with tooltip
export const renderTextWithMentions = (
    text: string, 
    mentionedUsers?: Array<{ user_id: string; username: string; name: string; avatar?: string | null }>
): React.ReactNode => {
    // Create a map of username -> user info for quick lookup
    const userMap = new Map<string, { name: string; avatar?: string | null }>();
    if (mentionedUsers) {
        mentionedUsers.forEach(user => {
            userMap.set(user.username, { name: user.name, avatar: user.avatar });
        });
    }
    
    // Match @username format (word characters only, no spaces)
    const mentionRegex = /@(\w+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;
    
    while ((match = mentionRegex.exec(text)) !== null) {
        // Add text before mention
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        
        // Extract username
        const username = match[1];
        const userInfo = userMap.get(username);
        
        // Create tooltip content if we have user info
        const tooltipContent = userInfo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar 
                    size={32}
                    src={userInfo.avatar}
                    style={{ 
                        backgroundColor: userInfo.avatar ? undefined : getAvatarColor(userInfo.name),
                        fontSize: 12,
                        flexShrink: 0
                    }}
                >
                    {!userInfo.avatar && getInitials(userInfo.name)}
                </Avatar>
                <span style={{ fontWeight: 500 }}>{userInfo.name}</span>
            </div>
        ) : `@${username}`;
        
        // Add styled mention with hover effect and tooltip
        parts.push(
            <Tooltip key={key++} title={tooltipContent} placement="top">
                <span 
                    style={{
                        color: "#0f8b8d",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#0a6566";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#0f8b8d";
                    }}
                >
                    @{username}
                </span>
            </Tooltip>
        );
        
        lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : text;
};

// Helper function to render user mention with tooltip (for timeline events)
export const renderUserMention = (
    user: {name: string; username?: string; avatar?: string | null}, 
    key?: string | number
): React.ReactNode => {
    const username = user.username || user.name.toLowerCase().replace(/\s+/g, '');
    
    const tooltipContent = (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Avatar 
                size={32}
                src={user.avatar}
                style={{ 
                    backgroundColor: user.avatar ? undefined : getAvatarColor(user.name),
                    fontSize: 12,
                    flexShrink: 0
                }}
            >
                {!user.avatar && getInitials(user.name)}
            </Avatar>
            <span style={{ fontWeight: 500 }}>{user.name}</span>
        </div>
    );
    
    return (
        <Tooltip key={key} title={tooltipContent} placement="top">
            <span 
                style={{
                    color: "#0f8b8d",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "color 0.2s",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#0a6566";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#0f8b8d";
                }}
            >
                @{username}
            </span>
        </Tooltip>
    );
};

// Format UTC datetime to local time
export const formatLocalDateTime = (utcDateString: string): string => {
    // Ensure the date string is interpreted as UTC if it doesn't have a timezone
    const dateStr = utcDateString.endsWith('Z') ? utcDateString : utcDateString + 'Z';
    const date = new Date(dateStr);
    
    // Format in local timezone
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
};
