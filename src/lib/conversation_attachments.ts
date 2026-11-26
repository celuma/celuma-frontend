/**
 * Conversation image limits on the client (Céluma 1.5, #96).
 *
 * The server is authoritative (`app/services/order_conversation.py`: it sniffs the content,
 * whatever the name or MIME type say); this only refuses early what the server would refuse,
 * with the same limits, so the user learns before uploading.
 */
export const CONVERSATION_MAX_IMAGES = 4;
export const CONVERSATION_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const CONVERSATION_MAX_TEXT = 5000;

const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

/** The `accept` attribute of the picker. */
export const CONVERSATION_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** Shown next to the picker so the limits are known before choosing. */
export const CONVERSATION_IMAGE_HINT = `JPG, PNG, WebP o HEIC · hasta ${CONVERSATION_MAX_IMAGES} imágenes de 10 MB`;

export function isAcceptedConversationImage(file: File): boolean {
    const type = (file.type || "").toLowerCase();
    if (ACCEPTED_MIME.has(type)) return true;
    const name = (file.name || "").toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** HEIC cannot be previewed by most browsers; the tile shows a labelled placeholder instead. */
export function isPreviewableInBrowser(file: File): boolean {
    const type = (file.type || "").toLowerCase();
    return type === "image/jpeg" || type === "image/png" || type === "image/webp";
}

export type AttachmentSelection = { accepted: File[]; errors: string[] };

/** Adds `incoming` to `current`, refusing what the server would refuse, with a reason per file. */
export function addConversationImages(current: File[], incoming: File[]): AttachmentSelection {
    const accepted = [...current];
    const errors: string[] = [];
    for (const file of incoming) {
        const label = file.name ? `«${file.name}»` : "La imagen";
        if (!isAcceptedConversationImage(file)) {
            errors.push(`${label} no es un formato compatible. Usa JPG, PNG, WebP o HEIC.`);
        } else if (file.size > CONVERSATION_MAX_IMAGE_BYTES) {
            errors.push(`${label} supera el límite de 10 MB.`);
        } else if (file.size === 0) {
            errors.push(`${label} está vacía.`);
        } else if (accepted.length >= CONVERSATION_MAX_IMAGES) {
            errors.push(`Puedes adjuntar como máximo ${CONVERSATION_MAX_IMAGES} imágenes por mensaje.`);
            break;
        } else {
            accepted.push(file);
        }
    }
    return { accepted, errors };
}
