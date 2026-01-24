import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import TextField from "../components/ui/text_field";
import SelectField from "../components/ui/select_field";
import DateField from "../components/ui/date_field";
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
    try { parsed = text ? JSON.parse(text) : undefined; } catch (err) { console.warn("Non-JSON response", err); }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = {
        accept: "application/json",
    };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, {
        method: "GET",
        headers,
        credentials: "include",
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch (err) { console.warn("Non-JSON response", err); }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

const sampleSchema = z.object({
    sample_code: z.string().trim().nonempty("El código de muestra es requerido."),
    type: z.enum(["SANGRE", "BIOPSIA", "LAMINILLA", "TEJIDO", "OTRO"]),
    notes: z.string().trim().optional(),
    collected_date: z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato YYYY-MM-DD"),
    received_date: z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato YYYY-MM-DD"),
});

const schema = z.object({
    tenant_id: z.string().trim().nonempty("El tenant es requerido."),
    branch_id: z.string().trim().nonempty("La sucursal es requerida."),
    patient_id: z.string().trim().nonempty("El paciente es requerido."),
    order_code: z.string().trim().nonempty("El código de orden es requerido."),
    requested_by: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    created_by: z.string().trim().optional(),
    samples: z.array(sampleSchema).min(1, "Agregue al menos una muestra."),
});

type OrderFormData = z.infer<typeof schema>;

type UnifiedResponse = {
    order: { id: string; order_code: string; status: string; patient_id: string; tenant_id: string; branch_id: string };
    samples: Array<{ id: string; sample_code: string; type: string; state: string; order_id: string; tenant_id: string; branch_id: string }>;
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

export default function OrderRegister() {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const session = useMemo(() => getSessionContext(), []);
    const [patients, setPatients] = useState<Array<{ id: string; label: string }>>([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [currentUserId] = useState<string>(() => localStorage.getItem("user_id") || sessionStorage.getItem("user_id") || "");

    const prefilledPatientId = useMemo(() => {
        const qs = new URLSearchParams(search);
        return qs.get("patientId") || "";
    }, [search]);

    const { control, handleSubmit, reset } = useForm<CaseFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: session.tenantId,
            branch_id: "",
            patient_id: prefilledPatientId,
            order_code: "",
            requested_by: "",
            notes: "",
            samples: [
                { sample_code: "", type: undefined as unknown as CaseFormData["samples"][number]["type"], notes: "", collected_date: "", received_date: "" },
            ],
        },
        mode: "onTouched",
    });

    const { fields, append, remove } = useFieldArray({ control, name: "samples" });

    useEffect(() => {
        (async () => {
            try {
                setLoadingPatients(true);
                const data = await getJSON<Array<{ id: string; patient_code: string; first_name?: string; last_name?: string }>>("/v1/patients/");
                const mapped = (data || []).map((p) => ({
                    id: p.id,
                    label: `${p.patient_code}${p.first_name ? ` - ${p.first_name} ${p.last_name ?? ""}` : ""}`.trim(),
                }));
                setPatients(mapped);
            } finally {
                setLoadingPatients(false);
            }
        })();
    }, []);

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
                patient_id: data.patient_id,
                order_code: data.order_code,
                requested_by: data.requested_by || undefined,
                notes: data.notes || undefined,
                created_by: (currentUserId || data.created_by || undefined),
                samples: data.samples.map((s) => ({
                    sample_code: s.sample_code,
                    type: s.type,
                    notes: s.notes || undefined,
                    collected_at: s.collected_date ? `${s.collected_date}T00:00:00Z` : undefined,
                    received_at: s.received_date ? `${s.received_date}T00:00:00Z` : undefined,
                })),
            };
            const created = await postJSON<OrderFormData, UnifiedResponse>("/v1/laboratory/orders/unified", payload as unknown as OrderFormData);
            reset();
            navigate(`/orders/${created.order.id}`, { replace: true });
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
                  .cr-grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
                  .cr-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
                  .cr-grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); }
                  @media (max-width: 768px) {
                    .cr-grid-2, .cr-grid-3, .cr-grid-4 { grid-template-columns: 1fr; }
                  }
                  .sample-card { border: 1px dashed #c8e6e5; border-radius: 10px; padding: 12px; background: #fbffff; }
                `}</style>
                <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <FormCard title="Registrar Caso" description="Cree una orden y una o más muestras en una sola operación.">
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                            {!session.tenantId ? (
                                <section style={{ display: "grid", gap: 10 }}>
                                    <h3 style={{ margin: 0 }}>Contexto</h3>
                                    <div className="cr-grid-2" style={{ alignItems: "start" }}>
                                        <FormField
                                            control={control}
                                            name="tenant_id"
                                            render={(p) => (
                                                <TextField {...p} value={String(p.value ?? "")} placeholder="Tenant ID" />
                                            )}
                                        />
                                    </div>
                                </section>
                            ) : null}

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Sucursal</h3>
                                <div className="cr-grid-2">
                                    <FormField
                                        control={control}
                                        name="branch_id"
                                        render={(p) => (
                                            <SelectField
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val)}
                                                placeholder={loadingBranches ? "Cargando sucursales..." : "Seleccione la sucursal"}
                                                options={branches.map(b => ({ value: b.id, label: `${b.code ?? ""} ${b.name ?? ""}`.trim() }))}
                                                showSearch
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Paciente</h3>
                                <div className="cr-grid-2">
                                    <FormField
                                        control={control}
                                        name="patient_id"
                                        render={(p) => (
                                            <SelectField
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val)}
                                                placeholder={loadingPatients ? "Cargando pacientes..." : "Seleccione un paciente"}
                                                options={patients.map((pt) => ({ value: pt.id, label: pt.label }))}
                                                showSearch
                                                disabled={Boolean(prefilledPatientId)}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Orden</h3>
                                <div className="cr-grid-2">
                                    <FormField
                                        control={control}
                                        name="order_code"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Código de Orden" />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="requested_by"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Solicitante (opcional)" />
                                        )}
                                    />
                                </div>

                                <div className="cr-grid-2">
                                    <FormField
                                        control={control}
                                        name="notes"
                                        render={(p) => (
                                            <TextField {...p} value={String(p.value ?? "")} placeholder="Notas (opcional)" />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Muestras</h3>
                                <div style={{ display: "grid", gap: 12 }}>
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="sample-card">
                                            <div className="cr-grid-3">
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.sample_code`}
                                                    render={(p) => (
                                                        <TextField {...p} value={String(p.value ?? "")} placeholder="Código de Muestra" />
                                                    )}
                                                />
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.type`}
                                                    render={(p) => (
                                                        <SelectField
                                                            value={typeof p.value === "string" ? p.value : undefined}
                                                            onChange={(val) => p.onChange(val)}
                                                            placeholder="Tipo de muestra"
                                                            options={[
                                                                { value: "SANGRE", label: "Sangre" },
                                                                { value: "BIOPSIA", label: "Biopsia" },
                                                                { value: "LAMINILLA", label: "Laminilla" },
                                                                { value: "TEJIDO", label: "Tejido" },
                                                                { value: "OTRO", label: "Otro" },
                                                            ]}
                                                        />
                                                    )}
                                                />
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.notes`}
                                                    render={(p) => (
                                                        <TextField {...p} value={String(p.value ?? "")} placeholder="Notas (opcional)" />
                                                    )}
                                                />
                                            </div>

                                            <div className="cr-grid-2" style={{ marginTop: 8 }}>
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.collected_date`}
                                                    render={(p) => (
                                                        <DateField
                                                            value={typeof p.value === "string" ? p.value : ""}
                                                            onChange={(v) => p.onChange(v)}
                                                            placeholder="Fecha de recolección (AAAA-MM-DD)"
                                                        />
                                                    )}
                                                />
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.received_date`}
                                                    render={(p) => (
                                                        <DateField
                                                            value={typeof p.value === "string" ? p.value : ""}
                                                            onChange={(v) => p.onChange(v)}
                                                            placeholder="Fecha de recepción (AAAA-MM-DD)"
                                                        />
                                                    )}
                                                />
                                            </div>

                                            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                                                <Button type="default" onClick={() => remove(index)}>
                                                    Eliminar muestra
                                                </Button>
                                            </div>
                                        </div>
                                    ))}

                                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                                        <Button
                                            type="default"
                                            onClick={() =>
                                                append({ sample_code: "", type: undefined as unknown as CaseFormData["samples"][number]["type"], notes: "", collected_date: "", received_date: "" })
                                            }
                                        >
                                            Agregar otra muestra
                                        </Button>
                                    </div>
                                </div>
                            </section>

                            <Button htmlType="submit" type="primary" fullWidth loading={loading}>
                                Registrar Caso
                            </Button>
                        </form>

                        <ErrorText>{serverError}</ErrorText>
                    </FormCard>
                </div>
            </Layout.Content>
        </Layout>
    );
}


