import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "antd";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import CelumaAlert from "../components/ui/celuma_alert";
import CelumaSwitch from "../components/ui/celuma_switch";
import CelumaTabs from "../components/ui/celuma_tabs";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import Panel from "../components/ui/panel";
import SectionTitle from "../components/ui/section_title";
import { getErrorMessage } from "../lib/api_error";
import { showCelumaSuccess } from "../lib/celuma_feedback";
import { apiGet } from "../lib/api_fetch";
import { getNumberingConfigs, listTypeNumbering, saveNumberingConfig } from "../services/numbering_service";
import { listSampleTypes } from "../services/sample_type_service";
import { catalogTypeOptions } from "../lib/catalog_type_options";
import { catalogTypeSelectProps } from "../components/ui/catalog_type_select";
import { useNumberingPreview } from "../hooks/use_numbering_preview";
import TypeNumberingCard from "../components/numbering/type_numbering_card";
import {
    ChoiceButton,
    Disclosure,
    NumberField,
    PreviewPanel,
    SeparatorPicker,
} from "../components/numbering/numbering_parts";
import { NUMBERING_CSS, TOKEN_HELP, detectSeparator, type Separator } from "../lib/numbering_ui";
import {
    DEFAULT_NUMBERING_FORMAT,
    composeFormat,
    timezoneOptions,
    type NumberingConfig,
    type NumberingKind,
    type NumberingPreviewRequest,
    type NumberingScope,
    type TypeNumberingList,
} from "../models/numbering";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

interface CatalogOption {
    id: string;
    code: string;
    name: string;
}

const KIND_TEXT: Record<NumberingKind, { tab: string; title: string; subtitle: string; scopeLabel: string; plural: string }> = {
    order: {
        tab: "Órdenes",
        title: "Numeración predeterminada de órdenes",
        subtitle: "La usan los tipos de estudio sin configuración propia. Un contador por tipo de estudio y mes; el prefijo es el código del tipo de estudio.",
        scopeLabel: "Tipo de estudio del ejemplo",
        plural: "órdenes",
    },
    sample: {
        tab: "Muestras",
        title: "Numeración predeterminada de muestras",
        subtitle: "La usan los tipos de muestra sin configuración propia. Un contador por tipo de muestra y mes, independiente del de las órdenes; el mes sale de la fecha de recepción.",
        scopeLabel: "Tipo de muestra del ejemplo",
        plural: "muestras",
    },
};

interface CardProps {
    kind: NumberingKind;
    config: NumberingConfig;
    options: CatalogOption[];
    /** #64: ids of the types of this kind that have their own numbering (the laboratory preview does not apply to them). */
    ownTypeIds?: ReadonlySet<string>;
    onSaved: (config: NumberingConfig) => void;
}

function ChoiceButtons<T extends string>({ value, onChange, options, label, testId }: {
    value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string; testId?: string;
}) {
    return (
        <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid={testId}>
            {options.map((o) => (
                <ChoiceButton key={o.value} pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</ChoiceButton>
            ))}
        </div>
    );
}

/**
 * The laboratory's numbering of one kind (the default every type without its own configuration uses): activation,
 * separator, width and start value on the common path; custom format, scope and timezone under «Opciones
 * avanzadas»; the read-only server estimate beside the controls.
 */
function LabNumberingCard({ kind, config, options, ownTypeIds, onSaved }: CardProps) {
    const text = KIND_TEXT[kind];
    const zoneOptions = useMemo(() => timezoneOptions().map((z) => ({ value: z, label: z })), []);
    const [active, setActive] = useState(config.active);
    const [scope, setScope] = useState<NumberingScope>(config.scope);
    const [startValue, setStartValue] = useState<number | null>(config.start_value);
    const [format, setFormat] = useState(config.format);
    const [separator, setSeparator] = useState<Separator>(detectSeparator(config.format, config.scope));
    const [width, setWidth] = useState<number | null>(config.sequence_min_width);
    const [timezone, setTimezone] = useState(config.timezone);
    // Céluma 1.5 (#69): the preview's study/sample type, stable alphabetical order, searchable by name or code.
    const scopeOptions = useMemo(() => catalogTypeOptions(options), [options]);
    const scopeSelect = useMemo(() => catalogTypeSelectProps(scopeOptions), [scopeOptions]);
    const [scopeId, setScopeId] = useState<string | undefined>(scopeOptions[0]?.value);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    const reset = useCallback(() => {
        setActive(config.active);
        setScope(config.scope);
        setStartValue(config.start_value);
        setFormat(config.format);
        setSeparator(detectSeparator(config.format, config.scope));
        setWidth(config.sequence_min_width);
        setTimezone(config.timezone);
    }, [config]);
    useEffect(() => { reset(); }, [reset]);

    useEffect(() => {
        if (!scopeId && scopeOptions[0]) setScopeId(scopeOptions[0].value);
    }, [scopeOptions, scopeId]);

    const chooseSeparator = (next: Separator) => {
        setSeparator(next);
        if (next !== "custom") setFormat(composeFormat(next, scope));
    };
    const chooseScope = (next: NumberingScope) => {
        setScope(next);
        // A branch scope needs {BRANCH}, a tenant scope must not have it.
        if (separator !== "custom") setFormat(composeFormat(separator, next));
        else if (next === "tenant") setFormat((f) => f.replace(/\{BRANCH\}-?/g, ""));
    };

    const fieldsValid = width !== null && width >= 1 && width <= 6 && startValue !== null && startValue >= 1 && startValue <= 99_999_999 && format.trim() !== "";
    const request: NumberingPreviewRequest | null = fieldsValid ? {
        entity_kind: kind, active, format, sequence_min_width: width!, start_value: startValue!, scope, timezone, scope_id: scopeId,
        // This card edits the LABORATORY's numbering, so preview it even for a type with its own.
        layer: "laboratory",
    } : null;
    const preview = useNumberingPreview(request);

    const dirty =
        active !== config.active || scope !== config.scope || startValue !== config.start_value || format !== config.format ||
        width !== config.sequence_min_width || timezone !== config.timezone;
    const invalid = !!preview.preview && !preview.stale && !preview.preview.valid;

    const handleSave = async () => {
        if (!fieldsValid) return;
        setSaving(true);
        setSaveError(null);
        try {
            // The retired manual-code policy is never sent: the server keeps whatever is stored.
            const saved = await saveNumberingConfig(kind, {
                active, format, sequence_min_width: width!, start_value: startValue!, scope, timezone,
            });
            setStatus("Numeración guardada. Aplica a los registros nuevos; los códigos existentes no cambian.");
            showCelumaSuccess("Numeración guardada", "Aplica a los registros nuevos; los códigos existentes no cambian.");
            onSaved(saved);
        } catch (err) {
            setSaveError(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card style={{ ...cardStyle, minWidth: 0 }} data-testid={`numbering-card-${kind}`}>
            <SectionTitle>{text.title}</SectionTitle>
            <p style={{ margin: "0 0 16px", color: tokens.textSecondary, fontSize: 14 }}>{text.subtitle}</p>
            <div className="celuma-numbering-grid two">
                <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
                    <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>Numeración mensual</div>
                            <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }} data-testid={active ? undefined : `inactive-note-${kind}`}>
                                {active
                                    ? "Las " + text.plural + " nuevas usan este formato mensual. Los códigos ya emitidos no cambian ni se reutilizan."
                                    : `Sin activar, las ${text.plural} nuevas se numeran con el formato anterior (CÓDIGO-n), también de forma automática.`}
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: active ? "#1f7a75" : tokens.textSecondary }}>{active ? "Activa" : "Sin activar"}</span>
                            <CelumaSwitch checked={active} onChange={setActive} aria-label={`Numeración mensual de ${text.plural}`} data-testid={`active-${kind}`} />
                        </div>
                    </Panel>

                    <div style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>Separador</span>
                        <SeparatorPicker value={separator} onChange={chooseSeparator} base="CU" scope={scope} testId={`separator-${kind}`} />
                    </div>
                    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                        <NumberField label="Ancho mínimo del consecutivo" value={width} onChange={setWidth} min={1} max={6} testId={`width-${kind}`} />
                        <NumberField label="Valor inicial" value={startValue} onChange={setStartValue} min={1} max={99_999_999} testId={`start-${kind}`} />
                    </div>
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                        El ancho es un mínimo: a partir de 100 el consecutivo crece (CU1001026) sin truncarse. El valor inicial es el primer
                        consecutivo de cada contador nuevo; subirlo adelanta los contadores, bajarlo nunca los retrocede.
                    </span>

                    <Disclosure title="Opciones avanzadas" hint="formato personalizado, alcance y zona horaria" defaultOpen={separator === "custom"} testId={`advanced-${kind}`}>
                        <FloatingCaptionInput
                            label="Formato" value={format} maxLength={60} aria-label="Formato" data-testid={`format-${kind}`}
                            onChange={(e) => { setFormat(e.target.value); setSeparator(detectSeparator(e.target.value, scope)); }}
                            error={format.trim() === "" ? "El formato es obligatorio." : undefined}
                        />
                        <span style={{ fontSize: 12, color: tokens.textSecondary }}>Predeterminado: <code>{DEFAULT_NUMBERING_FORMAT}</code>. {TOKEN_HELP}</span>
                        <div style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>Alcance del contador</span>
                            <ChoiceButtons
                                value={scope} onChange={chooseScope} label="Alcance del contador" testId={`scope-${kind}`}
                                options={[{ value: "tenant", label: "Todo el laboratorio" }, { value: "branch", label: "Por sucursal (incluye {BRANCH})" }]}
                            />
                            {scope === "branch" && (
                                <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                                    Cada sucursal lleva su propio consecutivo y su código forma parte del código, para que dos sucursales nunca produzcan el mismo.
                                </span>
                            )}
                        </div>
                        <FloatingCaptionSelect
                            label="Zona horaria de la numeración" value={timezone} onChange={(v) => v && setTimezone(v)} options={zoneOptions}
                            showSearch data-testid={`timezone-${kind}`}
                        />
                        <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                            Define el mes (MM/AA) de los contadores de todo el laboratorio, sin importar qué sucursal registre. Con alcance por sucursal se
                            usa la zona de cada sucursal. Cambiarla nunca reinicia contadores ni reutiliza códigos.
                        </span>
                    </Disclosure>

                    <div style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={`registration-${kind}`}>
                        Los códigos se generan siempre de forma automática al registrar. Corregir el código de una muestra después de registrarla es una
                        acción aparte y auditada.
                    </div>
                    {config.legacy_manual_policy && (
                        <CelumaAlert
                            type="info" showIcon style={{ marginBottom: 0 }}
                            message={<span data-testid={`legacy-policy-${kind}`}>Este laboratorio tenía la política antigua «código manual obligatorio». Ya no tiene efecto: el registro siempre es automático. El valor guardado no se modificó.</span>}
                        />
                    )}
                </div>

                <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                    {options.length > 0 && (
                        <FloatingCaptionSelect
                            label={text.scopeLabel}
                            value={scopeId}
                            onChange={(v) => setScopeId(v)}
                            options={scopeOptions}
                            showSearch
                            selectProps={scopeSelect}
                            data-testid={`preview-type-${kind}`}
                        />
                    )}
                    {scopeId && ownTypeIds?.has(scopeId) && (
                        <CelumaAlert
                            type="info" showIcon style={{ marginBottom: 0 }}
                            message={<span data-testid={`own-type-note-${kind}`}>Este tipo tiene configuración propia: el ejemplo muestra la numeración del laboratorio, que usaría si se la quitas.</span>}
                        />
                    )}
                    <PreviewPanel
                        preview={preview.preview} loading={preview.loading} error={preview.error} stale={preview.stale} onRetry={preview.retry}
                        testId={`preview-${kind}`}
                        emptyHint={!fieldsValid ? "Completa el ancho, el valor inicial y el formato para ver el ejemplo." : undefined}
                    />
                    {preview.preview?.valid && preview.preview.estimate && (
                        <span className="ct-sr" data-testid={`estimate-${kind}`}>Próximo código estimado: {preview.preview.estimate.code}</span>
                    )}
                </div>
            </div>
            {/* The save bar follows the preview, so on one column the example stays next to the controls. */}
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                {saveError && (
                    <CelumaAlert type="error" showIcon message="No se guardó la numeración. Tus cambios siguen aquí." description={<span data-testid={`save-error-${kind}`}>{saveError}</span>} />
                )}
                {status && !dirty && <div role="status" style={{ fontSize: 13, color: "#047857" }}>{status}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                    <CelumaButton onClick={() => { reset(); setSaveError(null); }} disabled={!dirty || saving}>Descartar cambios</CelumaButton>
                    <CelumaButton type="primary" onClick={() => void handleSave()} loading={saving} disabled={!dirty || !fieldsValid || invalid} data-testid={`save-${kind}`}>
                        {saveError ? "Reintentar guardar" : "Guardar"}
                    </CelumaButton>
                </div>
            </div>
        </Card>
    );
}

/**
 * Configuración → Numeración (Céluma 1.4 #8; per-type numbering 1.5 #64). One tab per kind; each tab first shows the
 * laboratory's default numbering, then the optional numbering of each study type (orders) or sample type
 * (samples). Gated on `admin:manage_catalog` (the permission the API enforces on every write). Changes affect
 * only registrations made after saving.
 */
export default function NumberingSettings({ embedded = true }: { embedded?: boolean }) {
    const [configs, setConfigs] = useState<{ order: NumberingConfig; sample: NumberingConfig } | null>(null);
    const [studyTypes, setStudyTypes] = useState<CatalogOption[]>([]);
    const [sampleTypes, setSampleTypes] = useState<CatalogOption[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<NumberingKind>("order");
    const [typeLists, setTypeLists] = useState<{ order: TypeNumberingList | null; sample: TypeNumberingList | null }>({ order: null, sample: null });
    const [typeErrors, setTypeErrors] = useState<{ order: string | null; sample: string | null }>({ order: null, sample: null });
    const [typeReload, setTypeReload] = useState(0);

    const loadConfigs = useCallback(() => {
        setError(null);
        getNumberingConfigs().then(setConfigs).catch((err) => setError(getErrorMessage(err)));
    }, []);

    useEffect(() => {
        let alive = true;
        for (const kind of ["order", "sample"] as const) {
            listTypeNumbering(kind)
                .then((list) => {
                    if (!alive) return;
                    setTypeLists((prev) => ({ ...prev, [kind]: list }));
                    setTypeErrors((prev) => ({ ...prev, [kind]: null }));
                })
                .catch((err) => alive && setTypeErrors((prev) => ({ ...prev, [kind]: getErrorMessage(err) })));
        }
        return () => { alive = false; };
    }, [typeReload]);

    const ownTypeIds = useMemo(() => ({
        order: new Set((typeLists.order?.types ?? []).filter((t) => t.source === "type").map((t) => t.type_id)),
        sample: new Set((typeLists.sample?.types ?? []).filter((t) => t.source === "type").map((t) => t.type_id)),
    }), [typeLists]);
    const reloadTypes = () => setTypeReload((n) => n + 1);

    useEffect(() => {
        loadConfigs();
        apiGet<{ study_types: Array<CatalogOption & { is_active: boolean }> }>(`${base}/v1/study-types/`)
            .then((d) => setStudyTypes((d.study_types ?? []).filter((s) => s.is_active)))
            .catch(() => undefined);
        listSampleTypes(true).then((rows) => setSampleTypes(rows)).catch(() => undefined);
    }, [loadConfigs]);

    const options = useMemo(() => ({ order: studyTypes, sample: sampleTypes }), [studyTypes, sampleTypes]);

    const kindContent = (kind: NumberingKind) => configs && (
        <div style={{ display: "grid", gap: tokens.gap, gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0 }}>
            <LabNumberingCard
                kind={kind} config={configs[kind]} options={options[kind]} ownTypeIds={ownTypeIds[kind]}
                onSaved={(c) => { setConfigs((prev) => (prev ? { ...prev, [kind]: c } : prev)); reloadTypes(); }}
            />
            <TypeNumberingCard kind={kind} list={typeLists[kind]} error={typeErrors[kind]} onRetry={reloadTypes} onChanged={reloadTypes} />
        </div>
    );

    const content = (
        <div className="celuma-numbering" style={{ display: "grid", gap: tokens.gap, gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0 }}>
            <style>{NUMBERING_CSS}</style>
            <PageHeader
                title="Numeración"
                subtitle="Códigos automáticos de órdenes y muestras: la numeración predeterminada del laboratorio y, si hace falta, una configuración propia por tipo. Los cambios aplican solo a registros nuevos."
            />
            {error && (
                <CelumaAlert
                    type="error" showIcon message="No se pudo cargar la numeración."
                    description={<span>{error} <CelumaButton size="xsmall" onClick={loadConfigs}>Reintentar</CelumaButton></span>}
                />
            )}
            {!configs && !error && <Card style={cardStyle}><span style={{ color: tokens.textSecondary }} aria-live="polite">Cargando numeración…</span></Card>}
            {configs && (
                <CelumaTabs
                    activeKey={tab}
                    onChange={(k) => setTab(k as NumberingKind)}
                    items={(["order", "sample"] as const).map((kind) => ({
                        key: kind,
                        label: <span data-testid={`tab-${kind}`}>{KIND_TEXT[kind].tab}</span>,
                        children: kindContent(kind),
                    }))}
                />
            )}
        </div>
    );
    return embedded ? content : <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>{content}</div>;
}
