import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, Button } from "antd";

/* ---------------------------
   API helpers
--------------------------- */
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
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore non-JSON */ }
    if (!res.ok) {
        const msg = (parsed as ApiError | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(msg);
    }
    return parsed as TRes;
}

/* ---------------------------
   API types
--------------------------- */
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

/* ---------------------------
   Validation schemas
--------------------------- */
const tenantSchema = z.object({
    name: z.string().nonempty("El nombre es requerido."),
    legal_name: z.string().nonempty("La razón social es requerida."),
});

const branchSchema = z.object({
    code: z.string().nonempty("El código es requerido."),
    name: z.string().nonempty("El nombre es requerido."),
    address_line1: z.string().nonempty("La dirección principal es requerida."),
    address_line2: z.string().optional(),
    postal_code: z.string().nonempty("El código postal es requerido."),
    city: z.string().nonempty("La ciudad es requerida."),
    state: z.string().nonempty("El estado es requerido."),
    country: z.string().nonempty("El país es requerido."),
});

const formSchema = z.object({
    tenant: tenantSchema,
    branch: branchSchema,
});

type RegistrationFormData = z.infer<typeof formSchema>;

/* ---------------------------
   UI helper
--------------------------- */
function FieldError({ error }: { error?: string }) {
    if (!error) return null;
    return <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{error}</p>;
}

/* ---------------------------
   Main component
--------------------------- */
export default function TenantAndBranchOneClick() {
    const timezone = useMemo(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Mexico_City",
        []
    );

    const [loading, setLoading] = useState(false);
    const [tenantRes, setTenantRes] = useState<TenantCreateResponse | null>(null);
    const [branchRes, setBranchRes] = useState<BranchCreateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { control, handleSubmit, formState: { errors } } = useForm<RegistrationFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            tenant: { name: "", legal_name: "" },
            branch: {
                code: "",
                name: "",
                address_line1: "",
                address_line2: "",
                postal_code: "",
                city: "",
                state: "",
                country: "MX",
            },
        },
        mode: "onTouched",
    });

    const onSubmit = handleSubmit(async (data) => {
        setLoading(true);
        setError(null);
        setTenantRes(null);
        setBranchRes(null);

        try {
            // 1) Tenant
            const createdTenant = await postJSON<TenantCreateRequest, TenantCreateResponse>(
                "/v1/tenants/",
                { name: data.tenant.name, legal_name: data.tenant.legal_name, tax_id: "string" }
            );
            setTenantRes(createdTenant);

            // 2) Branch
            const createdBranch = await postJSON<BranchCreateRequest, BranchCreateResponse>(
                "/v1/branches/",
                {
                    tenant_id: createdTenant.id,
                    code: data.branch.code,
                    name: data.branch.name,
                    timezone,
                    address_line1: data.branch.address_line1,
                    address_line2: data.branch.address_line2,
                    postal_code: data.branch.postal_code,
                    city: data.branch.city,
                    state: data.branch.state,
                    country: data.branch.country,
                }
            );
            setBranchRes(createdBranch);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    });

    return (
        <div style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
                Registrar Tenant y Sucursal
            </h1>

            <form onSubmit={onSubmit} style={{ display: "grid", gap: 20 }}>
                {/* Tenant */}
                <section style={{ border: "1px solid #23283a", borderRadius: 12, padding: 16 }}>
                    <h2 style={{ marginBottom: 12 }}>Tenant</h2>
                    <div style={{ display: "grid", gap: 14 }}>
                        <div>
                            <Controller control={control} name="tenant.name" render={({ field }) => <Input {...field} placeholder="Nombre" />} />
                            <FieldError error={errors.tenant?.name?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="tenant.legal_name" render={({ field }) => <Input {...field} placeholder="Razón social" />} />
                            <FieldError error={errors.tenant?.legal_name?.message} />
                        </div>
                    </div>
                </section>

                {/* Branch */}
                <section style={{ border: "1px solid #23283a", borderRadius: 12, padding: 16 }}>
                    <h2 style={{ marginBottom: 12 }}>Sucursal</h2>
                    <p style={{ fontSize: 12, color: "#666" }}>Zona horaria detectada: <code>{timezone}</code></p>

                    <div style={{ display: "grid", gap: 14 }}>
                        <div>
                            <Controller control={control} name="branch.code" render={({ field }) => <Input {...field} placeholder="Código" />} />
                            <FieldError error={errors.branch?.code?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.name" render={({ field }) => <Input {...field} placeholder="Nombre" />} />
                            <FieldError error={errors.branch?.name?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.address_line1" render={({ field }) => <Input {...field} placeholder="Dirección línea 1" />} />
                            <FieldError error={errors.branch?.address_line1?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.address_line2" render={({ field }) => <Input {...field} placeholder="Dirección línea 2 (opcional)" />} />
                            <FieldError error={errors.branch?.address_line2?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.postal_code" render={({ field }) => <Input {...field} placeholder="Código postal" />} />
                            <FieldError error={errors.branch?.postal_code?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.city" render={({ field }) => <Input {...field} placeholder="Ciudad" />} />
                            <FieldError error={errors.branch?.city?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.state" render={({ field }) => <Input {...field} placeholder="Estado" />} />
                            <FieldError error={errors.branch?.state?.message} />
                        </div>
                        <div>
                            <Controller control={control} name="branch.country" render={({ field }) => <Input {...field} placeholder="País (ISO-2)" maxLength={2} />} />
                            <FieldError error={errors.branch?.country?.message} />
                        </div>
                    </div>
                </section>

                {/* Submit */}
                <Button htmlType="submit" type="primary" loading={loading}>
                    Crear tenant y sucursal
                </Button>

                {tenantRes && (
                    <div style={{ marginTop: 10, padding: 10, border: "1px solid green", borderRadius: 8 }}>
                        <strong>✅ Tenant creado</strong>
                        <pre>{JSON.stringify(tenantRes, null, 2)}</pre>
                    </div>
                )}

                {branchRes && (
                    <div style={{ marginTop: 10, padding: 10, border: "1px solid green", borderRadius: 8 }}>
                        <strong>✅ Sucursal creada</strong>
                        <pre>{JSON.stringify(branchRes, null, 2)}</pre>
                    </div>
                )}

                {error && (
                    <div style={{ marginTop: 10, padding: 10, border: "1px solid red", borderRadius: 8 }}>
                        ❌ {error}
                    </div>
                )}
            </form>
        </div>
    );
}

