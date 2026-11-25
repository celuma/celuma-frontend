import { useEffect, useMemo, useState } from "react";
import { Alert, Card, Input, InputNumber, Modal, Popconfirm, Radio, Table, Tag, message } from "antd";
import { tokens, cardStyle } from "../design/tokens";
import CelumaButton from "../ui/button";
import { getErrorMessage } from "../../lib/api_error";
import { clearTypeNumbering, previewNumbering, saveTypeNumbering } from "../../services/numbering_service";
import {
    composeFormat,
    type EffectiveTypeNumbering,
    type NumberingKind,
    type NumberingPreview,
    type NumberingScope,
    type TypeNumberingEntry,
    type TypeNumberingList,
} from "../../models/numbering";

/**
 * Céluma 1.5 (#64): optional numbering per study type (orders) and per sample type (samples).
 *
 * Same pattern as a template's preferred letterhead: a type may have its own configuration; without one it
 * uses the laboratory's (the default). Only the format, the minimum width and the start value can differ.
 * Activation, counter scope and numbering timezone always come from the laboratory, and each type keeps its
 * own counter, so changing or clearing a type's configuration continues its sequence; nothing already issued
 * changes. Every preview is read-only (it reserves nothing). The API enforces `admin:manage_catalog`.
 */

const TEXT: Record<NumberingKind, { title: string; typeLabel: string; subtitle: string }> = {
    order: {
        title: "Numeración por tipo de estudio",
        typeLabel: "Tipo de estudio",
        subtitle: "Cada orden usa la numeración de su tipo de estudio. Si el tipo no tiene numeración propia, usa la del laboratorio.",
    },
    sample: {
        title: "Numeración por tipo de muestra",
        typeLabel: "Tipo de muestra",
        subtitle:
            "Cada muestra usa la numeración de su propio tipo de muestra, aunque la orden tenga muestras de varios tipos. " +
            "Si el tipo no tiene numeración propia, usa la del laboratorio.",
    },
};

type Separator = "none" | "hyphen" | "custom";

function detectSeparator(format: string, scope: NumberingScope): Separator {
    if (format === composeFormat("none", scope)) return "none";
    if (format === composeFormat("hyphen", scope)) return "hyphen";
    return "custom";
}

function scopeText(scope: NumberingScope): string {
    return scope === "branch" ? "por sucursal" : "todo el laboratorio";
}

interface Props {
    kind: NumberingKind;
    list: TypeNumberingList | null;
    error?: string | null;
    onChanged: () => void;
}

export default function TypeNumberingCard({ kind, list, error, onChanged }: Props) {
    const text = TEXT[kind];
    const [editing, setEditing] = useState<TypeNumberingEntry | null>(null);
    const [clearing, setClearing] = useState<string | null>(null);
    const lab = list?.laboratory;

    const clear = async (entry: TypeNumberingEntry) => {
        setClearing(entry.type_id);
        try {
            await clearTypeNumbering(kind, entry.type_id);
            message.success("El tipo vuelve a usar la numeración del laboratorio. Los códigos ya emitidos no cambian.");
            onChanged();
        } catch (err) {
            message.error(getErrorMessage(err));
        } finally {
            setClearing(null);
        }
    };

    return (
        <Card style={cardStyle} title={text.title} data-testid={`type-numbering-${kind}`}>
            <div style={{ display: "grid", gap: 12 }}>
                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>{text.subtitle}</p>
                {lab && !lab.active && (
                    <Alert
                        type="info" showIcon data-testid={`type-inactive-note-${kind}`}
                        message="La numeración mensual no está activa: todos los tipos usan el formato anterior (CÓDIGO-n). Las numeraciones propias se guardan y se aplican al activarla."
                    />
                )}
                {error && <Alert type="error" showIcon message={error} />}
                <Table<TypeNumberingEntry>
                    size="small"
                    rowKey="type_id"
                    loading={!list && !error}
                    pagination={false}
                    dataSource={list?.types ?? []}
                    locale={{ emptyText: "No hay tipos en el catálogo." }}
                    columns={[
                        {
                            title: text.typeLabel, key: "type",
                            render: (_, row) => (
                                <span>
                                    {row.name} <code>{row.code}</code>{" "}
                                    {!row.is_active && <Tag style={{ marginLeft: 4 }}>inactivo</Tag>}
                                </span>
                            ),
                        },
                        {
                            title: "Numeración", key: "source", width: 220,
                            render: (_, row) => row.source === "type"
                                ? <Tag color="cyan" data-testid={`source-${kind}-${row.code}`}>Propia</Tag>
                                : <Tag data-testid={`source-${kind}-${row.code}`}>Laboratorio (predeterminada)</Tag>,
                        },
                        {
                            title: "Formato que se aplica", key: "format",
                            render: (_, row) => (
                                <span data-testid={`effective-${kind}-${row.code}`}>
                                    <code>{row.effective.format}</code> · ancho {row.effective.sequence_min_width} · inicio {row.effective.start_value}
                                </span>
                            ),
                        },
                        {
                            title: "", key: "actions", width: 260, align: "right",
                            render: (_, row) => (
                                <span style={{ display: "inline-flex", gap: 8 }}>
                                    <CelumaButton size="small" onClick={() => setEditing(row)} data-testid={`edit-${kind}-${row.code}`}>
                                        {row.source === "type" ? "Editar" : "Configurar"}
                                    </CelumaButton>
                                    {row.source === "type" && (
                                        <Popconfirm
                                            title="¿Usar la numeración del laboratorio?"
                                            description="Los registros nuevos de este tipo usarán la numeración del laboratorio. Los códigos ya emitidos no cambian y el consecutivo continúa."
                                            okText="Sí, usar la del laboratorio" cancelText="Cancelar"
                                            onConfirm={() => clear(row)}
                                        >
                                            <CelumaButton size="small" loading={clearing === row.type_id} data-testid={`clear-${kind}-${row.code}`}>
                                                Usar la del laboratorio
                                            </CelumaButton>
                                        </Popconfirm>
                                    )}
                                </span>
                            ),
                        },
                    ]}
                />
            </div>
            {editing && lab && (
                <TypeNumberingEditor
                    kind={kind} entry={editing} laboratory={lab}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); onChanged(); }}
                />
            )}
        </Card>
    );
}

interface EditorProps {
    kind: NumberingKind;
    entry: TypeNumberingEntry;
    laboratory: EffectiveTypeNumbering;
    onClose: () => void;
    onSaved: () => void;
}

function TypeNumberingEditor({ kind, entry, laboratory, onClose, onSaved }: EditorProps) {
    // A new configuration starts from what the type uses today (the laboratory's), so nothing changes until edited.
    const start = entry.override ?? entry.effective;
    const scope = laboratory.scope;
    const [format, setFormat] = useState(start.format);
    const [separator, setSeparator] = useState<Separator>(detectSeparator(start.format, scope));
    const [width, setWidth] = useState<number>(start.sequence_min_width);
    const [startValue, setStartValue] = useState<number>(start.start_value);
    const [preview, setPreview] = useState<NumberingPreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const idPrefix = `type-${kind}-${entry.code}`;

    useEffect(() => {
        let alive = true;
        const timer = setTimeout(() => {
            previewNumbering({
                entity_kind: kind, scope_id: entry.type_id, layer: "effective",
                format, sequence_min_width: width, start_value: startValue,
            })
                .then((p) => { if (alive) { setPreview(p); setPreviewError(null); } })
                .catch((err) => alive && setPreviewError(getErrorMessage(err)));
        }, 350);
        return () => { alive = false; clearTimeout(timer); };
    }, [kind, entry.type_id, format, width, startValue]);

    const valid = preview?.valid !== false && Number.isInteger(width) && width >= 1 && width <= 6
        && Number.isInteger(startValue) && startValue >= 1;
    const unchanged = entry.override !== null && format === entry.override.format
        && width === entry.override.sequence_min_width && startValue === entry.override.start_value;
    const sample = useMemo(
        () => (s: Separator) => composeFormat(s as "none" | "hyphen", scope)
            .replace("{BASE}", entry.code).replace("{BRANCH}", "SUC").replace("{SEQ}", "01").replace("{MM}", "10").replace("{YY}", "26"),
        [scope, entry.code],
    );

    const save = async () => {
        setSaving(true);
        try {
            await saveTypeNumbering(kind, entry.type_id, { format, sequence_min_width: width, start_value: startValue });
            message.success("Numeración del tipo guardada. Aplica a los registros nuevos; los códigos existentes no cambian.");
            onSaved();
        } catch (err) {
            message.error(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open title={`Numeración de ${entry.name} (${entry.code})`} onCancel={onClose} width={640}
            footer={[
                <CelumaButton key="cancel" onClick={onClose}>Cancelar</CelumaButton>,
                <CelumaButton key="save" type="primary" onClick={save} loading={saving} disabled={!valid || unchanged} data-testid={`${idPrefix}-save`}>
                    Guardar numeración propia
                </CelumaButton>,
            ]}
        >
            <div style={{ display: "grid", gap: 14 }} data-testid={`${idPrefix}-editor`}>
                <span style={{ fontSize: 13, color: tokens.textSecondary }}>
                    {entry.source === "type"
                        ? "Este tipo tiene numeración propia."
                        : "Este tipo usa ahora la numeración del laboratorio. Al guardar tendrá numeración propia."}{" "}
                    Su consecutivo continúa: cambiar o quitar esta configuración nunca reinicia el contador ni reutiliza códigos.
                </span>
                <div style={{ display: "grid", gap: 6 }}>
                    <strong>Separador</strong>
                    <Radio.Group
                        value={separator}
                        onChange={(e) => {
                            const next = e.target.value as Separator;
                            setSeparator(next);
                            if (next !== "custom") setFormat(composeFormat(next, scope));
                        }}
                    >
                        <Radio value="none">Sin separador (<code>{sample("none")}</code>)</Radio>
                        <Radio value="hyphen">Con guion (<code>{sample("hyphen")}</code>)</Radio>
                        <Radio value="custom">Personalizado</Radio>
                    </Radio.Group>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontWeight: 600 }} htmlFor={`${idPrefix}-format`}>Formato</label>
                    <Input
                        id={`${idPrefix}-format`} value={format} maxLength={60}
                        onChange={(e) => { setFormat(e.target.value); setSeparator(detectSeparator(e.target.value, scope)); }}
                    />
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 600 }} htmlFor={`${idPrefix}-width`}>Ancho mínimo del consecutivo</label>
                        <InputNumber id={`${idPrefix}-width`} min={1} max={6} value={width} onChange={(v) => setWidth(Number(v))} />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontWeight: 600 }} htmlFor={`${idPrefix}-start`}>Valor inicial</label>
                        <InputNumber id={`${idPrefix}-start`} min={1} max={99999999} value={startValue} onChange={(v) => setStartValue(Number(v))} />
                    </div>
                </div>
                <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                    El valor inicial solo puede adelantar el contador de este tipo; bajarlo nunca lo retrocede.
                </span>
                <div style={{ display: "grid", gap: 4, fontSize: 13 }} data-testid={`${idPrefix}-inherited`}>
                    <strong>Heredado del laboratorio</strong>
                    <span>Numeración mensual: {laboratory.active ? "activa" : "sin activar (se usa CÓDIGO-n)"}</span>
                    <span>Alcance del contador: {scopeText(scope)}</span>
                    <span>Zona horaria: {laboratory.timezone}</span>
                    <span>Laboratorio: <code>{laboratory.format}</code> · ancho {laboratory.sequence_min_width} · inicio {laboratory.start_value}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                    <strong>Vista previa</strong>
                    {previewError && <Alert type="error" showIcon message={previewError} />}
                    {preview && !preview.valid && <Alert type="error" showIcon message={preview.errors.join("; ")} data-testid={`${idPrefix}-errors`} />}
                    {preview?.valid && (
                        <>
                            <Table
                                size="small" pagination={false} rowKey="sequence"
                                dataSource={preview.examples.slice(0, 4)}
                                columns={[
                                    { title: "Consecutivo", dataIndex: "sequence", key: "sequence", width: 120 },
                                    {
                                        title: preview.scheme === "legacy"
                                            ? "Código (formato anterior, numeración sin activar)"
                                            : `Código (${String(preview.period_month).padStart(2, "0")}/${preview.period_year}, ${preview.timezone})`,
                                        dataIndex: "code", key: "code",
                                    },
                                ]}
                            />
                            {preview.estimate && (
                                <span data-testid={`${idPrefix}-estimate`}>
                                    Próximo código estimado: <strong>{preview.estimate.code}</strong>
                                </span>
                            )}
                        </>
                    )}
                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                        La vista previa es orientativa: no reserva ni consume ningún número. El código real se asigna al registrar y puede diferir.
                    </span>
                </div>
            </div>
        </Modal>
    );
}
