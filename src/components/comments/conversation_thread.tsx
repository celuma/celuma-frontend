import { forwardRef, useMemo } from "react";
import { Avatar } from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    LoadingOutlined,
    MessageOutlined,
    PictureOutlined,
    ReloadOutlined,
    StopOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { tokens } from "../design/tokens";
import CelumaButton from "../ui/button";
import EmptyState from "../ui/empty_state";
import { getInitials, getAvatarColor, renderTextWithMentions } from "./comment_utils";
import { MessageAttachments } from "./conversation_attachments";
import type { ConversationMessage } from "../../services/conversation_service";
import type { LoadState, PendingMessage } from "../../hooks/use_order_conversation";
import "./conversation.css";

/** Consecutive messages from the same author within this window are grouped. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Accessible teal ink on light surfaces (Brand System: #1f7a75, not the identity teal). */
const INK = "#1f7a75";

function toLocalDate(utc: string): Date {
    const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : utc + "Z";
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
function fullDateLabel(d: Date): string {
    return d.toLocaleString("es-MX", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Group = {
    type: "group";
    key: string;
    userName: string;
    avatar?: string | null;
    own: boolean;
    items: ConversationMessage[];
};
type Divider = { type: "divider"; key: string; label: string };

function AuthorAvatar({ name, avatar }: { name: string; avatar?: string | null }) {
    return (
        <Avatar
            size={32}
            src={avatar || undefined}
            aria-hidden
            style={{ backgroundColor: avatar ? undefined : getAvatarColor(name), fontSize: 12, fontWeight: 700, flexShrink: 0 }}
        >
            {!avatar && getInitials(name)}
        </Avatar>
    );
}

function MessageGroup({ group, orderId }: { group: Group; orderId: string }) {
    const { own, userName, avatar, items } = group;
    const first = toLocalDate(items[0].created_at);
    const author = own ? "Tú" : userName;
    return (
        <div className={`celuma-conv-group${own ? " celuma-conv-group--own" : ""}`}>
            <AuthorAvatar name={userName} avatar={avatar} />
            <div className="celuma-conv-group__body">
                <div className="celuma-conv-group__header">
                    <span className="celuma-conv-group__author">{author}</span>
                    <time dateTime={first.toISOString()} title={fullDateLabel(first)}>{timeLabel(first)}</time>
                </div>
                {items.map((m, idx) => {
                    const d = toLocalDate(m.created_at);
                    const attachments = m.attachments ?? [];
                    const imagesLabel = attachments.length ? `, ${attachments.length === 1 ? "1 imagen" : `${attachments.length} imágenes`}` : "";
                    return (
                        <article
                            key={m.id}
                            className="celuma-conv-message"
                            aria-label={`Mensaje de ${author}, ${fullDateLabel(d)}${imagesLabel}`}
                        >
                            {m.text && <div className="celuma-conv-message__text">{renderTextWithMentions(m.text, (m.mentioned_users ?? []).map((u) => ({ ...u, username: u.username ?? "" })))}</div>}
                            <MessageAttachments orderId={orderId} commentId={m.id} attachments={attachments} authorName={author} />
                            {idx > 0 && (
                                <time className="celuma-conv-message__time" dateTime={d.toISOString()} title={fullDateLabel(d)}>
                                    {timeLabel(d)}
                                </time>
                            )}
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

function PendingBubble({
    item, onRetry, onCancel, onDiscard, onEdit,
}: {
    item: PendingMessage;
    onRetry: (id: string) => void;
    onCancel: (id: string) => void;
    onDiscard: (id: string) => void;
    onEdit: (id: string) => void;
}) {
    const images = item.payload.files.length;
    const status = item.status === "sending"
        ? { icon: <LoadingOutlined aria-hidden />, text: "Enviando…", tone: "sending" }
        : item.status === "failed"
            ? { icon: <WarningOutlined aria-hidden />, text: "No se confirmó el envío", tone: "failed" }
            : { icon: <ExclamationCircleOutlined aria-hidden />, text: "No se envió", tone: "rejected" };
    return (
        <div className="celuma-conv-group celuma-conv-group--own">
            <span aria-hidden style={{ width: 32 }} />
            <div className="celuma-conv-group__body">
                <article className={`celuma-conv-message celuma-conv-message--${status.tone}`} aria-label={`Tu mensaje pendiente: ${status.text}`}>
                    {item.payload.text && <div className="celuma-conv-message__text">{item.payload.text}</div>}
                    {images > 0 && (
                        <div className="celuma-conv-pending-images">
                            <PictureOutlined aria-hidden /> {images === 1 ? "1 imagen" : `${images} imágenes`}
                        </div>
                    )}
                    <div className="celuma-conv-status" role={item.status === "sending" ? "status" : "alert"}>
                        {status.icon}
                        <span><strong>{status.text}.</strong> {item.status === "sending" ? null : item.error}</span>
                    </div>
                    {item.status === "failed" && (
                        <div className="celuma-conv-status__hint">Puede que se haya guardado; reintentar no lo duplica.</div>
                    )}
                    <div className="celuma-conv-actions">
                        {item.status === "sending" && (
                            <CelumaButton size="xsmall" icon={<StopOutlined />} onClick={() => onCancel(item.localId)}>Cancelar</CelumaButton>
                        )}
                        {item.status === "failed" && (
                            <>
                                <CelumaButton size="xsmall" type="primary" icon={<ReloadOutlined />} onClick={() => onRetry(item.localId)}>Reintentar</CelumaButton>
                                <CelumaButton size="xsmall" danger onClick={() => onDiscard(item.localId)}>Descartar</CelumaButton>
                            </>
                        )}
                        {item.status === "rejected" && (
                            <>
                                <CelumaButton size="xsmall" type="primary" icon={<EditOutlined />} onClick={() => onEdit(item.localId)}>Corregir</CelumaButton>
                                <CelumaButton size="xsmall" danger onClick={() => onDiscard(item.localId)}>Descartar</CelumaButton>
                            </>
                        )}
                    </div>
                </article>
            </div>
        </div>
    );
}

type Props = {
    orderId: string;
    messages: ConversationMessage[];
    pending: PendingMessage[];
    currentUserId?: string;
    loadState: LoadState;
    loadError?: string | null;
    onReload: () => void;
    hasOlder: boolean;
    loadingOlder: boolean;
    olderError?: string | null;
    onLoadOlder: () => void;
    onRetry: (localId: string) => void;
    onCancel: (localId: string) => void;
    onDiscard: (localId: string) => void;
    onEdit: (localId: string) => void;
};

/**
 * ConversationThread — the order conversation history (Céluma 1.5, #96).
 *
 * Messages are grouped by author within five minutes, under day dividers; every group
 * names its author ("Tú" for your own) and time, so the thread scans without relying on
 * bubble side or colour. Loading, empty, failed-load, sending, unconfirmed and refused
 * states each have text and an icon. The scroll container forwards its ref so the parent
 * can keep the newest message in view. It is a `log` region: new messages are announced
 * politely to screen readers.
 */
export const ConversationThread = forwardRef<HTMLDivElement, Props>((props, ref) => {
    const {
        orderId, messages, pending, currentUserId, loadState, loadError, onReload,
        hasOlder, loadingOlder, olderError, onLoadOlder, onRetry, onCancel, onDiscard, onEdit,
    } = props;

    const rendered = useMemo(() => {
        const out: (Group | Divider)[] = [];
        let lastDay = "";
        let current: Group | null = null;
        let lastTime = 0;
        for (const m of messages) {
            const d = toLocalDate(m.created_at);
            const dk = dayKey(d);
            if (dk !== lastDay) {
                out.push({ type: "divider", key: `div-${dk}`, label: dayDividerLabel(d) });
                lastDay = dk;
                current = null;
            }
            const own = !!currentUserId && m.created_by === currentUserId;
            if (current && current.items[0].created_by === m.created_by && d.getTime() - lastTime < GROUP_WINDOW_MS) {
                current.items.push(m);
            } else {
                current = {
                    type: "group", key: `grp-${m.id}`, own, items: [m],
                    userName: m.created_by_name || "Usuario", avatar: m.created_by_avatar,
                };
                out.push(current);
            }
            lastTime = d.getTime();
        }
        return out;
    }, [messages, currentUserId]);

    let body: React.ReactNode;
    if (loadState === "loading" && messages.length === 0) {
        body = (
            <div className="celuma-conv-center" role="status">
                <LoadingOutlined style={{ fontSize: 24, color: INK }} aria-hidden />
                <span>Cargando conversación…</span>
            </div>
        );
    } else if (loadState === "error" && messages.length === 0) {
        body = (
            <EmptyState
                icon={<WarningOutlined />}
                color="#b91c1c"
                title="No se pudo cargar la conversación"
                description={<span role="alert">{loadError || "Revisa tu conexión e inténtalo de nuevo."}</span>}
                action={<CelumaButton size="small" icon={<ReloadOutlined />} onClick={onReload}>Reintentar</CelumaButton>}
            />
        );
    } else if (messages.length === 0 && pending.length === 0) {
        body = (
            <EmptyState
                icon={<MessageOutlined />}
                color={INK}
                title="Aún no hay mensajes"
                description="Escribe el primero para coordinar esta orden con tu equipo. Puedes adjuntar imágenes y mencionar con @."
            />
        );
    } else {
        body = (
            <>
                {hasOlder && (
                    <div className="celuma-conv-older">
                        <CelumaButton size="small" onClick={onLoadOlder} loading={loadingOlder} icon={<ClockCircleOutlined />}>
                            Ver mensajes anteriores
                        </CelumaButton>
                        {olderError && <span role="alert" className="celuma-conv-error-text">{olderError}</span>}
                    </div>
                )}
                {!hasOlder && messages.length > 0 && (
                    <div className="celuma-conv-start"><CheckCircleOutlined aria-hidden /> Inicio de la conversación</div>
                )}
                {rendered.map((item) =>
                    item.type === "divider" ? (
                        <div key={item.key} className="celuma-conv-divider" role="separator" aria-label={item.label}>
                            <span>{item.label}</span>
                        </div>
                    ) : (
                        <MessageGroup key={item.key} group={item} orderId={orderId} />
                    ),
                )}
                {pending.map((p) => (
                    <PendingBubble key={p.localId} item={p} onRetry={onRetry} onCancel={onCancel} onDiscard={onDiscard} onEdit={onEdit} />
                ))}
            </>
        );
    }

    return (
        <div
            ref={ref}
            className="celuma-conv-thread"
            role="log"
            aria-label="Mensajes de la conversación"
            aria-live="polite"
            aria-busy={loadState === "loading" || loadingOlder}
            tabIndex={0}
            style={{ color: tokens.textPrimary }}
        >
            {body}
        </div>
    );
});

ConversationThread.displayName = "ConversationThread";

export default ConversationThread;
