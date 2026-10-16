import { useEffect, useMemo, useState } from "react";
import { Alert, Card, Input, InputNumber, Radio, Select, Switch, Table, message } from "antd";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import { getErrorMessage } from "../lib/api_error";
import { apiGet } from "../lib/api_fetch";
import { getNumberingConfigs, previewNumbering, saveNumberingConfig } from "../services/numbering_service";
import { listSampleTypes } from "../services/sample_type_service";
import {
    DEFAULT_NUMBERING_FORMAT,
    MANUAL_POLICIES,
    composeFormat,
    timezoneOptions,
    POLICY_LABEL,
    type ManualPolicy,
    type NumberingConfig,
    type NumberingKind,
    type NumberingPreview,
    type NumberingScope,
} from "../models/numbering";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

interface CatalogOption {
    id: string;
    code: string;
    name: string;
}

const KIND_TEXT: Record<NumberingKind, { title: string; subtitle: string; scopeLabel: string }> = {
    order: {
        title: "Órdenes",
        subtitle: "Un contador por tipo de estudio y mes. El prefijo es el código del tipo de estudio.",
        scopeLabel: "Tipo de estudio de ejemplo",
    },
    sample: {
        title: "Muestras",
        subtitle: "Un contador por tipo de muestra y mes, independiente del de las órdenes. El prefijo es el código del tipo de muestra.",
        scopeLabel: "Tipo de muestra de ejemplo",
    },
};

const TOKEN_HELP =
    "Variables: {BASE} código del tipo, {BRANCH} código de la sucursal (solo con alcance por sucursal), {SEQ} consecutivo, {MM} mes, " +
    "{YY} o {YYYY} año. Cada una debe aparecer una vez (año: {YY} o {YYYY}). Entre variables solo se permiten letras, números, '.', '_' y '-'.";

interface CardProps {
    kind: NumberingKind;
    config: NumberingConfig;
    options: CatalogOption[];
    onSaved: (config: NumberingConfig) => void;
}

type Separator = "none" | "hyphen" | "custom";

function detectSeparator(format: string, scope: NumberingScope): Separator {
    if (format === composeFormat("none", scope)) return "none";
    if (format === composeFormat("hyphen", scope)) return "hyphen";
    return "custom";
}

function NumberingKindCard({ kind, config, options, onSaved }: CardProps) {
    const text = KIND_TEXT[kind];
    const zoneOptions = useMemo(() => timezoneOptions().map((z) => ({ value: z, label: z })), []);
    const [active, setActive] = useState(config.active);
    const [policy, setPolicy] = useState<ManualPolicy>(config.manual_policy);
    const [scope, setScope] = useState<NumberingScope>(config.scope);
    const [startValue, setStartValue] = useState<number>(config.start_value);
    const [format, setFormat] = useState(config.format);
    const [separator, setSeparator] = useState<Separator>(detectSeparator(config.format, config.scope));
    const [width, setWidth] = useState<number>(config.sequence_min_width);
    const [timezone, setTimezone] = useState(config.timezone);
    const [scopeId, setScopeId] = useState<string | undefined>(options[0]?.id);
    const [preview, setPreview] = useState<NumberingPreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setActive(config.active);
        setPolicy(config.manual_policy);
        setScope(config.scope);
        setStartValue(config.start_value);
        setFormat(config.format);
        setSeparator(detectSeparator(config.format, config.scope));
        setWidth(config.sequence_min_width);
        setTimezone(config.timezone);
    }, [config]);

    useEffect(() => {
        if (!scopeId && options[0]) setScopeId(options[0].id);
    }, [options, scopeId]);

    const chooseSeparator = (next: Separator, nextScope: NumberingScope = scope) => {
        setSeparator(next);
        if (next !== "custom") setFormat(composeFormat(next, nextScope));
    };

    const chooseScope = (next: NumberingScope) => {
        setScope(next);
        // Keep the format consistent with the scope: a branch scope needs {BRANCH}, a tenant scope must not have it.
        if (separator !== "custom") setFormat(composeFormat(separator, next));
        else if (next === "tenant") setFormat((f) => f.replace(/\{BRANCH\}-?/g, ""));
    };

    // Live preview: debounced, and strictly read-only on the server (it reserves nothing).
    useEffect(() => {
        let alive = true;
        const timer = setTimeout(() => {
            previewNumbering({
                entity_kind: kind, active, format, sequence_min_width: width, start_value: startValue, scope, timezone, scope_id: scopeId,
            })
                .then((p) => {
                    if (!alive) return;
                    setPreview(p);
                    setPreviewError(null);
                })
                .catch((err) => alive && setPreviewError(getErrorMessage(err)));
        }, 350);
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [kind, active, format, width, startValue, scope, timezone, scopeId]);

    const dirty =
        active !== config.active || policy !== config.manual_policy || scope !== config.scope ||
        startValue !== config.start_value || format !== config.format || width !== config.sequence_min_width ||
        timezone !== config.timezone;
    const valid =
        preview?.valid !== false && Number.isInteger(width) && width >= 1 && width <= 6 &&
        Number.isInteger(startValue) && startValue >= 1;

    const handleSave = async () => {
        setSaving(true);
        try {
            const saved = await saveNumberingConfig(kind, {
                active, manual_policy: policy, format, sequence_min_width: width, start_value: startValue, scope, timezone,
            });
            onSaved(saved);
            message.success("Numeración guardada. Aplica a los registros nuevos; los códigos existentes no cambian.");
        } catch (err) {
            message.error(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card style={cardStyle} title={text.title} data-testid={`numbering-card-${kind}`}>
            <div style={{ display: "grid", gap: 16 }}>
                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>{text.subtitle}</p>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Switch checked={active} onChange={setActive} aria-label={`Activar numeración mensual de ${text.title.toLowerCase()}`} data-testid={`active-${kind}`} />
                    <strong>{active ? "Numeración mensual activa" : "Numeración mensual sin activar"}</strong>
                </div>
                {!active && (
                    <Alert
                        type="info" showIcon data-testid={`inactive-note-${kind}`}
                        message={kind === "order"
                            ? "Sin activar, las órdenes nuevas siguen usando el formato anterior (CÓDIGO-n)."
                            : "Sin activar, el código de cada muestra se escribe a mano, como antes."}
                    />
                )}
                {active && (
                    <Alert type="warning" showIcon message="Al guardar, los registros nuevos usarán esta numeración. Los códigos ya emitidos no cambian ni se reutilizan." />
                )}

                <div style={{ display: "grid", gap: 6 }}>
                    <strong>Separador</strong>
                    <Radio.Group value={separator} onChange={(e) => chooseSeparator(e.target.value)} data-testid={`separator-${kind}`}>
                        <Radio value="none">Sin separador (<code>{composeFormat("none", "tenant").replace("{BASE}", "CU").replace("{SEQ}", "01").replace("{MM}", "10").replace("{YY}", "26")}</code>)</Radio>
                        <Radio value="hyphen">Con guion (<code>{composeFormat("hyphen", "tenant").replace("{BASE}", "CU").replace("{SEQ}", "01").replace("{MM}", "10").replace("{YY}", "26")}</code>)</Radio>
                        <Radio value="custom">Personalizado</Radio>
                    </Radio.Group>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontWeight: 600 }} htmlFor={`fmt-${kind}`}>Formato</label>
                    <Input
                        id={`fmt-${kind}`} value={format} maxLength={60}
                        onChange={(e) => { setFormat(e.target.value); setSeparator(detectSeparator(e.target.value, scope)); }}
                    />
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                        Predeterminado: <code>{DEFAULT_NUMBERING_FORMAT}</code>. {TOKEN_HELP}
                    </span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontWeight: 600 }} htmlFor={`width-${kind}`}>Ancho mínimo del consecutivo</label>
                    <InputNumber id={`width-${kind}`} min={1} max={6} value={width} onChange={(v) => setWidth(Number(v))} />
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                        Es un mínimo: a partir de 100 el consecutivo crece (CU1001026) sin truncarse ni reiniciarse.
                    </span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontWeight: 600 }} htmlFor={`start-${kind}`}>Valor inicial</label>
                    <InputNumber id={`start-${kind}`} min={1} max={99999999} value={startValue} onChange={(v) => setStartValue(Number(v))} />
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                        Primer consecutivo de cada contador nuevo (predeterminado 1). Subirlo adelanta los contadores existentes; bajarlo nunca
                        los retrocede ni reutiliza códigos ya emitidos.
                    </span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                    <strong>Alcance del contador</strong>
                    <Radio.Group value={scope} onChange={(e) => chooseScope(e.target.value)} data-testid={`scope-${kind}`}>
                        <Radio value="tenant">Todo el laboratorio</Radio>
                        <Radio value="branch">Por sucursal (el código incluye la sucursal: {"{BRANCH}"})</Radio>
                    </Radio.Group>
                    {scope === "branch" && (
                        <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                            Cada sucursal lleva su propio consecutivo; el código de la sucursal forma parte del código para que dos sucursales nunca produzcan el mismo.
                        </span>
                    )}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontWeight: 600 }} htmlFor={`tz-${kind}`}>Zona horaria de la numeración</label>
                    <Select
                        id={`tz-${kind}`} showSearch value={timezone} onChange={setTimezone} data-testid={`timezone-${kind}`}
                        options={zoneOptions} style={{ maxWidth: 360 }} aria-label="Zona horaria de la numeración"
                    />
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                        Define el mes (MM/AA) de los contadores de todo el laboratorio, sin importar qué sucursal registre. Con alcance por sucursal
                        se usa la zona de cada sucursal. Cambiarla nunca reinicia contadores ni reutiliza códigos.
                    </span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                    <strong>Códigos manuales</strong>
                    <Radio.Group value={policy} onChange={(e) => setPolicy(e.target.value)} data-testid={`policy-${kind}`}>
                        {MANUAL_POLICIES.map((m) => (
                            <Radio key={m} value={m}>{POLICY_LABEL[m]}</Radio>
                        ))}
                    </Radio.Group>
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                        Además de esta política, cada usuario necesita el permiso «Escribir códigos manualmente»
                        (<code>lab:enter_manual_code</code>); habilitarlo aquí no autoriza a nadie por sí solo. Un código escrito no consume la numeración
                        automática, pasa las mismas verificaciones de colisión y queda auditado.
                    </span>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                    <strong>Vista previa</strong>
                    {options.length > 0 && (
                        <Select
                            value={scopeId}
                            onChange={setScopeId}
                            aria-label={text.scopeLabel}
                            options={options.map((o) => ({ value: o.id, label: `${o.code} — ${o.name}` }))}
                            style={{ maxWidth: 360 }}
                        />
                    )}
                    {previewError && <Alert type="error" showIcon message={previewError} />}
                    {preview && !preview.valid && <Alert type="error" showIcon message={preview.errors.join("; ")} data-testid={`errors-${kind}`} />}
                    {preview?.valid && (
                        <>
                            <Table
                                size="small"
                                pagination={false}
                                rowKey="sequence"
                                dataSource={preview.examples}
                                columns={[
                                    { title: "Consecutivo", dataIndex: "sequence", key: "sequence", width: 120 },
                                    {
                                        title: preview.scheme === "legacy" ? "Código (formato anterior)" : `Código (${String(preview.period_month).padStart(2, "0")}/${preview.period_year}, ${preview.timezone})`,
                                        dataIndex: "code", key: "code",
                                    },
                                ]}
                            />
                            {preview.estimate && (
                                <span data-testid={`estimate-${kind}`}>
                                    Próximo código estimado: <strong>{preview.estimate.code}</strong>
                                </span>
                            )}
                        </>
                    )}
                    <span style={{ fontSize: 12, color: tokens.textSecondary }} data-testid={`notice-${kind}`}>
                        La vista previa es orientativa: no reserva ni consume ningún número. El código real se asigna al registrar y puede diferir.
                    </span>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <CelumaButton type="primary" onClick={handleSave} loading={saving} disabled={!dirty || !valid}>
                        Guardar
                    </CelumaButton>
                </div>
            </div>
        </Card>
    );
}

/**
 * Configuración → Numeración (Céluma 1.4, issue #8): format, minimum width and
 * manual-code policy of the monthly codes of orders and samples.
 *
 * Gated on `admin:manage_catalog` (the permission the API enforces on the
 * PUT). Changes affect only registrations made after saving.
 */
export default function NumberingSettings({ embedded = true }: { embedded?: boolean }) {
    const [configs, setConfigs] = useState<{ order: NumberingConfig; sample: NumberingConfig } | null>(null);
    const [studyTypes, setStudyTypes] = useState<CatalogOption[]>([]);
    const [sampleTypes, setSampleTypes] = useState<CatalogOption[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getNumberingConfigs().then(setConfigs).catch((err) => setError(getErrorMessage(err)));
        apiGet<{ study_types: Array<CatalogOption & { is_active: boolean }> }>(`${base}/v1/study-types/`)
            .then((d) => setStudyTypes((d.study_types ?? []).filter((s) => s.is_active)))
            .catch(() => undefined);
        listSampleTypes(true).then((rows) => setSampleTypes(rows)).catch(() => undefined);
    }, []);

    const options = useMemo(() => ({ order: studyTypes, sample: sampleTypes }), [studyTypes, sampleTypes]);

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <PageHeader
                title="Numeración"
                subtitle="Códigos automáticos mensuales de órdenes y muestras. Los cambios aplican solo a registros nuevos."
            />
            {error && <Alert type="error" showIcon message={error} />}
            {configs && (
                <>
                    <NumberingKindCard
                        kind="order" config={configs.order} options={options.order}
                        onSaved={(c) => setConfigs((prev) => (prev ? { ...prev, order: c } : prev))}
                    />
                    <NumberingKindCard
                        kind="sample" config={configs.sample} options={options.sample}
                        onSaved={(c) => setConfigs((prev) => (prev ? { ...prev, sample: c } : prev))}
                    />
                </>
            )}
        </div>
    );
    return embedded ? content : <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>{content}</div>;
}
