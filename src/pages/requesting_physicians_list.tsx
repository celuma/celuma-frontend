import { useEffect, useMemo, useState } from "react";
import { Layout, Input, Card, Avatar } from "antd";
import CelumaButton from "../components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, pageTitleStyle, subtitleStyle } from "../components/design/tokens";
import { CelumaTable } from "../components/ui/celuma_table";
import { getInitials, getAvatarColor, stringSorter } from "../components/ui/table_helpers";
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

type RequestingPhysicianRow = {
    id: string;
    physician_code: string;
    first_name: string;
    last_name: string;
    full_name: string;
    specialty?: string | null;
    professional_license?: string | null;
    institution?: string | null;
    phone?: string | null;
    email?: string | null;
    is_active: boolean;
};

export default function RequestingPhysiciansList() {
    usePageTitle();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<RequestingPhysicianRow[]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            setError(null);
            setLoading(true);
            try {
                const data = await getJSON<RequestingPhysicianRow[]>("/v1/requesting-physicians/?active_only=false");
                setRows(data || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) =>
            [row.physician_code, row.full_name, row.specialty, row.professional_license, row.institution, row.email, row.phone]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(q))
        );
    }, [rows, search]);

    const columns: ColumnsType<RequestingPhysicianRow> = [
        {
            title: "Código",
            dataIndex: "physician_code",
            key: "physician_code",
            width: 120,
            sorter: stringSorter("physician_code"),
            defaultSortOrder: "ascend",
        },
        {
            title: "Médico",
            key: "full_name",
            render: (_, row) => {
                const initials = getInitials(row.full_name || row.physician_code);
                const color = getAvatarColor(row.full_name || row.physician_code);
                return (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar size={32} style={{ backgroundColor: color, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                            {initials}
                        </Avatar>
                        <div>
                            <div style={{ fontWeight: 600 }}>{row.full_name}</div>
                            {row.professional_license && <div style={{ fontSize: 11, color: "#888" }}>Cédula: {row.professional_license}</div>}
                        </div>
                    </div>
                );
            },
            sorter: (a, b) => a.full_name.localeCompare(b.full_name),
        },
        { title: "Especialidad", dataIndex: "specialty", key: "specialty", width: 180, sorter: stringSorter("specialty") },
        { title: "Institución", dataIndex: "institution", key: "institution", width: 180, sorter: stringSorter("institution") },
        { title: "Teléfono", dataIndex: "phone", key: "phone", width: 130, sorter: stringSorter("phone") },
        { title: "Email", dataIndex: "email", key: "email", width: 200, sorter: stringSorter("email") },
        {
            title: "Estado",
            dataIndex: "is_active",
            key: "is_active",
            width: 100,
            render: (isActive: boolean) => (
                <div style={{
                    backgroundColor: isActive ? "#ecfdf5" : "#f3f4f6",
                    color: isActive ? "#10b981" : "#6b7280",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "4px 10px",
                    display: "inline-block",
                }}>
                    {isActive ? "Activo" : "Inactivo"}
                </div>
            ),
            filters: [
                { text: "Activo", value: true },
                { text: "Inactivo", value: false },
            ],
            onFilter: (value, record) => record.is_active === value,
        },
    ];

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/home"} onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                        <div className="celuma-page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                            <div>
                                <h1 style={pageTitleStyle}>Médicos Solicitantes</h1>
                                <p style={subtitleStyle}>Consulta y gestiona los médicos solicitantes</p>
                            </div>
                            <CelumaButton type="primary" onClick={() => navigate("/requesting-physicians/register")}>
                                Registrar Médico
                            </CelumaButton>
                        </div>
                    </Card>
                    <Card style={cardStyle}>
                        <div style={{ marginBottom: 16 }}>
                            <Input.Search
                                allowClear
                                placeholder="Buscar médicos solicitantes"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                onSearch={(value) => setSearch(value)}
                                style={{ width: "100%", maxWidth: 320 }}
                            />
                        </div>
                        <CelumaTable
                            dataSource={filtered}
                            columns={columns}
                            rowKey={(row) => row.id}
                            loading={loading}
                            onRowClick={(record) => navigate(`/requesting-physicians/${record.id}`)}
                            emptyText="Sin médicos solicitantes"
                            pagination={{ pageSize: 10 }}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
