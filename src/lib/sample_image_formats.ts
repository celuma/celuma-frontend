// Single source of truth for which files the sample-image uploads accept, so the
// sample detail page, the report picker and the report uploader agree.
// Mirrors celuma-backend app/services/image_processing.py (HEIC is decoded
// server-side by content; the extension here only decides what the browser offers).

export const RAW_EXT = [".cr2", ".cr3", ".nef", ".nrw", ".arw", ".sr2", ".raf", ".rw2", ".orf", ".pef", ".dng"];
export const HEIC_EXT = [".heic", ".heif"];
export const NONRAW_EXT = [".jpg", ".jpeg", ".png", ...HEIC_EXT];
export const MAX_MB_RAW = 500;
export const MAX_MB_NONRAW = 50;

/** `accept` for the strict report uploaders. */
export const ACCEPT_EXTENSIONS = [...RAW_EXT, ...NONRAW_EXT].join(",");
/** `accept` for the sample page, which stays open to every `image/*` type. */
export const ACCEPT_ANY_IMAGE = ["image/*", ...HEIC_EXT].join(",");

export function getExt(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Spanish error for a file the uploaders must not send, or null when it may be sent. */
export function sampleImageFileError(file: { name: string; size: number }): string | null {
    const ext = getExt(file.name);
    const sizeMB = file.size / 1024 / 1024;
    if (RAW_EXT.includes(ext)) {
        return sizeMB > MAX_MB_RAW ? `El archivo RAW excede el límite de ${MAX_MB_RAW} MB.` : null;
    }
    if (NONRAW_EXT.includes(ext)) {
        return sizeMB > MAX_MB_NONRAW ? `La imagen excede el límite de ${MAX_MB_NONRAW} MB.` : null;
    }
    return (
        "Formato no compatible. Formatos permitidos:\n" +
        `RAW: ${RAW_EXT.join(", ")}\n` +
        `NO-RAW: ${NONRAW_EXT.join(", ")}`
    );
}

/**
 * Message to show for a failed upload response. The backend answers 4xx with
 * `{"detail": "<Spanish message>"}` for unusable images (corrupt, too large to
 * decode, unsupported HEIC) — show that instead of the raw status/JSON.
 */
export function sampleImageUploadErrorMessage(status: number, bodyText: string, statusText = ""): string {
    let detail: unknown;
    try {
        detail = bodyText ? (JSON.parse(bodyText) as { detail?: unknown }).detail : undefined;
    } catch {
        detail = undefined;
    }
    if (typeof detail === "string" && detail.trim() && status >= 400 && status < 500) return detail;
    if (status === 413) return `La imagen excede el límite de ${MAX_MB_NONRAW} MB.`;
    if (status === 403) return "No tienes permiso para subir imágenes.";
    return `No se pudo subir la imagen (${status}${statusText ? ` ${statusText}` : ""}). Inténtalo de nuevo.`;
}
