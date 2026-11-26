/**
 * Céluma 1.5, issue #94 — removing study types and sample types from the catalog (UI side).
 *
 * Contract: celuma-engineering/specs/laboratory/catalog-type-removal.md. The API enforces removal
 * (permission, tenant, frozen removed types, every creation path); these tests pin that the screens keep
 * deactivation and removal visibly distinct, explain the consequences before removing, surface failures
 * without losing the typed reason, refresh after success, and show removed types as removed. Synthetic data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SampleTypes from "../../pages/sample_types";
import StudyTypes from "../../pages/study_types";
import { sampleTypeLabel } from "../../components/ui/table_helpers";
import { transferIssueMessage } from "../../lib/catalog_transfer_messages";
import { getErrorMessage } from "../../lib/api_error";
import { useUserProfile } from "../../hooks/use_user_profile";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function grant(...permissions: string[]) {
    mockedUseUserProfile.mockReturnValue({
        hasPermission: (p: string) => permissions.includes(p),
        profile: { permissions },
    } as unknown as ReturnType<typeof useUserProfile>);
}

type Row = { id: string; tenant_id: string; code: string; name: string; description: null; is_active: boolean;
    created_at: string; is_removed?: boolean; removed_at?: string | null; code_released?: boolean };
const T = (id: string, code: string, name: string, extra: Partial<Row> = {}): Row => ({
    id, tenant_id: "t1", code, name, description: null, is_active: true, created_at: "2026-01-02T00:00:00", ...extra,
});

type Call = { url: string; method: string; body?: unknown };

/** A stateful fake catalog API for one kind: list (with/without removed), deactivate, remove. */
type Opts = { failRemoveOnce?: { status: number; body: unknown }; used?: Record<string, number>; impactFails?: boolean };
function fakeCatalog(kind: "study" | "sample", rows: Row[], opts: Opts = {}) {
    const calls: Call[] = [];
    const key = kind === "study" ? "study_types" : "sample_types";
    let fail = opts.failRemoveOnce;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        const refKey = kind === "study" ? "orders" : "samples";
        const impactMatch = url.match(/\/([^/]+)\/removal-impact$/);
        if (method === "GET" && impactMatch) {
            if (opts.impactFails) return json({ detail: "boom" }, 500);
            const used = opts.used?.[impactMatch[1]] ?? 0;
            const row = rows.find((r) => r.id === impactMatch[1])!;
            return json({ id: row.id, code: row.code, already_removed: !!row.is_removed, references: { [refKey]: used },
                code_will_be_released: used === 0, code_released: false });
        }
        const removeMatch = url.match(/\/([^/]+)\/remove$/);
        if (method === "POST" && removeMatch) {
            if (fail) {
                const f = fail;
                fail = undefined;
                return json(f.body, f.status);
            }
            const row = rows.find((r) => r.id === removeMatch[1])!;
            const already = !!row.is_removed;
            const used = opts.used?.[row.id] ?? 0;
            Object.assign(row, { is_active: false, is_removed: true, removed_at: "2026-11-25T10:00:00", code_released: used === 0 });
            return json({ ...row, already_removed: already, references: { [refKey]: used } });
        }
        if (method === "DELETE") {
            const id = url.split("/").pop()!;
            Object.assign(rows.find((r) => r.id === id)!, { is_active: false });
            return json({ message: "deactivated", id });
        }
        if (method === "GET" && url.includes("/reports/templates")) return json({ templates: [] });
        if (method === "GET" && url.includes(`/${kind}-types/`)) {
            const withRemoved = url.includes("include_removed=true");
            return json({ [key]: rows.filter((r) => withRemoved || !r.is_removed).map((r) => ({ ...r })) });
        }
        return json({});
    }));
    return calls;
}

beforeEach(() => grant("lab:read", "admin:manage_catalog"));
afterEach(() => vi.unstubAllGlobals());

const PAGES = [
    { kind: "sample" as const, Page: SampleTypes, noun: "tipo de muestra", records: "muestras" },
    { kind: "study" as const, Page: StudyTypes, noun: "tipo de estudio", records: "órdenes" },
];

describe.each(PAGES)("$kind catalog: deactivate versus remove", ({ kind, Page, noun, records }) => {
    it("offers two distinct, labelled actions per row", async () => {
        fakeCatalog(kind, [T("a", "BIO", "Biopsia"), T("b", "OLD", "Anterior", { is_active: false })]);
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        await screen.findByText("Biopsia");
        expect(screen.getByRole("button", { name: "Desactivar Biopsia" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Eliminar Biopsia del catálogo" })).toBeInTheDocument();
        // an inactive type can no longer be deactivated, but can still be removed
        expect(screen.queryByRole("button", { name: "Desactivar Anterior" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Eliminar Anterior del catálogo" })).toBeInTheDocument();
    });

    it("deactivation asks with its own wording and calls DELETE, never /remove", async () => {
        const calls = fakeCatalog(kind, [T("a", "BIO", "Biopsia")]);
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        fireEvent.click(await screen.findByRole("button", { name: "Desactivar Biopsia" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText(/puedes reactivarlo/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Desactivar" }));
        await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
        expect(calls.some((c) => c.url.endsWith("/remove"))).toBe(false);
        expect(calls.find((c) => c.method === "DELETE")!.url).not.toContain("hard_delete");
        expect(await screen.findByText("Inactivo")).toBeInTheDocument();
    });

    it("removal explains the consequences, sends the reason, and refreshes the catalog", async () => {
        const calls = fakeCatalog(kind, [T("a", "BIO", "Biopsia"), T("c", "CIT", "Citología")]);
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        fireEvent.click(await screen.findByRole("button", { name: "Eliminar Biopsia del catálogo" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("¿Eliminar «Biopsia» del catálogo?")).toBeInTheDocument();
        expect(within(dialog).getByText(new RegExp(`Eliminar no es lo mismo que desactivar. El ${noun} BIO se conserva para sus ${records}`)))
            .toBeInTheDocument();
        const consequences = within(dialog).getByTestId("remove-type-consequences");
        // unused type: the dialog says the code will be free for a DIFFERENT type, and the row keeps it
        expect(await within(dialog).findByText(/quedará libre para crear o asignar a otro/)).toBeInTheDocument();
        expect(consequences).toHaveTextContent("no se reactiva");
        expect(consequences).toHaveTextContent("No se puede deshacer");
        expect(consequences).toHaveTextContent("los consecutivos no se reinician");
        fireEvent.change(within(dialog).getByLabelText("Motivo de la eliminación (opcional)"), { target: { value: "  Duplicado  " } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar del catálogo" }));

        await waitFor(() => expect(screen.queryByText("Biopsia")).not.toBeInTheDocument(), { timeout: 5000 });
        const post = calls.find((c) => c.url.endsWith("/remove"))!;
        expect(post.method).toBe("POST");
        expect(post.url).toMatch(new RegExp(`/v1/${kind}-types/a/remove$`));
        expect(post.body).toEqual({ reason: "Duplicado" });
        expect(screen.getByText("Citología")).toBeInTheDocument();
        // reloaded after success
        expect(calls.filter((c) => c.method === "GET" && c.url.includes(`/${kind}-types/?`)).length).toBeGreaterThanOrEqual(2);
    });

    it("a refused removal keeps the dialog and the reason, says why, and can be retried", async () => {
        const calls = fakeCatalog(kind, [T("a", "BIO", "Biopsia")], {
            failRemoveOnce: { status: 403, body: { detail: "Permission required: admin:manage_catalog" } },
        });
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        fireEvent.click(await screen.findByRole("button", { name: "Eliminar Biopsia del catálogo" }));
        const dialog = await screen.findByRole("dialog");
        const reason = within(dialog).getByLabelText("Motivo de la eliminación (opcional)");
        fireEvent.change(reason, { target: { value: "Error de captura" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar del catálogo" }));
        expect(await within(dialog).findByTestId("remove-type-error")).toHaveTextContent("No tienes permiso");
        expect(reason).toHaveValue("Error de captura");
        // antd keeps its internal loading state (and ignores clicks) for a moment after `loading` turns false.
        const retry = within(dialog).getByRole("button", { name: /Reintentar eliminar/ });
        await waitFor(() => expect(retry).not.toHaveClass("ant-btn-loading"));
        fireEvent.click(retry);
        await waitFor(() => expect(screen.queryByText("Biopsia")).not.toBeInTheDocument(), { timeout: 5000 });
        expect(calls.filter((c) => c.url.endsWith("/remove"))).toHaveLength(2);
    });

    it("shows removed types only on request, as «Eliminado», without actions", async () => {
        const calls = fakeCatalog(kind, [T("a", "BIO", "Biopsia"),
            T("r", "OLDX", "Quitado", { is_active: false, is_removed: true, removed_at: "2026-11-20T00:00:00" }),
            T("f", "FREE", "Liberado", { is_active: false, is_removed: true, removed_at: "2026-11-20T00:00:00", code_released: true })]);
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        await screen.findByText("Biopsia");
        expect(screen.queryByText("Quitado")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("switch", { name: "Mostrar tipos eliminados" }));
        expect(await screen.findByText("Quitado")).toBeInTheDocument();
        expect(calls.some((c) => c.url.includes("include_removed=true"))).toBe(true);
        expect(screen.getAllByTestId("catalog-state-removed")[0]).toHaveTextContent("Eliminado");
        expect(screen.queryByRole("button", { name: "Editar Quitado" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Eliminar Quitado del catálogo" })).not.toBeInTheDocument();
        expect(screen.getByTestId("code-state-OLDX")).toHaveTextContent("Código reservado por su historial");
        expect(screen.getByTestId("code-state-FREE")).toHaveTextContent("Código liberado para otro tipo");
    });

    it("says a historically used code stays reserved (withdrawn records count)", async () => {
        fakeCatalog(kind, [T("a", "BIO", "Biopsia")], { used: { a: 1 } });
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        fireEvent.click(await screen.findByRole("button", { name: "Eliminar Biopsia del catálogo" }));
        const outcome = await screen.findByTestId("remove-type-code-outcome");
        await waitFor(() => expect(outcome).toHaveTextContent(`Tiene 1 ${records === "órdenes" ? "orden" : "muestra"} registrada (incluidas las retiradas)`));
        expect(outcome).toHaveTextContent("seguirá reservado");
    });

    it("states the rule when the impact cannot be read", async () => {
        fakeCatalog(kind, [T("a", "BIO", "Biopsia")], { impactFails: true });
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        fireEvent.click(await screen.findByRole("button", { name: "Eliminar Biopsia del catálogo" }));
        const outcome = await screen.findByTestId("remove-type-code-outcome");
        await waitFor(() => expect(outcome).toHaveTextContent(`Si no tiene ${records} (ni retiradas), su código quedará libre`));
    });

    it("hides the removal control without admin:manage_catalog (the API refuses regardless)", async () => {
        grant("lab:read");
        fakeCatalog(kind, [T("a", "BIO", "Biopsia")]);
        render(<MemoryRouter><Page embedded /></MemoryRouter>);
        await screen.findByText("Biopsia");
        expect(screen.queryByRole("button", { name: "Eliminar Biopsia del catálogo" })).not.toBeInTheDocument();
    });
});

describe("removed types in historical displays and messages", () => {
    it("labels a removed sample type as removed, distinct from inactive", () => {
        expect(sampleTypeLabel({ id: "1", code: "BX", name: "Biopsia", is_active: false, is_removed: true })).toBe("Biopsia (eliminado)");
        expect(sampleTypeLabel({ id: "1", code: "BX", name: "Biopsia", is_active: false })).toBe("Biopsia (inactivo)");
        expect(sampleTypeLabel({ id: "1", code: "BX", name: "Biopsia", is_active: true, is_removed: false })).toBe("Biopsia");
    });

    it("explains an import conflict with a removed type's reserved code", () => {
        expect(transferIssueMessage({
            code: "code_exists", message: "A sample type with code 'BX' already exists (removed; the code stays reserved by its samples)",
        })).toBe("Ya existe un tipo de muestra con el código «BX» (eliminado del catálogo; el código sigue reservado por sus muestras).");
    });

    it("translates the API refusals of removed types", () => {
        const reserved = new Error(JSON.stringify({
            detail: "Sample type with code 'BX' already exists: the code belongs to a type removed from the catalog and stays reserved because samples reference it",
        }));
        expect(getErrorMessage(reserved)).toMatch(/tipo de muestra eliminado del catálogo que tiene muestras registradas \(incluidas las retiradas\), por eso sigue reservado/);
        const refused = new Error(JSON.stringify({ detail: "Study type 'CU' was removed from the catalog and cannot be used for new orders" }));
        expect(getErrorMessage(refused)).toBe("El tipo de estudio «CU» fue eliminado del catálogo y ya no se puede usar.");
    });
});
