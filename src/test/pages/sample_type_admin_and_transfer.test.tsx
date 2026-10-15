/**
 * Céluma 1.4, issue #17 — sample-type administration, catalog JSON export, JSON
 * import into sample types and direct copy from study types (UI side).
 *
 * Contract: celuma-engineering/specs/laboratory/catalog-transfer.md. The API
 * validates and executes; these tests pin what the screens show, which
 * decisions they let the user make, and what they send back (selection,
 * conflict policy, plan digest). Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SampleTypes from "../../pages/sample_types";
import StudyTypes from "../../pages/study_types";
import CatalogTransferModal from "../../components/catalog/catalog_transfer_modal";
import { readExportFile } from "../../services/sample_type_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import type { TransferItem, TransferPreview } from "../../models/sample_type";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function grant(...permissions: string[]) {
    mockedUseUserProfile.mockReturnValue({
        hasPermission: (p: string) => permissions.includes(p),
        profile: { permissions },
    } as unknown as ReturnType<typeof useUserProfile>);
}

const ST = (id: string, code: string, name: string, is_active = true) => ({
    id, tenant_id: "t1", code, name, description: null, is_active, created_at: "2026-01-02T00:00:00",
});

const item = (index: number, code: string, status: TransferItem["status"], extra: Partial<TransferItem> = {}): TransferItem => ({
    index, code, name: `Nombre ${code}`, description: null, is_active: true, status,
    template_reference: "none", source_id: null, existing_sample_type_id: null, issues: [], warnings: [], ...extra,
});

const preview = (items: TransferItem[], extra: Partial<TransferPreview> = {}): TransferPreview => ({
    source_kind: "study_types", origin: "file", total: items.length,
    ready: items.filter((i) => i.status === "ready").length,
    conflicts: items.filter((i) => i.status !== "ready" && i.status !== "invalid").length,
    invalid: items.filter((i) => i.status === "invalid").length,
    plan_digest: "digest-1", items, ...extra,
});

beforeEach(() => grant("lab:read", "admin:manage_catalog"));
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

describe("sample-type administration page", () => {
    function stub(rows = [ST("a", "BIO", "Biopsia"), ST("b", "OLD", "Retirado", false)]) {
        const calls: Array<{ url: string; method: string; body?: unknown }> = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            if (method === "GET" && url.includes("/sample-types/export")) {
                return new Response(JSON.stringify({ schema: "celuma.catalog-export" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="celuma-sample-types-export-20261015.json"' },
                });
            }
            if (method === "GET") return json({ sample_types: rows });
            return json(ST("n", "NEW", "Nuevo"));
        });
        vi.stubGlobal("fetch", fetchMock);
        return calls;
    }

    it("lists active AND inactive types with the study-type pattern (no template field)", async () => {
        const calls = stub();
        render(<MemoryRouter><SampleTypes embedded /></MemoryRouter>);
        expect(await screen.findByText("Biopsia")).toBeInTheDocument();
        expect(screen.getByText("Retirado")).toBeInTheDocument();
        expect(calls[0].url).toContain("/v1/sample-types/?active_only=false");
        expect(screen.queryByText(/Plantilla/)).toBeNull();
    });

    it("creates a type through the API", async () => {
        const calls = stub();
        render(<MemoryRouter><SampleTypes embedded /></MemoryRouter>);
        await screen.findByText("Biopsia");
        fireEvent.click(screen.getAllByRole("button", { name: "Nuevo Tipo de Muestra" })[0]);
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText(/Código/), { target: { value: "sangre" } });
        fireEvent.change(within(dialog).getByLabelText(/Nombre/), { target: { value: "Sangre" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
        await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
        const post = calls.find((c) => c.method === "POST")!;
        expect(post.url).toMatch(/\/v1\/sample-types\/$/);
        expect(post.body).toMatchObject({ code: "sangre", name: "Sangre", is_active: true });
    });

    it("requires code and name before calling the API", async () => {
        const calls = stub();
        render(<MemoryRouter><SampleTypes embedded /></MemoryRouter>);
        await screen.findByText("Biopsia");
        fireEvent.click(screen.getAllByRole("button", { name: "Nuevo Tipo de Muestra" })[0]);
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
        expect(await within(dialog).findByText("El código es requerido.")).toBeInTheDocument();
        expect(calls.some((c) => c.method === "POST")).toBe(false);
    });

    it("exports the catalog and saves the file under the API's distinguishable name", async () => {
        const calls = stub();
        const created = vi.fn(() => "blob:x");
        vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
        const clicked: string[] = [];
        const original = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { clicked.push(this.download); };
        try {
            render(<MemoryRouter><SampleTypes embedded /></MemoryRouter>);
            await screen.findByText("Biopsia");
            fireEvent.click(screen.getByRole("button", { name: "Exportar JSON" }));
            await waitFor(() => expect(clicked).toEqual(["celuma-sample-types-export-20261015.json"]));
            expect(calls.some((c) => c.url.endsWith("/v1/sample-types/export"))).toBe(true);
        } finally {
            HTMLAnchorElement.prototype.click = original;
        }
    });
});

// ---------------------------------------------------------------------------
// Study types page: export and copy
// ---------------------------------------------------------------------------

describe("study-type page — export and 'Copiar a tipos de muestra'", () => {
    function stub() {
        const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            const body = init?.body ? JSON.parse(String(init.body)) : undefined;
            calls.push({ url, method, body });
            if (url.includes("copy-from-study-types/preview")) {
                return json(preview([item(0, "HIST", "ready"), item(1, "CITO", "code_exists", { issues: [{ code: "code_exists", message: "Ya existe" }] })], { origin: "copy" }));
            }
            if (url.includes("copy-from-study-types/confirm")) {
                return json({ operation_id: "op", created: [ST("n", "HIST", "Nombre HIST")], skipped: [{ index: 1, code: "CITO", reason: "code_exists" }] });
            }
            if (url.includes("/v1/study-types/")) {
                return json({ study_types: [ST("s1", "HIST", "Histopatología"), ST("s2", "CITO", "Citología"), ST("s3", "IHQ", "Inmuno")] });
            }
            if (url.includes("/reports/templates")) return json({ templates: [] });
            return json({});
        });
        vi.stubGlobal("fetch", fetchMock);
        return calls;
    }

    it("hides export and copy from users without catalog permission", async () => {
        grant("lab:read");
        stub();
        render(<MemoryRouter><StudyTypes embedded /></MemoryRouter>);
        await screen.findByText("Histopatología");
        expect(screen.queryByRole("button", { name: /Exportar JSON/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Copiar a tipos de muestra/ })).toBeNull();
        expect(document.querySelector(".ant-checkbox-input")).toBeNull();
    });

    it("copy is disabled until study types are selected, then previews exactly the selection", async () => {
        const calls = stub();
        render(<MemoryRouter><StudyTypes embedded /></MemoryRouter>);
        await screen.findByText("Histopatología");
        const copyButton = () => screen.getByRole("button", { name: /Copiar a tipos de muestra/ });
        expect(copyButton()).toBeDisabled();

        const rowOf = (text: string) => screen.getByText(text).closest("tr")!;
        fireEvent.click(rowOf("Histopatología").querySelector("input[type=checkbox]")!);
        fireEvent.click(rowOf("Citología").querySelector("input[type=checkbox]")!);
        expect(copyButton()).toHaveTextContent("(2)");
        fireEvent.click(copyButton());

        const dialog = await screen.findByRole("dialog");
        await within(dialog).findByTestId("transfer-summary");
        const previewCall = calls.find((c) => c.url.includes("copy-from-study-types/preview"))!;
        expect(previewCall.body).toEqual({ study_type_ids: ["s1", "s2"] });
        expect(within(dialog).getByText("El código ya existe")).toBeInTheDocument();
        expect(within(dialog).getByText(/no se modifican/)).toBeInTheDocument();
    });

    it("confirming echoes the plan digest and the chosen policy, and reports what was skipped", async () => {
        const calls = stub();
        render(<MemoryRouter><StudyTypes embedded /></MemoryRouter>);
        await screen.findByText("Histopatología");
        const rowOf = (text: string) => screen.getByText(text).closest("tr")!;
        fireEvent.click(rowOf("Histopatología").querySelector("input[type=checkbox]")!);
        fireEvent.click(rowOf("Citología").querySelector("input[type=checkbox]")!);
        fireEvent.click(screen.getByRole("button", { name: /Copiar a tipos de muestra/ }));
        const dialog = await screen.findByRole("dialog");
        await within(dialog).findByTestId("transfer-summary");

        // With a conflict and the default 'abort' policy nothing can be confirmed.
        expect(within(dialog).getByRole("button", { name: /Crear 1 tipo/ })).toBeDisabled();
        fireEvent.click(within(dialog).getByLabelText(/Omitir los registros en conflicto/));
        const confirm = within(dialog).getByRole("button", { name: /Crear 1 tipo/ });
        expect(confirm).toBeEnabled();
        fireEvent.click(confirm);

        await within(dialog).findByText(/1 tipo\(s\) de muestra creado\(s\)/);
        expect(within(dialog).getByText(/CITO/)).toBeInTheDocument();
        const post = calls.find((c) => c.url.includes("copy-from-study-types/confirm"))!;
        expect(post.body).toEqual({ study_type_ids: ["s1", "s2"], on_conflict: "skip", plan_digest: "digest-1" });
    });

    it("exports the study-type catalog", async () => {
        const calls = stub();
        render(<MemoryRouter><StudyTypes embedded /></MemoryRouter>);
        await screen.findByText("Histopatología");
        const original = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = () => undefined;
        vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() }));
        try {
            fireEvent.click(screen.getByRole("button", { name: "Exportar JSON" }));
            await waitFor(() => expect(calls.some((c) => c.url.endsWith("/v1/study-types/export"))).toBe(true));
        } finally {
            HTMLAnchorElement.prototype.click = original;
        }
    });
});

// ---------------------------------------------------------------------------
// Import flow
// ---------------------------------------------------------------------------

describe("JSON import flow", () => {
    const DOC = { schema: "celuma.catalog-export", version: 1, catalog_kind: "study_types", items: [{ code: "A", name: "Uno" }] };
    const fileOf = (content: string, name = "export.json") => new File([content], name, { type: "application/json" });

    function stub(handler: (url: string, body: Record<string, unknown>) => Response) {
        const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            calls.push({ url: String(input), body });
            return handler(String(input), body);
        }));
        return calls;
    }

    const choose = (file: File) =>
        fireEvent.change(screen.getByTestId("import-file"), { target: { files: [file] } });

    it("validates the file, previews it, selects only ready records and confirms with the digest", async () => {
        const items = [item(0, "A", "ready"), item(1, "B", "code_exists"), item(2, "", "invalid", { code: null, issues: [{ code: "required", message: "code is required" }] })];
        const calls = stub((url) =>
            url.includes("preview")
                ? json(preview(items))
                : json({ operation_id: "op", created: [ST("n", "A", "Uno")], skipped: [] }),
        );
        const done = vi.fn();
        render(<CatalogTransferModal open source={{ mode: "import" }} onClose={vi.fn()} onDone={done} />);
        choose(fileOf(JSON.stringify(DOC)));

        const summary = await screen.findByTestId("transfer-summary");
        expect(summary.textContent).toContain("3 registro(s)");
        expect(calls[0].url).toMatch(/\/v1\/sample-types\/import\/preview$/);
        expect(calls[0].body).toEqual({ document: DOC });

        const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(".ant-table-tbody input[type=checkbox]"));
        expect(boxes.map((b) => b.checked)).toEqual([true, false, false]); // only ready is pre-selected
        expect(boxes[2].disabled).toBe(true); // invalid can never be selected
        expect(screen.getByText("code is required")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Crear 1 tipo/ }));
        await screen.findByText(/1 tipo\(s\) de muestra creado\(s\)/);
        expect(calls[1].url).toMatch(/import\/confirm$/);
        expect(calls[1].body).toEqual({ document: DOC, selected_indexes: [0], on_conflict: "abort", plan_digest: "digest-1" });
        expect(done).toHaveBeenCalledTimes(1);
    });

    it("a conflicting record can be selected only with the 'omitir' policy", async () => {
        stub((url) => (url.includes("preview") ? json(preview([item(0, "A", "ready"), item(1, "B", "code_exists")])) : json({})));
        render(<CatalogTransferModal open source={{ mode: "import" }} onClose={vi.fn()} onDone={vi.fn()} />);
        choose(fileOf(JSON.stringify(DOC)));
        await screen.findByTestId("transfer-summary");
        const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(".ant-table-tbody input[type=checkbox]"));
        fireEvent.click(boxes()[1]);
        expect(screen.getByRole("button", { name: /Crear 1 tipo/ })).toBeDisabled(); // abort + a conflict selected
        fireEvent.click(screen.getByLabelText(/Omitir los registros en conflicto/));
        expect(screen.getByRole("button", { name: /Crear 1 tipo/ })).toBeEnabled();
    });

    it("a stale plan (409) shows the refreshed preview and creates nothing", async () => {
        let first = true;
        stub((url) => {
            if (url.includes("preview")) return json(preview([item(0, "A", "ready")]));
            if (first) {
                first = false;
                return json({ detail: { code: "preview_stale", message: "changed", preview: preview([item(0, "A", "code_exists")], { plan_digest: "digest-2" }) } }, 409);
            }
            return json({});
        });
        render(<CatalogTransferModal open source={{ mode: "import" }} onClose={vi.fn()} onDone={vi.fn()} />);
        choose(fileOf(JSON.stringify(DOC)));
        await screen.findByTestId("transfer-summary");
        fireEvent.click(screen.getByRole("button", { name: /Crear 1 tipo/ }));
        expect(await screen.findByText(/El catálogo cambió desde la vista previa/)).toBeInTheDocument();
        expect(screen.getByText("El código ya existe")).toBeInTheDocument();
        expect(screen.queryByText(/creado\(s\)/)).toBeNull();
        // The old selection is gone: the conflicting record is not silently re-selected.
        expect(screen.getByRole("button", { name: /Crear 0 tipo/ })).toBeDisabled();
    });

    it("rejects non-JSON, non-object and oversized files before calling the API", async () => {
        const calls = stub(() => json({}));
        render(<CatalogTransferModal open source={{ mode: "import" }} onClose={vi.fn()} onDone={vi.fn()} />);
        choose(fileOf("{not json"));
        expect(await screen.findByText("El archivo no es un JSON válido.")).toBeInTheDocument();
        choose(fileOf("[1,2]"));
        expect(await screen.findByText(/debe contener un objeto JSON/)).toBeInTheDocument();
        await expect(readExportFile(fileOf("x".repeat(1024 * 1024 + 1)))).rejects.toThrow("1 MB");
        expect(calls).toEqual([]);
    });

    it("surfaces the API's structured refusal for an unsupported document", async () => {
        stub(() => json({ detail: { code: "unsupported_version", message: "Unsupported export version 2; supported: 1" } }, 422));
        render(<CatalogTransferModal open source={{ mode: "import" }} onClose={vi.fn()} onDone={vi.fn()} />);
        choose(fileOf(JSON.stringify({ ...DOC, version: 2 })));
        expect(await screen.findByText("Unsupported export version 2; supported: 1")).toBeInTheDocument();
        expect(screen.queryByTestId("transfer-summary")).toBeNull();
    });
});
