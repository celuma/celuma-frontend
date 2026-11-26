/**
 * Order conversation API (Céluma 1.5, #88/#96/#98).
 *
 * Contract: celuma-engineering/specs/laboratory/order-conversation.md.
 *
 * - `listConversation` without a cursor returns the LATEST page, oldest first inside the page;
 *   `before` pages backwards. (#88: the first page used to be the oldest 20 messages.)
 * - `sendConversationMessage` always carries an `Idempotency-Key`; retrying an unanswered
 *   send with the same key returns the stored message instead of a duplicate.
 * - Images are never public URLs: `fetchAttachmentBlob` reads them with the session token,
 *   and the server re-checks `lab:read` and the tenant on every read.
 */
import { getStoredToken, redirectToLoginForExpiredSession } from "../lib/auth_session";
import { formatHttpError, NETWORK_ERROR_MESSAGE } from "../lib/api_error";
import { IDEMPOTENCY_HEADER } from "../lib/idempotency";

function apiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

export type ConversationAttachment = {
    id: string;
    position: number;
    width: number;
    height: number;
    content_type?: string;
};

export type ConversationMentionedUser = {
    user_id: string;
    username?: string | null;
    name: string;
    avatar?: string | null;
};

export type ConversationMessage = {
    id: string;
    order_id: string;
    created_by: string;
    created_by_name?: string | null;
    created_by_avatar?: string | null;
    created_at: string;
    text: string;
    mentions: string[];
    mentioned_users?: ConversationMentionedUser[];
    attachments?: ConversationAttachment[];
};

export type ConversationPage = {
    items: ConversationMessage[];
    page_info: { has_more: boolean; next_before?: string | null; next_after?: string | null };
};

/**
 * A send that did not succeed. `definitive` means the server answered with a refusal that
 * stored nothing (a 4xx other than timeout/rate-limit), so the content may be edited and
 * sent as a new message. Otherwise the outcome is unknown (network error, timeout,
 * cancellation, 5xx): the message may have been saved, and only a retry with the same key
 * is safe.
 */
export class ConversationSendError extends Error {
    readonly status: number | null;
    readonly definitive: boolean;
    constructor(message: string, status: number | null, definitive: boolean) {
        super(message);
        this.name = "ConversationSendError";
        this.status = status;
        this.definitive = definitive;
    }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = getStoredToken();
    return { ...(token ? { Authorization: token } : {}), ...extra };
}

async function failureMessage(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    return formatHttpError(res.status, text);
}

function orderUrl(orderId: string): string {
    return `${apiBase()}/v1/laboratory/orders/${encodeURIComponent(orderId)}/comments`;
}

export async function listConversation(
    orderId: string,
    options: { before?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<ConversationPage> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 30));
    if (options.before) params.set("before", options.before);
    const res = await fetch(`${orderUrl(orderId)}?${params}`, {
        headers: authHeaders({ accept: "application/json" }),
        credentials: "include",
        signal: options.signal,
    });
    if (res.status === 401) {
        redirectToLoginForExpiredSession();
        throw new Error("Session expired");
    }
    if (!res.ok) throw new Error(await failureMessage(res));
    return (await res.json()) as ConversationPage;
}

export type OutgoingMessage = {
    text: string;
    mentions: string[];
    files: File[];
};

/** 4xx answers after which a retry with the same key could still succeed. */
const AMBIGUOUS_STATUSES = new Set([408, 425, 429]);

export async function sendConversationMessage(
    orderId: string,
    message: OutgoingMessage,
    idempotencyKey: string,
    signal?: AbortSignal,
): Promise<{ message: ConversationMessage; replayed: boolean }> {
    let body: BodyInit;
    const headers = authHeaders({ [IDEMPOTENCY_HEADER]: idempotencyKey, accept: "application/json" });
    if (message.files.length) {
        const form = new FormData();
        form.append("text", message.text);
        for (const id of message.mentions) form.append("mentions", id);
        message.files.forEach((file, index) => form.append("files", file, `imagen-${index + 1}`));
        body = form; // the browser sets the multipart boundary
    } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ text: message.text, mentions: message.mentions });
    }

    let res: Response;
    try {
        res = await fetch(orderUrl(orderId), { method: "POST", headers, body, credentials: "include", signal });
    } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        throw new ConversationSendError(
            aborted ? "Cancelaste el envío. Puede que se haya guardado; reintentar no lo duplica." : NETWORK_ERROR_MESSAGE,
            null,
            false,
        );
    }
    if (res.status === 401) {
        redirectToLoginForExpiredSession();
        throw new ConversationSendError("Tu sesión expiró. Vuelve a iniciar sesión.", 401, false);
    }
    if (!res.ok) {
        const definitive = res.status >= 400 && res.status < 500 && !AMBIGUOUS_STATUSES.has(res.status);
        throw new ConversationSendError(await failureMessage(res), res.status, definitive);
    }
    return {
        message: (await res.json()) as ConversationMessage,
        replayed: res.headers.get("Idempotent-Replayed") === "true",
    };
}

export function attachmentUrl(
    orderId: string,
    commentId: string,
    attachmentId: string,
    variant: "thumbnail" | "full",
): string {
    return `${orderUrl(orderId)}/${encodeURIComponent(commentId)}/attachments/${encodeURIComponent(attachmentId)}?variant=${variant}`;
}

export async function fetchAttachmentBlob(
    orderId: string,
    commentId: string,
    attachmentId: string,
    variant: "thumbnail" | "full",
    signal?: AbortSignal,
): Promise<Blob> {
    const res = await fetch(attachmentUrl(orderId, commentId, attachmentId, variant), {
        headers: authHeaders(),
        credentials: "include",
        signal,
    });
    if (res.status === 401) {
        redirectToLoginForExpiredSession();
        throw new Error("Session expired");
    }
    if (!res.ok) throw new Error(await failureMessage(res));
    return res.blob();
}
