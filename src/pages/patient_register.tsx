import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout } from "antd";
import DateField from "../components/ui/date_field";
import SelectField from "../components/ui/select_field";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import { tokens, cardTitleStyle } from "../components/design/tokens";

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
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore non-JSON */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
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
    tenant_id: z.string().trim().optional(),
    branch_id: z.string().trim().optional(),
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

const FormCard: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
        <div style={{ padding: tokens.cardPadding }}>
            <h2 style={{ ...cardTitleStyle, marginTop: 0, marginBottom: 0 }}>{title}</h2>
        </div>
        <div style={{ height: 1, background: "#e5e7eb" }} />
        <div style={{ padding: tokens.cardPadding, display: "grid", gap: 12 }}>
            {description && <div style={{ color: tokens.textSecondary, marginBottom: 16, fontSize: 14 }}>{description}</div>}
            {children}
        </div>
    </div>
);

export default function PatientRegister() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const session = useMemo(() => getSessionContext(), []);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);
    const [, setLoadingBranches] = useState(false);

    const { control, handleSubmit, reset } = useForm<PatientFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: session.tenantId,
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
                patient_code: data.patient_code,
                first_name: data.first_name,
                last_name: data.last_name,
                dob: data.dob || undefined,
                sex: data.sex || undefined,
                phone: data.phone || undefined,
                email: data.email || undefined,
            };
            const created = await postJSON<PatientFormData, CreatePatientResponse>("/v1/patients/", payload);
            reset();
            navigate(`/patients/${created.id}`, { replace: true });
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
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .pr-grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
                  .pr-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
                  .pr-grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); }
                  @media (max-width: 768px) {
                    .pr-grid-2, .pr-grid-3, .pr-grid-4 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <FormCard title="Registrar Paciente" description="Complete los datos para registrar un paciente.">
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                            {!session.tenantId ? (
                                <section style={{ display: "grid", gap: 10 }}>
                                    <h3 style={{ margin: 0 }}>Contexto</h3>
                                    <div className="pr-grid-2" style={{ alignItems: "start" }}>
                                        <FormField
                                            control={control}
                                            name="tenant_id"
                                            render={(p) => (
                                                <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Tenant ID" />
                                            )}
                                        />
                                    </div>
                                </section>
                            ) : null}

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Sucursal</h3>
                                <div className="pr-grid-2">
                                    <FormField
                                        control={control}
                                        name="branch_id"
                                        render={(p) => (
                                            <SelectField
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val)}
                                                placeholder="Seleccione la sucursal"
                                                options={branches.map(b => ({ value: b.id, label: `${b.code ?? ""} ${b.name ?? ""}`.trim() }))}
                                                showSearch
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Paciente</h3>
                                <div className="pr-grid-3">
                                    <FormField
                                        control={control}
                                        name="patient_code"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Código" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="first_name"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Nombre" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="last_name"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Apellido" />
                                        )}
                                    />
                                </div>

                                <div className="pr-grid-4">
                                    <FormField
                                        control={control}
                                        name="dob"
                                        render={(p) => (
                                            <DateField
                                                value={typeof p.value === "string" ? p.value : ""}
                                                onChange={(v) => p.onChange(v)}
                                                placeholder="Fecha de nacimiento"
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="sex"
                                        render={(p) => (
                                            <SelectField
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val)}
                                                placeholder="Sexo"
                                                options={[
                                                    { value: "M", label: "Masculino" },
                                                    { value: "F", label: "Femenino" },
                                                ]}
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="phone"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Teléfono" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="email"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Email" />
                                        )}
                                    />
                                </div>
                            </section>

                            <Button htmlType="submit" type="primary" fullWidth loading={loading}>
                                Registrar
                            </Button>
                        </form>

                        <ErrorText>{serverError}</ErrorText>
                    </FormCard>
                </div>
            </Layout.Content>
        </Layout>
    );
}


