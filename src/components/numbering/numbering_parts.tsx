/**
 * Céluma 1.5 (#64): building blocks shared by Configuración → Numeración and the Numeración section of the
 * study-type / sample-type editors. Presentation only, on top of the Céluma components (Panel, CelumaButton,
 * FloatingCaptionInput, CelumaAlert) and tokens; every rule is still the API's.
 *
 * Contrast (brand system): small teal text uses the accessible ink `#1f7a75`, salmon stays an accent, and every
 * status carries an icon and words, never color alone.
 */
import { useId, useState, type ReactNode } from "react";
import {
    BankOutlined,
    CheckOutlined,
    DownOutlined,
    ExclamationCircleOutlined,
    LoadingOutlined,
    PauseCircleOutlined,
    RightOutlined,
    SettingOutlined,
} from "@ant-design/icons";
import { tokens } from "../design/tokens";
import Panel from "../ui/panel";
import CelumaButton from "../ui/button";
import CelumaAlert from "../ui/celuma_alert";
import FloatingCaptionInput from "../ui/floating_caption_input";
import { composeFormat, type NumberingConfigSource, type NumberingPreview, type NumberingScope } from "../../models/numbering";
import { TEAL_INK, TEAL_TINT, type Separator } from "../../lib/numbering_ui";
import { monthLabel } from "../../lib/numbering_example";


const chipBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "3px 10px",
    fontSize: 12, fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap",
};

const SOURCE_CHIP: Record<NumberingConfigSource, { label: string; icon: ReactNode; style: React.CSSProperties }> = {
    laboratory: {
        label: "Predeterminada del laboratorio", icon: <BankOutlined aria-hidden />,
        style: { color: "#334155", background: "#f1f5f9", border: "1px solid #e2e8f0" },
    },
    type: {
        label: "Configuración propia", icon: <SettingOutlined aria-hidden />,
        style: { color: TEAL_INK, background: TEAL_TINT, border: `1px solid ${tokens.primary}55` },
    },
};

/** Where a type's numbering comes from; `inactive` adds that a stored configuration has no effect yet. */
export function SourceChip({ source, inactive = false, testId }: { source: NumberingConfigSource; inactive?: boolean; testId?: string }) {
    const cfg = SOURCE_CHIP[source];
    return (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }} data-testid={testId}>
            <span style={{ ...chipBase, ...cfg.style }}>{cfg.icon}{cfg.label}</span>
            {inactive && source === "type" && (
                <span style={{ ...chipBase, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a" }} data-testid={testId ? `${testId}-inactive` : undefined}>
                    <PauseCircleOutlined aria-hidden />Guardada, sin efecto hasta activar la numeración mensual
                </span>
            )}
        </span>
    );
}


/** Separator presets as a Céluma segmented choice (buttons with `aria-pressed`, keyboard reachable). */
export function SeparatorPicker({ value, onChange, base, scope, testId }: {
    value: Separator; onChange: (next: Separator) => void; base: string; scope: NumberingScope; testId?: string;
}) {
    const sample = (s: "none" | "hyphen") => composeFormat(s, scope)
        .replace("{BASE}", base).replace("{BRANCH}", "SUC").replace("{SEQ}", "01").replace("{MM}", "10").replace("{YY}", "26");
    const options: Array<{ key: Separator; label: ReactNode; aria: string }> = [
        { key: "none", label: <>Sin separador <code style={codeInline}>{sample("none")}</code></>, aria: `Sin separador, por ejemplo ${sample("none")}` },
        { key: "hyphen", label: <>Con guion <code style={codeInline}>{sample("hyphen")}</code></>, aria: `Con guion, por ejemplo ${sample("hyphen")}` },
        { key: "custom", label: "Personalizado", aria: "Formato personalizado" },
    ];
    return (
        <div role="group" aria-label="Separador" style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid={testId}>
            {options.map((o) => (
                <ChoiceButton key={o.key} pressed={value === o.key} ariaLabel={o.aria} onClick={() => onChange(o.key)}>
                    {o.label}
                </ChoiceButton>
            ))}
        </div>
    );
}

/**
 * One option of a Céluma choice group: outline when off; teal tint, accessible teal ink (#1f7a75 on #eaf7f5)
 * and a check icon when on, so the state never depends on color alone (the filled teal + white text of the
 * primary button is reserved for actions).
 */
export function ChoiceButton({ pressed, onClick, children, ariaLabel }: {
    pressed: boolean; onClick: () => void; children: ReactNode; ariaLabel?: string;
}) {
    return (
        <CelumaButton
            size="small" aria-pressed={pressed} aria-label={ariaLabel} onClick={onClick}
            icon={pressed ? <CheckOutlined aria-hidden /> : undefined}
            style={pressed ? { background: TEAL_TINT, borderColor: tokens.primary, color: TEAL_INK, fontWeight: 700 } : undefined}
        >
            {children}
        </CelumaButton>
    );
}

const codeInline: React.CSSProperties = { fontSize: 12, background: "rgba(13,27,42,.06)", borderRadius: 6, padding: "0 5px" };

/** A whole-number field (digits only) with a floating caption and an inline error. */
export function NumberField({ label, value, onChange, min, max, error, testId, id }: {
    label: string; value: number | null; onChange: (v: number | null) => void; min: number; max: number;
    error?: string; testId?: string; id?: string;
}) {
    const rangeError = value === null ? "Escribe un número." : value < min || value > max ? `Entre ${min} y ${max.toLocaleString("es-MX")}.` : undefined;
    return (
        <FloatingCaptionInput
            id={id}
            label={label}
            inputMode="numeric"
            value={value === null ? "" : String(value)}
            onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                onChange(digits === "" ? null : Number(digits));
            }}
            error={error ?? rangeError}
            data-testid={testId}
            aria-label={label}
        />
    );
}

/** A labelled disclosure for supporting options (keyboard: Enter/Space toggle; `aria-expanded`). */
export function Disclosure({ title, hint, children, defaultOpen = false, testId }: {
    title: string; hint?: string; children: ReactNode; defaultOpen?: boolean; testId?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const id = useId();
    return (
        <div style={{ display: "grid", gap: 10 }}>
            <button
                type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
                className="celuma-disclosure" data-testid={testId}
                style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", background: "none", border: "none", padding: "4px 2px",
                    color: TEAL_INK, fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left", borderRadius: 8,
                }}
            >
                {open ? <DownOutlined aria-hidden /> : <RightOutlined aria-hidden />}
                <span style={{ whiteSpace: "nowrap" }}>{title}</span>
                {hint && <span style={{ color: tokens.textSecondary, fontWeight: 500, fontSize: 13 }}>{hint}</span>}
            </button>
            <div id={id} hidden={!open} style={{ display: open ? "grid" : "none", gap: 14 }}>{children}</div>
        </div>
    );
}


/**
 * The read-only server estimate next to the controls: the next code, its month and zone, a few boundary
 * examples, and the plain statement that nothing is reserved. Shows loading, stale, error and invalid states.
 */
export function PreviewPanel({ preview, loading, error, stale, onRetry, sourceNote, testId, emptyHint }: {
    preview: NumberingPreview | null; loading: boolean; error: string | null; stale: boolean; onRetry: () => void;
    sourceNote?: ReactNode; testId?: string; emptyHint?: string;
}) {
    const invalid = preview && !preview.valid;
    const estimate = preview?.valid ? preview.estimate : null;
    return (
        <Panel style={{ display: "grid", gap: 10, background: "#fff", borderColor: "#e8eeec" }} data-testid={testId}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 700, color: tokens.textPrimary, fontSize: 14 }}>Ejemplo del próximo código</span>
                <span aria-live="polite" style={{ fontSize: 12, color: tokens.textSecondary, display: "inline-flex", gap: 6, alignItems: "center" }}>
                    {loading ? <><LoadingOutlined aria-hidden /> Actualizando…</> : stale ? "Desactualizado" : null}
                </span>
            </div>
            {error && (
                <CelumaAlert
                    type="error" showIcon
                    message="No se pudo calcular la vista previa. Tus cambios siguen aquí."
                    description={<span>{error} <CelumaButton size="xsmall" onClick={onRetry} data-testid={testId ? `${testId}-retry` : undefined}>Reintentar</CelumaButton></span>}
                />
            )}
            {invalid && (
                <div role="alert" style={{ display: "flex", gap: 8, color: "#b91c1c", background: "#fef2f2", borderRadius: 10, padding: "8px 10px", fontSize: 13 }} data-testid={testId ? `${testId}-errors` : undefined}>
                    <ExclamationCircleOutlined aria-hidden style={{ marginTop: 2 }} />
                    <span><strong>Formato no válido:</strong> {preview.errors.join("; ")}</span>
                </div>
            )}
            {preview?.valid && (
                <>
                    <div
                        style={{ fontFamily: tokens.titleFont, fontSize: 28, fontWeight: 800, color: tokens.textPrimary, overflowWrap: "anywhere", opacity: stale ? 0.55 : 1 }}
                        data-testid={testId ? `${testId}-code` : undefined}
                    >
                        {estimate?.code ?? preview.examples[0]?.code ?? "—"}
                    </div>
                    <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                        {preview.scheme === "legacy"
                            ? "Formato anterior (CÓDIGO-n): la numeración mensual no está activa."
                            : `Mes de ${monthLabel(preview.period_year, preview.period_month)} · zona ${preview.timezone}`}
                    </div>
                    {preview.examples.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Ejemplos por consecutivo">
                            {preview.examples.filter((e) => [1, 2, 10, 100].includes(e.sequence)).map((e) => (
                                <span key={e.sequence} style={{ fontSize: 12, background: "#f1f5f9", color: "#334155", borderRadius: 8, padding: "2px 8px" }}>
                                    <span style={{ color: tokens.textSecondary }}>n.º {e.sequence}:</span> {e.code}
                                </span>
                            ))}
                        </div>
                    )}
                    {sourceNote && <div style={{ fontSize: 13, color: tokens.textPrimary }}>{sourceNote}</div>}
                </>
            )}
            {!preview && !error && !loading && emptyHint && <div style={{ fontSize: 13, color: tokens.textSecondary }}>{emptyHint}</div>}
            <div style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={testId ? `${testId}-notice` : undefined}>
                Es una estimación: no reserva ningún número. El código real se asigna al registrar y puede ser distinto.
            </div>
        </Panel>
    );
}

/** Settings that always come from the laboratory, shown as a compact read-only list. */
export function InheritedSummary({ active, scope, timezone, labFormat, testId }: {
    active: boolean; scope: NumberingScope; timezone: string; labFormat?: string; testId?: string;
}) {
    const row = (k: string, v: ReactNode) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><span style={{ color: tokens.textSecondary, minWidth: 150 }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
    );
    return (
        <Panel style={{ display: "grid", gap: 6, fontSize: 13 }} data-testid={testId}>
            <span style={{ fontWeight: 700 }}>Siempre del laboratorio</span>
            {row("Numeración mensual", active ? "Activa" : "Sin activar (se usa CÓDIGO-n)")}
            {row("Alcance del contador", scope === "branch" ? "Por sucursal" : "Todo el laboratorio")}
            {row("Zona horaria", timezone)}
            {labFormat && row("Formato del laboratorio", <code style={codeInline}>{labFormat}</code>)}
        </Panel>
    );
}

