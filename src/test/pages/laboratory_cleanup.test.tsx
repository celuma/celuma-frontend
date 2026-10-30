/**
 * Céluma 1.4, issue #39 — Configuración → Mantenimiento → Limpieza de contenido.
 *
 * The API is the authority (the active superadministrator of the laboratory, own tenant, signed preview, password throttle);
 * these tests pin what the screen asks for, what it shows and what it refuses to do. There are no options: billing
 * and audit are always part of the cleanup. Synthetic data only. The password is a
 * synthetic test value and must never appear anywhere in the DOM after it is typed or after a failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LaboratoryCleanup from "../../pages/laboratory_cleanup";
import SidebarConfig from "../../components/ui/sidebar_config";
import type { CleanupOperation, CleanupPreview } from "../../models/laboratory_cleanup";

const TENANT = "11111111-1111-4111-8111-111111111111";
const LAB = "Laboratorio Embajador Ñandú";
const PASSWORD = "synthetic-test-password";
const REASON = "Limpieza de contenido de prueba antes del arranque";

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const profile = (roles: string[], permissions: string[] = ["admin:manage_tenant", "admin:manage_users", "admin:manage_catalog"]) => ({
    id: "u1", email: "op@example.invalid", full_name: "Operador Sintético", roles, permissions, tenant_id: TENANT, branch_ids: [],
});

const preview = (over: Partial<CleanupPreview> = {}): CleanupPreview => ({
    laboratory: { id: TENANT, name: LAB },
    delete: { orders: 4, samples: 6, reports: 2, report_versions: 8, report_amendments: 1, invoices: 3, invoice_items: 3, payments: 1, audit_rows: 9 },
    retain_as_evidence: { previously_removed_orders_included: 1, idempotency_receipts: 3, numbering_allocations: 7, sample_code_corrections: 2 },
    preserve: { patients: 1, users: 5, branches: 1, report_templates: 1, numbering_counters: 3, shared_assets_kept: 2 },
    objects: { delete_count: 9, delete_bytes: 2048, by_category: { official_pdf: { objects: 2, bytes: 1000 } }, kept_shared_count: 2 },
    blockers: [], warnings: [{ code: "shared_assets_kept", message: "Algunos objetos referenciados por contenido a eliminar se conservan porque otro registro los usa." }],
    scope_revision: "a".repeat(64), preview_token: "token-opaque-value", expires_at: "2099-01-01T00:00:00",
    ...over,
});

const operation = (over: Partial<CleanupOperation> = {}): CleanupOperation => ({
    id: "op-1", tenant_id: TENANT, status: "QUEUED", phase: "QUIESCE", reason: REASON, laboratory_name: LAB,
    approved_counts: { delete: {}, retain_as_evidence: {} }, executed_counts: null, error_code: null, error_message: null,
    attempts: 0, objects: { total: 0, pending: 0, deleted: 0, absent: 0, kept: 0, failed: 0, pending_bytes: 0 }, writers_blocked: true,
    can_retry: false, can_cancel: true, created_at: "2026-10-28T10:00:00", started_at: null, database_cleaned_at: null, completed_at: null, cancelled_at: null,
    ...over,
});

interface Server {
    calls: Array<{ method: string; url: string; body: Record<string, unknown> | null }>;
    onPreview: (body: Record<string, unknown>) => Response;
    onStart: (body: Record<string, unknown>) => Response;
    operations: CleanupOperation[];
    detail: () => CleanupOperation;
    authorized: boolean;
    roles: string[];
}

function serve(over: Partial<Server> = {}): Server {
    const server: Server = {
        calls: [],
        onPreview: () => json(preview()),
        onStart: () => json(operation(), 202),
        operations: [],
        detail: () => operation({ status: "COMPLETED", phase: "DONE", writers_blocked: false, can_cancel: false }),
        authorized: true,
        roles: ["superuser"],
        ...over,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
        server.calls.push({ method, url, body });
        if (url.endsWith("/auth/me")) return json(profile(server.roles));
        if (url.endsWith("/authorization")) return json({ authorized: server.authorized });
        if (url.endsWith("/preview")) return server.onPreview(body ?? {});
        if (url.endsWith("/operations") && method === "POST") return server.onStart(body ?? {});
        if (url.endsWith("/operations")) return json(server.operations);
        if (url.endsWith("/retry")) return json(operation({ status: "RUNNING", phase: "OBJECTS", writers_blocked: false, can_retry: false, can_cancel: false }), 202);
        if (url.endsWith("/cancel")) return json(operation({ status: "CANCELLED", writers_blocked: false, can_cancel: false, error_message: "Cancelada por el operador antes de modificar datos." }));
        if (url.includes("/operations/")) return json(server.detail());
        return json({});
    }));
    return server;
}

beforeEach(() => {
    localStorage.setItem("auth_token", "Bearer test-token");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
});

const renderPage = () => render(<MemoryRouter><LaboratoryCleanup /></MemoryRouter>);
const posts = (server: Server, suffix: string) => server.calls.filter((c) => c.method === "POST" && c.url.endsWith(suffix));

async function openPreview() {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("laboratory-cleanup-page");
    await user.click(screen.getByTestId("preview-button"));
    await screen.findByTestId("cleanup-preview");
    return user;
}

async function fillConfirmation(user: ReturnType<typeof userEvent.setup>, over: { reason?: string; name?: string; password?: string; ack?: boolean } = {}) {
    await user.type(screen.getByLabelText("Motivo de la limpieza"), over.reason ?? REASON);
    await user.type(screen.getByLabelText("Nombre del laboratorio"), over.name ?? LAB);
    await user.type(screen.getByLabelText("Tu contraseña actual"), over.password ?? PASSWORD);
    if (over.ack !== false) await user.click(screen.getByRole("checkbox"));
}

describe("access", () => {
    it("shows access denied when the backend says the user is not an active superadministrator of the laboratory", async () => {
        serve({ authorized: false });
        renderPage();
        expect(await screen.findByText("Acceso Denegado")).toBeInTheDocument();
        expect(screen.queryByTestId("laboratory-cleanup-page")).toBeNull();
    });

    it("the profile's roles never decide: an administrator the backend does not authorize is denied and cannot preview", async () => {
        const server = serve({ roles: ["admin", "superuser"], authorized: false });
        renderPage();
        expect(await screen.findByText("Acceso Denegado")).toBeInTheDocument();
        expect(server.calls.some((c) => c.url.endsWith("/authorization"))).toBe(true);
        expect(posts(server, "/preview")).toHaveLength(0);
    });

    it("the live backend capability remains authoritative when the cached profile is stale", async () => {
        serve({ roles: ["lab_tech"], authorized: true });
        renderPage();
        expect(await screen.findByTestId("laboratory-cleanup-page")).toBeInTheDocument();
    });

    it("an authorized superadministrator sees the irreversible warning and no confirmation yet", async () => {
        serve();
        renderPage();
        expect(await screen.findByTestId("laboratory-cleanup-page")).toBeInTheDocument();
        expect(screen.getByText("Esta acción es irreversible")).toBeInTheDocument();
        expect(screen.queryByTestId("cleanup-confirmation")).toBeNull();
        expect(screen.queryByTestId("cleanup-preview")).toBeNull();
    });
});

describe("preview", () => {
    it("offers no options: no finance switch exists, and the preview is requested with an empty body", async () => {
        const server = serve();
        await openPreview();
        expect(screen.queryByTestId("finance-switch")).toBeNull();
        expect(screen.queryByRole("switch")).toBeNull();
        expect(posts(server, "/preview")[0].body).toEqual({});
        expect(document.body.textContent).not.toMatch(/solo lectura|se conserva(n)? sin cambios|Incluir la facturación/);
    });

    it("says, before the preview, that billing and audit are part of the cleanup and that plan and prices stay", async () => {
        serve();
        renderPage();
        await screen.findByTestId("laboratory-cleanup-page");
        const text = document.body.textContent ?? "";
        expect(text).toMatch(/facturas, conceptos, pagos y el historial de auditoría/);
        expect(text).toMatch(/precios maestros/);
        expect(text).toMatch(/el plan y la suscripción del laboratorio/);
    });

    it("shows the exact laboratory, what is deleted (billing and audit included), the technical records kept and what is preserved", async () => {
        serve();
        await openPreview();
        expect(screen.getByTestId("preview-lab-name").textContent).toBe(LAB);
        expect(screen.getByTestId("preview-delete-orders").textContent).toBe("4");
        expect(screen.getByTestId("preview-delete-reports").textContent).toBe("2");
        expect(screen.getByTestId("preview-delete-invoices").textContent).toBe("3");
        expect(screen.getByTestId("preview-delete-payments").textContent).toBe("1");
        expect(screen.getByTestId("preview-delete-audit_rows").textContent).toBe("9");
        expect(screen.getByTestId("preview-retain-numbering_allocations").textContent).toBe("7");
        expect(screen.queryByTestId("preview-retain-order_tombstones")).toBeNull();
        expect(screen.queryByTestId("preview-retain-audit_rows_redacted")).toBeNull();
        expect(screen.getByTestId("preview-preserve-patients").textContent).toBe("1");
        expect(screen.getByTestId("preview-preserve-numbering_counters").textContent).toBe("3");
        expect(screen.getByTestId("preview-objects-count").textContent).toBe("9");
        expect(screen.getByTestId("preview-objects-bytes").textContent).toBe("2 KB");
        expect(within(screen.getByTestId("preview-warnings")).getByText(/otro registro los usa/)).toBeInTheDocument();
        expect(screen.getByTestId("cleanup-confirmation")).toBeInTheDocument();
    });

    it("explains the technical operation record and does not promise to erase backups or exports", async () => {
        serve();
        await openPreview();
        const note = screen.getByTestId("preview-provenance").textContent ?? "";
        expect(note).toMatch(/registro técnico mínimo/);
        expect(note).toMatch(/sin contenido eliminado/);
        expect(note).toMatch(/respaldos, exportaciones ya generadas ni versiones anteriores de archivos/);
    });

    it("blockers withhold the whole confirmation: nothing can be started", async () => {
        serve({
            onPreview: () => json(preview({ preview_token: null, expires_at: null, blockers: [{ code: "deliveries_in_flight", message: "Hay correos de notificación en envío ligados a este contenido; espera a que terminen." }] })),
        });
        await openPreview();
        expect(within(screen.getByTestId("preview-blockers")).getByText(/correos de notificación en envío/)).toBeInTheDocument();
        expect(screen.queryByTestId("cleanup-confirmation")).toBeNull();
        expect(screen.queryByTestId("confirm-button")).toBeNull();
    });

    it("a failed preview is reported as an alert and creates nothing", async () => {
        const server = serve({ onPreview: () => json({ detail: { code: "laboratory_cleanup_not_authorized", message: "No tienes autorización para limpiar el contenido de este laboratorio." } }, 403) });
        const user = userEvent.setup();
        renderPage();
        await screen.findByTestId("laboratory-cleanup-page");
        await user.click(screen.getByTestId("preview-button"));
        const message = await screen.findByText(/No tienes autorización/);
        expect(message.closest('[role="alert"]')).not.toBeNull();  // announced to assistive technology
        expect(posts(server, "/operations")).toHaveLength(0);
    });
});

describe("confirmation", () => {
    it("the destructive button stays disabled until reason, exact name, password and acknowledgement are all given", async () => {
        const server = serve();
        const user = await openPreview();
        const button = screen.getByTestId("confirm-button");
        expect(button).toBeDisabled();
        await user.type(screen.getByLabelText("Motivo de la limpieza"), "corto");
        expect(screen.getByText("Escribe al menos 10 caracteres.")).toBeInTheDocument();
        await user.clear(screen.getByLabelText("Motivo de la limpieza"));
        await user.type(screen.getByLabelText("Motivo de la limpieza"), REASON);
        await user.type(screen.getByLabelText("Nombre del laboratorio"), "Laboratorio Embajador");
        expect(screen.getByText("El nombre no coincide.")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Tu contraseña actual"), PASSWORD);
        await user.click(screen.getByRole("checkbox"));
        expect(button).toBeDisabled();  // the name is still wrong
        await user.clear(screen.getByLabelText("Nombre del laboratorio"));
        await user.type(screen.getByLabelText("Nombre del laboratorio"), LAB);
        expect(button).toBeEnabled();
        expect(posts(server, "/operations")).toHaveLength(0);
    });

    it("sends exactly the approved preview, reason, name and the actor's own password (and no obsolete option) — and never renders the password", async () => {
        const server = serve();
        const user = await openPreview();
        await fillConfirmation(user);
        await user.click(screen.getByTestId("confirm-button"));
        await screen.findByTestId("cleanup-operation");
        expect(posts(server, "/operations")).toHaveLength(1);
        expect(posts(server, "/operations")[0].body).toEqual({
            preview_token: "token-opaque-value", reason: REASON, confirm_name: LAB, password: PASSWORD,
        });
        expect(document.body.innerHTML).not.toContain(PASSWORD);
        // the confirmation is consumed: preview and form are gone, the progress view replaced them
        expect(screen.queryByTestId("cleanup-confirmation")).toBeNull();
        expect(screen.queryByTestId("cleanup-preview")).toBeNull();
    });

    it("a wrong password is reported, clears the password field and keeps the preview for another attempt", async () => {
        serve({ onStart: () => json({ detail: { code: "password_confirmation_invalid", message: "La contraseña no es correcta. No se realizó ningún cambio." } }, 403) });
        const user = await openPreview();
        await fillConfirmation(user);
        await user.click(screen.getByTestId("confirm-button"));
        const alert = await screen.findByTestId("confirm-error");
        expect(alert.textContent).toContain("La contraseña no es correcta");
        expect((screen.getByLabelText("Tu contraseña actual") as HTMLInputElement).value).toBe("");
        expect(screen.getByTestId("cleanup-preview")).toBeInTheDocument();
        expect(screen.queryByTestId("cleanup-operation")).toBeNull();
        expect(document.body.innerHTML).not.toContain(PASSWORD);
    });

    it("a stale or expired preview is discarded and a new one is demanded", async () => {
        serve({ onStart: () => json({ detail: { code: "preview_stale", message: "La vista previa ya no es válida. Genera una nueva vista previa." } }, 409) });
        const user = await openPreview();
        await fillConfirmation(user);
        await user.click(screen.getByTestId("confirm-button"));
        expect((await screen.findByTestId("confirm-error")).textContent).toContain("Genera una nueva vista previa");
        expect(screen.queryByTestId("cleanup-preview")).toBeNull();
        expect(screen.queryByTestId("confirm-button")).toBeNull();
        expect(screen.getByTestId("preview-button")).toBeEnabled();
    });

    it("an expired preview cannot be confirmed", async () => {
        serve({ onPreview: () => json(preview({ expires_at: "2020-01-01T00:00:00" })) });
        const user = await openPreview();
        expect(screen.getByTestId("preview-expiry").textContent).toContain("venció");
        await fillConfirmation(user);
        expect(screen.getByTestId("confirm-button")).toBeDisabled();
    });
});

describe("progress, failure and retry", () => {
    it("polls an active operation until it completes and says what was deleted", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        serve({
            onStart: () => json(operation({ status: "RUNNING", phase: "DATABASE" }), 202),
            detail: () => operation({
                status: "COMPLETED", phase: "DONE", writers_blocked: false, can_cancel: false, attempts: 1,
                objects: { total: 9, pending: 0, deleted: 9, absent: 0, kept: 0, failed: 0, pending_bytes: 0 },
                executed_counts: { deleted: { orders: 1, samples: 6, reports: 2 }, retired_codes: 10, objects_queued: 9 },
                completed_at: "2026-10-28T10:05:00",
            }),
        });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        renderPage();
        await screen.findByTestId("laboratory-cleanup-page");
        await user.click(screen.getByTestId("preview-button"));
        await screen.findByTestId("cleanup-preview");
        await fillConfirmation(user);
        await user.click(screen.getByTestId("confirm-button"));
        expect((await screen.findByTestId("cleanup-status")).textContent).toContain("En ejecución");
        expect(screen.getByText("El laboratorio está en pausa")).toBeInTheDocument();
        await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
        await waitFor(() => expect(screen.getByTestId("cleanup-status").textContent).toContain("Completada"));
        expect(screen.getByTestId("cleanup-objects").textContent).toContain("9 de 9 eliminados");
        expect(screen.getByTestId("cleanup-executed").textContent).toContain("6 muestras");
        expect(screen.queryByText("El laboratorio está en pausa")).toBeNull();
    });

    it("an object-store failure shows the truth (database done, files pending) and offers retry — not cancel", async () => {
        const failed = operation({
            status: "FAILED", phase: "OBJECTS", writers_blocked: false, can_retry: true, can_cancel: false, attempts: 1,
            error_code: "objects_failed", error_message: "No se pudieron eliminar 2 objeto(s) del almacenamiento. Puedes reintentar.",
            objects: { total: 9, pending: 0, deleted: 7, absent: 0, kept: 0, failed: 2, pending_bytes: 4096 },
        });
        const server = serve({ operations: [failed] });
        const user = userEvent.setup();
        renderPage();
        const box = await screen.findByTestId("cleanup-error");
        expect(box.textContent).toContain("Faltan archivos por eliminar");
        expect(box.textContent).toContain("La base de datos ya está limpia");
        expect(screen.getByTestId("cleanup-objects").textContent).toContain("7 de 9 eliminados");
        expect(screen.getByTestId("cleanup-objects").textContent).toContain("2 con error");
        expect(screen.queryByTestId("cleanup-cancel")).toBeNull();
        expect(screen.queryByText("El laboratorio está en pausa")).toBeNull();
        // a new cleanup cannot be started while this one is open: the preview form is replaced by the operation
        expect(screen.queryByTestId("preview-button")).toBeNull();

        await user.click(screen.getByTestId("cleanup-retry"));
        await waitFor(() => expect(posts(server, "/retry")).toHaveLength(1));
        await waitFor(() => expect(screen.getByTestId("cleanup-status").textContent).toContain("En ejecución"));
    });

    it("a failure before the database phase offers retry AND cancel, and cancelling lifts the pause", async () => {
        const failed = operation({
            status: "FAILED", phase: "DATABASE", writers_blocked: true, can_retry: true, can_cancel: true,
            error_code: "database_error", error_message: "La fase de base de datos falló y se revirtió sin cambios. Puedes reintentar.",
        });
        const server = serve({ operations: [failed] });
        const user = userEvent.setup();
        renderPage();
        expect((await screen.findByTestId("cleanup-error")).textContent).toContain("No se eliminó ningún dato");
        expect(screen.getByText("El laboratorio está en pausa")).toBeInTheDocument();
        await user.click(screen.getByTestId("cleanup-cancel"));
        await waitFor(() => expect(posts(server, "/cancel")).toHaveLength(1));
        await waitFor(() => expect(screen.getByTestId("cleanup-status").textContent).toContain("Cancelada"));
        expect(screen.queryByText("El laboratorio está en pausa")).toBeNull();
        expect(screen.getByText(/Cancelada por el operador antes de modificar datos\. No se eliminó ningún dato/)).toBeInTheDocument();
    });

    it("lists earlier cleanups with an accessible table", async () => {
        const done = operation({ id: "op-9", status: "COMPLETED", phase: "DONE", writers_blocked: false, can_cancel: false });
        serve({ operations: [done] });
        renderPage();
        const table = await screen.findByTestId("cleanup-history");
        expect(within(table).getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
        expect(within(table).getByText("Completada")).toBeInTheDocument();
        expect(within(table).queryByRole("columnheader", { name: "Facturación" })).toBeNull();
    });
});

describe("sidebar entry", () => {
    const renderSidebar = () => render(<MemoryRouter initialEntries={["/config/profile"]}><SidebarConfig /></MemoryRouter>);

    it("appears for an active superadministrator of the laboratory, as the backend decides", async () => {
        serve({ authorized: true });
        renderSidebar();
        expect(await screen.findByText("Mantenimiento")).toBeInTheDocument();
    });

    it("is absent for an administrator or superuser the backend does not authorize (the server is asked, the role is not trusted)", async () => {
        const server = serve({ roles: ["admin", "superuser"], authorized: false });
        renderSidebar();
        await screen.findByText("Acerca de");
        await waitFor(() => expect(server.calls.some((c) => c.url.endsWith("/authorization"))).toBe(true));
        expect(screen.queryByText("Mantenimiento")).toBeNull();
    });

    it("is absent when the probe itself fails", async () => {
        serve();
        const original = globalThis.fetch;
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith("/authorization")) throw new Error("network down");
            return original(input, init);
        }));
        renderSidebar();
        await screen.findByText("Acerca de");
        expect(screen.queryByText("Mantenimiento")).toBeNull();
    });
});

it("never places the operation in the ordinary order/sample delete surfaces (static guard)", async () => {
    const files = import.meta.glob("../../{pages,components}/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const offenders = Object.entries(files)
        .filter(([path, source]) => /laboratory[-_]cleanup|Limpieza de contenido del laboratorio/.test(source) && !/laboratory_cleanup\.tsx$|sidebar_config\.tsx$/.test(path))
        .map(([path]) => path);
    expect(offenders).toEqual([]);
});
