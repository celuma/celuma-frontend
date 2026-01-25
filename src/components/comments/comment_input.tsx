import React, { useState, useRef, useCallback } from "react";
import { Input, Button as AntButton, Avatar } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { SendOutlined, LoadingOutlined } from "@ant-design/icons";
import { searchMentionUsers, type MentionUser } from "./comment_service";
import { getInitials, getAvatarColor, extractMentionIdsFromMap } from "./comment_utils";
import { tokens } from "../design/tokens";

export type CommentInputProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (text: string, mentionIds: string[]) => Promise<void>;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    loading?: boolean;
    submitButtonText?: string;
    showTip?: boolean;
    autoFocus?: boolean;
    hideSubmitButton?: boolean;
};

export const CommentInput: React.FC<CommentInputProps> = ({
    value,
    onChange,
    onSubmit,
    placeholder = "Escribe un comentario... Usa @ para mencionar a alguien",
    rows = 3,
    disabled = false,
    loading = false,
    submitButtonText = "Comentar",
    showTip = true,
    autoFocus = false,
    hideSubmitButton = false,
}) => {
    const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
    const [showMentionPopover, setShowMentionPopover] = useState(false);
    const [mentionSearch, setMentionSearch] = useState("");
    const [loadingMentions, setLoadingMentions] = useState(false);
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [mentionMap, setMentionMap] = useState<Record<string, { id: string; name: string; avatar?: string | null }>>({});
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    // Search users for mentions
    const performMentionSearch = useCallback(async (query: string) => {
        setLoadingMentions(true);
        try {
            const users = await searchMentionUsers(query);
            setMentionUsers(users);
        } catch (err) {
            console.error("Error searching users:", err);
            setMentionUsers([]);
        } finally {
            setLoadingMentions(false);
        }
    }, []);

    // Handle text change with mention detection
    const handleCommentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart || 0;
        onChange(newValue);
        
        // Find if we're in a mention context (typing after @)
        const textBeforeCursor = newValue.substring(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        
        if (lastAtIndex !== -1) {
            // Check if there's a space between @ and cursor (meaning mention is complete)
            const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
            // Only show popover if we're actively typing a mention (no space or newline after @)
            if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
                setMentionStartIndex(lastAtIndex);
                setMentionSearch(textAfterAt);
                setShowMentionPopover(true);
                performMentionSearch(textAfterAt);
                return;
            }
        }
        
        setShowMentionPopover(false);
        setMentionStartIndex(-1);
    }, [onChange, performMentionSearch]);
    
    // Handle mention selection
    const handleSelectMention = useCallback((user: MentionUser) => {
        if (mentionStartIndex === -1) return;
        
        // Use username if available, otherwise create one from name
        // Only allow alphanumeric characters and underscores
        let mentionUsername = user.username;
        if (!mentionUsername) {
            // Remove all non-alphanumeric characters except spaces, then replace spaces with underscores
            mentionUsername = user.name
                .replace(/[^a-zA-Z0-9\s]/g, '')  // Remove special characters
                .replace(/\s+/g, '_')             // Replace spaces with underscores
                .toLowerCase();                   // Convert to lowercase
        }
        
        const before = value.substring(0, mentionStartIndex);
        const after = value.substring(mentionStartIndex + 1 + mentionSearch.length);
        const mention = `@${mentionUsername}`;
        
        const newText = before + mention + after + " ";
        onChange(newText);
        
        // Store the mapping of @username -> { id, name, avatar }
        setMentionMap(prev => ({
            ...prev,
            [mention]: {
                id: user.id,
                name: user.name,
                avatar: user.avatar_url
            }
        }));
        
        setShowMentionPopover(false);
        setMentionStartIndex(-1);
        setMentionSearch("");
        
        // Focus back on textarea
        setTimeout(() => {
            if (textAreaRef.current) {
                textAreaRef.current.focus();
                const newCursorPos = (before + mention + " ").length;
                textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        }, 0);
    }, [value, mentionStartIndex, mentionSearch, onChange]);

    // Handle submit
    const handleSubmit = useCallback(async () => {
        if (!value.trim() || loading) return;
        
        // Extract mention IDs from the text using mentionMap
        const mentionIds = extractMentionIdsFromMap(value, mentionMap);
        
        await onSubmit(value, mentionIds);
        
        // Clear mention map after successful submission
        setMentionMap({});
    }, [value, loading, mentionMap, onSubmit]);

    return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, width: "100%" }}>
            <div style={{ flex: 1, position: "relative" }}>
                {/* Mention Dropdown - positioned ABOVE textarea */}
                {showMentionPopover && (
                    <div style={{
                        position: "absolute",
                        bottom: "calc(100% - 8px)",
                        left: 0,
                        zIndex: 1050,
                        width: "100%",
                        maxWidth: 350,
                        maxHeight: 190,
                        overflowY: "auto",
                        background: "white",
                        borderRadius: 8,
                        boxShadow: "0 6px 16px rgba(0,0,0,0.15)",
                        border: "1px solid #d1d5db",
                        marginBottom: 4
                    }}>
                        {loadingMentions ? (
                            <div style={{ padding: 16, textAlign: "center" }}>
                                <LoadingOutlined spin /> Buscando...
                            </div>
                        ) : mentionUsers.length === 0 ? (
                            <div style={{ padding: 16, textAlign: "center", color: tokens.textSecondary }}>
                                {mentionSearch ? "No se encontraron usuarios" : "Escribe para buscar"}
                            </div>
                        ) : (
                            <div>
                                {mentionUsers.map((user, index) => (
                                    <div
                                        key={user.id}
                                        style={{ 
                                            cursor: "pointer", 
                                            padding: "8px 12px",
                                            borderBottom: index < mentionUsers.length - 1 ? "1px solid #f3f4f6" : "none",
                                            transition: "background-color 0.2s"
                                        }}
                                        onClick={() => handleSelectMention(user)}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f5f5f5"}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <Avatar 
                                                size={28} 
                                                src={user.avatar_url}
                                                style={{ 
                                                    backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name),
                                                    fontSize: 11,
                                                    flexShrink: 0
                                                }}
                                            >
                                                {!user.avatar_url && getInitials(user.name)}
                                            </Avatar>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ 
                                                    fontWeight: 500, 
                                                    fontSize: 13,
                                                    color: tokens.textPrimary,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    lineHeight: "16px",
                                                    marginBottom: 2
                                                }}>
                                                    {user.name}
                                                </div>
                                                <div style={{ 
                                                    fontSize: 11, 
                                                    color: tokens.textSecondary,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    lineHeight: "14px"
                                                }}>
                                                    {user.email}
                                                </div>
                                            </div>
                                            {user.username && (
                                                <div style={{ 
                                                    fontSize: 10,
                                                    color: tokens.textSecondary,
                                                    backgroundColor: "#f3f4f6",
                                                    padding: "2px 6px",
                                                    borderRadius: 3,
                                                    fontFamily: "monospace",
                                                    flexShrink: 0,
                                                    marginLeft: "auto"
                                                }}>
                                                    @{user.username}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <Input.TextArea
                    ref={textAreaRef as React.Ref<TextAreaRef>}
                    value={value}
                    onChange={handleCommentChange}
                    placeholder={placeholder}
                    rows={rows}
                    style={{ marginBottom: 8 }}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSubmit();
                        }
                        // Close popover on Escape
                        if (e.key === 'Escape' && showMentionPopover) {
                            setShowMentionPopover(false);
                        }
                    }}
                />
                {!hideSubmitButton && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {showTip && (
                            <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                                Tip: Presiona Cmd/Ctrl + Enter para enviar | @ para mencionar
                            </div>
                        )}
                        {!showTip && <div />}
                        <AntButton 
                            type="primary" 
                            size="small"
                            onClick={handleSubmit}
                            loading={loading}
                            disabled={!value.trim() || disabled}
                            icon={<SendOutlined />}
                        >
                            {submitButtonText}
                        </AntButton>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommentInput;
