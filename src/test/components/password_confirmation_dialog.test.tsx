/**
 * Céluma 1.4 (#13): the password confirmation dialog used for signing and
 * reopening. It keeps the password only while open, hands it over once, and
 * clears it on use, cancellation and close. Synthetic values only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

/**
 * Céluma 1.4 (#46): a password manager filled the saved username into the field
 * it took for the username — the reason — when it filled the password. These
 * tests pin the form semantics that prevent it (the native behaviour itself was
 * checked in Chrome 156 with its own password manager; a DOM test cannot prove
 * what a real manager does).
 */
describe("PasswordConfirmationDialog — form semantics for password managers (1.4 #46)", () => {
    const AMENDMENT = {
        reasonLabel: "Motivo (obligatorio)",
        reasonRequired: true,
        choice: {
            label: "Tipo de enmienda",
            options: [
                { value: "CORRECTION", label: "Corrección" },
                { value: "SUPPLEMENT", label: "Complemento (p. ej., IHC)" },
            ],
        },
    };
    const reason = () => screen.getByLabelText("Motivo (obligatorio)") as HTMLTextAreaElement;
    const username = () => screen.getByTestId("password-confirmation-username") as HTMLInputElement;
    const fieldsOf = (form: HTMLFormElement | null) =>
        Array.from(form?.elements ?? []).filter((el) => el.matches("input, textarea, select"));

    async function chooseCorrection() {
        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.click(await screen.findByText("Corrección"));
    }

    it("keeps the reason and the category out of the credential form, which names its own username field", () => {
        renderDialog(AMENDMENT);
        const credentials = input().form;
        expect(credentials).not.toBeNull();
        // Only the username slot and the password: nothing a manager could take for the username.
        expect(fieldsOf(credentials)).toEqual([username(), input()]);
        expect(reason().form).not.toBe(credentials);
        expect(screen.getByRole("combobox").closest("form")).not.toBe(credentials);
        expect(reason().form).toBe(screen.getByRole("combobox").closest("form"));

        expect(username().getAttribute("autocomplete")).toBe("username");
        expect(username().type).toBe("text");
        expect(username().readOnly).toBe(true);
        // Empty on purpose: a value matching the saved login lets the browser fill the password by itself.
        expect(username().value).toBe("");
        expect(username().tabIndex).toBe(-1);
        expect(username().getAttribute("aria-hidden")).toBe("true");
        expect(input().getAttribute("autocomplete")).toBe("current-password");
        expect(input().getAttribute("name")).toBe("password");
        // The reason stays an ordinary editable field.
        expect(reason().readOnly).toBe(false);
        expect(reason().disabled).toBe(false);
    });

    it("applies the same structure to every protected action (reopen, cancellation, sign)", () => {
        const { rerender, props } = renderDialog({ reasonLabel: "Motivo (opcional)" });
        expect(fieldsOf(input().form)).toEqual([username(), input()]);
        expect((screen.getByLabelText("Motivo (opcional)") as HTMLTextAreaElement).form).not.toBe(input().form);

        rerender(<PasswordConfirmationDialog {...props} reasonLabel={undefined} />);
        expect(fieldsOf(input().form)).toEqual([username(), input()]);
        expect(screen.queryByTestId("password-confirmation-details")).toBeNull();
    });

    it("a write into the credential form never reaches the reason (simulated fill, not a native one)", async () => {
        const { props } = renderDialog(AMENDMENT);
        await chooseCorrection();
        await userEvent.type(reason(), "Corrección de texto de prueba");
        // What a manager writes when it fills the credential form: the username slot and the password.
        fireEvent.change(username(), { target: { value: "lectora@example.com" } });
        fireEvent.change(input(), { target: { value: SECRET } });
        expect(reason().value).toBe("Corrección de texto de prueba");

        await userEvent.click(submit());
        expect(props.onConfirm).toHaveBeenCalledWith(SECRET, "Corrección de texto de prueba", "CORRECTION");
    });

    it("keeps deliberate reason edits, retries after a refused password and submits with Enter", async () => {
        const { props, rerender } = renderDialog(AMENDMENT);
        await chooseCorrection();
        await userEvent.type(reason(), "Texto inicial");
        await userEvent.clear(reason());
        await userEvent.type(reason(), "Motivo corregido");
        await userEvent.type(input(), "wrong-synthetic{Enter}");
        expect(props.onConfirm).toHaveBeenLastCalledWith("wrong-synthetic", "Motivo corregido", "CORRECTION");

        // The parent keeps the dialog open with the refusal: the reason and the choice survive, the password does not.
        rerender(<PasswordConfirmationDialog {...props} {...AMENDMENT} error="La contraseña no es correcta." />);
        expect(reason().value).toBe("Motivo corregido");
        expect(input().value).toBe("");
        await userEvent.type(input(), `${SECRET}{Enter}`);
        expect(props.onConfirm).toHaveBeenLastCalledWith(SECRET, "Motivo corregido", "CORRECTION");
        expect(props.onConfirm).toHaveBeenCalledTimes(2);
    });

    it("still requires the reason, and reopening starts empty", async () => {
        const { props, rerender } = renderDialog(AMENDMENT);
        await chooseCorrection();
        await userEvent.type(input(), SECRET);
        await userEvent.type(reason(), "ab");
        expect(submit().hasAttribute("disabled")).toBe(true);
        await userEvent.type(input(), "{Enter}");
        expect(props.onConfirm).not.toHaveBeenCalled();

        rerender(<PasswordConfirmationDialog {...props} {...AMENDMENT} open={false} />);
        rerender(<PasswordConfirmationDialog {...props} {...AMENDMENT} open />);
        expect(reason().value).toBe("");
        expect(input().value).toBe("");
        expect(username().value).toBe("");
    });
});
