import { useCallback, useEffect } from "react";

/**
 * sessionStorage-backed draft persistence + accidental-navigation guard for
 * the report template editor (Céluma 1.3 Phase 2, Block D, Story D11).
 *
 * There is no `DRAFT` entity on the backend — `ReportTemplateVersion` stays
 * append-only/immutable (see report-template-editor-contract.md, "Local
 * state or draft"). This hook only persists the in-progress `presentation`
 * state client-side, scoped per tenant/template/baseline, so a reload or
 * accidental tab close doesn't silently discard unpublished configuration.
 *
 * Only `presentation` values (paper/header/footer/style/signer) are ever
 * stored here — never clinical/patient data, matching the constraint in the
 * assignment ("contains no clinical or sensitive data").
 *
 * This app uses a plain `<BrowserRouter>` (see main.tsx), not a data router,
 * so React Router's `useBlocker` (which requires `RouterProvider`) is not
 * available here. In-app navigation is guarded manually via
 * `confirmNavigateAway()`, called by every nav trigger inside the editor
 * (Cancel/Back); tab close/refresh is covered by `beforeunload` below.
 */

function draftKey(tenantId: string, templateId: string, baseline: string): string {
    return `celuma:report_template_draft:${tenantId}:${templateId}:${baseline}`;
}

interface UseTemplateEditorDraftOptions<T> {
    tenantId: string;
    templateId: string;
    /** Id of the version this draft started from, or "new" for a blank one. */
    baseline: string;
    /** The current, possibly-dirty draft value — persisted whenever `dirty` is true. */
    value: T;
    /** Whether `value` differs from what was loaded/published — drives persistence + guards. */
    dirty: boolean;
}

export function useTemplateEditorDraft<T>({
    tenantId,
    templateId,
    baseline,
    value,
    dirty,
}: UseTemplateEditorDraftOptions<T>) {
    const key = draftKey(tenantId, templateId, baseline);

    const loadDraft = useCallback((): T | null => {
        try {
            const raw = sessionStorage.getItem(key);
            return raw ? (JSON.parse(raw) as T) : null;
        } catch {
            return null;
        }
         
    }, [key]);

    const clearDraft = useCallback(() => {
        try {
            sessionStorage.removeItem(key);
        } catch {
            /* sessionStorage unavailable — nothing to clean up */
        }
         
    }, [key]);

    // Persist on every change while the draft is dirty (cheap: presentation
    // objects are small, well under sessionStorage's per-origin limit).
    useEffect(() => {
        if (!dirty) return;
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* best-effort only — draft recovery is a convenience, not a guarantee */
        }
         
    }, [key, value, dirty]);

    // Tab close / refresh with unpublished changes.
    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);

    /** Call before any in-app navigation away from the editor. Returns true when navigation should proceed. */
    const confirmNavigateAway = useCallback((): boolean => {
        if (!dirty) return true;
        return window.confirm(
            "Tienes cambios sin publicar en esta versión. Si sales ahora, se perderán. ¿Deseas continuar?"
        );
    }, [dirty]);

    return { loadDraft, clearDraft, confirmNavigateAway };
}
