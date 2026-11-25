import { Alert, Button } from "antd";
import FloatingCaptionSelect from "../ui/floating_caption_select";
import { tokens } from "../design/tokens";
import { joinNames, TEMPLATE_SOURCE_LABEL, type TemplateOrigin } from "../../lib/report_template_suggestion";
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
    /** Céluma 1.5 (#70): which sample types / study type stand behind the fallback. Display only; when it is
     *  absent or a template is not in it, the generic origin is shown, as before. */
    origin?: TemplateOrigin | null;
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
    value, onChange, options, fallback, origin, mode, inactiveChoice, disabled, loading, error,
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

    const sampleTypesOf = (templateId: string) => origin?.sampleTypesByTemplate[templateId] ?? [];
    // "sugerida por el tipo de muestra Biopsia" / "por los tipos de muestra A y B" / "por el tipo de estudio X".
    const sourceLabel = (source: ReportTemplateSource, templateId: string) => {
        if (source === "SAMPLE_TYPE") {
            const names = sampleTypesOf(templateId);
            if (names.length === 1) return `${TEMPLATE_SOURCE_LABEL.SAMPLE_TYPE} ${names[0]}`;
            if (names.length > 1) return `sugerida por los tipos de muestra ${joinNames(names)}`;
        }
        if (source === "STUDY_TYPE" && origin?.studyTypeName) {
            return `${TEMPLATE_SOURCE_LABEL.STUDY_TYPE} ${origin.studyTypeName}`;
        }
        return TEMPLATE_SOURCE_LABEL[source];
    };
    const fallbackText = () => {
        if (fallback.template && fallback.source) {
            return `${fallback.template.name} (${sourceLabel(fallback.source, fallback.template.id)})`;
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
        help = `${sentence(sourceLabel(fallback.source, fallback.template.id))}. Puedes elegir otra; tu elección se guarda con la orden.`;
    } else if (fallback.status === "NONE") {
        help = mode === "create"
            ? "Ni los tipos de muestra ni el tipo de estudio sugieren una plantilla. Puedes elegirla ahora o después, al corregir la orden."
            : "Ni los tipos de muestra ni el tipo de estudio sugieren una plantilla: elige una para poder crear el reporte.";
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
                    description={
                        <div style={{ display: "grid", gap: 4 }}>
                            <ul style={{ margin: 0, paddingInlineStart: 20 }} data-testid="report-template-candidates">
                                {fallback.candidates.map((c) => {
                                    const names = sampleTypesOf(c.id);
                                    return (
                                        <li key={c.id}>
                                            <strong>{c.name}</strong>
                                            {names.length > 0 && `: ${joinNames(names)}`}
                                        </li>
                                    );
                                })}
                            </ul>
                            <span>
                                {mode === "create"
                                    ? "Elige aquí la plantilla o corrige el tipo de muestra que no corresponda."
                                    : "Elige aquí la plantilla que usará el reporte."}{" "}
                                No se decide por el orden de las muestras ni por el tipo de estudio.
                            </span>
                        </div>
                    }
                />
            )}
            {help && (
                <div style={{ color: tokens.textSecondary, fontSize: 13 }} data-testid="report-template-help">{help}</div>
            )}
        </div>
    );
}
