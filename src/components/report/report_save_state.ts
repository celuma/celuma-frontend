/**
 * Céluma 1.5 (#68): the report editor's save state, as pure functions shared
 * by the editor and its indicator (`report_save_status.tsx`).
 */

export type ReportSaveStatus = "clean" | "unsaved" | "saving" | "saved" | "failed";

export type ReportSaveFailure = {
    /** `network`: the request never got an answer; `server`: the API refused it. */
    kind: "network" | "server";
    message: string;
    /** False when retrying the same request cannot succeed (stale template). */
    retryable: boolean;
};

export function deriveReportSaveStatus(args: {
    saving: boolean;
    dirty: boolean;
    failure: ReportSaveFailure | null;
    savedOnce: boolean;
}): ReportSaveStatus {
    if (args.saving) return "saving";
    if (args.dirty && args.failure) return "failed";
    if (args.dirty) return "unsaved";
    if (args.savedOnce) return "saved";
    return "clean";
}

/** `fetch` rejects with a TypeError when there is no response at all. */
export function isNetworkFailure(err: unknown): boolean {
    return err instanceof TypeError;
}
