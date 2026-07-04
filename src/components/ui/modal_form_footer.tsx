import { tokens } from "../design/tokens";
import CelumaButton from "./button";

type Props = {
    /** Called when the user cancels (closes the form without saving). */
    onCancel: () => void;
    /** Label for the primary submit button (e.g. "Crear", "Guardar cambios"). */
    submitLabel: string;
    /** Submit in-flight — disables both buttons and spins the primary. */
    loading?: boolean;
    /** Disable only the submit button (e.g. nothing selected yet). */
    submitDisabled?: boolean;
    /** Hide the "* obligatorios" note (for forms with no required fields). */
    hideRequiredNote?: boolean;
};

/**
 * ModalFormFooter — the standard footer for Céluma create/edit form modals:
 * a left-aligned "campos obligatorios" note and a right-aligned Cancelar
 * (outline/danger) + primary submit pair. Rendered inside the form's `<form>`
 * so the primary button submits it. Shared so every config form reads the same.
 */
export default function ModalFormFooter({ onCancel, submitLabel, loading = false, submitDisabled = false, hideRequiredNote = false }: Props) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
            {hideRequiredNote ? <span /> : (
                <div style={{ color: tokens.textSecondary, fontSize: 12 }}>
                    Los campos marcados con <span style={{ color: "#e5484d", fontWeight: 700 }}>*</span> son obligatorios.
                </div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
                <CelumaButton htmlType="button" danger onClick={onCancel} disabled={loading}>
                    Cancelar
                </CelumaButton>
                <CelumaButton htmlType="submit" type="primary" loading={loading} disabled={submitDisabled}>
                    {submitLabel}
                </CelumaButton>
            </div>
        </div>
    );
}
