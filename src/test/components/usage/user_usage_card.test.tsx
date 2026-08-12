/**
 * Céluma 1.3, Phase 4, Block F — the user usage card.
 *
 * The one thing that must not drift: the seat numerator is
 * `active_internal_users`, never `registered_users` and never the physician
 * portal count. The backend already decided that, and a React-side "fix" would
 * silently contradict Céluma's commercial rules.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import UserUsageCard from "../../../components/usage/user_usage_card";
import type { UserUsage } from "../../../models/tenant_usage";

function users(overrides: Partial<UserUsage> = {}): UserUsage {
    return {
        registered_users: 21,
        active_internal_users: 8,
        active_physician_portal_users: 14,
        user_limit: 10,
        unlimited: false,
        usage_ratio: 0.8,
        usage_percent: 80,
        ...overrides,
    };
}

describe("licensed seats", () => {
    it("counts active internal users against the limit", () => {
        render(<UserUsageCard users={users()} />);

        expect(screen.getByText("8 de 10")).toBeInTheDocument();
        expect(screen.getByText("80%")).toBeInTheDocument();
    });

    it("does not use registered users as the numerator", () => {
        // 21 registered, 8 internal, limit 10. If the card ever showed "21 de
        // 10" it would be reimplementing — and contradicting — the backend.
        render(<UserUsageCard users={users()} />);

        expect(screen.queryByText("21 de 10")).not.toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toHaveAttribute(
            "aria-valuetext",
            "80% de usuarios internos utilizados",
        );
    });

    it("does not use physician portal accounts as the numerator", () => {
        render(<UserUsageCard users={users()} />);

        expect(screen.queryByText("14 de 10")).not.toBeInTheDocument();
    });
});

describe("secondary counts", () => {
    it("reports registered users and physician portal accounts separately", () => {
        render(<UserUsageCard users={users()} />);

        expect(screen.getByText("Usuarios registrados")).toBeInTheDocument();
        expect(screen.getByText("21")).toBeInTheDocument();
        expect(screen.getByText("Portal de médicos")).toBeInTheDocument();
        expect(screen.getByText("14")).toBeInTheDocument();
    });

    it("says plainly that portal accounts do not consume a seat", () => {
        render(<UserUsageCard users={users()} />);

        expect(
            screen.getByText(
                /Las cuentas del portal de médicos no se contabilizan dentro del límite de usuarios internos\./,
            ),
        ).toBeInTheDocument();
    });
});

describe("unlimited", () => {
    const unlimited = users({
        user_limit: null,
        unlimited: true,
        usage_ratio: null,
        usage_percent: null,
    });

    it("shows the absolute count and says there is no limit", () => {
        render(<UserUsageCard users={unlimited} />);

        expect(screen.getByText("8 usuarios internos activos")).toBeInTheDocument();
        expect(screen.getByText("Sin límite configurado")).toBeInTheDocument();
    });

    it("invents neither a percentage nor a bar", () => {
        render(<UserUsageCard users={unlimited} />);

        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
        expect(screen.queryByText("0%")).not.toBeInTheDocument();
        expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });

    it("still reports the informational counts", () => {
        render(<UserUsageCard users={unlimited} />);

        expect(screen.getByText("Usuarios registrados")).toBeInTheDocument();
        expect(screen.getByText("Portal de médicos")).toBeInTheDocument();
    });
});

describe("over limit", () => {
    const over = users({
        active_internal_users: 12,
        user_limit: 10,
        usage_ratio: 1.2,
        usage_percent: 120,
    });

    it("shows 12 de 10 and 120%, unclamped", () => {
        render(<UserUsageCard users={over} />);

        expect(screen.getByText("12 de 10")).toBeInTheDocument();
        expect(screen.getByText("120%")).toBeInTheDocument();
        expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });

    it("never implies a user is blocked or deactivated", () => {
        const { container } = render(<UserUsageCard users={over} />);

        expect(screen.getByText("Uso por encima del límite configurado")).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/desactivad|bloquead|deshabilitad|suspend/i);
    });

    it("marks the over-limit state with an icon and text, not colour alone", () => {
        render(<UserUsageCard users={over} />);

        const notice = screen.getByText("Uso por encima del límite configurado").closest("div");
        expect(notice).not.toBeNull();
        expect(within(notice as HTMLElement).getByRole("img", { hidden: true })).toBeInTheDocument();
    });
});
