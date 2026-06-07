import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout, Card } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import FloatingCaptionDate from "../components/ui/floating_caption_date";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getSessionContext() {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
    return { token, tenantId };
}

async function requestJSON<TReq extends object, TRes>(method: "POST" | "PUT", path: string, body: TReq): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { "Content-Type": "application/json", accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, {
        method,
        headers,
        body: JSON.stringify(body),
        credentials: "include",
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
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
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

const schema = z.object({
    branch_id: z.string().trim().nonempty("La sucursal es requerida."),
    first_name: z.string().trim().nonempty("El nombre es requerido."),
    last_name: z.string().trim().nonempty("El apellido es requerido."),
    dob: z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato YYYY-MM-DD"),
    sex: z.enum(["M", "F"]).optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().optional(),
});

type PatientFormData = z.infer<typeof schema>;

type PatientDetailResponse = {
    id: string;
    patient_code: string;
    first_name: string;
    last_name: string;
    dob?: string | null;
    sex?: string | null;
    phone?: string | null;
    email?: string | null;
    tenant_id: string;
    branch_id: string;
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 style={{
        margin: 0,
        fontFamily: tokens.titleFont,
        fontSize: 18,
        fontWeight: 700,
        color: tokens.textPrimary,
        letterSpacing: "-0.01em",
    }}>
        {children}
    </h3>
);

export default function PatientForm() {
    usePageTitle();
    const navigate = useNavigate();
    const { patientId } = useParams();
    const isEditing = Boolean(patientId);
    const session = useMemo(() => getSessionContext(), []);
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);

    const { control, handleSubmit, reset } = useForm<PatientFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            branch_id: "",
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
        if (!session.tenantId) return;
        getJSON<Array<{ id: string; name?: string; code?: string }>>(`/v1/tenants/${session.tenantId}/branches`)
            .then((data) => setBranches(data || []))
            .catch((err) => setServerError(err instanceof Error ? err.message : "No se pudieron cargar las sucursales."));
    }, [session.tenantId]);

    useEffect(() => {
        if (!patientId) return;
        setLoading(true);
        getJSON<PatientDetailResponse>(`/v1/patients/${patientId}`)
            .then((detail) => {
                reset({
                    branch_id: detail.branch_id,
                    first_name: detail.first_name,
                    last_name: detail.last_name,
                    dob: detail.dob || "",
                    sex: (detail.sex as "M" | "F" | undefined) || undefined,
                    phone: detail.phone || "",
                    email: detail.email || "",
                });
            })
            .catch((err) => setServerError(err instanceof Error ? err.message : "No se pudo cargar el paciente."))
            .finally(() => setLoading(false));
    }, [patientId, reset]);

    const onSubmit = handleSubmit(async (data) => {
        setServerError(null);
        setLoading(true);
        try {
            if (isEditing && patientId) {
                const payload = {
                    branch_id: data.branch_id,
                    first_name: data.first_name,
                    last_name: data.last_name,
                    dob: data.dob || undefined,
                    sex: data.sex || undefined,
                    phone: data.phone || undefined,
                    email: data.email || undefined,
                };
                const saved = await requestJSON<typeof payload, PatientDetailResponse>("PUT", `/v1/patients/${patientId}`, payload);
                navigate(`/patients/${saved.id}`, { replace: true });
            } else {
                if (!session.tenantId) throw new Error("Falta el contexto de tenant en la sesión.");
                const payload = {
                    tenant_id: session.tenantId,
                    branch_id: data.branch_id,
                    first_name: data.first_name,
                    last_name: data.last_name,
                    dob: data.dob || undefined,
                    sex: data.sex || undefined,
                    phone: data.phone || undefined,
                    email: data.email || undefined,
                };
                const saved = await requestJSON<typeof payload, PatientDetailResponse>("POST", "/v1/patients/", payload);
                navigate(`/patients/${saved.id}`, { replace: true });
            }
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    });

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/patients" onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .pf-grid-2 { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
                  .pf-grid-3 { display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
                  @media (max-width: 768px) {
                    .pf-grid-2, .pf-grid-3 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <PageHeader
                        title={isEditing ? "Editar Paciente" : "Registrar Paciente"}
                        subtitle="Administra los datos del paciente para usarlo en las órdenes del laboratorio."
                    />

                    <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 28 }}>
                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Información general</SectionTitle>
                                <div className="pf-grid-2">
                                    <FormField
                                        control={control}
                                        name="branch_id"
                                        render={(props) => (
                                            <FloatingCaptionSelect
                                                label="Sucursal"
                                                requiredMark
                                                value={typeof props.value === "string" ? props.value : undefined}
                                                onChange={(value) => props.onChange(value ?? "")}
                                                placeholder="Seleccione la sucursal"
                                                options={branches.map((branch) => ({ value: branch.id, label: `${branch.code ?? ""} ${branch.name ?? ""}`.trim() }))}
                                                showSearch
                                                error={props.error}
                                            />
                                        )}
                                    />
                                </div>
                                {!isEditing && (
                                    <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                        El código de paciente se asignará automáticamente al guardar.
                                    </div>
                                )}
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Datos del paciente</SectionTitle>
                                <div className="pf-grid-2">
                                    <FormField control={control} name="first_name" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Nombre" requiredMark />} />
                                    <FormField control={control} name="last_name" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Apellido" requiredMark />} />
                                </div>
                                <div className="pf-grid-2">
                                    <FormField
                                        control={control}
                                        name="dob"
                                        render={(props) => (
                                            <FloatingCaptionDate
                                                label="Fecha de nacimiento"
                                                value={typeof props.value === "string" ? props.value : ""}
                                                onChange={(v) => props.onChange(v)}
                                                error={props.error}
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="sex"
                                        render={(props) => (
                                            <FloatingCaptionSelect
                                                label="Sexo"
                                                value={typeof props.value === "string" ? props.value : undefined}
                                                onChange={(val) => props.onChange(val)}
                                                placeholder="Seleccione el sexo"
                                                options={[
                                                    { value: "M", label: "Masculino" },
                                                    { value: "F", label: "Femenino" },
                                                ]}
                                                error={props.error}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Contacto</SectionTitle>
                                <div className="pf-grid-2">
                                    <FormField
                                        control={control}
                                        name="phone"
                                        render={(props) => (
                                            <FloatingCaptionInput
                                                label="Teléfono"
                                                value={String(props.value ?? "")}
                                                inputMode="numeric"
                                                maxLength={15}
                                                onBlur={props.onBlur}
                                                onChange={(e) => props.onChange(e.target.value.replace(/\D/g, ""))}
                                                error={props.error}
                                            />
                                        )}
                                    />
                                    <FormField control={control} name="email" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Email" />} />
                                </div>
                            </section>

                            {serverError && <ErrorText>{serverError}</ErrorText>}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                    Los campos marcados con <span style={{ color: "#e5484d", fontWeight: 700 }}>*</span> son obligatorios.
                                </div>
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    <Button htmlType="button" danger onClick={() => navigate(-1)} disabled={loading}>
                                        Cancelar
                                    </Button>
                                    <Button htmlType="submit" type="primary" loading={loading}>
                                        {isEditing ? "Guardar cambios" : "Registrar"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
