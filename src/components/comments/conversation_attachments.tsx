/**
 * Conversation images in history (Céluma 1.5, #96).
 *
 * Bytes are fetched with the session token (`fetchAttachmentBlob`) and shown from an object
 * URL that is revoked on unmount; there is no public URL to leak. Each thumbnail is a real
 * button with an accessible name, and the viewer is a modal (focus trapped, Esc closes) with
 * previous/next by button or arrow keys.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LeftOutlined, PictureOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { fetchAttachmentBlob, type ConversationAttachment } from "../../services/conversation_service";
import { tokens } from "../design/tokens";
import CelumaButton from "../ui/button";

const INK = "#1f7a75";

function useAttachmentUrl(orderId: string, commentId: string, attachmentId: string, variant: "thumbnail" | "full", attempt: number) {
    const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
    useEffect(() => {
        const controller = new AbortController();
        let objectUrl: string | null = null;
        setState({ url: null, failed: false });
        fetchAttachmentBlob(orderId, commentId, attachmentId, variant, controller.signal)
            .then((blob) => {
                objectUrl = URL.createObjectURL(blob);
                setState({ url: objectUrl, failed: false });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ url: null, failed: true });
            });
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [orderId, commentId, attachmentId, variant, attempt]);
    return state;
}

function AttachmentThumb({
    orderId, commentId, attachment, label, onOpen,
}: { orderId: string; commentId: string; attachment: ConversationAttachment; label: string; onOpen: () => void }) {
    const [attempt, setAttempt] = useState(0);
    const { url, failed } = useAttachmentUrl(orderId, commentId, attachment.id, "thumbnail", attempt);
    if (failed) {
        return (
            <button
                type="button"
                className="celuma-conv-thumb celuma-conv-thumb--failed"
                onClick={() => setAttempt((n) => n + 1)}
                aria-label={`No se pudo cargar la ${label}. Reintentar`}
            >
                <ReloadOutlined aria-hidden />
                <span>No se pudo cargar · Reintentar</span>
            </button>
        );
    }
    return (
        <button type="button" className="celuma-conv-thumb" onClick={onOpen} aria-label={`Abrir ${label}`}>
            {url ? (
                <img src={url} alt="" />
            ) : (
                <span className="celuma-conv-thumb__loading" role="status" aria-label={`Cargando ${label}`}>
                    <PictureOutlined aria-hidden />
                </span>
            )}
        </button>
    );
}

export function MessageAttachments({
    orderId, commentId, attachments, authorName,
}: { orderId: string; commentId: string; attachments: ConversationAttachment[]; authorName: string }) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    // The thumbnail that opened the viewer gets focus back when it closes.
    const opener = useRef<HTMLElement | null>(null);
    const open = (i: number) => {
        opener.current = document.activeElement as HTMLElement | null;
        setOpenIndex(i);
    };
    const close = () => {
        setOpenIndex(null);
        window.setTimeout(() => opener.current?.focus(), 0);
    };
    if (!attachments.length) return null;
    const total = attachments.length;
    // Lower-case lead word so it reads inside a sentence ("Abrir imagen 1 de 2 de Ana");
    // the viewer title capitalizes it. The author's name is never re-cased.
    const label = (i: number) => `imagen ${i + 1} de ${total} de ${authorName}`;
    return (
        <>
            <div className={`celuma-conv-thumbs celuma-conv-thumbs--${Math.min(total, 4)}`} role="group" aria-label={`${total === 1 ? "1 imagen" : `${total} imágenes`} adjuntas`}>
                {attachments.map((a, i) => (
                    <AttachmentThumb key={a.id} orderId={orderId} commentId={commentId} attachment={a} label={label(i)} onOpen={() => open(i)} />
                ))}
            </div>
            {openIndex !== null && (
                <AttachmentViewer
                    orderId={orderId}
                    commentId={commentId}
                    attachments={attachments}
                    index={openIndex}
                    onIndexChange={setOpenIndex}
                    onClose={close}
                    label={(i) => `Imagen ${label(i).slice("imagen ".length)}`}
                />
            )}
        </>
    );
}

function AttachmentViewer({
    orderId, commentId, attachments, index, onIndexChange, onClose, label,
}: {
    orderId: string; commentId: string; attachments: ConversationAttachment[]; index: number;
    onIndexChange: (i: number) => void; onClose: () => void; label: (i: number) => string;
}) {
    const [attempt, setAttempt] = useState(0);
    const attachment = attachments[index];
    const { url, failed } = useAttachmentUrl(orderId, commentId, attachment.id, "full", attempt);
    const total = attachments.length;
    const go = useCallback((delta: number) => onIndexChange((index + delta + total) % total), [index, total, onIndexChange]);
    // Arrow keys anywhere inside the open viewer (antd puts focus on its own wrapper).
    useEffect(() => {
        if (total < 2) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
            if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [go, total]);
    return (
        <Modal
            open
            onCancel={onClose}
            footer={null}
            width="min(960px, 96vw)"
            centered
            title={<span style={{ fontFamily: tokens.titleFont, fontWeight: 800, color: tokens.textPrimary }}>{label(index)}</span>}
            styles={{ content: { borderRadius: tokens.radius, padding: 16 }, body: { padding: 0 } }}
            destroyOnHidden
        >
            <div style={{ display: "grid", gap: 12 }}>
                <div style={{ background: "#0d1b2a", borderRadius: 10, minHeight: 240, display: "grid", placeItems: "center", overflow: "hidden" }}>
                    {url ? (
                        <img src={url} alt={label(index)} style={{ maxWidth: "100%", maxHeight: "72vh", display: "block" }} />
                    ) : failed ? (
                        <div role="alert" style={{ color: "#fff", display: "grid", gap: 10, justifyItems: "center", padding: 24, textAlign: "center" }}>
                            <span>No se pudo cargar la imagen. Puede que ya no tengas acceso a esta orden.</span>
                            <CelumaButton size="small" onClick={() => setAttempt((n) => n + 1)} icon={<ReloadOutlined />}>Reintentar</CelumaButton>
                        </div>
                    ) : (
                        <span role="status" style={{ color: "rgba(255,255,255,.85)" }}>Cargando imagen…</span>
                    )}
                </div>
                {total > 1 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <CelumaButton size="small" icon={<LeftOutlined />} onClick={() => go(-1)}>Anterior</CelumaButton>
                        <span aria-live="polite" style={{ color: INK, fontWeight: 600 }}>{index + 1} de {total}</span>
                        <CelumaButton size="small" icon={<RightOutlined />} iconPosition="end" onClick={() => go(1)}>Siguiente</CelumaButton>
                    </div>
                )}
            </div>
        </Modal>
    );
}
