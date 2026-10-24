import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import ReportEditor from "../../src/components/report/report_editor";

/**
 * Céluma 1.4 (#29) — real-browser harness for report-editor spelling
 * assistance. Mounts the unmodified ReportEditor (real Quill, real controls,
 * real spelling worker and es-MX dictionary) inside a MemoryRouter. Every API
 * call is answered by the Playwright spec with synthetic data
 * (report_spelling.functional.spec.ts); there is no backend, no database and
 * no real credential. Never bundled into the production app.
 *
 * Usage: /report_spelling.html?report=<synthetic report id>
 */
const params = new URLSearchParams(window.location.search);
const reportId = params.get("report") ?? "00000000-0000-4000-8000-000000000a01";

// Synthetic session: the spec's /v1/auth/me route decides the permissions.
localStorage.setItem("auth_token", "Bearer synthetic-harness-token");
localStorage.setItem("tenant_id", "00000000-0000-4000-8000-0000000000t1");
localStorage.setItem("branch_id", "00000000-0000-4000-8000-0000000000b1");
localStorage.setItem("user_id", "00000000-0000-4000-8000-0000000000u1");

function SwitchReport() {
    const navigate = useNavigate();
    return (
        <button type="button" data-testid="harness-switch-report" onClick={() => navigate(`/reports/${params.get("next") ?? ""}`)}>
            Cambiar de reporte (arnés)
        </button>
    );
}

createRoot(document.getElementById("root")!).render(
    <MemoryRouter initialEntries={[`/reports/${reportId}`]}>
        <SwitchReport />
        <Routes>
            <Route path="/reports/:reportId" element={<ReportEditor />} />
            <Route path="/orders/:orderId" element={<div data-testid="harness-order-page">Orden</div>} />
        </Routes>
    </MemoryRouter>,
);
