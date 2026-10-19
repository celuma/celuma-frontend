/**
 * Céluma 1.4 (#13): the password confirmation dialog used for signing and
 * reopening. It keeps the password only while open, hands it over once, and
 * clears it on use, cancellation and close. Synthetic values only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasswordConfirmationDialog from "../../components/report/password_confirmation_dialog";

const SECRET = "synthetic-confirmation";

function renderDialog(overrides: Partial<React.ComponentProps<typeof PasswordConfirmationDialog>> = {}) {
    const props = {
        open: true,
        title: "Firmar y publicar",
        description: "Descripción",
        confirmText: "Confirmar firma",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        ...overrides,
    };
    const utils = render(<PasswordConfirmationDialog {...props} />);
    return { ...utils, props };
}

const input = () => screen.getByTestId("password-confirmation-input") as HTMLInputElement;
const submit = () => screen.getByTestId("password-confirmation-submit");

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});

describe("PasswordConfirmationDialog", () => {
    it("asks for the current password and cannot be confirmed empty", () => {
        renderDialog();
        expect(screen.getByLabelText("Contraseña actual")).toBe(input());
        expect(input().getAttribute("autocomplete")).toBe("current-password");
        expect(input().getAttribute("type")).toBe("password");
        expect(submit().hasAttribute("disabled")).toBe(true);
    });

    it("hands the password over once and clears the field", async () => {
        const { props } = renderDialog();
        await userEvent.type(input(), SECRET);
        await userEvent.click(submit());

        expect(props.onConfirm).toHaveBeenCalledTimes(1);
        expect(props.onConfirm).toHaveBeenCalledWith(SECRET, undefined, undefined);
        expect(input().value).toBe("");
        expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(SECRET);
    });

    it("submits with Enter", async () => {
        const { props } = renderDialog();
        await userEvent.type(input(), `${SECRET}{Enter}`);
        expect(props.onConfirm).toHaveBeenCalledWith(SECRET, undefined, undefined);
    });

    it("passes the optional reason when the field is offered", async () => {
        const { props } = renderDialog({ reasonLabel: "Motivo (opcional)" });
        await userEvent.type(screen.getByLabelText("Motivo (opcional)"), "  Membrete incorrecto ");
        await userEvent.type(input(), SECRET);
        await userEvent.click(submit());
        expect(props.onConfirm).toHaveBeenCalledWith(SECRET, "Membrete incorrecto", undefined);
    });

    it("cancelling clears the field and never confirms", async () => {
        const { props, rerender } = renderDialog();
        await userEvent.type(input(), SECRET);
        await userEvent.click(screen.getByText("Cancelar"));
        expect(props.onCancel).toHaveBeenCalledTimes(1);
        expect(props.onConfirm).not.toHaveBeenCalled();

        rerender(<PasswordConfirmationDialog {...props} open={false} />);
        expect(screen.queryByTestId("password-confirmation-input")).toBeNull();
        rerender(<PasswordConfirmationDialog {...props} open />);
        expect(input().value).toBe("");
    });

    it("shows a refused confirmation inline as an alert", () => {
        renderDialog({ error: "La contraseña no es correcta. No se realizó ningún cambio." });
        const alert = screen.getByTestId("password-confirmation-error");
        expect(alert.getAttribute("role")).toBe("alert");
        expect(alert.textContent).toContain("No se realizó ningún cambio");
        expect(input().getAttribute("aria-invalid")).toBe("true");
        expect(input().getAttribute("aria-describedby")).toBe(alert.id);
    });

    it("cannot be cancelled or resubmitted while the action runs", () => {
        renderDialog({ loading: true });
        expect(input().hasAttribute("disabled")).toBe(true);
        expect(screen.getByText("Cancelar").closest("button")?.hasAttribute("disabled")).toBe(true);
    });

    it("requires the reason and the choice when asked to (1.4 #13 amendments)", async () => {
        const { props } = renderDialog({
            reasonLabel: "Motivo (obligatorio)",
            reasonRequired: true,
            choice: {
                label: "Tipo de enmienda",
                options: [
                    { value: "CORRECTION", label: "Corrección" },
                    { value: "SUPPLEMENT", label: "Complemento (p. ej., IHC)" },
                ],
            },
        });
        await userEvent.type(input(), SECRET);
        expect(submit().hasAttribute("disabled")).toBe(true); // no reason, no choice

        await userEvent.type(screen.getByLabelText("Motivo (obligatorio)"), "  ab ");
        expect(submit().hasAttribute("disabled")).toBe(true); // too short once trimmed

        await userEvent.type(screen.getByLabelText("Motivo (obligatorio)"), "c IHC");
        expect(submit().hasAttribute("disabled")).toBe(true); // still no choice

        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.click(await screen.findByText("Complemento (p. ej., IHC)"));
        expect(submit().hasAttribute("disabled")).toBe(false);
        await userEvent.click(submit());
        expect(props.onConfirm).toHaveBeenCalledWith(SECRET, "ab c IHC", "SUPPLEMENT");
    });

    it("renders nothing while closed", () => {
        renderDialog({ open: false });
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
