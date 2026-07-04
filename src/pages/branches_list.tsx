import { useEffect, useState } from "react";
import { Layout, Card, Input, Space, Button, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/table";
import { stringSorter } from "../components/ui/table_helpers";
import { usePageTitle } from "../hooks/use_page_title";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

type BranchRow = {
    id: string;
    code: string;
    name: string;
    city?: string | null;
    state?: string | null;
    is_active: boolean;
    tenant_id: string;
};

interface Props {
    embedded?: boolean;
}

function BranchesList({ embedded = false }: Props) {
    usePageTitle();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<BranchRow[]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        setLoading(true);
        getJSON<BranchRow[]>("/v1/branches/")
            .then((data) => setRows(data || []))
            .catch((err) => setError(err instanceof Error ? err.message : "Ocurrió un error inesperado."))
            .finally(() => setLoading(false));
    }, []);

    const filtered = rows.filter((r) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return [r.code, r.name, r.city, r.state]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q));
    });

    const basePath = embedded ? "/config/branches" : "/branches";

    const columns: ColumnsType<BranchRow> = [
        {
            title: "Código",
            dataIndex: "code",
            key: "code",
            width: 120,
            sorter: stringSorter("code"),
            defaultSortOrder: "ascend",
        },
        {
            title: "Nombre",
            dataIndex: "name",
            key: "name",
            sorter: stringSorter("name"),
        },
        {
            title: "Ciudad",
            dataIndex: "city",
            key: "city",
            width: 150,
            sorter: stringSorter("city"),
            render: (v: string | null) => v || "—",
        },
        {
            title: "Estado",
            dataIndex: "state",
            key: "state",
            width: 150,
            sorter: stringSorter("state"),
            render: (v: string | null) => v || "—",
        },
        {
            title: "Estatus",
            dataIndex: "is_active",
            key: "is_active",
            width: 110,
            filters: [
                { text: "Activo", value: true },
                { text: "Inactivo", value: false },
            ],
            onFilter: (value, record) => record.is_active === value,
            render: (v: boolean) => (
                <Tag color={v ? "green" : "default"}>{v ? "Activo" : "Inactivo"}</Tag>
            ),
        },
    ];

    const content = (
        <Card
            title={<span style={cardTitleStyle}>Sucursales</span>}
            style={cardStyle}
            extra={
                <Space>
                    <Input.Search
                        allowClear
                        placeholder="Buscar sucursal"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onSearch={(v) => setSearch(v)}
                        style={{ width: 260 }}
                    />
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate(`${basePath}/register`)}
                    >
                        Nueva sucursal
                    </Button>
                </Space>
            }
        >
            <CelumaTable
                dataSource={filtered}
                columns={columns}
                rowKey={(r) => r.id}
                loading={loading}
                onRowClick={(record) => navigate(`${basePath}/${record.id}`)}
                emptyText="Sin sucursales"
                pagination={{ pageSize: 10 }}
                locale={{
                    filterTitle: "Filtrar",
                    filterConfirm: "Aceptar",
                    filterReset: "Limpiar",
                    filterEmptyText: "Sin filtros",
                    filterCheckall: "Seleccionar todo",
                    filterSearchPlaceholder: "Buscar en filtros",
                    emptyText: "Sin sucursales",
                    selectAll: "Seleccionar todo",
                    selectInvert: "Invertir selección",
                    selectNone: "Limpiar selección",
                    selectionAll: "Seleccionar todos",
                    sortTitle: "Ordenar",
                    expand: "Expandir fila",
                    collapse: "Colapsar fila",
                    triggerDesc: "Clic para ordenar descendente",
                    triggerAsc: "Clic para ordenar ascendente",
                    cancelSort: "Clic para cancelar ordenamiento",
                }}
            />
            {error && <ErrorText>{error}</ErrorText>}
        </Card>
    );

    if (embedded) return content;

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default BranchesList;
