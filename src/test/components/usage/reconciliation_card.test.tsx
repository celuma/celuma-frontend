/**
 * Céluma 1.3, Phase 4, Block F — the storage verification card.
 *
 * Every `integrity_status` the backend can derive, every `error_code` it can
 * report, and the rule that the three integrity findings are shown separately
 * and never summed.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReconciliationCard from "../../../components/usage/reconciliation_card";
import type { ReconciliationSummary } from "../../../models/tenant_usage";
import { RECONCILIATION_ERROR_CODES } from "../../../models/tenant_usage";

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

/** The never-reconciled shape: every run field null. */
const NEVER_RUN = reconciliation({
    has_run: false,
    integrity_status: "NOT_RUN",
    status: null,
    started_at: null,
    completed_at: null,
    expected_storage_bytes: null,
    actual_storage_bytes: null,
    difference_bytes: null,
    repaired: null,
    objects_checked: null,
    orphans_found: null,
    missing_objects_found: null,
    metadata_mismatches_found: null,
});

function renderCard(value: ReconciliationSummary, verifying = false) {
    const onVerify = vi.fn();
    render(
        <ReconciliationCard reconciliation={value} onVerify={onVerify} verifying={verifying} />,
    );
    return onVerify;
}

describe("card identity", () => {
    it("is named for the storage, never for the cloud provider", () => {
        const { container } = render(
            <ReconciliationCard reconciliation={reconciliation()} onVerify={vi.fn()} verifying={false} />,
        );

        expect(screen.getByText("Verificación del almacenamiento")).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/\bS3\b|AWS|Amazon|bucket/i);
    });
});

describe("NOT_RUN", () => {
    it("is neutral, not a clean bill of health", () => {
        renderCard(NEVER_RUN);

        expect(screen.getByText("Sin verificar")).toBeInTheDocument();
        expect(
            screen.getByText("Aún no se ha realizado una verificación del almacenamiento."),
        ).toBeInTheDocument();
        expect(screen.queryByText(/sin incidencias/i)).not.toBeInTheDocument();
    });

    it("says there is no previous run instead of showing an empty date", () => {
        renderCard(NEVER_RUN);

        expect(screen.getByText("Sin verificaciones previas")).toBeInTheDocument();
    });

    it("offers the verify action", async () => {
        const onVerify = renderCard(NEVER_RUN);

        await userEvent.click(screen.getByRole("button", { name: /verificar ahora/i }));

        expect(onVerify).toHaveBeenCalledOnce();
    });
});

describe("RUNNING", () => {
    const running = reconciliation({
        integrity_status: "RUNNING",
        status: "RUNNING",
        completed_at: null,
        repaired: null,
        objects_checked: null,
        orphans_found: null,
        missing_objects_found: null,
        metadata_mismatches_found: null,
    });

    it("shows a verifying state", () => {
        renderCard(running);

        // Both the status panel and the button read "Verificando…".
        expect(
            within(screen.getByTestId("usage-integrity-status")).getByText("Verificando…"),
        ).toBeInTheDocument();
    });

    it("disables the action so a second run cannot be requested", () => {
        renderCard(running);

        // Requesting another would only earn a 409; the poll picks up the result.
        expect(screen.getByRole("button", { name: /verificando/i })).toBeDisabled();
    });

    it("shows the start time, since there is no completion time yet", () => {
        renderCard(running);

        expect(screen.getByText(/11 ago 2026/)).toBeInTheDocument();
    });

    it("shows no findings while the counters are unmeasured", () => {
        renderCard(running);

        expect(screen.queryByTestId("usage-finding-missing")).not.toBeInTheDocument();
        expect(screen.queryByTestId("usage-finding-orphans")).not.toBeInTheDocument();
        expect(screen.queryByTestId("usage-finding-metadata")).not.toBeInTheDocument();
    });
});

describe("HEALTHY", () => {
    it("reports no findings and when the check ran", () => {
        renderCard(reconciliation());

        expect(screen.getByText("Sin incidencias detectadas")).toBeInTheDocument();
        expect(screen.getByText(/11 ago 2026/)).toBeInTheDocument();
        expect(screen.getByText("142")).toBeInTheDocument();
    });

    it("exposes no object identifier", () => {
        const { container } = render(
            <ReconciliationCard reconciliation={reconciliation()} onVerify={vi.fn()} verifying={false} />,
        );

        // The response carries none, and the card must not invent a place for one.
        expect(container.textContent).not.toMatch(/\.pdf|\.png|key|arn:/i);
    });
});

describe("ACCOUNTING_ONLY", () => {
    const accountingOnly = reconciliation({
        integrity_status: "ACCOUNTING_ONLY",
        objects_checked: null,
        orphans_found: null,
        missing_objects_found: null,
        metadata_mismatches_found: null,
    });

    it("says the usage was verified but the files were not", () => {
        renderCard(accountingOnly);

        expect(screen.getByText(/Uso verificado/)).toBeInTheDocument();
        expect(
            screen.getByText(
                "El cálculo de uso fue verificado, pero no se comprobó el almacenamiento de archivos.",
            ),
        ).toBeInTheDocument();
    });

    it("is not presented as healthy", () => {
        renderCard(accountingOnly);

        expect(screen.queryByText("Sin incidencias detectadas")).not.toBeInTheDocument();
    });

    it("omits the objects-checked figure that was never measured", () => {
        renderCard(accountingOnly);

        expect(screen.queryByText(/Archivos verificados/)).not.toBeInTheDocument();
    });
});

describe("WARNING", () => {
    function warning(overrides: Partial<ReconciliationSummary> = {}) {
        return reconciliation({ integrity_status: "WARNING", ...overrides });
    }

    it("shows an orphan finding with neutral operational wording", () => {
        renderCard(warning({ orphans_found: 3 }));

        const row = screen.getByTestId("usage-finding-orphans");
        expect(within(row).getByText("Archivos sin referencia")).toBeInTheDocument();
        expect(within(row).getByText("3")).toBeInTheDocument();
        expect(
            within(row).getByText(
                "Se detectaron objetos almacenados que ya no tienen una referencia activa en Céluma.",
            ),
        ).toBeInTheDocument();
    });

    it("gives a missing object its own, stronger copy", () => {
        renderCard(warning({ missing_objects_found: 1 }));

        const row = screen.getByTestId("usage-finding-missing");
        expect(within(row).getByText("Archivos no encontrados")).toBeInTheDocument();
        expect(within(row).getByText(/Requieren revisión/)).toBeInTheDocument();
        // The backend does not know why an object is absent.
        expect(row.textContent).not.toMatch(/eliminad|borrad/i);
    });

    it("shows a metadata mismatch without claiming corruption", () => {
        renderCard(warning({ metadata_mismatches_found: 2 }));

        const row = screen.getByTestId("usage-finding-metadata");
        expect(within(row).getByText("Metadatos inconsistentes")).toBeInTheDocument();
        expect(row.textContent).not.toMatch(/corrupt/i);
    });

    it("never merges the three into one issue count", () => {
        renderCard(
            warning({ orphans_found: 3, missing_objects_found: 1, metadata_mismatches_found: 2 }),
        );

        // Three findings, three rows, three counts — not "6 incidencias".
        expect(screen.getByTestId("usage-finding-missing")).toBeInTheDocument();
        expect(screen.getByTestId("usage-finding-orphans")).toBeInTheDocument();
        expect(screen.getByTestId("usage-finding-metadata")).toBeInTheDocument();
        expect(screen.queryByText(/6 incidencias|6 problemas/i)).not.toBeInTheDocument();
    });

    it("puts the missing-object finding first", () => {
        renderCard(warning({ orphans_found: 3, missing_objects_found: 1 }));

        const rows = screen.getAllByTestId(/usage-finding-/);
        expect(rows[0]).toHaveAttribute("data-testid", "usage-finding-missing");
    });

    it("hides a finding that was verified as zero", () => {
        renderCard(warning({ orphans_found: 3, missing_objects_found: 0, metadata_mismatches_found: 0 }));

        expect(screen.getByTestId("usage-finding-orphans")).toBeInTheDocument();
        expect(screen.queryByTestId("usage-finding-missing")).not.toBeInTheDocument();
    });
});

describe("FAILED", () => {
    it("maps every sanitized code to user-safe copy, never showing the code", () => {
        for (const code of RECONCILIATION_ERROR_CODES) {
            const { unmount, container } = render(
                <ReconciliationCard
                    reconciliation={reconciliation({
                        integrity_status: "FAILED",
                        status: "FAILED",
                        error_code: code,
                    })}
                    onVerify={vi.fn()}
                    verifying={false}
                />,
            );

            expect(screen.getByText("La verificación no se completó")).toBeInTheDocument();
            expect(container.textContent).not.toContain(code);
            unmount();
        }
    });

    it("explains an access failure without naming the provider", () => {
        renderCard(
            reconciliation({
                integrity_status: "FAILED",
                status: "FAILED",
                error_code: "s3_access_denied",
            }),
        );

        expect(screen.getByText("No fue posible acceder al almacenamiento.")).toBeInTheDocument();
    });

    it("describes a recovered stale run as an interruption", () => {
        renderCard(
            reconciliation({
                integrity_status: "FAILED",
                status: "FAILED",
                error_code: "stale_run_recovered",
            }),
        );

        expect(
            screen.getByText(
                "Una verificación anterior se interrumpió y fue cerrada automáticamente.",
            ),
        ).toBeInTheDocument();
    });

    it("keeps the retry available", () => {
        renderCard(
            reconciliation({ integrity_status: "FAILED", status: "FAILED", error_code: "s3_timeout" }),
        );

        expect(screen.getByRole("button", { name: /verificar ahora/i })).toBeEnabled();
    });
});

describe("the verify button", () => {
    it("goes into a loading state with its own text while the POST is in flight", () => {
        renderCard(reconciliation(), true);

        const button = screen.getByRole("button", { name: /verificando/i });
        expect(button).toBeInTheDocument();
        // Loading is stated, not only spun.
        expect(button.textContent).toMatch(/Verificando/);
    });
});
