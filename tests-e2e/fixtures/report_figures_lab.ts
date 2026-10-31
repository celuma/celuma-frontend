/**
 * Synthetic laboratory for the report figure editor specs (1.4 #18/#20).
 *
 * One laboratory with a DRAFT V2 report whose template has a rich-text section
 * and an images section, an order with one sample, and N synthetic images.
 * Every image is a PNG with its label drawn large ("A", "B", …) so a rendered
 * figure can be told apart by eye and by pixel. Passwords are synthetic.
 */
import { expect, type APIRequestContext } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";

export const API_BASE = process.env.CELUMA_E2E_API_BASE_URL || "http://localhost:8000";
export const ADMIN_PASSWORD = "E2eFigures14!2026";
export const REVIEWER_PASSWORD = "E2eFiguresReviewer!2026";

type Json = Record<string, unknown>;

export function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export async function api<T = Json>(
    request: APIRequestContext,
    method: "GET" | "POST" | "PUT" | "PATCH",
    urlPath: string,
    options: { data?: unknown; token?: string } = {},
): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
    if (method === "POST" && /\/laboratory\/(orders\/(unified)?|samples\/)$/.test(urlPath)) {
        headers["Idempotency-Key"] = crypto.randomUUID();
    }
    const res = await request.fetch(`${API_BASE}${urlPath}`, { method, headers, data: options.data });
    if (!res.ok()) throw new Error(`${method} ${urlPath} -> ${res.status()}: ${await res.text()}`);
    return (await res.json().catch(() => ({}))) as T;
}

/** A 640x480 PNG with one big distinguishing label on a distinct colour. */
export function labelledPng(label: string, hue: number): Buffer {
    const canvas = createCanvas(640, 480);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `hsl(${hue}, 60%, 70%)`;
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#0d1b2a";
    ctx.font = "bold 320px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 320, 250);
    return canvas.toBuffer("image/png");
}

export interface FigureLab {
    adminEmail: string;
    reviewerEmail: string;
    admin: string;
    reviewerToken: string;
    orderId: string;
    reportId: string;
    sampleId: string;
    templateId: string;
    tenantId: string;
    branchId: string;
    imageIds: Record<string, string>;
}

/** Céluma 1.4 (#12/#14/#15/#19): optional extras so the composition spec can reuse this lab. */
export interface FigureLabOptions {
    /** Replaces the default template JSON (base fields, sections, signatureMetadata). */
    templateJson?: Record<string, unknown>;
    /** Order fields: the optional request reference and the legacy free-text requester. */
    expediente?: string;
    requestedBy?: string;
    /** Extra samples on the order (the first one is always created). */
    extraSamples?: number;
    /** Upload a wide synthetic autograph for the reviewer, so a signed report carries one. */
    uploadSignature?: boolean;
    /** Margins (cm) of the default letterhead. */
    marginsCm?: number;
    /** Letterhead band heights (mm), to leave a deliberately small usable body. */
    headerHeightMm?: number;
    footerHeightMm?: number;
}

/** A 360x120 PNG "signature": a stroke on a transparent background. */
export function autographPng(): Buffer {
    const canvas = createCanvas(360, 120);
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#0d1b2a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(10, 90);
    ctx.bezierCurveTo(90, 10, 180, 120, 350, 30);
    ctx.stroke();
    return canvas.toBuffer("image/png");
}

export async function figureLab(request: APIRequestContext, labels: string[], opts: FigureLabOptions = {}): Promise<FigureLab> {
    const suffix = uniqueSuffix();
    const adminEmail = `e2e-figs14-admin-${suffix}@example.com`;
    const reg = await api<{ tenant_id: string; branch_id: string }>(request, "POST", "/api/v1/auth/register/unified", {
        data: {
            tenant: { name: `E2E Figs14 ${suffix}` },
            branch: { code: "MAIN", name: "Main Branch" },
            admin_user: { email: adminEmail, password: ADMIN_PASSWORD, full_name: "E2E Admin" },
        },
    });
    const admin = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: adminEmail, password: ADMIN_PASSWORD },
    })).access_token;

    const letterhead = await api<{ id: string }>(request, "POST", "/api/v1/report-letterheads/", {
        data: { name: `Membrete ${suffix}` }, token: admin,
    });
    await api(request, "PUT", `/api/v1/report-letterheads/${letterhead.id}/versions/current`, {
        data: {
            configuration: {
                paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: opts.marginsCm ?? 2, right: opts.marginsCm ?? 2, bottom: opts.marginsCm ?? 2, left: opts.marginsCm ?? 2 } },
                header: { enabled: true, institution_name: "Laboratorio Sintético", ...(opts.headerHeightMm ? { height_mm: opts.headerHeightMm } : {}) },
                footer: { enabled: true, custom_text: "Pie sintético", show_page_number: true, ...(opts.footerHeightMm ? { height_mm: opts.footerHeightMm } : {}) },
                style: { primary_color: "#336699" },
            },
        },
        token: admin,
    });
    await api(request, "POST", `/api/v1/report-letterheads/${letterhead.id}/default`, { token: admin });

    const templateJson = opts.templateJson ?? {
        base: { diagnosis: { is_visible: true, label: "Diagnóstico", is_custom: true, type: "text", value: "" } },
        sections: {
            hallazgos: { is_visible: true, label: "Hallazgos", type: "richtext", content: "" },
            figuras: { is_visible: true, label: "Imágenes", type: "images", content: [] },
        },
        base_order: ["diagnosis"],
        section_order: ["hallazgos", "figuras"],
    };
    const template = await api<{ id: string; template_hash: string }>(request, "POST", "/api/v1/reports/templates/", {
        data: { name: `Plantilla ${suffix}`, template_json: templateJson }, token: admin,
    });
    const studyType = await api<{ id: string }>(request, "POST", "/api/v1/study-types/", {
        data: { code: `FG${suffix.slice(-6)}`, name: `Estudio ${suffix}`, default_report_template_id: template.id },
        token: admin,
    });
    const patient = await api<{ id: string }>(request, "POST", "/api/v1/patients/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id,
            first_name: "E2E", last_name: "Paciente", patient_code: `FG-PAT-${suffix}`,
        },
        token: admin,
    });
    const order = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/orders/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id, patient_id: patient.id,
            study_type_id: studyType.id,
            ...(opts.expediente ? { expediente: opts.expediente } : {}),
            ...(opts.requestedBy ? { requested_by: opts.requestedBy } : {}),
        },
        token: admin,
    });
    const sampleType = await api<{ id: string }>(request, "POST", "/api/v1/sample-types/", {
        data: { code: `BQ${suffix.slice(-6)}`, name: `Bloque ${suffix}` }, token: admin,
    });
    const sample = await api<{ id: string }>(request, "POST", "/api/v1/laboratory/samples/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id, order_id: order.id,
            sample_type_id: sampleType.id, collected_at: "2026-10-01T10:00:00", received_at: "2026-10-01T11:00:00",
        },
        token: admin,
    });
    const sampleId = sample.id;
    for (let i = 0; i < (opts.extraSamples ?? 0); i += 1) {
        await api(request, "POST", "/api/v1/laboratory/samples/", {
            data: {
                tenant_id: reg.tenant_id, branch_id: reg.branch_id, order_id: order.id,
                sample_type_id: sampleType.id, collected_at: "2026-10-01T10:00:00", received_at: "2026-10-01T11:00:00",
            },
            token: admin,
        });
    }

    const imageIds: Record<string, string> = {};
    for (const [i, label] of labels.entries()) {
        const res = await request.fetch(`${API_BASE}/api/v1/laboratory/samples/${sampleId}/images`, {
            method: "POST",
            headers: { Authorization: `Bearer ${admin}` },
            multipart: { file: { name: `${label}.png`, mimeType: "image/png", buffer: labelledPng(label, (i * 70) % 360) } },
        });
        expect(res.ok(), await res.text()).toBeTruthy();
        imageIds[label] = ((await res.json()) as { id: string }).id;
    }

    const reviewerEmail = `e2e-figs14-reviewer-${suffix}@example.com`;
    const reviewer = await api<{ id: string }>(request, "POST", "/api/v1/users/", {
        data: {
            email: reviewerEmail, first_name: "Revisora", last_name: "Sintética", role: "reviewer",
            password: REVIEWER_PASSWORD, branch_ids: [reg.branch_id],
        },
        token: admin,
    });
    await api(request, "PUT", `/api/v1/laboratory/orders/${order.id}/reviewers`, {
        data: { reviewer_ids: [reviewer.id] }, token: admin,
    });
    const reviewerToken = (await api<{ access_token: string }>(request, "POST", "/api/v1/auth/login", {
        data: { username_or_email: reviewerEmail, password: REVIEWER_PASSWORD },
    })).access_token;

    const tpl = await api<{ template_hash: string }>(request, "GET", `/api/v1/reports/templates/${template.id}`, { token: admin });
    const report = await api<{ id: string }>(request, "POST", "/api/v1/reports/", {
        data: {
            tenant_id: reg.tenant_id, branch_id: reg.branch_id, order_id: order.id,
            title: "Reporte sintético de figuras",
            report: { base: {}, sections: {}, base_order: [], section_order: [] },
            template_id: template.id, template_hash: tpl.template_hash,
        },
        token: admin,
    });

    if (opts.uploadSignature) {
        const res = await request.fetch(`${API_BASE}/api/v1/users/me/signature`, {
            method: "POST",
            headers: { Authorization: `Bearer ${reviewerToken}` },
            multipart: { file: { name: "firma.png", mimeType: "image/png", buffer: autographPng() } },
        });
        expect(res.ok(), await res.text()).toBeTruthy();
    }

    return {
        adminEmail, reviewerEmail, admin, reviewerToken, orderId: order.id, reportId: report.id,
        sampleId, templateId: template.id, tenantId: reg.tenant_id, branchId: reg.branch_id, imageIds,
    };
}

/**
 * Selects the first `count` synthetic images in the sample gallery (each card has one checkbox button).
 * The gallery lists the oldest upload first, so these are the first `count` labels passed to `figureLab`.
 */
export async function selectAllGalleryImages(page: import("@playwright/test").Page, count: number) {
    const checkboxes = page.locator('div[role="button"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < count; i++) {
        await checkboxes.nth(i).click();
    }
}

/**
 * Selects the synthetic images with these labels, in this order, identifying each gallery card by the
 * label in its object key rather than by its position, so a spec about figure order never depends on
 * the gallery's own order.
 */
export async function selectGalleryImages(page: import("@playwright/test").Page, labels: string[]) {
    const checkboxes = page.locator('div[role="button"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 30_000 });
    for (const label of labels) {
        const index = await checkboxes.evaluateAll(
            (els, l) => els.findIndex((el) => new RegExp(`/${l}_[0-9a-f]+\\.jpg`).test(el.parentElement?.querySelector("img")?.getAttribute("src") ?? "")),
            label,
        );
        expect(index, `gallery card for image ${label}`).toBeGreaterThanOrEqual(0);
        await checkboxes.nth(index).click();
    }
}
