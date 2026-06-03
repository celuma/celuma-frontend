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

const TIMEZONES = [
    "America/Mexico_City",
    "America/Cancun",
    "America/Chihuahua",
    "America/Hermosillo",
    "America/Tijuana",
    "America/Monterrey",
    "America/Merida",
    "America/Mazatlan",
    "America/Bahia_Banderas",
];

const schema = z.object({
    code: z.string().trim().nonempty("El código es requerido."),
    name: z.string().trim().nonempty("El nombre es requerido."),
    timezone: z.string().trim().nonempty("La zona horaria es requerida."),
    address_line1: z.string().trim().optional(),
    address_line2: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    postal_code: z.string().trim().optional(),
    country: z.string().trim().optional(),
    is_active: z.enum(["true", "false"]).optional(),
});

type BranchFormData = z.infer<typeof schema>;

type BranchDetailResponse = {
    id: string;
    code: string;
    name: string;
    timezone: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country: string;
    is_active: boolean;
    tenant_id: string;
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

interface Props {
    embedded?: boolean;
}

function BranchForm({ embedded = false }: Props) {
    usePageTitle();
    const navigate = useNavigate();
    const { branchId } = useParams();
    const isEditing = Boolean(branchId);
    const session = useMemo(() => getSessionContext(), []);
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const basePath = "/config/branches";

    const { control, handleSubmit, reset } = useForm<BranchFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            code: "",
            name: "",
            timezone: "America/Mexico_City",
            address_line1: "",
            address_line2: "",
            city: "",
            state: "",
            postal_code: "",
            country: "MX",
            is_active: "true",
        },
        mode: "onTouched",
    });

    useEffect(() => {
        if (!branchId) return;
        setLoading(true);
        getJSON<BranchDetailResponse>(`/v1/branches/${branchId}`)
            .then((detail) => {
                reset({
                    code: detail.code,
                    name: detail.name,
                    timezone: detail.timezone,
                    address_line1: detail.address_line1 || "",
                    address_line2: detail.address_line2 || "",
                    city: detail.city || "",
                    state: detail.state || "",
                    postal_code: detail.postal_code || "",
                    country: detail.country || "MX",
                    is_active: detail.is_active ? "true" : "false",
                });
            })
            .catch((err) => setServerError(err instanceof Error ? err.message : "No se pudo cargar la sucursal."))
            .finally(() => setLoading(false));
    }, [branchId, reset]);

    const onSubmit = handleSubmit(async (data) => {
        setServerError(null);
        setLoading(true);
        try {
            if (isEditing && branchId) {
                const payload = {
                    code: data.code,
                    name: data.name,
                    timezone: data.timezone,
                    address_line1: data.address_line1 || undefined,
                    address_line2: data.address_line2 || undefined,
                    city: data.city || undefined,
                    state: data.state || undefined,
                    postal_code: data.postal_code || undefined,
                    country: data.country || "MX",
                    is_active: data.is_active !== "false",
                };
                const saved = await requestJSON<typeof payload, BranchDetailResponse>("PUT", `/v1/branches/${branchId}`, payload);
                navigate(`${basePath}/${saved.id}`, { replace: true });
            } else {
                if (!session.tenantId) throw new Error("Falta el contexto de tenant en la sesión.");
                const payload = {
                    tenant_id: session.tenantId,
                    code: data.code,
                    name: data.name,
                    timezone: data.timezone,
                    address_line1: data.address_line1 || undefined,
                    address_line2: data.address_line2 || undefined,
                    city: data.city || undefined,
                    state: data.state || undefined,
                    postal_code: data.postal_code || undefined,
                    country: data.country || "MX",
                    is_active: data.is_active !== "false",
                };
                const saved = await requestJSON<typeof payload, BranchDetailResponse>("POST", "/v1/branches/", payload);
                navigate(`${basePath}/${saved.id}`, { replace: true });
            }
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    });

    const form = (
        <FormCard
            title={isEditing ? "Editar Sucursal" : "Nueva Sucursal"}
            description="Configure los datos de la sucursal del laboratorio."
        >
            <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                <style>{`
                  .bf-grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
                  .bf-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
                  .bf-required-note { color: ${tokens.textSecondary}; font-size: 12px; margin: -4px 0 4px; }
                  @media (max-width: 768px) {
                    .bf-grid-2, .bf-grid-3 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div className="bf-required-note"><span style={{ color: "#ef4444" }}>*</span> Campos obligatorios</div>

                <section style={{ display: "grid", gap: 10 }}>
                    <h3 style={{ margin: 0 }}>Información general</h3>
                    <div className="bf-grid-2">
                        <FormField
                            control={control}
                            name="code"
                            render={(props) => (
                                <div>
                                    <RequiredFieldLabel>Código</RequiredFieldLabel>
                                    <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Código" requiredMark />
                                </div>
                            )}
                        />
                        <FormField
                            control={control}
                            name="name"
                            render={(props) => (
                                <div>
                                    <RequiredFieldLabel>Nombre</RequiredFieldLabel>
                                    <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Nombre" requiredMark />
                                </div>
                            )}
                        />
                    </div>
                    <div className="bf-grid-2">
                        <FormField
                            control={control}
                            name="timezone"
                            render={(props) => (
                                <div>
                                    <RequiredFieldLabel>Zona horaria</RequiredFieldLabel>
                                    <SelectField
                                        value={typeof props.value === "string" ? props.value : undefined}
                                        onChange={(val) => props.onChange(val)}
                                        placeholder="Seleccione la zona horaria"
                                        options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
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
                                    onChange={(val) => props.onChange(val)}
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
                    <h3 style={{ margin: 0 }}>Dirección</h3>
                    <FormField control={control} name="address_line1" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Dirección línea 1" />} />
                    <FormField control={control} name="address_line2" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Dirección línea 2" />} />
                    <div className="bf-grid-3">
                        <FormField control={control} name="city" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Ciudad" />} />
                        <FormField control={control} name="state" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Estado" />} />
                        <FormField control={control} name="postal_code" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Código postal" />} />
                    </div>
                    <div className="bf-grid-2">
                        <FormField control={control} name="country" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="País (código ISO)" />} />
                    </div>
                </section>

                <Button htmlType="submit" type="primary" fullWidth loading={loading}>
                    {isEditing ? "Guardar cambios" : "Crear sucursal"}
                </Button>
            </form>

            <ErrorText>{serverError}</ErrorText>
        </FormCard>
    );

    if (embedded) {
        return <div style={{ maxWidth: 900 }}>{form}</div>;
    }

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 900, margin: "0 auto" }}>{form}</div>
            </Layout.Content>
        </Layout>
    );
}

export default BranchForm;
