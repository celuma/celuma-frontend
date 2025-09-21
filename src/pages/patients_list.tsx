import { useEffect, useMemo, useState } from "react";
import { Layout, Table, Input, Tag, Empty, Button as AntButton } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";
import { tokens } from "../components/design/tokens";

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
            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .pl-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.06); padding: 16px; }
                  .pl-toolbar { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
                  .pl-title { margin: 0; font-size: 20px; }
                  .pl-search { max-width: 360px; }
                  .ant-table-wrapper .ant-table { border-radius: 10px; overflow: hidden; }
                `}</style>

                <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <div className="pl-card" style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}>
                        <div className="pl-toolbar">
                            <h2 className="pl-title" style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Pacientes</h2>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <Input.Search
                                    className="pl-search"
                                    allowClear
                                    placeholder="Buscar por código, nombre, email o teléfono"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onSearch={(v) => setSearch(v)}
                                />
                                <AntButton type="primary" onClick={() => navigate("/patients/register")}>Registrar Paciente</AntButton>
                            </div>
                        </div>

                        <Table
                            loading={loading}
                            dataSource={filtered}
                            rowKey={(r) => r.id}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            locale={{ emptyText: <Empty description="Sin pacientes" /> }}
                            columns={[
                                { title: "Código", dataIndex: "patient_code", key: "patient_code", width: 120 },
                                { title: "Nombre", key: "name", render: (_, r: PatientRow) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() },
                                { title: "Sexo", dataIndex: "sex", key: "sex", width: 100, render: (v: string | null) => v ? <Tag color="#49b6ad">{v}</Tag> : "" },
                                { title: "Teléfono", dataIndex: "phone", key: "phone", width: 160 },
                                { title: "Email", dataIndex: "email", key: "email" },
                            ]}
                            onRow={(record) => ({
                                onClick: () => navigate(`/patients/${record.id}`),
                                style: { cursor: "pointer" },
                            })}
                        />

                        <ErrorText>{error}</ErrorText>
                    </div>
                </div>
            </Layout.Content>
        </Layout>
    );
}


