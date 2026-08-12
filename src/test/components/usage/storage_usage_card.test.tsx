/**
 * Céluma 1.3, Phase 4, Block F — the storage usage card.
 *
 * The four states of the Block E storage contract, and the three things the
 * card is forbidden to render: `0 B` for uninitialized usage, a fabricated
 * percentage for an unlimited tenant, and a clamped number above the limit.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StorageUsageCard from "../../../components/usage/storage_usage_card";
import type { StorageUsage } from "../../../models/tenant_usage";

function storage(overrides: Partial<StorageUsage> = {}): StorageUsage {
    return {
        initialized: true,
        billable_bytes: 127_900_000,
        limit_bytes: 1_000_000_000_000,
        unlimited: false,
        usage_ratio: 0.0001279,
        usage_percent: 0.01,
        ...overrides,
    };
}

function renderCard(value: StorageUsage, onVerify = vi.fn(), verifying = false) {
    render(<StorageUsageCard storage={value} onVerify={onVerify} verifying={verifying} />);
    return onVerify;
}

describe("initialized with a configured limit", () => {
    it("shows the billable total, the limit and the backend's percentage", () => {
        renderCard(storage({ usage_percent: 12.34, usage_ratio: 0.1234 }));

        expect(screen.getByText("127.9 MB")).toBeInTheDocument();
        expect(screen.getByText(/de 1 TB/)).toBeInTheDocument();
        expect(screen.getByText("12.34%")).toBeInTheDocument();
    });

    it("labels the bar with the percentage in words", () => {
        renderCard(storage({ usage_percent: 80, usage_ratio: 0.8 }));

        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-valuetext", "80% del almacenamiento utilizado");
        expect(bar).toHaveAttribute("aria-valuenow", "80");
    });

    it("renders a verified zero as an actual zero", () => {
        // `initialized: true` with 0 bytes is a real, known measurement — unlike
        // the uninitialized case below.
        renderCard(storage({ billable_bytes: 0, usage_ratio: 0, usage_percent: 0 }));

        expect(screen.getByText("0 B")).toBeInTheDocument();
        expect(screen.getByText("0%")).toBeInTheDocument();
    });
});

describe("uninitialized", () => {
    const uninitialized = storage({
        initialized: false,
        billable_bytes: null,
        usage_ratio: null,
        usage_percent: null,
    });

    it("says the usage has not been calculated instead of showing 0 B or 0%", () => {
        renderCard(uninitialized);

        expect(screen.getByText("Uso aún no calculado")).toBeInTheDocument();
        expect(screen.queryByText("0 B")).not.toBeInTheDocument();
        expect(screen.queryByText("0%")).not.toBeInTheDocument();
    });

    it("renders no progress bar — there is no numerator to draw", () => {
        renderCard(uninitialized);

        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("offers the same verify action as the reconciliation card, and it is not an error", async () => {
        const onVerify = renderCard(uninitialized);

        const button = screen.getByRole("button", { name: /verificar ahora/i });
        await userEvent.click(button);

        expect(onVerify).toHaveBeenCalledOnce();
        expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    it("gates that action while a run is already in progress", () => {
        // Same action as the verification card, so it must be gated the same
        // way — a second request while a run is going can only answer 409, and
        // "no counter yet + run underway" is exactly what a first-ever
        // verification looks like.
        render(
            <StorageUsageCard
                storage={uninitialized}
                onVerify={vi.fn()}
                verifying={false}
                runInProgress
            />,
        );

        const button = screen.getByRole("button", { name: /verificando/i });
        expect(button).toBeDisabled();
        expect(screen.queryByRole("button", { name: /^verificar ahora$/i })).not.toBeInTheDocument();
    });
});

describe("unlimited", () => {
    const unlimited = storage({
        limit_bytes: null,
        unlimited: true,
        usage_ratio: null,
        usage_percent: null,
    });

    it("shows the real amount and says there is no limit", () => {
        renderCard(unlimited);

        expect(screen.getByText(/127\.9 MB utilizados/)).toBeInTheDocument();
        expect(screen.getByText("Sin límite configurado")).toBeInTheDocument();
    });

    it("invents neither a percentage nor a bar", () => {
        renderCard(unlimited);

        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
        expect(screen.queryByText("0%")).not.toBeInTheDocument();
        expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });
});

describe("over limit", () => {
    const over = storage({
        billable_bytes: 1_230_000_000_000,
        usage_ratio: 1.23,
        usage_percent: 123,
    });

    it("shows the real percentage, unclamped", () => {
        renderCard(over);

        expect(screen.getByText("123%")).toBeInTheDocument();
        expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });

    it("caps only the bar's width", () => {
        renderCard(over);

        const bar = screen.getByRole("progressbar");
        // The value is honest even though the geometry cannot exceed the track.
        expect(bar).toHaveAttribute("aria-valuenow", "123");
        expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    });

    it("states the fact without implying anything is blocked", () => {
        renderCard(over);

        expect(screen.getByText("Uso por encima del límite configurado")).toBeInTheDocument();
        // Phase 4 enforces nothing; promising otherwise would be a lie.
        expect(screen.queryByText(/deshabilitad|bloquead|no podrás|suspend/i)).not.toBeInTheDocument();
    });
});

describe("commercial copy", () => {
    it("names no plan, price or upgrade path", () => {
        const { container } = render(
            <StorageUsageCard storage={storage()} onVerify={vi.fn()} verifying={false} />,
        );

        // Phase 4 has no plan catalog and no checkout to send anyone to.
        expect(container.textContent).not.toMatch(
            /plan|suscripción|comprar|mejora|starter|professional|enterprise|\$/i,
        );
    });
});
