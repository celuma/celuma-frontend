import React, { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, Button } from "antd";

// ---------- API base (tipado) ----------
const API_BASE: string = import.meta.env.VITE_API_BACKEND_HOST ?? "";

// ---------- Tipos de requests/responses ----------
// Tenants
interface TenantCreateRequest {
    name: string;
    legal_name: string;
}
interface TenantCreateResponse {
    tax_id: string; // lo usaremos como tenant_id
    name?: string;
    legal_name?: string;
}

// Branches
interface BranchCreateRequest {
    tenant_id: string;
    code: string;
    name: string;
    timezone: string;
    address_line1: string;
    city: string;
    state: string;
    country: string; // string requerido
}
interface BranchCreateResponse {
    id?: string;
    tenant_id?: string;
    code?: string;
    name?: string;
}

// Users
interface RegisterRequest {
    email: string;
    password: string;
    full_name: string;
    role: string; // string requerido
    tenant_id: string;
    username: string;
}
interface RegisterResponse {
    id?: string;
    email?: string;
    full_name?: string;
    role?: string;
    tenant_id?: string;
}

// Error de API (opcional)
interface ApiError { message?: string }

// ---------- Cliente HTTP tipado ----------
async function postJSON<TReq extends object, TRes>(path: string, body: TReq, init?: RequestInit): Promise<TRes> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        ...init,
    });

    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : undefined;

    if (!res.ok) {
        const message = (parsed as ApiError | undefined)?.message ?? res.statusText ?? "Request failed";
        throw new Error(message);
    }

    return parsed as TRes;
}

// ---------- Zod Schemas (country/role siempre string) ----------
const tenantSchema = z.object({
    name: z.string().min(2, "Requerido"),
    legal_name: z.string().min(2, "Requerido"),
});

const branchSchema = z.object({
    code: z.string().min(1, "Requerido").max(20),
    name: z.string().min(2, "Requerido"),
    address_line1: z.string().min(2, "Requerido"),
    city: z.string().min(2, "Requerido"),
    state: z.string().min(2, "Requerido"),
    country: z.string().length(2, "2 letras (ISO)") // sin default; siempre string
});

const employeeSchema = z.object({
    email: z.string().email("Correo inválido"),
    username: z.string().min(3, "Mínimo 3 caracteres").max(40).regex(/^[a-zA-Z0-9_.-]+$/, "Sólo letras, números y _.-"),
    password: z.string().min(8, "Mínimo 8 caracteres").regex(/[A-Z]/, "Incluye mayúscula").regex(/[a-z]/, "Incluye minúscula").regex(/[0-9]/, "Incluye número"),
    full_name: z.string().min(3, "Nombre completo requerido"),
    role: z.string().min(1, "Requerido"), // sin default; siempre string
});

const formSchema = z.object({
    tenant: tenantSchema,
    branch: branchSchema,
    employee: employeeSchema,
});

export type RegistrationFormData = z.infer<typeof formSchema>;

// ---------- UI Helpers ----------
function FieldError({ error }: { error?: string }) {
    if (!error) return null;
    return <p className="mt-1 text-sm text-rose-600">{error}</p>;
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
    return (
        <section className="rounded-2xl border border-zinc-800/40 bg-zinc-900/40 p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-zinc-100">{title}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
        </section>
    );
}

// ---------- Main ----------
export default function RegistrationWizard() {
    const timezone: string = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Mexico_City", []);

    const [loading, setLoading] = useState<boolean>(false);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [result, setResult] = useState<{ tenant?: TenantCreateResponse; branch?: BranchCreateResponse; user?: RegisterResponse } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { control, handleSubmit, formState: { errors } } = useForm<RegistrationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            tenant: { name: "", legal_name: "" },
            branch: { code: "", name: "", address_line1: "", city: "", state: "", country: "MX" },
            employee: { email: "", username: "", password: "", full_name: "", role: "admin" },
        },
        mode: "onTouched",
    });

    const onSubmit = handleSubmit(async (data) => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            // 1) Tenant
            const createdTenant = await postJSON<TenantCreateRequest, TenantCreateResponse>("/api/v1/tenants/", {
                name: data.tenant.name,
                legal_name: data.tenant.legal_name,
            });

            const newTenantId: string | undefined = createdTenant.tax_id;
            if (!newTenantId) throw new Error("No recibí tax_id/tenant_id del servidor");
            setTenantId(newTenantId);

            // 2) Branch
            const createdBranch = await postJSON<BranchCreateRequest, BranchCreateResponse>("/api/v1/branches/", {
                tenant_id: newTenantId,
                code: data.branch.code,
                name: data.branch.name,
                timezone,
                address_line1: data.branch.address_line1,
                city: data.branch.city,
                state: data.branch.state,
                country: data.branch.country,
            });

            // 3) User
            const createdUser = await postJSON<RegisterRequest, RegisterResponse>("/api/v1/auth/register", {
                email: data.employee.email,
                password: data.employee.password,
                full_name: data.employee.full_name,
                role: data.employee.role,
                tenant_id: newTenantId,
                username: data.employee.username,
            });

            setResult({ tenant: createdTenant, branch: createdBranch, user: createdUser });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error desconocido";
            setError(message);
        } finally {
            setLoading(false);
        }
    });

    return (
        <div className="mx-auto max-w-4xl space-y-5 p-6 text-zinc-200">
            <header className="mb-2">
                <h1 className="text-2xl font-bold">Registro de empresa, sucursal y usuario</h1>
                <p className="text-sm text-zinc-400">Zona horaria detectada: <code>{timezone}</code></p>
            </header>

            <form onSubmit={onSubmit} className="space-y-6">
                {/* Empresa */}
                <Section title="Empresa">
                    <div className="md:col-span-2">
                        <Controller control={control} name="tenant.name" render={({ field }) => (<Input {...field} placeholder="Nombre" />)} />
                        <FieldError error={errors.tenant?.name?.message} />
                    </div>
                    <div className="md:col-span-2">
                        <Controller control={control} name="tenant.legal_name" render={({ field }) => (<Input {...field} placeholder="Nombre legal" />)} />
                        <FieldError error={errors.tenant?.legal_name?.message} />
                    </div>
                </Section>

                {/* Sucursal */}
                <Section title="Sucursal">
                    <div>
                        <Controller control={control} name="branch.code" render={({ field }) => (<Input {...field} placeholder="Código" />)} />
                        <FieldError error={errors.branch?.code?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="branch.name" render={({ field }) => (<Input {...field} placeholder="Nombre" />)} />
                        <FieldError error={errors.branch?.name?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="branch.address_line1" render={({ field }) => (<Input {...field} placeholder="Dirección" />)} />
                        <FieldError error={errors.branch?.address_line1?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="branch.city" render={({ field }) => (<Input {...field} placeholder="Ciudad" />)} />
                        <FieldError error={errors.branch?.city?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="branch.state" render={({ field }) => (<Input {...field} placeholder="Estado" />)} />
                        <FieldError error={errors.branch?.state?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="branch.country" render={({ field }) => (<Input {...field} placeholder="País (ISO-2)" maxLength={2} />)} />
                        <FieldError error={errors.branch?.country?.message} />
                    </div>
                </Section>

                {/* Empleado */}
                <Section title="Empleado (admin)">
                    <div>
                        <Controller control={control} name="employee.email" render={({ field }) => (<Input {...field} type="email" placeholder="Correo" />)} />
                        <FieldError error={errors.employee?.email?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="employee.username" render={({ field }) => (<Input {...field} placeholder="Nombre de usuario" />)} />
                        <FieldError error={errors.employee?.username?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="employee.password" render={({ field }) => (<Input.Password {...field} placeholder="Contraseña" />)} />
                        <FieldError error={errors.employee?.password?.message} />
                    </div>
                    <div>
                        <Controller control={control} name="employee.full_name" render={({ field }) => (<Input {...field} placeholder="Nombre completo" />)} />
                        <FieldError error={errors.employee?.full_name?.message} />
                    </div>
                </Section>

                {/* Submit */}
                <div className="flex items-center gap-3">
                    <Button htmlType="submit" type="primary" loading={loading}>Crear todo</Button>
                    {tenantId && (<span className="text-sm text-zinc-400">tenant_id (tax_id): <code>{tenantId}</code></span>)}
                </div>

                {error && (<div className="rounded-xl border border-rose-800/50 bg-rose-900/20 p-3 text-rose-300">❌ {error}</div>)}

                {result && (
                    <div className="space-y-2 rounded-xl border border-emerald-800/50 bg-emerald-900/20 p-3 text-emerald-300">
                        <p className="font-semibold">✅ Todo listo</p>
                        <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs leading-relaxed">{JSON.stringify(result, null, 2)}</pre>
                    </div>
                )}
            </form>
        </div>
    );
}

