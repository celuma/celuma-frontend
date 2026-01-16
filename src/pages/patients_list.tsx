import { useEffect, useMemo, useState } from "react";
import { Layout, Table, Input, Tag, Empty, Button, Card, Space } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle, cardTitleStyle } from "../components/design/tokens";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = {
        accept: "application/json",
    };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "GET",
        headers,
        credentials: "include",
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch (err) { console.warn("Non-JSON response", err); }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

type PatientRow = {
    id: string;
    patient_code: string;
    first_name?: string;
    last_name?: string;
    dob?: string | null;
    sex?: string | null;
    phone?: string | null;
    email?: string | null;
};

export default function PatientsList() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<PatientRow[]>([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            setError(null);
            setLoading(true);
            try {
                const data = await getJSON<PatientRow[]>("/v1/patients/");
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
        return rows.filter((r) =>
            [r.patient_code, r.first_name, r.last_name, r.email, r.phone]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, search]);

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    <Card
                        title={<span style={cardTitleStyle}>Pacientes</span>}
                        extra={
                            <Space>
                                <Input.Search
                                    allowClear
                                    placeholder="Buscar por código, nombre, email o teléfono"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                    style={{ width: 320 }}
                                />
                                <Button type="primary" onClick={() => navigate("/patients/register")}>
                                    Registrar Paciente
                                </Button>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <Table
                            loading={loading}
                            dataSource={filtered}
                            rowKey={(r) => r.id}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Sin pacientes" /> }}
                            columns={[
                                { title: "Código", dataIndex: "patient_code", key: "patient_code", width: 120 },
                                { title: "Nombre", key: "name", render: (_, r: PatientRow) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() },
                                { title: "Sexo", dataIndex: "sex", key: "sex", width: 100, render: (v: string | null) => v ? <Tag color={tokens.primary}>{v}</Tag> : "" },
                                { title: "Teléfono", dataIndex: "phone", key: "phone", width: 160 },
                                { title: "Email", dataIndex: "email", key: "email" },
                            ]}
                            onRow={(record) => ({
                                onClick: () => navigate(`/patients/${record.id}`),
                                style: { cursor: "pointer" },
                            })}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}


