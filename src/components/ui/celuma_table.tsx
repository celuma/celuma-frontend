import React, { useMemo } from "react";
import { Table, Empty } from "antd";
import type { TableProps, ColumnsType, TablePaginationConfig } from "antd";

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
}

/**
 * CelumaTable - Reusable table component with consistent styling and behavior
 * 
 * Features:
 * - Consistent styling with Céluma design tokens
 * - Default sorting support
 * - Row click navigation
 * - Standardized pagination
 * - Empty state handling
 */
export function CelumaTable<T extends Record<string, unknown>>({
    dataSource,
    columns,
    rowKey,
    onRowClick,
    defaultSort,
    loading = false,
    pagination,
    emptyText = "Sin datos",
    ...rest
}: CelumaTableProps<T>) {
    
    // Apply default sorting to data if specified
    const sortedData = useMemo(() => {
        if (!defaultSort || !dataSource) return dataSource;
        
        const sorted = [...dataSource].sort((a, b) => {
            const aValue = a[defaultSort.field];
            const bValue = b[defaultSort.field];
            
            // Handle null/undefined values
            if (!aValue && !bValue) return 0;
            if (!aValue) return 1;
            if (!bValue) return -1;
            
            // Try date comparison first
            const aDate = new Date(aValue).getTime();
            const bDate = new Date(bValue).getTime();
            
            if (!isNaN(aDate) && !isNaN(bDate)) {
                return defaultSort.order === 'ascend' ? aDate - bDate : bDate - aDate;
            }
            
            // Fall back to string comparison
            const aStr = String(aValue);
            const bStr = String(bValue);
            const comparison = aStr.localeCompare(bStr);
            
            return defaultSort.order === 'ascend' ? comparison : -comparison;
        });
        
        return sorted;
    }, [dataSource, defaultSort]);

    // Default pagination config - spread pagination first so defaults don't override passed props
    const defaultPagination: TablePaginationConfig = pagination !== false ? {
        pageSize: 10,
        showSizeChanger: false,
        ...(typeof pagination === 'object' ? pagination : {}),
    } : false;

    return (
        <Table<T>
            loading={loading}
            dataSource={sortedData}
            rowKey={rowKey}
            columns={columns}
            pagination={defaultPagination}
            locale={{ 
                emptyText: <Empty description={emptyText} /> 
            }}
            onRow={(record) => ({
                onClick: () => onRowClick?.(record),
                style: { cursor: onRowClick ? "pointer" : "default" },
            })}
            {...rest}
        />
    );
}
