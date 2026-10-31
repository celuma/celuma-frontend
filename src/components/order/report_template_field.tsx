import { Alert, Button } from "antd";
import FloatingCaptionSelect from "../ui/floating_caption_select";
import { tokens } from "../design/tokens";
import { TEMPLATE_SOURCE_LABEL } from "../../lib/report_template_suggestion";
import type {
    ReportTemplateRef,
    ReportTemplateSource,
    ReportTemplateStatus,
} from "../../models/report_letterhead";

/** What applies when the order has no explicit choice (a suggestion while registering, the catalog default
 *  while editing). */
export interface TemplateFallback {
    status: ReportTemplateStatus;
    template: ReportTemplateRef | null;
    source: ReportTemplateSource | null;
    candidates: ReportTemplateRef[];
}

interface Props {
    /** The explicit choice; `null` = follow `fallback`. */
    value: string | null;
    onChange: (templateId: string | null) => void;
    /** The active templates of the laboratory (lightweight catalog: no structure). */
    options: ReportTemplateRef[];
    fallback: TemplateFallback;
    mode: "create" | "edit";
    /** The stored explicit choice when it has been deactivated (edit only): shown, never re-offered. */
    inactiveChoice?: ReportTemplateRef | null;
    disabled?: boolean;
    loading?: boolean;
    error?: string;
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * "Plantilla del reporte" on the order forms (Céluma 1.4.1). The select shows the template a new report will
 * use: the explicit choice, or the suggestion/default greyed by its explanation. Picking any option makes it
 * the explicit choice; the reset link returns to the suggestion. A later change of samples or study type
 * moves the suggestion, never an explicit choice (the parent keeps `value`).
 */
export default function ReportTemplateField({
    value, onChange, options, fallback, mode, inactiveChoice, disabled, loading, error,
}: Props) {
    const shown = value ?? fallback.template?.id ?? undefined;
    const byId = new Map<string, ReportTemplateRef>();
    for (const t of [...options, ...(fallback.template ? [fallback.template] : []), ...fallback.candidates]) {
        if (!byId.has(t.id)) byId.set(t.id, t);
    }
    if (inactiveChoice && value === inactiveChoice.id && !byId.has(inactiveChoice.id)) {
        byId.set(inactiveChoice.id, { ...inactiveChoice, name: `${inactiveChoice.name} (desactivada)` });
    }
    const selectOptions = [...byId.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
        .map((t) => ({ value: t.id, label: t.name }));

    const fallbackText = () => {
        if (fallback.template && fallback.source) {
            return `${fallback.template.name} (${TEMPLATE_SOURCE_LABEL[fallback.source]})`;
        }
        return null;
    };
    const resetLabel = mode === "create" ? "Usar la sugerida" : "Restablecer la predeterminada";

    let help: React.ReactNode = null;
    if (value) {
        const restored = fallbackText();
        help = (
            <span>
                Elegida para esta orden.{" "}
                {restored
                    ? `Sin esta elección se usaría ${restored}.`
                    : fallback.status === "AMBIGUOUS"
                        ? "Sin esta elección las muestras sugieren plantillas distintas y habría que elegir de nuevo."
                        : "Sin esta elección no habría plantilla predeterminada."}{" "}
                {!disabled && (
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onChange(null)}
                        data-testid="report-template-reset">
                        {resetLabel}
                    </Button>
                )}
            </span>
        );
    } else if (fallback.status === "RESOLVED" && fallback.template && fallback.source) {
        help = `${sentence(TEMPLATE_SOURCE_LABEL[fallback.source])}. Puedes elegir otra; tu elección se guarda con la orden.`;
    } else if (fallback.status === "NONE") {
        help = mode === "create"
            ? "Ni los tipos de muestra ni el tipo de estudio sugieren una plantilla. Puedes elegirla ahora o después, al corregir la orden."
            : "No hay plantilla predeterminada: elige una para poder crear el reporte.";
    }

    return (
        <div style={{ display: "grid", gap: 8 }} data-testid="report-template-field">
            <FloatingCaptionSelect
                label={mode === "create" ? "Plantilla del reporte (opcional)" : "Plantilla del reporte"}
                value={shown}
                onChange={(v) => onChange(v ?? null)}
                options={selectOptions}
                placeholder={fallback.status === "AMBIGUOUS" ? "Elige la plantilla" : "Sin plantilla"}
                showSearch
                allowClear={Boolean(value)}
                disabled={disabled}
                loading={loading}
                error={error}
                data-testid="report-template-select"
            />
            {!value && fallback.status === "AMBIGUOUS" && (
                <Alert
                    type="warning" showIcon data-testid="report-template-ambiguous"
                    message="Las muestras sugieren plantillas distintas"
                    description={`${fallback.candidates.map((c) => c.name).join(", ")}. Elige cuál usará el reporte; no se toma ninguna por el orden de las muestras.`}
                />
            )}
            {help && (
                <div style={{ color: tokens.textSecondary, fontSize: 13 }} data-testid="report-template-help">{help}</div>
            )}
        </div>
    );
}
