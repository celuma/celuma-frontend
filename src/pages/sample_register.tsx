import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import TextField from "../components/ui/text_field";
import SelectField from "../components/ui/select_field";
import DateField from "../components/ui/date_field";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getSessionContext() {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
    const branchId = localStorage.getItem("branch_id") || sessionStorage.getItem("branch_id") || "";
    return { token, tenantId, branchId };
}

async function postJSON<TReq extends object, TRes>(path: string, body: TReq): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        accept: "application/json",
    };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
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

const schema = z.object({
    tenant_id: z.string().trim().nonempty("El tenant es requerido."),
    branch_id: z.string().trim().nonempty("La sucursal es requerida."),
    order_id: z.string().trim().nonempty("La orden es requerida."),
    sample_code: z.string().trim().nonempty("El código de muestra es requerido."),
    type: z.enum(["SANGRE", "BIOPSIA", "LAMINILLA", "TEJIDO", "OTRO"]),
    notes: z.string().trim().optional(),
    collected_date: z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato YYYY-MM-DD"),
    received_date: z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato YYYY-MM-DD"),
});

type SampleFormData = z.infer<typeof schema>;

type CreateSampleResponse = {
    id: string;
    sample_code: string;
    type: string;
    state: string;
    order_id: string;
    tenant_id: string;
    branch_id: string;
};

const Card: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,.06)", padding: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h2>
        {description && <div style={{ color: "#64748b", marginBottom: 16, fontSize: 14 }}>{description}</div>}
        <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
);

export default function SampleRegister() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const session = useMemo(() => getSessionContext(), []);
    const [orders, setOrders] = useState<Array<{ id: string; label: string }>>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);

    const { control, handleSubmit, reset } = useForm<SampleFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: session.tenantId,
            branch_id: "",
            order_id: "",
            sample_code: "",
            type: undefined as unknown as SampleFormData["type"],
            notes: "",
            collected_date: "",
            received_date: "",
        },
        mode: "onTouched",
    });

    useEffect(() => {
        (async () => {
            try {
                setLoadingOrders(true);
                const data = await getJSON<Array<{ id: string; order_code: string; status: string }>>("/v1/laboratory/orders/");
                const mapped = (data || []).map((o) => ({ id: o.id, label: `${o.order_code} - ${o.status}` }));
                setOrders(mapped);
            } finally {
                setLoadingOrders(false);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            if (!session.tenantId) return;
            try {
                setLoadingBranches(true);
                const data = await getJSON<Array<{ id: string; name?: string; code?: string }>>(`/v1/tenants/${session.tenantId}/branches`);
                setBranches(data || []);
            } finally {
                setLoadingBranches(false);
            }
        })();
    }, [session.tenantId]);

    const onSubmit = handleSubmit(async (data) => {
        setServerError(null);
        setLoading(true);
        try {
            const finalTenant = session.tenantId || data.tenant_id || "";
            const finalBranch = data.branch_id || "";
            if (!finalTenant || !finalBranch) {
                throw new Error("Faltan tenant_id o branch_id en el contexto de sesión.");
            }
            const payload = {
                tenant_id: finalTenant,
                branch_id: finalBranch,
                order_id: data.order_id,
                sample_code: data.sample_code,
                type: data.type,
                notes: data.notes || undefined,
                collected_at: data.collected_date ? `${data.collected_date}T00:00:00Z` : undefined,
                received_at: data.received_date ? `${data.received_date}T00:00:00Z` : undefined,
            };
            await postJSON<SampleFormData, CreateSampleResponse>("/v1/laboratory/samples/", payload);
            reset();
            navigate("/home", { replace: true });
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    });

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: "#f6f8fa" }}>
                <style>{`
                  .sr-grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
                  .sr-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
                  .sr-grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); }
                  @media (max-width: 768px) {
                    .sr-grid-2, .sr-grid-3, .sr-grid-4 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 16 }}>
                    <Card title="Registrar Muestra" description="Complete los datos para registrar una muestra.">
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                            {!session.tenantId ? (
                                <section style={{ display: "grid", gap: 10 }}>
                                    <h3 style={{ margin: 0 }}>Contexto</h3>
                                    <div className="sr-grid-2" style={{ alignItems: "start" }}>
                                        <FormField
                                            control={control}
                                            name="tenant_id"
                                            render={(p) => (
                                                <TextField {...p} value={String(p.value ?? "")} placeholder="Tenant ID" />
                                            )}
                                        />
                                    </div>
                                </section>
                            ) : null}

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Sucursal</h3>
                                <div className="sr-grid-2">
                                    <FormField
                                        control={control}
                                        name="branch_id"
                                        render={(p) => (
                                            <SelectField
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val)}
                                                placeholder={loadingBranches ? "Cargando sucursales..." : "Seleccione la sucursal"}
                                                options={branches.map(b => ({ value: b.id, label: `${b.code ?? ""} ${b.name ?? ""}`.trim() }))}
                                                showSearch
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Orden</h3>
                                <div className="sr-grid-2">
                                    <FormField
                                        control={control}
                                        name="order_id"
                                        render={(p) => (
                                            <SelectField
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val)}
                                                placeholder={loadingOrders ? "Cargando órdenes..." : "Seleccione una orden"}
                                                options={orders.map((o) => ({ value: o.id, label: o.label }))}
                                                showSearch
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Muestra</h3>
                                <div className="sr-grid-3">
                                    <FormField
                                        control={control}
                                        name="sample_code"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Código de Muestra" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="type"
                                        render={(p) => (
                                            <SelectField
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val)}
                                                placeholder="Tipo de muestra"
                                                options={[
                                                    { value: "SANGRE", label: "Sangre" },
                                                    { value: "BIOPSIA", label: "Biopsia" },
                                                    { value: "LAMINILLA", label: "Laminilla" },
                                                    { value: "TEJIDO", label: "Tejido" },
                                                    { value: "OTRO", label: "Otro" },
                                                ]}
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="notes"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Notas (opcional)" />
                                        )}
                                    />
                                </div>

                                <div className="sr-grid-2">
                                    <FormField
                                        control={control}
                                        name="collected_date"
                                        render={(p) => (
                                            <DateField
                                                value={typeof p.value === "string" ? p.value : ""}
                                                onChange={(v) => p.onChange(v)}
                                                placeholder="Fecha de recolección (AAAA-MM-DD)"
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="received_date"
                                        render={(p) => (
                                            <DateField
                                                value={typeof p.value === "string" ? p.value : ""}
                                                onChange={(v) => p.onChange(v)}
                                                placeholder="Fecha de recepción (AAAA-MM-DD)"
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <Button htmlType="submit" type="primary" fullWidth loading={loading}>
                                Registrar
                            </Button>
                        </form>

                        <ErrorText>{serverError}</ErrorText>
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}


