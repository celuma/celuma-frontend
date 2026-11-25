import { useCallback, useEffect, useMemo, useState } from "react";
import { NumberOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import CelumaButton from "../ui/button";
import CelumaAlert from "../ui/celuma_alert";
import ConfirmDialog from "../ui/confirm_dialog";
import FloatingCaptionInput from "../ui/floating_caption_input";
import SectionTitle from "../ui/section_title";
import { getErrorMessage } from "../../lib/api_error";
import { showCelumaSuccess } from "../../lib/celuma_feedback";
import { useNumberingPreview } from "../../hooks/use_numbering_preview";
import { clearTypeNumbering, listTypeNumbering, saveTypeNumbering } from "../../services/numbering_service";
import {
    composeFormat,
    type EffectiveTypeNumbering,
    type NumberingKind,
    type NumberingPreviewRequest,
    type TypeNumberingEntry,
} from "../../models/numbering";
import {
    Disclosure,
    InheritedSummary,
    NumberField,
    PreviewPanel,
    SeparatorPicker,
    SourceChip,
} from "./numbering_parts";
import { NUMBERING_CSS, TOKEN_HELP, detectSeparator, type Separator } from "../../lib/numbering_ui";

/**
 * Céluma 1.5 (#64): THE editor of one type's optional numbering, shared by Configuración → Numeración (a list
 * row) and the Numeración section of Editar tipo de estudio / Editar tipo de muestra. Same API calls, same
 * preview, same confirmation, so both entry points behave identically.
 *
 * - Shows where the numbering comes from (laboratory default / own configuration, and whether a stored one has
 *   no effect because monthly numbering is off) and the server's read-only estimate.
 * - Editing is inline (progressive disclosure, no stacked dialog). It has its OWN save boundary
 *   («Guardar numeración»): it never submits, resets or discards the surrounding catalog form, and Enter inside
 *   its fields does not submit that form.
 * - Typed values survive a failed preview, save or clear; a retry resends them.
 * - Without `canManage` it is read-only (the API enforces `admin:manage_catalog` anyway).
 * - With no `typeId` (a type not created yet) it explains that the type will use the laboratory's numbering
 *   and, when `onCreateAndConfigure` is given, offers to create the type and continue here.
 */
export interface TypeNumberingSectionProps {
    kind: NumberingKind;
    typeId: string | null;
    typeCode: string;
    typeName?: string;
    canManage: boolean;
    /** Known state (from a list); otherwise the section loads it. */
    entry?: TypeNumberingEntry | null;
    laboratory?: EffectiveTypeNumbering | null;
    /** After a successful save or clear, with the new state. */
    onChanged?: (entry: TypeNumberingEntry) => void;
    /** True while the numbering editor holds unsaved values. */
    onDirtyChange?: (dirty: boolean) => void;
    /** Open the editor immediately (e.g. right after "Crear y configurar numeración"). */
    startEditing?: boolean;
    /** `section` (inside a type editor, with its own heading) or `row` (inside the list, no heading). */
    variant?: "section" | "row";
    onCreateAndConfigure?: () => void;
    creating?: boolean;
    testId?: string;
}

const KIND_TEXT: Record<NumberingKind, { what: string; codes: string }> = {
    order: { what: "Este tipo de estudio define la numeración de sus órdenes.", codes: "órdenes" },
    sample: { what: "Este tipo de muestra define la numeración de sus muestras, aunque la orden tenga muestras de otros tipos.", codes: "muestras" },
};

export default function TypeNumberingSection(props: TypeNumberingSectionProps) {
    const { kind, typeId, canManage, onChanged, onDirtyChange, variant = "section", testId = `type-numbering-${kind}` } = props;
    const [entry, setEntry] = useState<TypeNumberingEntry | null>(props.entry ?? null);
    // The loaded state is authoritative (a type created a moment ago may not be in the caller's list yet).
    const typeCode = entry?.code || props.typeCode;
    const typeName = entry?.name || props.typeName;
    const [lab, setLab] = useState<EffectiveTypeNumbering | null>(props.laboratory ?? null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(false);
    const [format, setFormat] = useState("");
    const [separator, setSeparator] = useState<Separator>("none");
    const [width, setWidth] = useState<number | null>(2);
    const [startValue, setStartValue] = useState<number | null>(1);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [clearError, setClearError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => { if (props.entry !== undefined) setEntry(props.entry); }, [props.entry]);
    useEffect(() => { if (props.laboratory !== undefined) setLab(props.laboratory); }, [props.laboratory]);

    const load = useCallback(async () => {
        if (!typeId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const list = await listTypeNumbering(kind);
            setLab(list.laboratory);
            setEntry((list.types ?? []).find((t) => t.type_id === typeId) ?? null);
        } catch (err) {
            setLoadError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [kind, typeId]);

    // Loads when nothing was handed in (the type editors); always fresh, so a change made from the other
    // entry point is shown the next time this one opens.
    useEffect(() => {
        if (typeId && props.entry === undefined) void load();
    }, [typeId, props.entry, load]);

    const scope = lab?.scope ?? "tenant";
    const openEditor = useCallback((from: TypeNumberingEntry) => {
        const base = from.override ?? from.effective;
        setFormat(base.format);
        setSeparator(detectSeparator(base.format, from.effective.scope));
        setWidth(base.sequence_min_width);
        setStartValue(base.start_value);
        setSaveError(null);
        setStatus(null);
        setEditing(true);
    }, []);

    useEffect(() => {
        if (props.startEditing && entry && canManage && !editing) openEditor(entry);
        // only when asked to start editing and the state first arrives
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.startEditing, entry?.type_id]);

    const baseline = entry ? entry.override ?? entry.effective : null;
    const changed = editing && !!baseline && (format !== baseline.format || width !== baseline.sequence_min_width || startValue !== baseline.start_value);
    useEffect(() => { onDirtyChange?.(editing && changed); }, [editing, changed, onDirtyChange]);

    const fieldsValid = width !== null && width >= 1 && width <= 6 && startValue !== null && startValue >= 1 && startValue <= 99_999_999 && format.trim() !== "";
    const previewRequest: NumberingPreviewRequest | null = useMemo(() => {
        if (!typeId || !entry) return null;
        if (!editing) return { entity_kind: kind, scope_id: typeId, layer: "effective" };
        if (!fieldsValid) return null;
        return { entity_kind: kind, scope_id: typeId, layer: "effective", format, sequence_min_width: width!, start_value: startValue! };
    }, [typeId, entry, editing, fieldsValid, kind, format, width, startValue]);
    const preview = useNumberingPreview(previewRequest);
    const previewInvalid = editing && preview.preview && !preview.stale && !preview.preview.valid;

    const save = async () => {
        if (!typeId || !fieldsValid) return;
        setSaving(true);
        setSaveError(null);
        try {
            const next = await saveTypeNumbering(kind, typeId, { format, sequence_min_width: width!, start_value: startValue! });
            setEntry(next);
            setEditing(false);
            setStatus("Numeración propia guardada. Aplica a los registros nuevos; los códigos ya emitidos no cambian.");
            showCelumaSuccess("Numeración del tipo guardada", "Aplica a los registros nuevos; los códigos ya emitidos no cambian.");
            onChanged?.(next);
        } catch (err) {
            setSaveError(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const clear = async () => {
        if (!typeId) return;
        setClearing(true);
        setClearError(null);
        try {
            const next = await clearTypeNumbering(kind, typeId);
            setEntry(next);
            setEditing(false);
            setConfirmClear(false);
            setStatus("El tipo vuelve a usar la numeración del laboratorio. Los códigos ya emitidos no cambian.");
            showCelumaSuccess("Numeración del laboratorio restablecida", "Los códigos ya emitidos no cambian y el consecutivo continúa.");
            onChanged?.(next);
        } catch (err) {
            setClearError(getErrorMessage(err));
        } finally {
            setClearing(false);
        }
    };

    const heading = variant === "section" ? (
        <SectionTitle icon={<NumberOutlined />} style={{ marginBottom: 4 }}>Numeración</SectionTitle>
    ) : null;

    // ── A type that does not exist yet ───────────────────────────────────────────────────────────────────
    if (!typeId) {
        return (
            <section aria-label="Numeración" style={{ display: "grid", gap: 10 }} data-testid={testId}>
                {heading}
                <SourceChip source="laboratory" />
                <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                    Al crearlo, este tipo usará la numeración del laboratorio. Podrás darle una numeración propia en cuanto exista
                    {props.onCreateAndConfigure ? "." : ", desde «Editar» o en Configuración → Numeración."}
                </div>
                {props.onCreateAndConfigure && canManage && (
                    <div>
                        <CelumaButton size="small" onClick={props.onCreateAndConfigure} loading={props.creating} data-testid={`${testId}-create-and-configure`}>
                            Crear y configurar numeración
                        </CelumaButton>
                    </div>
                )}
            </section>
        );
    }

    return (
        // Enter inside these fields must never submit the surrounding catalog form.
        <section
            aria-label="Numeración" className="celuma-numbering" style={{ display: "grid", gap: 12 }} data-testid={testId}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}
        >
            <style>{NUMBERING_CSS}</style>
            {heading}
            {variant === "section" && <div style={{ fontSize: 13, color: tokens.textSecondary }}>{KIND_TEXT[kind].what}</div>}

            {loadError && (
                <CelumaAlert
                    type="error" showIcon message="No se pudo cargar la numeración de este tipo."
                    description={<span>{loadError} <CelumaButton size="xsmall" onClick={() => void load()} data-testid={`${testId}-reload`}>Reintentar</CelumaButton></span>}
                />
            )}
            {loading && !entry && <div style={{ fontSize: 13, color: tokens.textSecondary }} aria-live="polite">Cargando numeración…</div>}

            {entry && lab && (
                <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <SourceChip source={entry.source} inactive={!lab.active} testId={`${testId}-source`} />
                        {canManage && !editing && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <CelumaButton size="small" type={entry.source === "type" ? "default" : "primary"} onClick={() => openEditor(entry)} data-testid={`${testId}-edit`}
                                    aria-label={entry.source === "type" ? `Editar la numeración propia de ${typeName ?? typeCode}` : `Configurar numeración propia de ${typeName ?? typeCode}`}>
                                    {entry.source === "type" ? "Editar numeración" : "Configurar numeración propia"}
                                </CelumaButton>
                                {entry.source === "type" && (
                                    <CelumaButton size="small" danger onClick={() => { setClearError(null); setConfirmClear(true); }} data-testid={`${testId}-clear`}
                                        aria-label={`Usar la numeración del laboratorio para ${typeName ?? typeCode}`}>
                                        Usar la del laboratorio
                                    </CelumaButton>
                                )}
                            </div>
                        )}
                    </div>
                    {!canManage && (
                        <div style={{ fontSize: 13, color: tokens.textSecondary }} data-testid={`${testId}-readonly`}>
                            Solo quien administra el catálogo puede cambiar la numeración de este tipo.
                        </div>
                    )}
                    {status && <div role="status" style={{ fontSize: 13, color: "#047857" }} data-testid={`${testId}-status`}>{status}</div>}

                    <div className={`celuma-numbering-grid${variant === "row" ? " two" : ""}`}>
                        <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
                            {!editing && (
                                <div style={{ fontSize: 13, color: tokens.textPrimary, display: "grid", gap: 4 }} data-testid={`${testId}-effective`}>
                                    <span><span style={{ color: tokens.textSecondary }}>Formato que se aplica:</span> <code>{entry.effective.format}</code></span>
                                    <span><span style={{ color: tokens.textSecondary }}>Ancho mínimo:</span> {entry.effective.sequence_min_width} · <span style={{ color: tokens.textSecondary }}>Valor inicial:</span> {entry.effective.start_value}</span>
                                    {entry.source === "type" && !lab.active && (
                                        <span style={{ color: "#92400e" }}>La configuración propia está guardada, pero mientras la numeración mensual esté desactivada se usa el formato anterior (CÓDIGO-n).</span>
                                    )}
                                </div>
                            )}
                            {editing && (
                                <div style={{ display: "grid", gap: 14 }} data-testid={`${testId}-editor`}>
                                    <div style={{ fontSize: 13, color: tokens.textSecondary }}>
                                        {entry.source === "type" ? "Editando la numeración propia de este tipo." : "Al guardar, este tipo dejará de usar la numeración del laboratorio."}{" "}
                                        Su consecutivo continúa: cambiarla o quitarla nunca reinicia el contador ni reutiliza códigos.
                                    </div>
                                    <div style={{ display: "grid", gap: 6 }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>Separador</span>
                                        <SeparatorPicker
                                            value={separator} base={typeCode} scope={scope} testId={`${testId}-separator`}
                                            onChange={(next) => { setSeparator(next); if (next !== "custom") setFormat(composeFormat(next, scope)); }}
                                        />
                                    </div>
                                    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                                        <NumberField label="Ancho mínimo del consecutivo" value={width} onChange={setWidth} min={1} max={6} testId={`${testId}-width`} />
                                        <NumberField label="Valor inicial" value={startValue} onChange={setStartValue} min={1} max={99_999_999} testId={`${testId}-start`} />
                                    </div>
                                    <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                                        El ancho es un mínimo (a partir de 100 el número crece). El valor inicial solo adelanta el contador; bajarlo nunca lo retrocede.
                                    </div>
                                    <Disclosure title="Formato avanzado" hint={separator === "custom" ? "personalizado" : undefined} defaultOpen={separator === "custom"} testId={`${testId}-advanced`}>
                                        <FloatingCaptionInput
                                            label="Formato" value={format} maxLength={60} data-testid={`${testId}-format`} aria-label="Formato"
                                            onChange={(e) => { setFormat(e.target.value); setSeparator(detectSeparator(e.target.value, scope)); }}
                                            error={format.trim() === "" ? "El formato es obligatorio." : undefined}
                                        />
                                        <span style={{ fontSize: 12, color: tokens.textSecondary }}>{TOKEN_HELP}</span>
                                        <InheritedSummary active={lab.active} scope={lab.scope} timezone={lab.timezone} labFormat={lab.format} testId={`${testId}-inherited`} />
                                    </Disclosure>
                                </div>
                            )}
                        </div>
                        <PreviewPanel
                            preview={preview.preview} loading={preview.loading} error={preview.error} stale={preview.stale} onRetry={preview.retry}
                            testId={`${testId}-preview`}
                            emptyHint={editing && !fieldsValid ? "Completa el ancho, el valor inicial y el formato para ver el ejemplo." : undefined}
                            sourceNote={!editing && entry.source === "laboratory" ? "Usa la numeración del laboratorio." : undefined}
                        />
                    </div>
                    {editing && (
                        // The save bar follows the preview, so on one column the example stays next to the fields.
                        <div style={{ display: "grid", gap: 10 }}>
                            {saveError && (
                                <CelumaAlert
                                    type="error" showIcon message="No se guardó la numeración. Tus cambios siguen aquí."
                                    description={<span data-testid={`${testId}-save-error`}>{saveError}</span>}
                                />
                            )}
                            {changed && (
                                <div style={{ fontSize: 12, color: "#92400e" }}>Cambios de numeración sin guardar.</div>
                            )}
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                <CelumaButton size="small" onClick={() => { setEditing(false); setSaveError(null); }} disabled={saving} data-testid={`${testId}-cancel`}>
                                    Cancelar
                                </CelumaButton>
                                <CelumaButton
                                    size="small" type="primary" onClick={() => void save()} loading={saving}
                                    disabled={!fieldsValid || !!previewInvalid || (entry.source === "type" && !changed)}
                                    data-testid={`${testId}-save`}
                                >
                                    {saveError ? "Reintentar guardar" : "Guardar numeración"}
                                </CelumaButton>
                            </div>
                            <div style={{ fontSize: 12, color: tokens.textSecondary }}>
                                «Guardar numeración» guarda solo la numeración de este tipo{variant === "section" ? "; los demás datos del tipo se guardan con «Guardar cambios»" : ""}.
                            </div>
                        </div>
                    )}
                </>
            )}

            <ConfirmDialog
                open={confirmClear}
                danger
                title="¿Usar la numeración del laboratorio?"
                description={`${typeName ?? typeCode} dejará su configuración propia. Las ${KIND_TEXT[kind].codes} nuevas de este tipo usarán la numeración del laboratorio.`}
                confirmText="Sí, usar la del laboratorio"
                cancelText="Conservar la propia"
                loading={clearing}
                onCancel={() => setConfirmClear(false)}
                onConfirm={() => void clear()}
            >
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: tokens.textSecondary }}>
                    <li>Los códigos ya emitidos no cambian.</li>
                    <li>El consecutivo de este tipo continúa; no se reinicia.</li>
                </ul>
                {clearError && (
                    <div role="alert" style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }} data-testid={`${testId}-clear-error`}>
                        No se pudo quitar la configuración: {clearError}. Puedes reintentar.
                    </div>
                )}
            </ConfirmDialog>
        </section>
    );
}
