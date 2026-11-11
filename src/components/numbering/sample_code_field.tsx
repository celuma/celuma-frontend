import { tokens } from "../design/tokens";
import FloatingCaptionInput from "../ui/floating_caption_input";
import { MANUAL_SAMPLE_CODE_RE, type RowCodeState } from "../../lib/sample_code_rows";

interface Props {
    state: RowCodeState;
    /** The user is writing their own code (even if the text is empty right now: they may be retyping it). */
    manual: boolean;
    /** What the user typed (meaningful while the row is manual). */
    typedCode: string;
    /** The user holds the privileged manual-capture capability (`lab:enter_manual_code`). */
    canEdit: boolean;
    onType: (value: string) => void;
    /** Leaves the field empty after typing: back to the automatic code. */
    onBlurEmpty: () => void;
    /** Drops the manual code and returns to the automatic suggestion. */
    onUseSuggestion: () => void;
    error?: string;
    testId?: string;
}

const HELP: Record<string, string> = {
    need_type: "Seleccione el tipo de muestra para sugerir el código.",
    need_date: "Indique la fecha de recepción para sugerir el código.",
    pending: "Calculando la sugerencia…",
    unavailable: "No hay sugerencia por ahora; el código se asignará al guardar.",
};

/**
 * "Código de muestra": the suggested code for an automatic row, or the code the user typed (hotfix 1.4.3).
 *
 * The suggestion reserves nothing: the definitive code is assigned on save and the result is shown after.
 * Without the capability the field shows the suggestion and cannot be edited (the API refuses a typed code
 * from anyone who lacks it, so the field never offers it).
 */
export default function SampleCodeField({ state, manual, typedCode, canEdit, onType, onBlurEmpty, onUseSuggestion, error, testId = "sample-code" }: Props) {
    const value = manual ? typedCode : state.kind === "suggested" ? state.code : "";
    const invalid = manual && typedCode.trim() !== "" && !MANUAL_SAMPLE_CODE_RE.test(typedCode.trim());

    let help: string;
    if (manual && typedCode.trim() === "") help = "Escriba el código o salga del campo vacío para usar la sugerencia automática.";
    else if (manual) help = "Código manual: no usa un número automático y puede repetir un código existente.";
    else if (state.kind === "suggested") help = canEdit
        ? "Sugerido, no reservado: el código definitivo se asigna al guardar y puede cambiar. Escriba uno para usar un código propio."
        : "Sugerido, no reservado: el código definitivo se asigna al guardar y puede cambiar.";
    else help = HELP[state.kind] ?? "";
    if (!canEdit && !manual && state.kind !== "suggested") help = `${help} Escribir un código propio requiere el permiso de captura manual.`.trim();

    return (
        <div style={{ display: "grid", gap: 4, alignContent: "start" }} data-testid={`${testId}-field`}>
            <FloatingCaptionInput
                label="Código de muestra"
                value={value}
                disabled={!canEdit}
                maxLength={100}
                autoComplete="off"
                error={error ?? (invalid ? "Use de 1 a 100 caracteres: letras, números, punto, guion y guion bajo." : undefined)}
                onChange={(e) => onType(e.target.value)}
                onBlur={() => { if (manual && typedCode.trim() === "") onBlurEmpty(); }}
                data-testid={testId}
                aria-describedby={`${testId}-help`}
            />
            <span id={`${testId}-help`} data-testid={`${testId}-help`} style={{ fontSize: 12, color: tokens.textSecondary }}>
                {help}
                {manual && canEdit ? (
                    <>
                        {" "}
                        <button
                            type="button"
                            onClick={onUseSuggestion}
                            data-testid={`${testId}-reset`}
                            style={{ background: "none", border: 0, padding: 0, color: tokens.primary ?? "inherit", cursor: "pointer", textDecoration: "underline", font: "inherit" }}
                        >
                            Usar la sugerencia automática
                        </button>
                    </>
                ) : null}
            </span>
        </div>
    );
}
