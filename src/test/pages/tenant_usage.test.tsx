/**
 * Céluma 1.3, Phase 4, Block F — the /config/usage dashboard page.
 *
 * Loading, the recoverable load failure, the four outcomes of "Verificar
 * ahora" (succeeded, failed run, 409, client timeout) and the temporary poll
 * while a run is in progress.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TenantUsage from "../../pages/tenant_usage";
import * as usageService from "../../services/tenant_usage_service";
import {
    TenantUsageApiError,
    TenantUsageTimeoutError,
    USAGE_RUNNING_POLL_INTERVAL_MS,
} from "../../services/tenant_usage_service";
import type { ReconciliationSummary, TenantUsageResponse } from "../../models/tenant_usage";

const showWarning = vi.fn();
const showSuccess = vi.fn();
const showApiError = vi.fn();
vi.mock("../../lib/celuma_feedback", () => ({
    showCelumaApiError: (...args: unknown[]) => showApiError(...args),
    showCelumaSuccess: (...args: unknown[]) => showSuccess(...args),
    showCelumaWarning: (...args: unknown[]) => showWarning(...args),
    showCelumaPermissionDenied: vi.fn(),
    registerCelumaNotification: vi.fn(),
}));

function reconciliation(overrides: Partial<ReconciliationSummary> = {}): ReconciliationSummary {
    return {
        has_run: true,
        integrity_status: "HEALTHY",
        status: "SUCCEEDED",
        started_at: "2026-08-11T23:00:00",
        completed_at: "2026-08-11T23:00:04",
        expected_storage_bytes: 123_456_789,
        actual_storage_bytes: 123_456_789,
        difference_bytes: 0,
        repaired: false,
        objects_checked: 142,
        orphans_found: 0,
        missing_objects_found: 0,
        metadata_mismatches_found: 0,
        error_code: null,
        ...overrides,
    };
}

function usage(overrides: Partial<TenantUsageResponse> = {}): TenantUsageResponse {
    return {
        storage: {
            initialized: true,
            billable_bytes: 127_900_000,
            limit_bytes: 1_000_000_000_000,
            unlimited: false,
            usage_ratio: 0.0001279,
            usage_percent: 0.01,
        },
        users: {
            registered_users: 21,
            active_internal_users: 8,
            active_physician_portal_users: 14,
            user_limit: 10,
            unlimited: false,
            usage_ratio: 0.8,
            usage_percent: 80,
        },
        reconciliation: reconciliation(),
        ...overrides,
    };
}

/** A tenant with a reconciliation in progress — the one state that is polled. */
const RUNNING_USAGE: TenantUsageResponse = usage({
    reconciliation: reconciliation({
        integrity_status: "RUNNING",
        status: "RUNNING",
        completed_at: null,
        repaired: null,
        objects_checked: null,
        orphans_found: null,
        missing_objects_found: null,
        metadata_mismatches_found: null,
    }),
});

function renderPage() {
    return render(
        <MemoryRouter>
            <TenantUsage embedded />
        </MemoryRouter>,
    );
}

let getSpy: ReturnType<typeof vi.spyOn>;
let reconcileSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    getSpy = vi.spyOn(usageService, "getTenantUsage").mockResolvedValue(usage());
    reconcileSpy = vi
        .spyOn(usageService, "reconcileTenantUsage")
        .mockResolvedValue({ status: "SUCCEEDED", error_code: null });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

describe("initial load", () => {
    it("reads the dashboard once on mount", async () => {
        renderPage();

        await screen.findByText("127.9 MB");
        expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it("never fires the reconciliation automatically", async () => {
        renderPage();

        await screen.findByText("127.9 MB");
        expect(reconcileSpy).not.toHaveBeenCalled();
    });

    it("shows a skeleton rather than zeros while the first response is pending", async () => {
        let resolve: (value: TenantUsageResponse) => void = () => {};
        getSpy.mockReturnValue(new Promise<TenantUsageResponse>((r) => { resolve = r; }));

        const { container } = renderPage();

        // Loading is a distinct state from zero: no fabricated 0 B / 0%.
        expect(container.querySelector(".ant-skeleton")).not.toBeNull();
        expect(screen.queryByText("0 B")).not.toBeInTheDocument();
        expect(screen.queryByText("0%")).not.toBeInTheDocument();

        await act(async () => { resolve(usage()); });
        await screen.findByText("127.9 MB");
    });
});

describe("load failure", () => {
    it("shows a recoverable page-level error instead of falling back to zeros", async () => {
        getSpy.mockRejectedValue(new Error("Error de red: no se pudo contactar al servidor."));

        renderPage();

        await screen.findByText("No fue posible cargar la información de uso.");
        expect(screen.queryByText("0 B")).not.toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("never shows the raw transport error", async () => {
        getSpy.mockRejectedValue(new TypeError("Failed to fetch"));

        const { container } = renderPage();

        await screen.findByText("No fue posible cargar la información de uso.");
        expect(container.textContent).not.toMatch(/Failed to fetch|TypeError|fetch/i);
    });

    it("retries on demand", async () => {
        getSpy.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(usage());

        renderPage();
        await screen.findByText("No fue posible cargar la información de uso.");

        await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));

        await screen.findByText("127.9 MB");
        expect(getSpy).toHaveBeenCalledTimes(2);
    });
});

// ---------------------------------------------------------------------------
// Verify now
// ---------------------------------------------------------------------------

async function clickVerify() {
    const buttons = await screen.findAllByRole("button", { name: /verificar ahora/i });
    await userEvent.click(buttons[0]);
}

describe("verify now", () => {
    it("re-reads the dashboard after a succeeded run", async () => {
        renderPage();
        await screen.findByText("127.9 MB");

        await clickVerify();

        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
        expect(reconcileSpy).toHaveBeenCalledTimes(1);
        expect(showSuccess).toHaveBeenCalled();
    });

    it("re-reads the dashboard after a run that failed, and reports its sanitized cause", async () => {
        // 200 with status FAILED: the run happened. Its accounting half may
        // already have repaired the counter, so the GET is not optional.
        reconcileSpy.mockResolvedValue({ status: "FAILED", error_code: "s3_timeout" });

        renderPage();
        await screen.findByText("127.9 MB");

        await clickVerify();

        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
        expect(showWarning).toHaveBeenCalledWith(
            "La verificación no se completó",
            "La verificación tardó más de lo esperado.",
        );
        // Not reported as a transport failure — the request itself succeeded.
        expect(showApiError).not.toHaveBeenCalled();
    });

    it("says a run is already going on 409, then re-reads", async () => {
        reconcileSpy.mockRejectedValue(
            new TenantUsageApiError(409, "Ya hay una verificación en curso."),
        );

        renderPage();
        await screen.findByText("127.9 MB");

        await clickVerify();

        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
        expect(showWarning).toHaveBeenCalledWith("Ya hay una verificación en curso.");
        expect(showApiError).not.toHaveBeenCalled();
    });

    it("treats a client timeout as unknown, not as a failure", async () => {
        reconcileSpy.mockRejectedValue(new TenantUsageTimeoutError());

        renderPage();
        await screen.findByText("127.9 MB");

        await clickVerify();

        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
        const [message] = showWarning.mock.calls[0];
        expect(message).toBe("La verificación puede continuar en segundo plano. Actualizando estado…");
        // The one thing it must not say: that the run failed.
        expect(message).not.toMatch(/falló|failed/i);
        expect(showApiError).not.toHaveBeenCalled();
    });

    it("surfaces a genuine request failure through the shared error toast", async () => {
        reconcileSpy.mockRejectedValue(new TenantUsageApiError(500, "Error del servidor."));

        renderPage();
        await screen.findByText("127.9 MB");

        await clickVerify();

        await waitFor(() => expect(showApiError).toHaveBeenCalled());
    });

    it("keeps the verify action gated on both cards while a run is in progress", async () => {
        // The uninitialized storage card offers the same reconciliation the
        // verification card does, so it must be gated the same way — and
        // "no counter yet, run underway" is exactly what a first-ever
        // verification looks like.
        getSpy.mockResolvedValue(
            usage({
                storage: {
                    initialized: false,
                    billable_bytes: null,
                    limit_bytes: 1_000_000_000_000,
                    unlimited: false,
                    usage_ratio: null,
                    usage_percent: null,
                },
                reconciliation: RUNNING_USAGE.reconciliation,
            }),
        );

        renderPage();
        await screen.findByText("Uso aún no calculado");

        // Neither card offers a request that could only answer 409.
        expect(screen.queryByRole("button", { name: /^verificar ahora$/i })).not.toBeInTheDocument();
        for (const button of screen.getAllByRole("button", { name: /verificando/i })) {
            expect(button).toBeDisabled();
        }
    });
});

describe("overlapping reads", () => {
    /** Starts a RUNNING page and leaves one poll read open. Returns its resolver. */
    async function withOpenPollRead() {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let releasePoll: (value: TenantUsageResponse) => void = () => {};

        getSpy.mockResolvedValueOnce(RUNNING_USAGE);
        renderPage();
        await screen.findByText(/en curso/i);

        getSpy.mockReturnValueOnce(new Promise<TenantUsageResponse>((r) => { releasePoll = r; }));
        await act(async () => {
            vi.advanceTimersByTime(USAGE_RUNNING_POLL_INTERVAL_MS);
        });
        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
        return () => releasePoll(RUNNING_USAGE);
    }

    it("does not swallow a manual refresh issued while a poll read is open", async () => {
        // The refresh button stays available during a run, so this overlap is
        // reachable. A deliberate read must never be dropped because a
        // background poll happened to be mid-flight.
        const releasePoll = await withOpenPollRead();

        getSpy.mockResolvedValue(usage());
        await userEvent.click(screen.getByRole("button", { name: /actualizar/i }));

        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(3));
        await act(async () => { releasePoll(); });
    });

    it("does not let a slow poll response overwrite the newer read that followed it", async () => {
        // Two reads in flight resolving out of order: the later-issued one is
        // the truth. A stale RUNNING body landing last would restart polling
        // for a run that already finished.
        const releasePoll = await withOpenPollRead();

        getSpy.mockResolvedValue(usage());
        await userEvent.click(screen.getByRole("button", { name: /actualizar/i }));
        await screen.findByText("Sin incidencias detectadas");

        await act(async () => { releasePoll(); });

        expect(screen.getByText("Sin incidencias detectadas")).toBeInTheDocument();
        expect(screen.queryByText(/en curso/i)).not.toBeInTheDocument();
    });
});

describe("polling while a run is in progress", () => {
    const runningUsage = RUNNING_USAGE;

    it("does not poll while the status is terminal", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });

        renderPage();
        await screen.findByText("127.9 MB");
        expect(getSpy).toHaveBeenCalledTimes(1);

        await act(async () => {
            vi.advanceTimersByTime(USAGE_RUNNING_POLL_INTERVAL_MS * 5);
        });

        // No permanent poller: a storage counter moves on clinical writes, not
        // on a timer.
        expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it("polls while RUNNING and stops once the status becomes terminal", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        getSpy.mockResolvedValue(runningUsage);

        renderPage();
        await screen.findByText(/en curso/i);
        expect(getSpy).toHaveBeenCalledTimes(1);

        await act(async () => {
            vi.advanceTimersByTime(USAGE_RUNNING_POLL_INTERVAL_MS);
        });
        await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));

        // The run finishes: the next tick returns a terminal status.
        getSpy.mockResolvedValue(usage());
        await act(async () => {
            vi.advanceTimersByTime(USAGE_RUNNING_POLL_INTERVAL_MS);
        });
        await screen.findByText("Sin incidencias detectadas");

        const callsAfterTermination = getSpy.mock.calls.length;
        await act(async () => {
            vi.advanceTimersByTime(USAGE_RUNNING_POLL_INTERVAL_MS * 4);
        });

        expect(getSpy).toHaveBeenCalledTimes(callsAfterTermination);
    });

    it("does not poll while the tab is hidden, and catches up when it returns", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        getSpy.mockResolvedValue(runningUsage);

        renderPage();
        await screen.findByText(/en curso/i);
        const baseline = getSpy.mock.calls.length;

        const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        await act(async () => {
            document.dispatchEvent(new Event("visibilitychange"));
            vi.advanceTimersByTime(USAGE_RUNNING_POLL_INTERVAL_MS * 3);
        });
        expect(getSpy).toHaveBeenCalledTimes(baseline);

        visibility.mockReturnValue("visible");
        await act(async () => {
            document.dispatchEvent(new Event("visibilitychange"));
        });

        // Immediate catch-up rather than waiting out the interval.
        await waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(baseline));
    });
});

// ---------------------------------------------------------------------------
// What the page must not do
// ---------------------------------------------------------------------------

describe("no threshold alerting", () => {
    it("raises no notification for a tenant sitting above 90%", async () => {
        getSpy.mockResolvedValue(
            usage({
                storage: {
                    initialized: true,
                    billable_bytes: 950_000_000_000,
                    limit_bytes: 1_000_000_000_000,
                    unlimited: false,
                    usage_ratio: 0.95,
                    usage_percent: 95,
                },
            }),
        );

        renderPage();
        await screen.findByText("95%");

        // The amber card is presentation. Deciding that 95% is an event worth
        // telling someone about is Block G's, and a toast from here would be a
        // second, competing source of that decision.
        expect(showWarning).not.toHaveBeenCalled();
        expect(showSuccess).not.toHaveBeenCalled();
        expect(showApiError).not.toHaveBeenCalled();
    });
});
