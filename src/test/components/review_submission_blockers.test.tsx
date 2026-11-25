/**
 * Céluma 1.5 (#65): the list of requirements shown above "Enviar a revisión".
 * It names each requirement, tells blocking ones from warnings, and offers a
 * way to the affected section only where the user can act on it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import ReviewSubmissionBlockers from "../../components/report/review_submission_blockers";
import type { ReviewBlocker } from "../../lib/review_submission";

const NOTE: ReviewBlocker = {
    id: "amendment_change_note_required",
    section: "amendment",
    severity: "blocker",
    title: "Falta la nota de enmienda",
    detail: "Escribe qué cambió y guarda el reporte.",
};

const NO_REVIEWERS: ReviewBlocker = {
    id: "reviewers_missing",
    section: "reviewers",
    severity: "warning",
    title: "La orden no tiene revisores asignados",
    detail: "Asigna un revisor desde la orden.",
};

const NO_PERMISSION: ReviewBlocker = {
    id: "permission_denied",
    section: "permission",
    severity: "blocker",
    title: "Sin permiso",
    detail: "No tienes permiso para enviar reportes a revisión.",
};

afterEach(cleanup);

describe("ReviewSubmissionBlockers", () => {
    it("renders nothing when there is nothing pending", () => {
        const { container } = render(<ReviewSubmissionBlockers blockers={[]} onGo={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it("lists each requirement with its title and what to do", () => {
        render(<ReviewSubmissionBlockers blockers={[NOTE, NO_REVIEWERS]} onGo={vi.fn()} />);
        const region = screen.getByRole("region", { name: "Requisitos para enviar a revisión" });
        expect(within(region).getAllByRole("listitem")).toHaveLength(2);
        const note = screen.getByTestId("review-blocker-amendment_change_note_required");
        expect(note.textContent).toContain("Falta la nota de enmienda.");
        expect(note.textContent).toContain("Escribe qué cambió y guarda el reporte.");
        expect(note.getAttribute("data-section")).toBe("amendment");
    });

    it("says it blocks the submission when any item is blocking", () => {
        render(<ReviewSubmissionBlockers blockers={[NO_REVIEWERS, NOTE]} onGo={vi.fn()} />);
        expect(screen.getByText("Antes de enviar a revisión")).toBeTruthy();
        expect(screen.getByLabelText("Bloquea el envío")).toBeTruthy();
        expect(screen.getByLabelText("Aviso")).toBeTruthy();
    });

    it("only warnings read as a review, not a stop", () => {
        render(<ReviewSubmissionBlockers blockers={[NO_REVIEWERS]} onGo={vi.fn()} />);
        expect(screen.getByText("Revisa antes de enviar a revisión")).toBeTruthy();
        expect(screen.queryByLabelText("Bloquea el envío")).toBeNull();
    });

    it("the section action calls onGo with that requirement", async () => {
        const onGo = vi.fn();
        render(<ReviewSubmissionBlockers blockers={[NOTE, NO_REVIEWERS]} onGo={onGo} />);
        await userEvent.click(screen.getByRole("button", { name: "Ir a la nota de enmienda" }));
        expect(onGo).toHaveBeenCalledWith(NOTE);
        await userEvent.click(screen.getByRole("button", { name: "Ir a la orden" }));
        expect(onGo).toHaveBeenLastCalledWith(NO_REVIEWERS);
    });

    it("offers no action where the user cannot fix it from here", () => {
        render(<ReviewSubmissionBlockers blockers={[NO_PERMISSION]} onGo={vi.fn()} />);
        expect(screen.queryByTestId("review-blocker-go-permission_denied")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("forwards its ref to a focusable container, so the editor can move focus to it", () => {
        const ref = createRef<HTMLDivElement>();
        render(<ReviewSubmissionBlockers ref={ref} blockers={[NOTE]} onGo={vi.fn()} />);
        expect(ref.current).toBe(screen.getByTestId("review-submission-blockers"));
        ref.current?.focus();
        expect(document.activeElement).toBe(ref.current);
    });
});
