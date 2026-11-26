/**
 * OrderConversation — the order page's conversation tab (Céluma 1.5, #88/#96).
 *
 * History (`ConversationThread`) plus composer in one Céluma card. The composer keeps the
 * text and the selected images until the server confirms the message; a send that fails
 * stays in the thread with "Reintentar" (same idempotency key) or, after a definitive
 * refusal, "Corregir", which puts the text and images back into the composer.
 *
 * Users without `lab:manage_comments` read the thread and see why they cannot write; the
 * server enforces it regardless.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseOutlined, LockOutlined, PaperClipOutlined, PictureOutlined } from "@ant-design/icons";
import CommentInput from "./comment_input";
import ConversationThread from "./conversation_thread";
import { useOrderConversation } from "../../hooks/use_order_conversation";
import {
    addConversationImages,
    CONVERSATION_IMAGE_ACCEPT,
    CONVERSATION_IMAGE_HINT,
    CONVERSATION_MAX_IMAGES,
    CONVERSATION_MAX_TEXT,
    isPreviewableInBrowser,
} from "../../lib/conversation_attachments";
import "./conversation.css";

type Props = {
    orderId: string;
    currentUserId?: string;
    canComment: boolean;
    /** The tab is visible: load and refresh only then. */
    active: boolean;
    /** Called after a message is confirmed (e.g. to refresh the order timeline). */
    onSent?: () => void;
};

function SelectedImage({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!isPreviewableInBrowser(file)) return;
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);
    return (
        <li className="celuma-conv-attach-tile">
            {url ? <img src={url} alt={`Imagen ${index + 1} seleccionada`} /> : (
                <span><PictureOutlined aria-hidden style={{ fontSize: 20 }} /><br />Imagen {index + 1}</span>
            )}
            <button type="button" onClick={onRemove} aria-label={`Quitar imagen ${index + 1}`} title="Quitar">
                <CloseOutlined aria-hidden />
            </button>
        </li>
    );
}

export default function OrderConversation({ orderId, currentUserId, canComment, active, onSent }: Props) {
    const conversation = useOrderConversation(orderId, active, onSent);
    const { messages, pending } = conversation;
    const [text, setText] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [selectionErrors, setSelectionErrors] = useState<string[]>([]);
    const [inputKey, setInputKey] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);
    const previousHeight = useRef(0);
    const previousFirstId = useRef<string | undefined>(undefined);

    // Keep the newest message in view unless the reader scrolled up; keep the reading
    // position when older messages are prepended.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const firstId = messages[0]?.id;
        const prepended = previousFirstId.current !== undefined && firstId !== previousFirstId.current
            && messages.some((m) => m.id === previousFirstId.current);
        if (prepended) {
            el.scrollTop += el.scrollHeight - previousHeight.current;
        } else if (stickToBottom.current) {
            el.scrollTop = el.scrollHeight;
        }
        previousHeight.current = el.scrollHeight;
        previousFirstId.current = firstId;
    }, [messages, pending, conversation.loadState]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, [conversation.loadState]);

    const addFiles = useCallback((incoming: File[]) => {
        const { accepted, errors } = addConversationImages(files, incoming);
        setFiles(accepted);
        setSelectionErrors(errors);
    }, [files]);

    const submit = useCallback((value: string, mentionIds: string[]) => {
        const trimmed = value.trim();
        if (!trimmed && files.length === 0) return;
        conversation.send({ text: trimmed, mentions: mentionIds, files });
        stickToBottom.current = true;
        setText("");
        setFiles([]);
        setSelectionErrors([]);
        setInputKey((n) => n + 1);
    }, [files, conversation]);

    const editPending = useCallback((localId: string) => {
        const payload = conversation.discard(localId);
        if (!payload) return;
        setText((current) => (current ? `${payload.text}\n${current}` : payload.text));
        setFiles((current) => addConversationImages(payload.files, current).accepted);
    }, [conversation]);

    return (
        <section className="celuma-conv-panel" aria-label="Conversación de la orden">
            <ConversationThread
                ref={scrollRef}
                orderId={orderId}
                messages={messages}
                pending={pending}
                currentUserId={currentUserId}
                loadState={conversation.loadState}
                loadError={conversation.loadError}
                onReload={() => void conversation.reload()}
                hasOlder={conversation.hasOlder}
                loadingOlder={conversation.loadingOlder}
                olderError={conversation.olderError}
                onLoadOlder={() => {
                    stickToBottom.current = false;
                    void conversation.loadOlder();
                }}
                onRetry={conversation.retry}
                onCancel={conversation.cancel}
                onDiscard={(id) => void conversation.discard(id)}
                onEdit={editPending}
            />

            {canComment ? (
                <div
                    className="celuma-conv-composer"
                    onPaste={(e) => {
                        const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
                        if (pasted.length) {
                            e.preventDefault();
                            addFiles(pasted);
                        }
                    }}
                >
                    {files.length > 0 && (
                        <ul className="celuma-conv-attachments" aria-label={`Imágenes para enviar: ${files.length} de ${CONVERSATION_MAX_IMAGES}`}>
                            {files.map((file, index) => (
                                <SelectedImage
                                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                                    file={file}
                                    index={index}
                                    onRemove={() => setFiles((current) => current.filter((_, i) => i !== index))}
                                />
                            ))}
                        </ul>
                    )}
                    {selectionErrors.length > 0 && (
                        <div role="alert" className="celuma-conv-error-text">
                            {selectionErrors.map((err) => <div key={err}>{err}</div>)}
                        </div>
                    )}
                    <div className="celuma-conv-composer__row">
                        <button
                            type="button"
                            className="celuma-conv-icon-button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={files.length >= CONVERSATION_MAX_IMAGES}
                            aria-label="Adjuntar imágenes"
                            title="Adjuntar imágenes"
                        >
                            <PaperClipOutlined aria-hidden />
                        </button>
                        <input
                            key={inputKey}
                            ref={fileInputRef}
                            type="file"
                            accept={CONVERSATION_IMAGE_ACCEPT}
                            multiple
                            hidden
                            onChange={(e) => {
                                addFiles(Array.from(e.target.files ?? []));
                                e.target.value = "";
                            }}
                        />
                        <CommentInput
                            variant="chat"
                            value={text}
                            onChange={setText}
                            onSubmit={submit}
                            canSubmitEmpty={files.length > 0}
                            maxLength={CONVERSATION_MAX_TEXT}
                            ariaLabel="Mensaje para la conversación"
                            submitButtonText="Enviar mensaje"
                            placeholder="Escribe un mensaje… Usa @ para mencionar"
                            rows={1}
                        />
                    </div>
                    <div className="celuma-conv-composer__meta">
                        <span>{CONVERSATION_IMAGE_HINT}</span>
                        <span className="celuma-conv-shortcut">Ctrl/⌘ + Enter para enviar</span>
                    </div>
                </div>
            ) : (
                <div className="celuma-conv-readonly">
                    <LockOutlined aria-hidden style={{ color: "#1f7a75" }} />
                    Puedes leer esta conversación, pero tu rol no permite escribir en ella.
                </div>
            )}
        </section>
    );
}
