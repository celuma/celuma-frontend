import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, Button } from "antd";
import { useNavigate } from "react-router-dom";
import styles from "../styles/register.module.css";

// API base URL depending on environment
function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

// Simple fetch wrapper with JSON in/out and error handling
interface ApiError { message?: string }

// POST JSON and parse response or throw Error
async function postJSON<TReq extends object, TRes>(path: string, body: TReq): Promise<TRes> {
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore non-JSON */ }
    if (!res.ok) {
        const msg = (parsed as ApiError | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    return parsed as TRes;
}

// Tenants interface
interface TenantCreateRequest {
    name: string;
    legal_name: string;
    tax_id: string;
}
interface TenantCreateResponse {
    id: string;
    name: string;
    legal_name: string;
}

// Branches interface
interface BranchCreateRequest {
    tenant_id: string;
    code: string;
    name: string;
    timezone: string;
    address_line1: string;
    address_line2?: string;
    postal_code: string;
    city: string;
    state: string;
    country: string;
}
interface BranchCreateResponse {
    id: string;
    name: string;
    code: string;
    tenant_id: string;
}

// Users interface
interface RegisterRequest {
    email: string;
    username?: string;
    password: string;
    full_name: string;
    role: string;
    tenant_id: string;
}
interface RegisterResponse {
    id: string;
    email: string;
    username: string;
    full_name: string;
    role: string;
}

// Validations
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
    postal_code: z.string()
        .nonempty("El código postal es requerido.")
        .regex(/^\d+$/, "Debe contener solo números"),
    city: z.string().nonempty("La ciudad es requerida."),
    state: z.string().nonempty("El estado es requerido."),
    country: z.string().nonempty("El país es requerido."),
});
const userSchema = z.object({
    email: z.string().nonempty("El email es requerido.").email("Email inválido."),
    username: z.string().optional(),
    password: z
        .string()
        .nonempty("La contraseña es obligatoria.")
        .min(8, "Mínimo 8 caracteres.")
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
            "La contraseña debe contener al menos una minúscula, una mayúscula, un número y un carácter especial."
        ),
    full_name: z.string().nonempty("El nombre completo es requerido."),
});
const formSchema = z.object({
    tenant: tenantSchema,
    branch: branchSchema,
    user: userSchema,
});

type RegistrationFormData = z.infer<typeof formSchema>;

// Simple component to show field errors below inputs
function FieldError({ error }: { error?: string }) {
    if (!error) return null;
    return <p className = {styles.error}> {error} </p>;
}

// Handlers to enforce numeric-only input
function numericHandlers(field: { value: string; onChange: (v: string) => void }) {
    return {
        value: field.value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const digits = e.target.value.replace(/\D+/g, "");
            field.onChange(digits);
        },

        onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (!/[0-9]/.test(e.key)) e.preventDefault();
        },

        onBeforeInput: (e: React.FormEvent<HTMLInputElement> & { data?: string; nativeEvent: InputEvent }) => {
            // No bloquear mientras el IME está componiendo caracteres
            if (e.nativeEvent?.isComposing) return;
            if (e.data && /\D/.test(e.data)) e.preventDefault();
        },

        onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => {
            const text = e.clipboardData.getData("text");
            if (/\D/.test(text)) {
                e.preventDefault();
                const digits = text.replace(/\D+/g, "");
                if (digits) field.onChange((field.value ?? "") + digits);
            }
        },

        inputMode: "numeric" as const,
        pattern: "[0-9]*",
    };
}

// Principal function
export default function RegisterAllOneClick() {
    const navigate = useNavigate();

    // Detect timezone once
    const timezone = useMemo(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Mexico_City",
        []
    );

    // Global UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { control, handleSubmit, formState: { errors } } = useForm<RegistrationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            tenant: { name: "", legal_name: "", tax_id: "" },
            branch: { code: "", name: "", address_line1: "", address_line2: "", postal_code: "", city: "", state: "", country: "" },
            user: { email: "", username: "", password: "",  full_name: "" },
        },
        mode: "onTouched",
    });

    // Single button flow
    const onSubmit = handleSubmit(async (data) => {
        setLoading(true);
        setError(null);

        try {
            // Create tenant
            const createdTenant = await postJSON<TenantCreateRequest, TenantCreateResponse>(
                "/v1/tenants/",
                {
                    name: data.tenant.name,
                    legal_name: data.tenant.legal_name,
                    tax_id: data.tenant.tax_id,
                }
            );

            // Create branch using tenant.id
            await postJSON<BranchCreateRequest, BranchCreateResponse>(
                "/v1/branches/",
                {
                    tenant_id: createdTenant.id,
                    code: data.branch.code,
                    name: data.branch.name,
                    timezone,
                    address_line1: data.branch.address_line1,
                    address_line2: data.branch.address_line2 || undefined,
                    postal_code: data.branch.postal_code,
                    city: data.branch.city,
                    state: data.branch.state,
                    country: data.branch.country,
                }
            );

            // Create admin user
            await postJSON<RegisterRequest, RegisterResponse>(
                "/v1/auth/register",
                {
                    email: data.user.email,
                    username: data.user.username || undefined,
                    password: data.user.password,
                    full_name: data.user.full_name,
                    role: "admin",
                    tenant_id: createdTenant.id,
                }
            );

            navigate("/login", { replace: true });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    });

    return (
        <div className = {styles.container}>
            <div className = {styles.wrapper}>
                {/* Header */}
                <header className = {styles.header}>
                    <h1 className = {styles.title}> ¡Regístrate! </h1>
                    <p className = {styles.subtitle}> Completa los datos para crear una empresa, sucursal y usuario </p>
                </header>

                <div className = {styles.card}>
                    <form onSubmit = {onSubmit} className = {styles.form}>
                        {/* Tenant */}
                        <section className = {styles.section}>
                            <h2 className = {styles.sectionTitle}> Empresa </h2>
                            <div className = {styles.grid}>
                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "tenant.name"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Nombre" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.tenant?.name?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "tenant.legal_name"
                                        render={({ field }) =>
                                            <Input {...field} placeholder = "Razón social" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.tenant?.legal_name?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "tenant.tax_id"
                                        render={({ field }) =>
                                            <Input {...field} placeholder = "RFC" className={styles.inputs}/>}
                                    />
                                    <FieldError error={errors.tenant?.tax_id?.message} />
                                </div>
                            </div>
                        </section>

                        {/* Branch */}
                        <section className = {styles.section}>
                            <h2 className = {styles.sectionTitle}> Sucursal </h2>
                            <p className = {styles.subtitle}> Zona horaria detectada: <code>{timezone}</code> </p>
                            <div className = {styles.grid}>
                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.code"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Identificador" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.code?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.name"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Nombre" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.name?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.address_line1"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Dirección" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.address_line1?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.address_line2"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Dirección 2 (opcional)" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.address_line2?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.postal_code"
                                        render = {({ field }) =>
                                            <Input {...numericHandlers(field)} placeholder = "Código postal" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.postal_code?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.city"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Ciudad" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.city?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.state"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Estado" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.state?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "branch.country"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "País (ej. MX)" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.branch?.country?.message} />
                                </div>
                            </div>
                        </section>

                        {/* User */}
                        <section className = {styles.section}>
                            <h2 className = {styles.sectionTitle}> Usuario </h2>
                            <div className = {styles.grid}>
                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "user.email"
                                        render = {({ field }) =>
                                            <Input {...field} type = "email" placeholder = "Email" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.user?.email?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "user.username"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Nombre de usuario (opcional)" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.user?.username?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "user.password"
                                        render = {({ field }) =>
                                            <Input.Password {...field} placeholder = "Contraseña" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.user?.password?.message} />
                                </div>

                                <div className = {styles.field}>
                                    <Controller
                                        control = {control}
                                        name = "user.full_name"
                                        render = {({ field }) =>
                                            <Input {...field} placeholder = "Nombre completo" className={styles.inputs} />}
                                    />
                                    <FieldError error={errors.user?.full_name?.message} />
                                </div>
                            </div>
                        </section>

                        {/* Submit */}
                        <div className = {styles.submitRow}>
                            <div className = {styles.submitButton}>
                                <Button htmlType = "submit" type = "primary" loading = {loading} className={styles.buttons}>
                                    Registrarse
                                </Button>
                            </div>
                        </div>
                    </form>

                    {/* Only show global error (no success blocks; we redirect on success) */}
                    {error && <div className = {styles.alertDanger}>❌ {error}</div>}
                </div>
            </div>
        </div>
    );
}
