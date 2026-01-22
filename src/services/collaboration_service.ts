/**
 * Collaboration Service - Handles assignees, reviewers, and labels
 */

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

async function putJSON<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        accept: "application/json" 
    };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { 
        method: "PUT", 
        headers, 
        credentials: "include",
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

async function postJSON<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        accept: "application/json" 
    };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { 
        method: "POST", 
        headers, 
        credentials: "include",
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

async function deleteJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { 
        method: "DELETE", 
        headers, 
        credentials: "include",
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

// --- Types ---

export type Label = {
    id: string;
    name: string;
    color: string;
    tenant_id: string;
    created_at: string;
};

export type LabelWithInheritance = {
    id: string;
    name: string;
    color: string;
    inherited: boolean;
};

export type LabelCreate = {
    name: string;
    color: string;
};

export type LabUser = {
    id: string;
    name: string;
    email: string;
    username?: string | null;
    avatar_url?: string | null;
};

export type UserRef = {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
};

export type OrderDetail = {
    id: string;
    order_code: string;
    status: string;
    patient_id: string;
    tenant_id: string;
    branch_id: string;
    requested_by?: string | null;
    notes?: string | null;
    billed_lock?: boolean | null;
    assignees?: UserRef[] | null;
    reviewers?: UserRef[] | null;
    labels?: Label[] | null;
};

export type SampleDetail = {
    id: string;
    sample_code: string;
    type: string;
    state: string;
    collected_at?: string | null;
    received_at?: string | null;
    notes?: string | null;
    tenant_id: string;
    assignees?: UserRef[] | null;
    labels?: LabelWithInheritance[] | null;
};

// --- Labels API ---

export async function getLabels(): Promise<Label[]> {
    const response = await getJSON<{ labels: Label[] }>("/v1/laboratory/labels/");
    return response.labels;
}

export async function createLabel(data: LabelCreate): Promise<Label> {
    return await postJSON<LabelCreate, Label>("/v1/laboratory/labels/", data);
}

export async function deleteLabel(labelId: string): Promise<{ message: string }> {
    return await deleteJSON<{ message: string }>(`/v1/laboratory/labels/${labelId}`);
}

// --- Order Assignees/Reviewers/Labels API ---

export async function updateOrderAssignees(orderId: string, assigneeIds: string[]): Promise<OrderDetail> {
    return await putJSON<{ assignee_ids: string[] }, OrderDetail>(
        `/v1/laboratory/orders/${orderId}/assignees`,
        { assignee_ids: assigneeIds }
    );
}

export async function updateOrderReviewers(orderId: string, reviewerIds: string[]): Promise<OrderDetail> {
    return await putJSON<{ reviewer_ids: string[] }, OrderDetail>(
        `/v1/laboratory/orders/${orderId}/reviewers`,
        { reviewer_ids: reviewerIds }
    );
}

export async function updateOrderLabels(orderId: string, labelIds: string[]): Promise<OrderDetail> {
    return await putJSON<{ label_ids: string[] }, OrderDetail>(
        `/v1/laboratory/orders/${orderId}/labels`,
        { label_ids: labelIds }
    );
}

// --- Sample Assignees/Labels API ---

export async function updateSampleAssignees(sampleId: string, assigneeIds: string[]): Promise<SampleDetail> {
    return await putJSON<{ assignee_ids: string[] }, SampleDetail>(
        `/v1/laboratory/samples/${sampleId}/assignees`,
        { assignee_ids: assigneeIds }
    );
}

export async function updateSampleLabels(sampleId: string, ownLabelIds: string[]): Promise<SampleDetail> {
    // ownLabelIds: solo las labels PROPIAS del sample, no incluir las heredadas
    return await putJSON<{ label_ids: string[] }, SampleDetail>(
        `/v1/laboratory/samples/${sampleId}/labels`,
        { label_ids: ownLabelIds }
    );
}

// --- Lab Users API ---

export async function getLabUsers(): Promise<LabUser[]> {
    const response = await getJSON<{ users: LabUser[] }>("/v1/laboratory/users/search");
    return response.users;
}
