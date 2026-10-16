import { useEffect, useMemo, useState } from "react";
import { Alert, Card, Input, InputNumber, Radio, Select, Table, message } from "antd";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import { getErrorMessage } from "../lib/api_error";
import { apiGet } from "../lib/api_fetch";
import { getNumberingConfigs, previewNumbering, saveNumberingConfig } from "../services/numbering_service";
import { listSampleTypes } from "../services/sample_type_service";
import {
    DEFAULT_NUMBERING_FORMAT,
    MODE_LABEL,
    NUMBERING_MODES,
    type NumberingConfig,
    type NumberingKind,
    type NumberingMode,
    type NumberingPreview,
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
    "Variables: {BASE} código del tipo, {SEQ} consecutivo, {MM} mes, {YY} o {YYYY} año. Cada una debe aparecer una vez " +
    "(año: {YY} o {YYYY}). Entre variables solo se permiten letras, números, '.', '_' y '-'.";

interface CardProps {
    kind: NumberingKind;
    config: NumberingConfig;
    options: CatalogOption[];
    onSaved: (config: NumberingConfig) => void;
}

function NumberingKindCard({ kind, config, options, onSaved }: CardProps) {
    const text = KIND_TEXT[kind];
    const [format, setFormat] = useState(config.format);
    const [width, setWidth] = useState<number>(config.sequence_min_width);
    const [mode, setMode] = useState<NumberingMode>(config.mode);
    const [scopeId, setScopeId] = useState<string | undefined>(options[0]?.id);
    const [preview, setPreview] = useState<NumberingPreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFormat(config.format);
        setWidth(config.sequence_min_width);
        setMode(config.mode);
    }, [config]);

    useEffect(() => {
        if (!scopeId && options[0]) setScopeId(options[0].id);
    }, [options, scopeId]);

    // Live preview: debounced, and strictly read-only on the server (it reserves nothing).
    useEffect(() => {
        let alive = true;
        const timer = setTimeout(() => {
            previewNumbering({ entity_kind: kind, format, sequence_min_width: width, scope_id: scopeId })
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
    }, [kind, format, width, scopeId]);

    const dirty = format !== config.format || width !== config.sequence_min_width || mode !== config.mode;
    const valid = preview?.valid !== false && Number.isInteger(width) && width >= 1 && width <= 6;

    const handleSave = async () => {
        setSaving(true);
        try {
            const saved = await saveNumberingConfig(kind, { format, sequence_min_width: width, mode });
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
                <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontWeight: 600 }} htmlFor={`fmt-${kind}`}>Formato</label>
                    <Input id={`fmt-${kind}`} value={format} onChange={(e) => setFormat(e.target.value)} maxLength={60} />
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
                    <strong>Códigos manuales</strong>
                    <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} data-testid={`mode-${kind}`}>
                        {NUMBERING_MODES.map((m) => (
                            <Radio key={m} value={m}>{MODE_LABEL[m]}</Radio>
                        ))}
                    </Radio.Group>
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
                                    { title: `Código (${String(preview.period_month).padStart(2, "0")}/${preview.period_year})`, dataIndex: "code", key: "code" },
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
