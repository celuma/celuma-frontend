/**
 * Worklist Service - API functions for worklist, assignments, and report reviews
 */

// Config base URL API
const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

// Helper function to get auth token
function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

// === Types ===

export interface UserRef {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
}

export interface ReviewerWithStatus extends UserRef {
    status: "pending" | "approved" | "rejected";
    review_id?: string | null;
}

export interface WorklistItem {
    id: string;
    kind: "assignment" | "review";
    item_type: "lab_order" | "sample" | "report";
    item_id: string;
    display_id: string;
    item_status: string;
    assigned_at: string;
    patient_name?: string | null;
    patient_code?: string | null;
    order_code?: string | null;
    tags?: string[] | null;
    link: string;
}

export interface WorklistResponse {
    items: WorklistItem[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
}

export interface AssignmentResponse {
    id: string;
    tenant_id: string;
    item_type: string;
    item_id: string;
    assignee_user_id: string;
    assigned_by_user_id?: string | null;
    assigned_at: string;
    unassigned_at?: string | null;
    is_reviewer: boolean;
    assignee?: UserRef | null;
    assigned_by?: UserRef | null;
}

export interface AssignmentsListResponse {
    assignments: AssignmentResponse[];
}

export interface ReportReviewResponse {
    id: string;
    tenant_id: string;
    report_id: string;
    reviewer_user_id: string;
    assigned_by_user_id?: string | null;
    assigned_at: string;
    decision_at?: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    comment?: string | null;
    reviewer?: UserRef | null;
    assigned_by?: UserRef | null;
}

export interface ReportReviewsListResponse {
    reviews: ReportReviewResponse[];
}


// === Worklist API ===

interface GetWorklistParams {
    kind?: "assignment" | "review";
    item_type?: "lab_order" | "sample" | "report";
    status?: string;
    page?: number;
    page_size?: number;
}

export async function getMyWorklist(params?: GetWorklistParams): Promise<WorklistResponse> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const queryParams = new URLSearchParams();
    if (params?.kind) queryParams.set("kind", params.kind);
    if (params?.item_type) queryParams.set("item_type", params.item_type);
    if (params?.status) queryParams.set("status", params.status);
    if (params?.page) queryParams.set("page", params.page.toString());
    if (params?.page_size) queryParams.set("page_size", params.page_size.toString());
    
    const queryString = queryParams.toString();
    const url = `${base}/v1/me/worklist${queryString ? `?${queryString}` : ""}`;
    
    const res = await fetch(url, { headers });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error loading worklist: ${res.status} - ${errText}`);
    }
    
    return await res.json();
}


// === Assignment API ===

interface GetAssignmentsParams {
    item_type?: string;
    item_id?: string;
    assignee_user_id?: string;
    is_reviewer?: boolean;
    include_unassigned?: boolean;
}

export async function getAssignments(params?: GetAssignmentsParams): Promise<AssignmentsListResponse> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const queryParams = new URLSearchParams();
    if (params?.item_type) queryParams.set("item_type", params.item_type);
    if (params?.item_id) queryParams.set("item_id", params.item_id);
    if (params?.assignee_user_id) queryParams.set("assignee_user_id", params.assignee_user_id);
    if (params?.is_reviewer !== undefined) queryParams.set("is_reviewer", params.is_reviewer.toString());
    if (params?.include_unassigned) queryParams.set("include_unassigned", "true");
    
    const queryString = queryParams.toString();
    const url = `${base}/v1/assignments${queryString ? `?${queryString}` : ""}`;
    
    const res = await fetch(url, { headers });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error loading assignments: ${res.status} - ${errText}`);
    }
    
    return await res.json();
}

interface CreateAssignmentParams {
    item_type: "lab_order" | "sample" | "report";
    item_id: string;
    assignee_user_id: string;
    is_reviewer?: boolean;
}

export async function createAssignment(params: CreateAssignmentParams): Promise<AssignmentResponse> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${base}/v1/assignments`, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error creating assignment: ${res.status} - ${errText}`);
    }
    
    return await res.json();
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${base}/v1/assignments/${assignmentId}`, {
        method: "DELETE",
        headers,
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error deleting assignment: ${res.status} - ${errText}`);
    }
}


// === Report Review API ===

interface GetReportReviewsParams {
    report_id?: string;
    reviewer_user_id?: string;
    status?: string;
}

export async function getReportReviews(params?: GetReportReviewsParams): Promise<ReportReviewsListResponse> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const queryParams = new URLSearchParams();
    if (params?.report_id) queryParams.set("report_id", params.report_id);
    if (params?.reviewer_user_id) queryParams.set("reviewer_user_id", params.reviewer_user_id);
    if (params?.status) queryParams.set("status", params.status);
    
    const queryString = queryParams.toString();
    const url = `${base}/v1/report-reviews${queryString ? `?${queryString}` : ""}`;
    
    const res = await fetch(url, { headers });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error loading report reviews: ${res.status} - ${errText}`);
    }
    
    return await res.json();
}

interface MakeReviewDecisionParams {
    decision: "approved" | "rejected";
    comment?: string;
}

export async function makeReviewDecision(
    reviewId: string, 
    params: MakeReviewDecisionParams
): Promise<ReportReviewResponse> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    
    const res = await fetch(`${base}/v1/report-reviews/${reviewId}/decision`, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error making review decision: ${res.status} - ${errText}`);
    }
    
    return await res.json();
}
