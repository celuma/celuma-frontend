import { useMemo, useState } from "react";
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
    patient_code: z.string().trim().nonempty("El código del paciente es requerido."),
    first_name: z.string().trim().nonempty("El nombre es requerido."),
    last_name: z.string().trim().nonempty("El apellido es requerido."),
    dob: z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato YYYY-MM-DD"),
    sex: z.enum(["M", "F"]).optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().email("Email inválido").optional(),
});

type PatientFormData = z.infer<typeof schema>;

type CreatePatientResponse = {
    id: string;
    patient_code: string;
    first_name: string;
    last_name: string;
    tenant_id: string;
    branch_id: string;
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,.06)", padding: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h2>
        <div style={{ color: "#64748b", marginBottom: 16, fontSize: 14 }}>Complete los datos para registrar un paciente.</div>
        <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
);

export default function PatientRegister() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const { control, handleSubmit, reset } = useForm<PatientFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: "",
            branch_id: "",
            patient_code: "",
            first_name: "",
            last_name: "",
            dob: "",
            sex: undefined,
            phone: "",
            email: "",
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
                patient_code: data.patient_code,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob || undefined,
                sex: data.sex || undefined,
                phone: data.phone || undefined,
                email: data.email || undefined,
            };
            await postJSON<PatientFormData, CreatePatientResponse>("/v1/patients/", payload);
            reset();
            navigate("/home", { replace: true });
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    });

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/start"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: "#f6f8fa" }}>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 16 }}>
                    <Card title="Registrar Paciente">
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Contexto</h3>
                                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
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
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Paciente</h3>
                                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(3, 1fr)" }}>
                                    <FormField
                                        control={control}
                                        name="patient_code"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Código" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="first_name"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Nombre" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="last_name"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Apellido" />
                                        )}
                                    />
                                </div>

                                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(4, 1fr)" }}>
                                    <FormField
                                        control={control}
                                        name="dob"
                                        render={(p) => (
                                            <TextField
                                                {...p}
                                                value={String(p.value ?? "")}
                                                placeholder="Fecha de nacimiento (YYYY-MM-DD)"
                                                inputMode="numeric"
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="sex"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Sexo (M/F)" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="phone"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Teléfono" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="email"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Email" />
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


