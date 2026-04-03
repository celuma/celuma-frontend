/**
 * RBAC helpers — client-side equivalents of the backend permission system.
 * Permission codes must stay in sync with the seed data in
 * celuma-backend/alembic/versions/e7f8a9b0c1d2_fase1_rbac_schema.py
 */

// ── Permission codes ──────────────────────────────────────────────────────────
export const PERMS = {
    // admin domain
    MANAGE_USERS: "admin:manage_users",
    MANAGE_BRANCHES: "admin:manage_branches",
    MANAGE_CATALOG: "admin:manage_catalog",
    MANAGE_TENANT: "admin:manage_tenant",
    MANAGE_INVITATIONS: "admin:manage_invitations",

    // lab domain
    LAB_READ: "lab:read",
    CREATE_ORDER: "lab:create_order",
    CREATE_PATIENT: "lab:create_patient",
    CREATE_SAMPLE: "lab:create_sample",
    UPDATE_ORDER: "lab:update_order",
    UPDATE_SAMPLE: "lab:update_sample",
    UPLOAD_IMAGES: "lab:upload_images",
    DELETE_IMAGES: "lab:delete_images",
    MANAGE_ASSIGNEES: "lab:manage_assignees",
    MANAGE_REVIEWERS: "lab:manage_reviewers",
    MANAGE_COMMENTS: "lab:manage_comments",
    MANAGE_LABELS: "lab:manage_labels",

    // billing domain
    BILLING_READ: "billing:read",
    CREATE_INVOICE: "billing:create_invoice",
    REGISTER_PAYMENT: "billing:register_payment",
    EDIT_ITEMS: "billing:edit_items",

    // reports domain
    REPORTS_READ: "reports:read",
    REPORTS_CREATE: "reports:create",
    REPORTS_EDIT: "reports:edit",
    REPORTS_SUBMIT: "reports:submit",
    REPORTS_APPROVE: "reports:approve",
    REPORTS_SIGN: "reports:sign",
    REPORTS_RETRACT: "reports:retract",
    MANAGE_TEMPLATES: "reports:manage_templates",

    // audit domain
    READ_AUDITLOG: "audit:read_auditlog",
    READ_EVENTS: "audit:read_events",

    // portal domain
    PHYSICIAN_ACCESS: "portal:physician_access",
    PATIENT_ACCESS: "portal:patient_access",
} as const;

// Roles that have implicit access to all tenant branches (mirrors backend FULL_BRANCH_ACCESS_ROLES).
const FULL_BRANCH_ACCESS_ROLES = new Set(["admin", "superuser"]);

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function hasPermission(permissions: string[], code: string): boolean {
    return permissions.includes(code);
}

export function hasAnyPermission(permissions: string[], codes: string[]): boolean {
    return codes.some((c) => permissions.includes(c));
}

export function hasRole(roles: string[], code: string): boolean {
    return roles.includes(code);
}

/** Whether the user's roles give them implicit access to every branch (admin / superuser). */
export function hasFullBranchAccess(roles: string[]): boolean {
    return roles.some((r) => FULL_BRANCH_ACCESS_ROLES.has(r));
}

/** Display label for a role code. */
export function roleDisplayName(code: string): string {
    const names: Record<string, string> = {
        superuser: "Superadministrador",
        admin: "Administrador",
        pathologist: "Patólogo",
        lab_tech: "Técnico de Laboratorio",
        billing: "Facturación",
        assistant: "Asistente",
        viewer: "Solo Lectura",
        physician: "Médico Solicitante",
        auditor: "Auditor",
    };
    return names[code] ?? code;
}

/**
 * Returns the most appropriate landing route for a set of permissions.
 * Used by RequirePermission when a logged-in user lacks access to the
 * requested route, to avoid redirecting to a route they also can't access.
 */
export function defaultRouteForPermissions(permissions: string[]): string {
    if (permissions.includes(PERMS.LAB_READ)) return "/home";
    if (permissions.includes(PERMS.PHYSICIAN_ACCESS)) return "/physician-portal";
    if (permissions.includes(PERMS.BILLING_READ)) return "/billing";
    if (permissions.includes(PERMS.REPORTS_READ)) return "/reports";
    return "/access-denied";
}

/** Human-readable label for a permission code (used in access-denied messages). */
export function permissionLabel(code: string): string {
    const labels: Record<string, string> = {
        "lab:read": "Laboratorio",
        "lab:create_order": "Crear Órdenes",
        "lab:create_patient": "Registrar Pacientes",
        "lab:create_sample": "Registrar Muestras",
        "lab:update_order": "Actualizar Órdenes",
        "lab:update_sample": "Actualizar Muestras",
        "billing:read": "Facturación",
        "billing:create_invoice": "Crear Facturas",
        "billing:register_payment": "Registrar Pagos",
        "billing:edit_items": "Editar Ítems de Factura",
        "reports:read": "Reportes",
        "reports:create": "Crear Reportes",
        "reports:edit": "Editar Reportes",
        "reports:submit": "Enviar Reportes",
        "reports:approve": "Aprobar Reportes",
        "reports:sign": "Firmar Reportes",
        "reports:retract": "Retractar Reportes",
        "reports:manage_templates": "Plantillas de Reportes",
        "admin:manage_users": "Gestión de Usuarios",
        "admin:manage_branches": "Gestión de Sucursales",
        "admin:manage_catalog": "Catálogo",
        "admin:manage_tenant": "Configuración del Tenant",
        "portal:physician_access": "Portal Médico",
        "portal:patient_access": "Portal de Pacientes",
        "audit:read_auditlog": "Auditoría",
    };
    return labels[code] ?? code;
}

/** Accent colour for a role badge. */
export function roleColor(code: string): { color: string; bg: string } {
    const palette: Record<string, { color: string; bg: string }> = {
        superuser: { color: "#7c3aed", bg: "#f5f3ff" },
        admin:     { color: "#8b5cf6", bg: "#ede9fe" },
        pathologist: { color: "#3b82f6", bg: "#eff6ff" },
        lab_tech:  { color: "#10b981", bg: "#ecfdf5" },
        billing:   { color: "#f59e0b", bg: "#fffbeb" },
        assistant: { color: "#06b6d4", bg: "#ecfeff" },
        viewer:    { color: "#6b7280", bg: "#f3f4f6" },
        physician: { color: "#0ea5e9", bg: "#f0f9ff" },
        auditor:   { color: "#64748b", bg: "#f8fafc" },
    };
    return palette[code] ?? { color: "#6b7280", bg: "#f3f4f6" };
}
