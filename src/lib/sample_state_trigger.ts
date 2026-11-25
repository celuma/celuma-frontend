/**
 * Timeline suffix for a sample state change the system made on its own.
 *
 * - `first_image_upload`: RECEIVED → PROCESSING when the sample's first image is uploaded.
 * - `report_submitted` (Céluma #86, proposed): RECEIVED/PROCESSING → READY when the order's report is submitted
 *   and the order enters review. The event's `created_by` is the submitter, so without the suffix the timeline
 *   would read as a manual change by that person.
 *
 * Any other (or missing) trigger is a manual change and gets no suffix.
 */
export const AUTOMATIC_SAMPLE_STATE_TRIGGERS: readonly string[] = ["first_image_upload", "report_submitted"];

export function automaticSampleStateSuffix(trigger: unknown): string {
    return typeof trigger === "string" && AUTOMATIC_SAMPLE_STATE_TRIGGERS.includes(trigger) ? " (automático)" : "";
}
