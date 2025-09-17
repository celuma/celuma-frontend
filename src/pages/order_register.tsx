import { useState } from "react";
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
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
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
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore non-JSON */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

const schema = z.object({
    tenant_id: z.string().trim().nonempty("El tenant es requerido."),
    branch_id: z.string().trim().nonempty("La sucursal es requerida."),
    patient_id: z.string().trim().nonempty("El paciente es requerido."),
    order_code: z.string().trim().nonempty("El código de orden es requerido."),
    requested_by: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    created_by: z.string().trim().optional(),
});

type OrderFormData = z.infer<typeof schema>;

type CreateOrderResponse = {
    id: string;
    order_code: string;
    status: string;
    patient_id: string;
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

export default function OrderRegister() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const { control, handleSubmit, reset } = useForm<OrderFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: "",
            branch_id: "",
            patient_id: "",
            order_code: "",
            requested_by: "",
            notes: "",
            created_by: "",
        },
        mode: "onTouched",
    });

    const onSubmit = handleSubmit(async (data) => {
        setServerError(null);
        setLoading(true);
        try {
            const payload = {
                tenant_id: data.tenant_id,
                branch_id: data.branch_id,
                patient_id: data.patient_id,
                order_code: data.order_code,
                requested_by: data.requested_by || undefined,
                notes: data.notes || undefined,
                created_by: data.created_by || undefined,
            };
            await postJSON<OrderFormData, CreateOrderResponse>("/v1/laboratory/orders/", payload);
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
                  .or-grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
                  .or-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
                  .or-grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); }
                  @media (max-width: 768px) {
                    .or-grid-2, .or-grid-3, .or-grid-4 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 16 }}>
                    <Card title="Registrar Orden" description="Complete los datos para registrar una orden de laboratorio.">
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Contexto</h3>
                                <div className="or-grid-3" style={{ alignItems: "start" }}>
                                    <FormField
                                        control={control}
                                        name="tenant_id"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Tenant ID" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="branch_id"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Branch ID" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="patient_id"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Patient ID" />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Orden</h3>
                                <div className="or-grid-2">
                                    <FormField
                                        control={control}
                                        name="order_code"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Código de Orden" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="requested_by"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Solicitado por (opcional)" />
                                        )}
                                    />
                                </div>

                                <div className="or-grid-2">
                                    <FormField
                                        control={control}
                                        name="notes"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Notas (opcional)" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="created_by"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Usuario que crea (UUID opcional)" />
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


