import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Grid } from "antd";
import { cardStyle, tokens } from "../design/tokens";
import CelumaButton from "../ui/button";
import CelumaAlert from "../ui/celuma_alert";
import Panel from "../ui/panel";
import SectionTitle from "../ui/section_title";
import { CelumaTable } from "../ui/table";
import CatalogTypeCode from "../ui/catalog_type_code";
import { matchesQuery } from "../../lib/search";
import { renderExample } from "../../lib/numbering_example";
import type { NumberingKind, TypeNumberingEntry, TypeNumberingList } from "../../models/numbering";
import { SourceChip } from "./numbering_parts";
import TypeNumberingSection from "./type_numbering_section";
import "../ui/catalog_type_select.css";

/**
 * Céluma 1.5 (#64): the optional numbering of every study type (orders) or sample type (samples), as one
 * searchable Céluma table: the type, where its numbering comes from, an illustrative example and the action.
 * «Configurar» / «Editar» opens the shared editor (`TypeNumberingSection`, the same one the type editors embed)
 * in a panel right under the table — one type at a time, scrolled into view and focused — so both entry points
 * save and clear through the same calls. (Outside the table on purpose: `CelumaTable` sizes to its content.)
 */
const TEXT: Record<NumberingKind, { title: string; typeLabel: string; subtitle: string; search: string; empty: string }> = {
    order: {
        title: "Numeración por tipo de estudio",
        typeLabel: "Tipo de estudio",
        subtitle: "Opcional. Cada orden usa la numeración de su tipo de estudio; sin configuración propia, usa la predeterminada del laboratorio.",
        search: "Buscar tipo de estudio por nombre o código",
        empty: "No hay tipos de estudio. Créalos en Configuración → Tipos de Estudio.",
    },
    sample: {
        title: "Numeración por tipo de muestra",
        typeLabel: "Tipo de muestra",
        subtitle: "Opcional. Cada muestra usa la numeración de su propio tipo, aunque la orden tenga muestras de varios tipos; sin configuración propia, usa la predeterminada del laboratorio.",
        search: "Buscar tipo de muestra por nombre o código",
        empty: "No hay tipos de muestra. Créalos en Configuración → Tipos de Muestra.",
    },
};

interface Props {
    kind: NumberingKind;
    list: TypeNumberingList | null;
    error?: string | null;
    onRetry?: () => void;
    onChanged: () => void;
}

export default function TypeNumberingCard({ kind, list, error, onRetry, onChanged }: Props) {
    const text = TEXT[kind];
    const [openId, setOpenId] = useState<string | null>(null);
    // Below `md` the list is one stacked column (type, source, example, action), so the action never ends up
    // beyond the table's horizontal scroll.
    const screens = Grid.useBreakpoint();
    const stacked = screens.md === false;
    const lab = list?.laboratory ?? null;
    const own = useMemo(() => (list?.types ?? []).filter((t) => t.source === "type").length, [list]);
    const openRow = (list?.types ?? []).find((t) => t.type_id === openId) ?? null;
    const headingRef = useRef<HTMLHeadingElement | null>(null);
    const returnFocus = useRef<HTMLElement | null>(null);

    const toggle = (id: string, trigger: HTMLElement) => {
        if (openId === id) { setOpenId(null); return; }
        returnFocus.current = trigger;
        setOpenId(id);
    };
    const close = () => {
        setOpenId(null);
        returnFocus.current?.focus();
    };
    useEffect(() => {
        if (!openId || !headingRef.current) return;
        headingRef.current.scrollIntoView?.({ block: "start", behavior: "smooth" });
        headingRef.current.focus({ preventScroll: true });
    }, [openId]);

    const typeCell = (row: TypeNumberingEntry) => (
        <span className="ct-option" style={{ minWidth: 0 }}>
            <span className="ct-option__name" style={{ fontWeight: 600 }}>{row.name}</span>
            <CatalogTypeCode className="ct-option__code" code={row.code} />
            {!row.is_active && <span className="ct-option__state"><span className="ct-sr"> — </span>inactivo</span>}
        </span>
    );
    const sourceCell = (row: TypeNumberingEntry) => (
        <div style={{ display: "grid", gap: 4 }}>
            <SourceChip source={row.source} inactive={!!lab && !lab.active} testId={`source-${kind}-${row.code}`} />
            <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                Ejemplo: <code data-testid={`example-${kind}-${row.code}`} style={{ color: tokens.textPrimary }}>
                    {renderExample({
                        format: row.effective.format, sequence_min_width: row.effective.sequence_min_width,
                        sequence: row.effective.scheme === "legacy" ? 1 : row.effective.start_value, base: row.code,
                        scheme: row.effective.scheme, scope: row.effective.scope, timezone: row.effective.timezone,
                    })}
                </code>
            </span>
        </div>
    );
    const actionCell = (row: TypeNumberingEntry) => {
        const open = openId === row.type_id;
        return (
            <CelumaButton
                size="small" onClick={(e) => toggle(row.type_id, e.currentTarget)} aria-expanded={open}
                aria-controls={`type-editor-${kind}`}
                data-testid={`edit-${kind}-${row.code}`}
                aria-label={`${open ? "Cerrar" : row.source === "type" ? "Editar" : "Configurar"} numeración de ${row.name}`}
            >
                {open ? "Cerrar" : row.source === "type" ? "Editar" : "Configurar"}
            </CelumaButton>
        );
    };

    return (
        <Card style={{ ...cardStyle, minWidth: 0 }} data-testid={`type-numbering-${kind}`}>
            <SectionTitle extra={list ? <span style={{ fontSize: 13, color: tokens.textSecondary }} data-testid={`type-count-${kind}`}>{own} con configuración propia</span> : undefined}>
                {text.title}
            </SectionTitle>
            {/* minmax(0, 1fr): the table sizes to its content and must scroll inside the card, not widen the page. */}
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0 }}>
                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>{text.subtitle}</p>
                {lab && !lab.active && (
                    <CelumaAlert
                        type="info" showIcon
                        message="La numeración mensual está desactivada: todos los tipos usan el formato anterior (CÓDIGO-n). Las configuraciones propias se guardan y se aplican al activarla."
                        style={{ marginBottom: 0 }}
                    />
                )}
                {error && (
                    <CelumaAlert
                        type="error" showIcon message="No se pudo cargar la numeración por tipo."
                        description={<span>{error} {onRetry && <CelumaButton size="xsmall" onClick={onRetry} data-testid={`type-retry-${kind}`}>Reintentar</CelumaButton>}</span>}
                    />
                )}
                <CelumaTable<TypeNumberingEntry>
                    rowKey="type_id"
                    loading={!list && !error}
                    dataSource={list?.types ?? []}
                    pagination={{ pageSize: 10 }}
                    emptyText={text.empty}
                    searchable
                    searchPlaceholder={text.search}
                    searchFilter={(r, q) => matchesQuery([r.name, r.code], q)}
                    columns={stacked ? [
                        {
                            title: text.typeLabel, key: "stacked",
                            render: (_, row) => (
                                <div style={{ display: "grid", gap: 8 }}>
                                    {typeCell(row)}
                                    {sourceCell(row)}
                                    <div>{actionCell(row)}</div>
                                </div>
                            ),
                        },
                    ] : [
                        { title: text.typeLabel, key: "type", render: (_, row) => typeCell(row) },
                        // Source and example together, so both stay visible.
                        { title: "Numeración", key: "source", render: (_, row) => sourceCell(row) },
                        { title: "", key: "actions", align: "right", width: 150, render: (_, row) => actionCell(row) },
                    ]}
                />
                {openRow && lab && (
                    <Panel style={{ background: "#fff", borderColor: `${tokens.primary}66`, display: "grid", gap: 8 }} data-testid={`type-editor-${kind}`}>
                        <div id={`type-editor-${kind}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <h4 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 17, fontWeight: 700, color: tokens.textPrimary, outline: "none" }}>
                                Numeración de {openRow.name} <span className="ct-option__code" style={{ fontFamily: tokens.textFont }}>{openRow.code}</span>
                            </h4>
                            <CelumaButton size="small" onClick={close} data-testid={`type-editor-close-${kind}`}>Cerrar</CelumaButton>
                        </div>
                        <TypeNumberingSection
                            key={openRow.type_id}
                            kind={kind} typeId={openRow.type_id} typeCode={openRow.code} typeName={openRow.name}
                            canManage entry={openRow} laboratory={lab} variant="row" startEditing
                            testId={`row-${kind}-${openRow.code}`}
                            onChanged={() => onChanged()}
                        />
                    </Panel>
                )}
                <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                    El ejemplo muestra el primer código de un mes con el formato que se aplica; no consulta contadores ni reserva números.
                </span>
            </div>
        </Card>
    );
}
