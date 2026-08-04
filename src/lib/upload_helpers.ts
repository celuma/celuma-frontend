import type { RcFile, UploadFile } from "antd/es/upload/interface";

/**
 * Post-Phase-2 remediation, Bug 1 root cause: Ant Design's `<Upload
 * beforeUpload={(file) => { setState(file); return false; }}>` pattern
 * receives the raw `RcFile` (which extends the native `File`), not an
 * `UploadFile` — `RcFile` has no `.originFileObj`. Storing it in state
 * typed as `UploadFile | null` compiles fine (structurally close enough)
 * but reading `.originFileObj` back is always `undefined`, so the upload
 * handler silently no-ops. See report_template_editor.tsx (pre-fix) and
 * tenant_settings.tsx for the two places this shipped.
 *
 * This helper handles both shapes defensively: the common case here (we
 * stored the RcFile ourselves) and the case where a caller genuinely holds
 * an Ant-managed `UploadFile` with `originFileObj` populated.
 */
export function extractUploadedFile(fileState: RcFile | UploadFile | File | null): File | null {
    if (!fileState) return null;
    if (fileState instanceof File) return fileState;
    const withOrigin = fileState as UploadFile;
    if (withOrigin.originFileObj instanceof File) return withOrigin.originFileObj;
    return null;
}
