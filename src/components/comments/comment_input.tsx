import React, { useState, useRef, useCallback, useId } from "react";
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
    onSubmit: (text: string, mentionIds: string[]) => Promise<void> | void;
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
    /** Accessible name of the text field (Spanish). */
    ariaLabel?: string;
    /** Allow sending with empty text (e.g. the message carries images). */
    canSubmitEmpty?: boolean;
    maxLength?: number;
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
    ariaLabel,
    canSubmitEmpty = false,
    maxLength,
}) => {
    const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
    const [showMentionPopover, setShowMentionPopover] = useState(false);
    const [mentionSearch, setMentionSearch] = useState("");
    const [loadingMentions, setLoadingMentions] = useState(false);
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [mentionMap, setMentionMap] = useState<Record<string, { id: string; name: string; avatar?: string | null }>>({});
    // Céluma 1.5 (#96): the mention list is operable from the keyboard (↑/↓, Enter/Tab, Esc).
    const [activeMention, setActiveMention] = useState(0);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const isChat = variant === "chat";
    const listboxId = useId();

    // Search users for mentions
    const performMentionSearch = useCallback(async (query: string) => {
        setLoadingMentions(true);
        try {
            const users = await searchMentionUsers(query);
            setMentionUsers(users);
            setActiveMention(0);
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
    const canSubmit = (!!value.trim() || canSubmitEmpty) && !loading && !disabled;
    const handleSubmit = useCallback(async () => {
        if (!canSubmit) return;
        const mentionIds = extractMentionIdsFromMap(value, mentionMap);
        await onSubmit(value, mentionIds);
        setMentionMap({});
    }, [canSubmit, value, mentionMap, onSubmit]);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showMentionPopover && mentionUsers.length > 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const delta = e.key === "ArrowDown" ? 1 : -1;
                setActiveMention((i) => (i + delta + mentionUsers.length) % mentionUsers.length);
                return;
            }
            if ((e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) || e.key === "Tab") {
                e.preventDefault();
                handleSelectMention(mentionUsers[Math.min(activeMention, mentionUsers.length - 1)]);
                return;
            }
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape" && showMentionPopover) {
            e.preventDefault();
            setShowMentionPopover(false);
        }
    }, [handleSubmit, showMentionPopover, mentionUsers, activeMention, handleSelectMention]);

    const sendButton = !hideSubmitButton && isChat ? (
        <CelumaButton
            type="primary"
            size="small"
            icon={loading ? <LoadingOutlined /> : <SendOutlined />}
            aria-label={submitButtonText}
            disabled={!canSubmit}
            onClick={handleSubmit}
        />
    ) : undefined;

    return (
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            {/* Mention dropdown — positioned ABOVE the field */}
            {showMentionPopover && (
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Personas para mencionar"
                    style={{
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
                                role="option"
                                aria-selected={index === activeMention}
                                style={{
                                    cursor: "pointer",
                                    padding: "8px 12px",
                                    borderBottom: index < mentionUsers.length - 1 ? "1px solid #f3f4f6" : "none",
                                    transition: "background-color 0.15s",
                                    backgroundColor: index === activeMention ? "#e6f7f7" : "transparent",
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSelectMention(user)}
                                onMouseEnter={() => setActiveMention(index)}
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
                ariaLabel={ariaLabel}
                maxLength={maxLength}
                showCount={false}
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
                        disabled={!canSubmit && !loading}
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
