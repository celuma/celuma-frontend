import React, { useState, useRef, useCallback } from "react";
import { Avatar } from "antd";
import { SendOutlined, LoadingOutlined } from "@ant-design/icons";
import { searchMentionUsers, type MentionUser } from "./comment_service";
import { getInitials, getAvatarColor, extractMentionIdsFromMap } from "./comment_utils";
import { tokens } from "../design/tokens";
import CelumaTextArea from "../ui/textarea_field";
import CelumaButton from "../ui/button";

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
    /** "chat" → integrated icon-only send button inside the field, no tip line. */
    variant?: "default" | "chat";
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
    variant = "default",
}) => {
    const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
    const [showMentionPopover, setShowMentionPopover] = useState(false);
    const [mentionSearch, setMentionSearch] = useState("");
    const [loadingMentions, setLoadingMentions] = useState(false);
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [mentionMap, setMentionMap] = useState<Record<string, { id: string; name: string; avatar?: string | null }>>({});
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const isChat = variant === "chat";

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

    // Handle text change with mention detection (cursor read from the textarea ref)
    const handleValueChange = useCallback((newValue: string) => {
        const cursorPos = textAreaRef.current?.selectionStart ?? newValue.length;
        onChange(newValue);

        const textBeforeCursor = newValue.substring(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf("@");

        if (lastAtIndex !== -1) {
            const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
            if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
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

        let mentionUsername = user.username;
        if (!mentionUsername) {
            mentionUsername = user.name
                .replace(/[^a-zA-Z0-9\s]/g, "")
                .replace(/\s+/g, "_")
                .toLowerCase();
        }

        const before = value.substring(0, mentionStartIndex);
        const after = value.substring(mentionStartIndex + 1 + mentionSearch.length);
        const mention = `@${mentionUsername}`;

        const newText = before + mention + after + " ";
        onChange(newText);

        setMentionMap(prev => ({
            ...prev,
            [mention]: { id: user.id, name: user.name, avatar: user.avatar_url },
        }));

        setShowMentionPopover(false);
        setMentionStartIndex(-1);
        setMentionSearch("");

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
        const mentionIds = extractMentionIdsFromMap(value, mentionMap);
        await onSubmit(value, mentionIds);
        setMentionMap({});
    }, [value, loading, mentionMap, onSubmit]);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape" && showMentionPopover) {
            setShowMentionPopover(false);
        }
    }, [handleSubmit, showMentionPopover]);

    const sendButton = !hideSubmitButton && isChat ? (
        <CelumaButton
            type="primary"
            size="xsmall"
            icon={loading ? <LoadingOutlined /> : <SendOutlined />}
            aria-label={submitButtonText}
            disabled={!value.trim() || disabled || loading}
            onClick={handleSubmit}
        />
    ) : undefined;

    return (
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            {/* Mention dropdown — positioned ABOVE the field */}
            {showMentionPopover && (
                <div style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    left: 0,
                    zIndex: 1050,
                    width: "100%",
                    maxWidth: 350,
                    maxHeight: 190,
                    overflowY: "auto",
                    background: "white",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(13,27,42,0.14)",
                    border: "1px solid #e2e8f0",
                }}>
                    {loadingMentions ? (
                        <div style={{ padding: 16, textAlign: "center", color: tokens.textSecondary }}>
                            <LoadingOutlined spin /> Buscando...
                        </div>
                    ) : mentionUsers.length === 0 ? (
                        <div style={{ padding: 16, textAlign: "center", color: tokens.textSecondary }}>
                            {mentionSearch ? "No se encontraron usuarios" : "Escribe para buscar"}
                        </div>
                    ) : (
                        mentionUsers.map((user, index) => (
                            <div
                                key={user.id}
                                style={{
                                    cursor: "pointer",
                                    padding: "8px 12px",
                                    borderBottom: index < mentionUsers.length - 1 ? "1px solid #f3f4f6" : "none",
                                    transition: "background-color 0.15s",
                                }}
                                onClick={() => handleSelectMention(user)}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f1f9f8"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <Avatar
                                        size={28}
                                        src={user.avatar_url}
                                        style={{ backgroundColor: user.avatar_url ? undefined : getAvatarColor(user.name), fontSize: 11, flexShrink: 0 }}
                                    >
                                        {!user.avatar_url && getInitials(user.name)}
                                    </Avatar>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: tokens.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {user.name}
                                        </div>
                                        <div style={{ fontSize: 11, color: tokens.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {user.email}
                                        </div>
                                    </div>
                                    {user.username && (
                                        <div style={{ fontSize: 10, color: tokens.primary, background: "#eaf7f5", padding: "2px 6px", borderRadius: 6, flexShrink: 0, fontWeight: 600 }}>
                                            @{user.username}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <CelumaTextArea
                value={value}
                onChange={handleValueChange}
                inputRef={textAreaRef as React.Ref<HTMLTextAreaElement>}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
                autoFocus={autoFocus}
                action={sendButton}
            />

            {/* Default variant footer (tip + button) — chat variant integrates the send button instead */}
            {!isChat && !hideSubmitButton && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    {showTip ? (
                        <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                            Tip: Cmd/Ctrl + Enter para enviar · @ para mencionar
                        </div>
                    ) : <div />}
                    <CelumaButton
                        type="primary"
                        size="small"
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={!value.trim() || disabled}
                        icon={<SendOutlined />}
                    >
                        {submitButtonText}
                    </CelumaButton>
                </div>
            )}
        </div>
    );
};

export default CommentInput;
