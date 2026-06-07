import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Table, Empty } from "antd";
import type { TableProps, TablePaginationConfig } from "antd";
import type { ColumnsType } from "antd/es/table";
import { tokens } from "../design/tokens";
import CelumaPagination from "./celuma_pagination";
import SearchField from "./search_field";

// Céluma-styled sort hint tooltip (navy, rounded) — matches the shared Tooltip component.
const SORTER_TOOLTIP = {
    color: tokens.textPrimary,
    overlayInnerStyle: {
        fontFamily: tokens.textFont,
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 8,
        padding: "6px 11px",
        minHeight: "auto",
    },
} as const;

/**
 * Generic search matcher — walks every string/number leaf of a record and tests
 * the (already normalized, lowercased) query against it. Used when a table opts
 * into search without supplying its own `searchFilter`.
 */
function defaultSearchMatch(record: unknown, query: string): boolean {
    const visit = (value: unknown): boolean => {
        if (value == null) return false;
        if (typeof value === "string") return value.toLowerCase().includes(query);
        if (typeof value === "number") return String(value).includes(query);
        if (Array.isArray(value)) return value.some(visit);
        if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(visit);
        return false;
    };
    return visit(record);
}

export interface CelumaTableProps<T> extends Omit<TableProps<T>, 'dataSource' | 'columns' | 'rowKey'> {
    dataSource: T[];
    columns: ColumnsType<T>;
    rowKey: string | ((record: T) => string);
    onRowClick?: (record: T) => void;
    defaultSort?: {
        field: string;
        order: 'ascend' | 'descend';
    };
    emptyText?: string;
    /** Show the built-in search field above the table (default false). */
    searchable?: boolean;
    /** Placeholder for the search field. */
    searchPlaceholder?: string;
    /**
     * Custom predicate used to filter rows against the search query. The query is
     * passed already trimmed and lowercased. When omitted, a generic matcher scans
     * every string/number value of the row.
     */
    searchFilter?: (record: T, query: string) => boolean;
    /** Optional content rendered to the right of the search field (e.g. an action button). */
    searchExtra?: ReactNode;
    /** Max width of the search field. Defaults to 420 (it grows to fill, capped here). */
    searchWidth?: number | string;
}

/**
 * CelumaTable - Reusable table component with consistent styling and behavior
 *
 * Features:
 * - Consistent styling with Céluma design tokens
 * - Optional built-in search field (`searchable`) shared across all list views
 * - Default sorting support
 * - Row click navigation
 * - Custom Céluma pagination (CelumaPagination) — antd stays the paging engine
 *   while its default control is hidden and replaced with our own segmented pill
 * - Empty state handling
 */
export function CelumaTable<T>({
    dataSource,
    columns,
    rowKey,
    onRowClick,
    defaultSort,
    loading = false,
    pagination,
    emptyText = "Sin datos",
    className,
    onChange,
    searchable = false,
    searchPlaceholder = "Buscar",
    searchFilter,
    searchExtra,
    searchWidth = 420,
    ...rest
}: CelumaTableProps<T>) {

    // Apply default sorting to data if specified
    const sortedData = useMemo(() => {
        if (!defaultSort || !dataSource) return dataSource;

        const sorted = [...dataSource].sort((a, b) => {
            const aValue = (a as Record<string, unknown>)[defaultSort.field];
            const bValue = (b as Record<string, unknown>)[defaultSort.field];

            // Handle null/undefined values
            if (!aValue && !bValue) return 0;
            if (!aValue) return 1;
            if (!bValue) return -1;

            // Try date comparison first
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                const aDate = new Date(aValue).getTime();
                const bDate = new Date(bValue).getTime();

                if (!isNaN(aDate) && !isNaN(bDate)) {
                    return defaultSort.order === 'ascend' ? aDate - bDate : bDate - aDate;
                }
            }

            // Fall back to string comparison
            const aStr = String(aValue);
            const bStr = String(bValue);
            const comparison = aStr.localeCompare(bStr);

            return defaultSort.order === 'ascend' ? comparison : -comparison;
        });

        return sorted;
    }, [dataSource, defaultSort]);

    // Built-in search — filters the data before it reaches antd.
    const [search, setSearch] = useState("");
    const searchedData = useMemo(() => {
        if (!searchable) return sortedData;
        const q = search.trim().toLowerCase();
        if (!q) return sortedData;
        return sortedData.filter((record) =>
            searchFilter ? searchFilter(record, q) : defaultSearchMatch(record, q)
        );
    }, [sortedData, searchable, search, searchFilter]);

    const isPaginated = pagination !== false;
    const pageSize = (typeof pagination === 'object' && pagination?.pageSize) || 10;

    // Controlled current page + total visible rows. antd still slices the data;
    // we just drive `current` and mirror it with our own CelumaPagination.
    const [current, setCurrent] = useState(1);
    const [total, setTotal] = useState(searchedData.length);

    // Reset when the visible data changes (search/external filter/data load).
    useEffect(() => {
        setTotal(searchedData.length);
        setCurrent(1);
    }, [searchedData]);

    // Hidden antd pagination (keeps the paging engine: slices to the current page).
    const mergedPagination: TablePaginationConfig | false = isPaginated ? {
        pageSize,
        showSizeChanger: false,
        ...(typeof pagination === 'object' ? pagination : {}),
        current,
        total,
    } : false;

    // Wrap antd onChange so column filters/sorters keep our total + page in range.
    const handleChange: TableProps<T>['onChange'] = (pag, filters, sorter, extra) => {
        const nextTotal = extra.currentDataSource.length;
        setTotal(nextTotal);
        setCurrent((c) => Math.min(c, Math.max(1, Math.ceil(nextTotal / pageSize))));
        onChange?.(pag, filters, sorter, extra);
    };

    return (
        <div>
            {searchable && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <SearchField
                        small
                        value={search}
                        onChange={setSearch}
                        placeholder={searchPlaceholder}
                        style={{ flex: 1, minWidth: 220, maxWidth: searchWidth }}
                    />
                    {searchExtra}
                </div>
            )}
            <Table<T>
                className={["celuma-table", className].filter(Boolean).join(" ")}
                loading={loading}
                dataSource={searchedData}
                rowKey={rowKey}
                columns={columns}
                pagination={mergedPagination}
                onChange={handleChange}
                scroll={{ x: "max-content" }}
                showSorterTooltip={SORTER_TOOLTIP}
                locale={{
                    emptyText: <Empty description={emptyText} />
                }}
                onRow={(record) => ({
                    onClick: () => onRowClick?.(record),
                    style: { cursor: onRowClick ? "pointer" : "default" },
                })}
                {...rest}
            />
            {isPaginated && total > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                    <CelumaPagination
                        current={current}
                        pageSize={pageSize}
                        total={total}
                        onChange={setCurrent}
                    />
                </div>
            )}
        </div>
    );
}
