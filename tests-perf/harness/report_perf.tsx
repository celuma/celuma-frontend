import { Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportEditor from "../../src/components/report/report_editor";

/**
 * Céluma 1.4 (#29 follow-up) — measurement-only harness for report-editor
 * typing latency. Mounts the unmodified ReportEditor under a React `Profiler`
 * (vite.perf.config.ts aliases `react-dom/client` to the profiling build) and
 * exposes commit counts/durations on `window.__perfCommits`. It is bundled
 * only by `npm run test:perf`; nothing here ships in the application, logs
 * anything, or touches a backend: the Playwright spec answers every API call
 * with synthetic data.
 */
const params = new URLSearchParams(window.location.search);
const reportId = params.get("report") ?? "00000000-0000-4000-8000-000000000a01";

localStorage.setItem("auth_token", "Bearer synthetic-harness-token");
localStorage.setItem("tenant_id", "00000000-0000-4000-8000-0000000000t1");
localStorage.setItem("branch_id", "00000000-0000-4000-8000-0000000000b1");
localStorage.setItem("user_id", "00000000-0000-4000-8000-0000000000u1");

interface CommitSample {
    phase: string;
    actualDuration: number;
    startTime: number;
    commitTime: number;
}
const commits: CommitSample[] = [];
(window as unknown as { __perfCommits: CommitSample[] }).__perfCommits = commits;

const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration, _base, startTime, commitTime) => {
    commits.push({ phase, actualDuration, startTime, commitTime });
};

createRoot(document.getElementById("root")!).render(
    <MemoryRouter initialEntries={[`/reports/${reportId}`]}>
        <Profiler id="report-editor" onRender={onRender}>
            <Routes>
                <Route path="/reports/:reportId" element={<ReportEditor />} />
                <Route path="/orders/:orderId" element={<div>Orden</div>} />
            </Routes>
        </Profiler>
    </MemoryRouter>,
);
