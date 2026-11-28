import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../src/components/report/report_editor";

/**
 * Céluma 1.5 (#91) — real-browser harness for the report editor's table card.
 * Mounts the unmodified ReportEditor with an in-page synthetic API (no backend,
 * no database, no real credential), so it can be opened directly in a browser.
 * Never bundled into the production app. Saves are kept in
 * `window.__harnessSaves` for inspection.
 *
 * Usage: /report_table_card.html?status=DRAFT|PUBLISHED&table=big|small
 */
const params = new URLSearchParams(window.location.search);
const status = params.get("status") ?? "DRAFT";
const LONG = "Esto es la prueba de un texto muy largo que debe poder verse en distintas líneas de texto";
const TABLES: Record<string, string> = {
    big:
        "| Prueba | Cantidad | Método | Control | Observación |\n| --- | --- | --- | --- | --- |\n" +
        Array.from({ length: 6 }, (_, i) => `| ${i === 0 ? LONG : `Prueba ${i + 1}`} | ${i === 0 ? LONG : `${i + 1}`} | IHQ | Externo | Fila ${i + 1} |`).join("\n"),
    small: "| Prueba | Cantidad |\n| --- | --- |\n| CK7 | 1 |",
};
const table = TABLES[params.get("table") ?? "big"] ?? TABLES.big;

const REPORT_ID = "00000000-0000-4000-8000-000000000c91";
const TENANT = "00000000-0000-4000-8000-0000000000t1";
const BRANCH = "00000000-0000-4000-8000-0000000000b1";
const USER = "00000000-0000-4000-8000-0000000000u1";

const sections = {
    diagnostico: { is_visible: true, label: "Diagnóstico", type: "richtext", content: "<p>Diagnóstico sintético.</p>" },
    pruebas: { is_visible: true, label: "Tabla de pruebas", type: "table", content: table },
};
const template = {
    base: { order_code: { is_visible: true, label: "Código de orden", value: "ORD-91" } },
    sections,
    base_order: ["order_code"],
    section_order: ["diagnostico", "pruebas"],
};
const full = {
    order: { id: "ord-91", order_code: "ORD-91", status: "IN_PROGRESS", patient_id: "pat-1", tenant_id: TENANT, branch_id: BRANCH, reviewers: [] },
    patient: { id: "pat-1", tenant_id: TENANT, branch_id: BRANCH, patient_code: "PAT-91" },
    samples: [],
    report: {
        id: REPORT_ID, order_id: "ord-91", tenant_id: TENANT, branch_id: BRANCH, created_by: USER, version_no: 1,
        status, schema_version: 2, title: "Reporte sintético 91", published_at: null, signed_by: null, signed_at: null,
        template,
        report: {
            ...template,
            schema_version: 2,
            rendering_snapshot: {
                schema_version: 2,
                template,
                presentation: {
                    paper: { size: "LETTER", orientation: "PORTRAIT", margins_cm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
                    header: { enabled: true, institution_name: "Laboratorio Sintético", subtitle: "Prueba de tablas" },
                    footer: { enabled: true, custom_text: "Documento sintético", show_page_number: true },
                    style: { primary_color: "#2f6f69" },
                },
            },
        },
    },
};
const profile = {
    id: USER, email: "autora@lab.example.invalid", full_name: "Autora Sintética", roles: ["pathologist"],
    permissions: ["reports:read", "reports:create", "reports:edit", "reports:submit", "lab:read"],
    tenant_id: TENANT, branch_ids: [BRANCH],
};

const saves: string[] = [];
(window as unknown as { __harnessSaves: string[] }).__harnessSaves = saves;
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.includes("/api/") && url.origin === location.origin) return realFetch(input, init);
    const path = url.pathname;
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (path.endsWith("/v1/auth/me")) return json(profile);
    if (/\/v1\/reports\/[^/]+\/full$/.test(path)) return json(full);
    if (/\/v1\/reports\/[^/]+\/new_version$/.test(path) || /\/v1\/reports\/?$/.test(path)) {
        saves.push(String(init?.body ?? ""));
        return json({});
    }
    if (path.includes("/v1/report-letterheads")) return json({ letterheads: [] });
    if (path.includes("/tenants/")) return json({ reports_v2_enabled: true });
    return json({});
};

localStorage.setItem("auth_token", "Bearer synthetic-harness-token");
localStorage.setItem("tenant_id", TENANT);
localStorage.setItem("branch_id", BRANCH);
localStorage.setItem("user_id", USER);

createRoot(document.getElementById("root")!).render(
    <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
        <Routes>
            <Route path="/reports/:reportId" element={<ReportEditor />} />
        </Routes>
    </MemoryRouter>,
);
