import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import SelectField from "../components/ui/select_field";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import { tokens, cardTitleStyle } from "../components/design/tokens";
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
    specialty: z.string().trim().optional(),
    professional_license: z.string().trim().optional(),
    institution: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().optional(),
    address: z.string().trim().optional(),
    is_active: z.enum(["true", "false"]).optional(),
});

type PhysicianFormData = z.infer<typeof schema>;

type RequestingPhysicianResponse = {
    id: string;
    tenant_id: string;
    branch_id: string;
    physician_code: string;
    first_name: string;
    last_name: string;
    full_name: string;
    specialty?: string | null;
    professional_license?: string | null;
    institution?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    is_active: boolean;
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

const RequiredFieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary, marginBottom: 6 }}>
        {children}<span style={{ color: "#ef4444" }}> *</span>
    </div>
);

export default function RequestingPhysicianForm() {
    usePageTitle();
    const navigate = useNavigate();
    const { physicianId } = useParams();
    const isEditing = Boolean(physicianId);
    const session = useMemo(() => getSessionContext(), []);
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);

    const { control, handleSubmit, reset } = useForm<PhysicianFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            branch_id: "",
            first_name: "",
            last_name: "",
            specialty: "",
            professional_license: "",
            institution: "",
            phone: "",
            email: "",
            address: "",
            is_active: "true",
        },
        mode: "onTouched",
    });

    useEffect(() => {
        (async () => {
            if (!session.tenantId) return;
            const data = await getJSON<Array<{ id: string; name?: string; code?: string }>>(`/v1/tenants/${session.tenantId}/branches`);
            setBranches(data || []);
        })().catch((err) => setServerError(err instanceof Error ? err.message : "No se pudieron cargar las sucursales."));
    }, [session.tenantId]);

    useEffect(() => {
        if (!physicianId) return;
        (async () => {
            setLoading(true);
            const detail = await getJSON<RequestingPhysicianResponse>(`/v1/requesting-physicians/${physicianId}`);
            reset({
                branch_id: detail.branch_id,
                first_name: detail.first_name,
                last_name: detail.last_name,
                specialty: detail.specialty || "",
                professional_license: detail.professional_license || "",
                institution: detail.institution || "",
                phone: detail.phone || "",
                email: detail.email || "",
                address: detail.address || "",
                is_active: detail.is_active ? "true" : "false",
            });
        })()
            .catch((err) => setServerError(err instanceof Error ? err.message : "No se pudo cargar el médico solicitante."))
            .finally(() => setLoading(false));
    }, [physicianId, reset]);

    const onSubmit = handleSubmit(async (data) => {
        setServerError(null);
        setLoading(true);
        try {
            const payload = {
                tenant_id: session.tenantId,
                branch_id: data.branch_id,
                first_name: data.first_name,
                last_name: data.last_name,
                specialty: data.specialty || undefined,
                professional_license: data.professional_license || undefined,
                institution: data.institution || undefined,
                phone: data.phone || undefined,
                email: data.email || undefined,
                address: data.address || undefined,
                is_active: data.is_active !== "false",
            };
            const saved = isEditing && physicianId
                ? await requestJSON<typeof payload, RequestingPhysicianResponse>("PUT", `/v1/requesting-physicians/${physicianId}`, payload)
                : await requestJSON<typeof payload, RequestingPhysicianResponse>("POST", "/v1/requesting-physicians/", payload);
            navigate(`/requesting-physicians/${saved.id}`, { replace: true });
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    });

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/requesting-physicians" onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .rp-grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
                  .rp-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
                  .rp-required-note { color: ${tokens.textSecondary}; font-size: 12px; margin: -4px 0 4px; }
                  @media (max-width: 768px) {
                    .rp-grid-2, .rp-grid-3 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <FormCard
                        title={isEditing ? "Editar Médico Solicitante" : "Registrar Médico Solicitante"}
                        description="Administre los datos del médico solicitante para usarlo en las órdenes del laboratorio."
                    >
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                            <div className="rp-required-note"><span style={{ color: "#ef4444" }}>*</span> Campos obligatorios</div>
                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Sucursal</h3>
                                <div className="rp-grid-2">
                                    <FormField
                                        control={control}
                                        name="branch_id"
                                        render={(props) => (
                                            <div>
                                                <RequiredFieldLabel>Sucursal</RequiredFieldLabel>
                                                <SelectField
                                                    value={typeof props.value === "string" ? props.value : undefined}
                                                    onChange={(value) => props.onChange(value)}
                                                    placeholder="Seleccione la sucursal"
                                                    options={branches.map((branch) => ({ value: branch.id, label: `${branch.code ?? ""} ${branch.name ?? ""}`.trim() }))}
                                                    showSearch
                                                    error={props.error}
                                                />
                                            </div>
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="is_active"
                                        render={(props) => (
                                            <SelectField
                                                value={typeof props.value === "string" ? props.value : undefined}
                                                onChange={(value) => props.onChange(value)}
                                                placeholder="Estado"
                                                options={[
                                                    { value: "true", label: "Activo" },
                                                    { value: "false", label: "Inactivo" },
                                                ]}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Médico</h3>
                                {!isEditing && (
                                    <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                        El código de solicitante se asignará automáticamente al guardar.
                                    </div>
                                )}
                                <div className="rp-grid-2">
                                    <FormField control={control} name="first_name" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Nombre" requiredMark />} />
                                    <FormField control={control} name="last_name" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Apellido" requiredMark />} />
                                </div>
                                <div className="rp-grid-3">
                                    <FormField control={control} name="specialty" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Especialidad" />} />
                                    <FormField control={control} name="professional_license" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Cédula profesional" />} />
                                    <FormField control={control} name="institution" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Institución" />} />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Contacto</h3>
                                <div className="rp-grid-3">
                                    <FormField control={control} name="phone" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Teléfono" />} />
                                    <FormField control={control} name="email" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Email" />} />
                                    <FormField control={control} name="address" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Dirección" />} />
                                </div>
                            </section>

                            <Button htmlType="submit" type="primary" fullWidth loading={loading}>
                                {isEditing ? "Guardar cambios" : "Registrar"}
                            </Button>
                        </form>

                        <ErrorText>{serverError}</ErrorText>
                    </FormCard>
                </div>
            </Layout.Content>
        </Layout>
    );
}
