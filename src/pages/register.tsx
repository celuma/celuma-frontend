import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import AuthCard from "../components/auth/auth_card";
import BrandHeader from "../components/auth/brand_header";
import FormField from "../components/ui/form_field";
import TextField from "../components/ui/text_field";
import PasswordField from "../components/ui/password_field";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

interface ApiError { message?: string }

async function postJSON<TReq extends object, TRes>(path: string, body: TReq): Promise<TRes> {
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* */ }
    if (!res.ok) {
        const msg = (parsed as ApiError | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    return parsed as TRes;
}


interface TenantCreateRequest { name: string; legal_name: string; tax_id: string; }

interface UnifiedRegisterRequest {
    tenant: TenantCreateRequest;
    branch: {
        code: string; name: string; timezone: string;
        address_line1: string; address_line2?: string;
        postal_code: string; city: string; state: string; country: string;
    };
    admin_user: {
        email: string; username?: string; password: string; full_name: string;
    };
}
interface UnifiedRegisterResponse { tenant_id: string; branch_id: string; user_id: string; }


const tenantSchema = z.object({
    name: z.string().nonempty("El nombre es requerido."),
    legal_name: z.string().nonempty("La razón social es requerida."),
    tax_id: z.string().nonempty("El RFC es requerido."),
});
const branchSchema = z.object({
    code: z.string().nonempty("El identificador es requerido."),
    name: z.string().nonempty("El nombre es requerido."),
    address_line1: z.string().nonempty("La dirección es requerida."),
    address_line2: z.string().optional(),
    postal_code: z.string().nonempty("El código postal es requerido.").regex(/^\d+$/, "Debe contener solo números"),
    city: z.string().nonempty("La ciudad es requerida."),
    state: z.string().nonempty("El estado es requerido."),
    country: z.string().max(2,"Máximo 2 caracteres.").nonempty("El país es requerido."),
});
const userSchema = z.object({
    email: z.string().nonempty("El email es requerido.").email("Email inválido."),
    username: z.string().optional(),
    password: z.string()
        .nonempty("La contraseña es obligatoria.")
        .min(8, "Mínimo 8 caracteres.")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, "La contraseña debe contener al menos una minúscula, una mayúscula, un número y un carácter especial."),
    confirmPassword: z.string()
        .nonempty("Confirmar contraseña es obligatorio."),
    full_name: z.string().nonempty("El nombre completo es requerido."),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
});
const formSchema = z.object({
    tenant: tenantSchema,
    branch: branchSchema,
    user: userSchema,
});
type RegistrationFormData = z.infer<typeof formSchema>;

export default function RegisterAllOneClick() {
    const navigate = useNavigate();

    const timezone = useMemo(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Mexico_City",
        []
    );

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { control, handleSubmit } = useForm<RegistrationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            tenant: { name: "", legal_name: "", tax_id: "" },
            branch: { code: "", name: "", address_line1: "", address_line2: "", postal_code: "", city: "", state: "", country: "" },
            user: { email: "", username: "", password: "", confirmPassword: "", full_name: "" },
        },
        mode: "onTouched",
    });

    const onSubmit = handleSubmit(async (data) => {
        setLoading(true);
        setError(null);

        try {
            const payload: UnifiedRegisterRequest = {
                tenant: {
                    name: data.tenant.name,
                    legal_name: data.tenant.legal_name,
                    tax_id: data.tenant.tax_id,
                },
                branch: {
                    code: data.branch.code,
                    name: data.branch.name,
                    timezone,
                    address_line1: data.branch.address_line1,
                    address_line2: data.branch.address_line2 || undefined,
                    postal_code: data.branch.postal_code,
                    city: data.branch.city,
                    state: data.branch.state,
                    country: data.branch.country,
                },
                admin_user: {
                    email: data.user.email,
                    username: data.user.username || undefined,
                    password: data.user.password,
                    full_name: data.user.full_name,
                },
            };

            await postJSON<UnifiedRegisterRequest, UnifiedRegisterResponse>("/v1/auth/register/unified", payload);

            navigate("/login", { replace: true });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    });

    const onlyDigits = (s: string) => s.replace(/\D+/g, "");

    return (
        <AuthCard header = {<BrandHeader title = "¡Regístrate!" />}>
            <form onSubmit = {onSubmit} style = {{ display: "grid", gap: 16 }}>
                {/* Company */}
                <section style = {{ display: "grid", gap: 12 }}>
                    <h3 style = {{ margin: 0 }}> Empresa </h3>
                    <div style = {{ display: "grid", gap: 12 }}>
                        <FormField
                            control = {control}
                            name = "tenant.name"
                            render = {(p) => <TextField {...p} value = {String(p.value ?? "")} placeholder="Nombre" />}
                        />
                        <FormField
                            control={control}
                            name="tenant.legal_name"
                            render={(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Razón social" />}
                        />
                        <FormField
                            control={control}
                            name="tenant.tax_id"
                            render={(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="RFC" />}
                        />
                    </div>
                </section>

                {/* Branch */}
                <section style = {{ display: "grid", gap: 12 }}>
                    <h3 style = {{ margin: 0 }}> Sucursal </h3>
                    <h6 style = {{ margin: 0, color: "#6b7280", opacity: 0.9 }}> Zona horaria detectada: <code>{timezone}</code> </h6>
                    <FormField
                        control = {control}
                        name = "branch.code"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Identificador" />}
                    />
                    <FormField
                        control = {control}
                        name ="branch.name"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Nombre" />}
                    />
                    <FormField
                        control = {control}
                        name = "branch.address_line1"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Dirección" />}
                    />
                    <FormField
                        control = {control}
                        name = "branch.address_line2"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Dirección 2 (opcional)" />}
                    />
                    <FormField
                        control = {control}
                        name = "branch.postal_code"
                        render = {(p) => (
                            <TextField
                                {...p}
                                value = {String(p.value ?? "")}
                                onChange = {(e) => p.onChange(onlyDigits(e.target.value))}
                                inputMode = "numeric"
                                pattern = "[0-9]*"
                                placeholder = "Código postal"
                            />
                        )}
                    />
                    <FormField
                        control = {control}
                        name = "branch.city"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Ciudad" />}
                    />
                    <FormField
                        control = {control}
                        name = "branch.state"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Estado" />}
                    />
                    <FormField
                        control = {control}
                        name = "branch.country"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="País (ej. MX)" />}
                    />
                </section>

                {/* User */}
                <section style = {{ display: "grid", gap: 12 }}>
                    <h3 style = {{ margin: 0 }}> Usuario </h3>
                    <FormField
                        control = {control}
                        name = "user.full_name"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Nombre completo" />}
                    />
                    <FormField
                        control = {control}
                        name = "user.email"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Correo electrónico" />}
                    />
                    <FormField
                        control = {control}
                        name = "user.username"
                        render = {(p) => <TextField {...p} value={String(p.value ?? "")} placeholder="Nombre de usuario (opcional)" />}
                    />
                    <FormField
                        control = {control}
                        name = "user.password"
                        render = {(p) => <PasswordField {...p} value={String(p.value ?? "")} placeholder="Contraseña" />}
                    />
                    <FormField
                        control = {control}
                        name = "user.confirmPassword"
                        render = {(p) => <PasswordField {...p} value={String(p.value ?? "")} placeholder="Repetir contraseña" />}
                    />
                </section>

                {/* Submit */}
                <Button htmlType = "submit" type = "primary" fullWidth loading = {loading}>
                    Registrarse
                </Button>
            </form>

            {/* Global error */}
            <ErrorText>{error}</ErrorText>
        </AuthCard>
    );
}
