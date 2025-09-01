import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, Button } from "antd";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

interface ApiError { message?: string }

async function postJSON<TReq extends object, TRes>(
    path: string,
    body: TReq
): Promise<TRes> {
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* non-JSON */ }
    if (!res.ok) {
        const msg = (parsed as ApiError | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    return parsed as TRes;
}

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

const tenantSchema = z.object({
    name: z.string().nonempty("El nombre de la empresa es requerido."),
    legal_name: z.string().nonempty("La razón social es requerida."),
    tax_id: z.string().nonempty("El RFC de la empresa es requerido."),
});
const branchSchema = z.object({
    code: z.string().nonempty("EL identificador de sucursal es requerido."),
    name: z.string().nonempty("El nombre de la sucursal es requerido."),
    address_line1: z.string().nonempty("La dirección es requerida."),
    address_line2: z.string().optional(),
    postal_code: z
        .string()
        .nonempty("El código postal es requerido.")
        .regex(/^\d+$/, "Solo se permiten números."),
    city: z.string().nonempty("La ciudad es requerida."),
    state: z.string().nonempty("El estado es requerido."),
    country: z.string().nonempty("El país es requerido"),
});
const userSchema = z.object({
    email: z.string().nonempty("El email es requerido.").email("Email invalido."),
    username: z.string().optional(),
    password: z
        .string()
        .nonempty("La contraseña es obligatoria.")
        .min(8, "Mínimo 8 caracteres.")
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
            "La contraseña debe contener al menos una minúscula, una mayúscula, un número y un carácter especial."
        ),
    full_name: z.string().nonempty("El nombre completo del empleado es requerido."),
});
const formSchema = z.object({
    tenant: tenantSchema,
    branch: branchSchema,
    user: userSchema,
});

type RegistrationFormData = z.infer<typeof formSchema>;

function FieldError({ error }: { error?: string }) {
    if (!error) return null;
    return <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{error}</p>;
}

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

export default function RegisterAllOneClick() {
    const timezone = useMemo(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Mexico_City",
        []
    );

    const [loading, setLoading] = useState(false);
    const [tenantRes, setTenantRes] = useState<TenantCreateResponse | null>(null);
    const [branchRes, setBranchRes] = useState<BranchCreateResponse | null>(null);
    const [userRes, setUserRes] = useState<RegisterResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { control, handleSubmit, formState: { errors } } = useForm<RegistrationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            tenant: { name: "", legal_name: "", tax_id: "" },
            branch: { code: "", name: "", address_line1: "", address_line2: "", postal_code: "", city: "", state: "", country: "" },
            user: { email: "", username: "", password: "", full_name: "" },
        },
        mode: "onTouched",
    });

    const onSubmit = handleSubmit(async (data) => {
        setLoading(true);
        setError(null);
        setTenantRes(null);
        setBranchRes(null);
        setUserRes(null);

        try {
            const createdTenant = await postJSON<TenantCreateRequest, TenantCreateResponse>(
                "/v1/tenants/",
                {
                    name: data.tenant.name,
                    legal_name: data.tenant.legal_name,
                    tax_id: data.tenant.tax_id,
                }
            );
            setTenantRes(createdTenant);

            const createdBranch = await postJSON<BranchCreateRequest, BranchCreateResponse>(
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
            setBranchRes(createdBranch);

            const createdUser = await postJSON<RegisterRequest, RegisterResponse>(
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
            setUserRes(createdUser);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    });

    return (
        <div style = {{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
            <h1 style = {{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}> ¡Registrate! </h1>

            <form onSubmit = {onSubmit} style = {{ display: "grid", gap: 20 }}>

                <section style = {{ border: "1px solid #23283a", borderRadius: 12, padding: 16 }}>
                    <h2 style = {{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}> Empresa </h2>
                    <div style = {{ display: "grid", gap: 14 }}>
                        <div>
                            <Controller control={control} name="tenant.name" render={({ field }) => (
                                <Input {...field} placeholder="Nombre" />
                            )}/>
                            <FieldError error={errors.tenant?.name?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="tenant.legal_name" render={({ field }) => (
                                <Input {...field} placeholder="Razón social" />
                            )}/>
                            <FieldError error={errors.tenant?.legal_name?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="tenant.tax_id" render={({ field }) => (
                                <Input {...field} placeholder="RFC" />
                            )}/>
                            <FieldError error={errors.tenant?.tax_id?.message} />
                        </div>
                    </div>
                </section>

                <section style = {{ border: "1px solid #23283a", borderRadius: 12, padding: 16 }}>
                    <h2 style = {{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}> Sucursal </h2>
                    <p style={{ marginTop: -6, marginBottom: 10, fontSize: 12, color: "#666" }}>
                        Zona horaria detectada: <code>{timezone}</code>
                    </p>
                    <div style = {{ display: "grid", gap: 14 }}>
                        <div>
                            <Controller control={control} name="branch.code" render={({ field }) => (
                                <Input {...field} placeholder="Identificador" />
                            )}/>
                            <FieldError error={errors.branch?.code?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.name" render={({ field }) => (
                                <Input {...field} placeholder="Nombre" />
                            )}/>
                            <FieldError error={errors.branch?.name?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.address_line1" render={({ field }) => (
                                <Input {...field} placeholder="Dirección" />
                            )}/>
                            <FieldError error={errors.branch?.address_line1?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.address_line2" render={({ field }) => (
                                <Input {...field} placeholder="Dirección 2 (opcional)" />
                            )}/>
                            <FieldError error={errors.branch?.address_line2?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.postal_code" render={({ field }) => (
                                <Input {...numericHandlers(field)} placeholder="Código postal" />
                            )}/>
                            <FieldError error={errors.branch?.postal_code?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.city" render={({ field }) => (
                                <Input {...field} placeholder="Ciudad" />
                            )}/>
                            <FieldError error={errors.branch?.city?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.state" render={({ field }) => (
                                <Input {...field} placeholder="Estado" />
                            )}/>
                            <FieldError error={errors.branch?.state?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.country" render={({ field }) => (
                                <Input {...field} placeholder="País" maxLength={2} />
                            )}/>
                            <FieldError error={errors.branch?.country?.message} />
                        </div>
                    </div>
                </section>

                <section style = {{ border: "1px solid #23283a", borderRadius: 12, padding: 16 }}>
                    <h2 style = {{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}> Usuario </h2>
                    <div style = {{ display: "grid", gap: 14 }}>
                        <div>
                            <Controller control={control} name="user.email" render={({ field }) => (
                                <Input {...field} type="email" placeholder="Email" />
                            )}/>
                            <FieldError error={errors.user?.email?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="user.username" render={({ field }) => (
                                <Input {...field} placeholder="Nombre de usuario" />
                            )}/>
                            <FieldError error={errors.user?.username?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="user.password" render={({ field }) => (
                                <Input.Password {...field} placeholder="Contraseña" />
                            )}/>
                            <FieldError error={errors.user?.password?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="user.full_name" render={({ field }) => (
                                <Input {...field} placeholder="Nombre completo" />
                            )}/>
                            <FieldError error={errors.user?.full_name?.message} />
                        </div>
                    </div>
                </section>

                <Button htmlType = "submit" type = "primary" loading={loading}> Registrarse </Button>

                {tenantRes && (
                    <div style = {{ marginTop: 10, padding: 10, border: "1px solid #16a34a", borderRadius: 8 }}>
                        <strong> ✅ Empresa creada </strong>
                        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(tenantRes, null, 2)}</pre>
                    </div>
                )}
                {branchRes && (
                    <div style = {{ marginTop: 10, padding: 10, border: "1px solid #16a34a", borderRadius: 8 }}>
                        <strong> ✅ Sucursal creada </strong>
                        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(branchRes, null, 2)}</pre>
                    </div>
                )}
                {userRes && (
                    <div style = {{ marginTop: 10, padding: 10, border: "1px solid #16a34a", borderRadius: 8 }}>
                        <strong> ✅ Usuario creado </strong>
                        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(userRes, null, 2)}</pre>
                    </div>
                )}
                {error && (
                    <div style = {{ marginTop: 10, padding: 10, border: "1px solid #ef4444", borderRadius: 8 }}>
                        ❌ {error}
                    </div>
                )}
            </form>
        </div>
    );
}
