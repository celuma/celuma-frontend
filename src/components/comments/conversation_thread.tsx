import { forwardRef, useMemo } from "react";
import { Avatar, Empty } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import { getInitials, getAvatarColor, renderTextWithMentions } from "./comment_utils";
import type { CommentData } from "./comment_item";

/** Consecutive messages from the same author within this window are grouped. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function toLocalDate(utc: string): Date {
    const s = utc.endsWith("Z") ? utc : utc + "Z";
    return new Date(s);
}
function timeLabel(d: Date): string {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayDividerLabel(d: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(d) === dayKey(today)) return "Hoy";
    if (dayKey(d) === dayKey(yesterday)) return "Ayer";
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

type Group = {
    type: "group";
    key: string;
    userId: string;
    userName: string;
    avatar?: string | null;
    own: boolean;
    items: CommentData[];
};
type Divider = { type: "divider"; key: string; label: string };

const MessageGroup = ({ group }: { group: Group }) => {
    const { own, userName, avatar, items } = group;
    const bubbleBg = own ? "#eaf7f5" : "#f1f5f9";

    return (
        <div
            style={{
                display: "flex",
                gap: 10,
                margin: "10px 0 2px",
                flexDirection: own ? "row-reverse" : "row",
                alignItems: "flex-start",
            }}
        >
            {!own && (
                <Avatar
                    size={36}
                    src={avatar || undefined}
                    style={{
                        backgroundColor: avatar ? undefined : getAvatarColor(userName),
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                        marginTop: 18,
                    }}
                >
                    {!avatar && getInitials(userName)}
                </Avatar>
            )}

            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: own ? "flex-end" : "flex-start",
                    maxWidth: "76%",
                    minWidth: 0,
                    gap: 3,
                }}
            >
                {!own && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary, margin: "0 4px 2px" }}>
                        {userName}
                    </span>
                )}

                {items.map((m, idx) => {
                    const t = timeLabel(toLocalDate(m.created_at));
                    const first = idx === 0;
                    const borderRadius = own
                        ? `14px ${first ? 6 : 14}px 14px 14px`
                        : `${first ? 6 : 14}px 14px 14px 14px`;
                    return (
                        <div
                            key={m.id}
                            style={{
                                background: bubbleBg,
                                color: tokens.textPrimary,
                                padding: "8px 12px 6px",
                                borderRadius,
                                fontSize: 14,
                                lineHeight: 1.5,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                maxWidth: "100%",
                                display: "flex",
                                flexDirection: "column",
                            }}
                        >
                            <span>{renderTextWithMentions(m.text, m.mentioned_users)}</span>
                            <span style={{ alignSelf: "flex-end", fontSize: 10.5, color: tokens.textSecondary, marginTop: 2 }}>
                                {t}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

type Props = {
    messages: CommentData[];
    currentUserId?: string;
    loading?: boolean;
};

/**
 * ConversationThread — a chat-style message thread (Telegram/Discord-like, but
 * Céluma): consecutive messages from the same author are grouped into bubbles,
 * own messages sit on the right in teal, others on the left in neutral, with day
 * dividers. Forwards its ref to the scroll container for auto-scroll-to-bottom.
 */
export const ConversationThread = forwardRef<HTMLDivElement, Props>(({ messages, currentUserId, loading }, ref) => {
    const sorted = useMemo(
        () => [...messages].sort((a, b) => toLocalDate(a.created_at).getTime() - toLocalDate(b.created_at).getTime()),
        [messages],
    );

    const rendered = useMemo(() => {
        const out: (Group | Divider)[] = [];
        let lastDay = "";
        let curGroup: Group | null = null;
        let lastTime = 0;
        let lastUser = "";
        for (const m of sorted) {
            const d = toLocalDate(m.created_at);
            const dk = dayKey(d);
            if (dk !== lastDay) {
                out.push({ type: "divider", key: `div-${dk}`, label: dayDividerLabel(d) });
                lastDay = dk;
                curGroup = null;
                lastUser = "";
            }
            const own = !!currentUserId && m.user_id === currentUserId;
            const within = d.getTime() - lastTime < GROUP_WINDOW_MS;
            if (curGroup && m.user_id === lastUser && within) {
                curGroup.items.push(m);
            } else {
                curGroup = { type: "group", key: `grp-${m.id}`, userId: m.user_id, userName: m.user_name, avatar: m.user_avatar, own, items: [m] };
                out.push(curGroup);
            }
            lastTime = d.getTime();
            lastUser = m.user_id;
        }
        return out;
    }, [sorted, currentUserId]);

    if (loading && messages.length === 0) {
        return (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                <Empty description="Cargando conversación..." />
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 40 }}>
                <div style={{ display: "grid", justifyItems: "center", gap: 10, textAlign: "center" }}>
                    <div style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: "#eaf7f5",
                        color: tokens.primary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 28,
                    }}>
                        <MessageOutlined />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary, fontFamily: tokens.titleFont }}>
                        Sin comentarios
                    </div>
                    <div style={{ color: tokens.textSecondary }}>Sé el primero en comentar sobre esta orden</div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "12px 16px 8px",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {rendered.map((item) =>
                item.type === "divider" ? (
                    <div key={item.key} style={{ display: "flex", justifyContent: "center", margin: "12px 0 6px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: tokens.textSecondary, background: "#eef2f1", padding: "3px 12px", borderRadius: 999 }}>
                            {item.label}
                        </span>
                    </div>
                ) : (
                    <MessageGroup key={item.key} group={item} />
                ),
            )}
        </div>
    );
});

ConversationThread.displayName = "ConversationThread";

export default ConversationThread;
