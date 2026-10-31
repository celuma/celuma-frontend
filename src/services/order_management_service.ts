/**
 * Typed client for basic order edits, sample-code correction and erroneous-capture removal
 * (Céluma 1.4, issues #9, #10, #11, #16). Every rule is enforced by the API; the UI only explains it.
 *
 *   GET   /v1/laboratory/orders/{id}/management      (lab:read)
 *   PATCH /v1/laboratory/orders/{id}                 (lab:update_order)
 *   POST  /v1/laboratory/orders/{id}/removal         (lab:remove_capture)
 *   GET   /v1/laboratory/samples/{id}/management     (lab:read)
 *   POST  /v1/laboratory/samples/{id}/code-correction (lab:update_sample + lab:enter_manual_code)
 *   POST  /v1/laboratory/samples/{id}/removal        (lab:remove_capture)
 *   PATCH /v1/laboratory/samples/{id}/notes          (lab:update_sample)
 *   PATCH /v1/laboratory/samples/{id}/dates          (lab:update_sample; received_at only within its numbering month)
 */
import { apiFetch } from "../lib/api_fetch";
import { formatHttpError } from "../lib/api_error";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";
const LAB = `${base}/v1/laboratory`;

export interface Blocker {
    code: string;
    message: string;
    report_id?: string | null;
}

export interface ActionState {
    /** The caller holds the capability (a hint; the API enforces it). */
    permitted: boolean;
    /** The lifecycle/evidence/dependency rules allow it right now. */
    allowed: boolean;
    blockers: Blocker[];
}

export interface OrderManagementState {
    order_id: string;
    order_code: string;
    status: string;
    edit: ActionState;
    removal: ActionState;
    editable_fields: string[];
    sample_count: number;
    has_report: boolean;
    removal_consequences: string[];
}

export interface SampleManagementState {
    sample_id: string;
    sample_code: string;
    order_id: string;
    order_code: string;
    correction: ActionState;
    /** Receipt/collection date edit; absent on an API older than this change. */
    dates?: ActionState;
    /** Moving the receipt date into another month regenerates the code (issued by monthly numbering). */
    code_follows_receipt_month?: boolean;
    removal: ActionState;
    removal_consequences: string[];
}

export interface OrderUpdateInput {
    patient_id?: string | null;
    requesting_physician_ids?: string[];
    expediente?: string | null;
    notes?: string | null;
}

export interface RemovalResult {
    kind: "order" | "sample";
    id: string;
    code: string;
    order_id: string;
    order_code: string;
    already_removed: boolean;
    samples_removed: number;
    reports_hidden: number;
    invoice_retained: boolean;
}

async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(formatHttpError(res.status, await res.text()));
    return (await res.json()) as T;
}

export const getOrderManagement = async (orderId: string) =>
    json<OrderManagementState>(await apiFetch(`${LAB}/orders/${orderId}/management`));

export const updateOrder = async (orderId: string, input: OrderUpdateInput) =>
    json<unknown>(await apiFetch(`${LAB}/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(input) }));

export const removeOrder = async (orderId: string, reason: string) =>
    json<RemovalResult>(await apiFetch(`${LAB}/orders/${orderId}/removal`, { method: "POST", body: JSON.stringify({ reason }) }));

export const getSampleManagement = async (sampleId: string) =>
    json<SampleManagementState>(await apiFetch(`${LAB}/samples/${sampleId}/management`));

export const correctSampleCode = async (sampleId: string, sampleCode: string, reason: string) =>
    json<{ sample_id: string; old_code: string; sample_code: string; unchanged: boolean }>(
        await apiFetch(`${LAB}/samples/${sampleId}/code-correction`, {
            method: "POST", body: JSON.stringify({ sample_code: sampleCode, reason }),
        }),
    );

export const removeSample = async (sampleId: string, reason: string) =>
    json<RemovalResult>(await apiFetch(`${LAB}/samples/${sampleId}/removal`, { method: "POST", body: JSON.stringify({ reason }) }));

export const updateSampleNotes = async (sampleId: string, notes: string | null) =>
    json<unknown>(await apiFetch(`${LAB}/samples/${sampleId}/notes`, { method: "PATCH", body: JSON.stringify({ notes }) }));

export const updateSampleDates = async (
    sampleId: string, input: { received_at?: string; collected_at?: string | null; reason: string },
) => json<{ sample_id: string; sample_code: string; old_code?: string | null; unchanged: boolean }>(
    await apiFetch(`${LAB}/samples/${sampleId}/dates`, { method: "PATCH", body: JSON.stringify(input) }),
);
