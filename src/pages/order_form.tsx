import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout, Card } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import FloatingCaptionDate from "../components/ui/floating_caption_date";
import Panel from "../components/ui/panel";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";
import { sortByLabel } from "../lib/sort";

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
    patient_id: z.string().trim().optional(),
    requesting_physician_id: z.string().trim().optional(),
    study_type_id: z.string().trim().nonempty("El tipo de estudio es requerido."),
    requested_by: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    created_by: z.string().trim().optional(),
    samples: z.array(sampleSchema).min(1, "Agregue al menos una muestra."),
}).refine((data) => Boolean(data.patient_id || data.requesting_physician_id), {
    path: ["patient_id"],
    message: "Seleccione un paciente, un médico solicitante o ambos.",
});

type OrderFormData = z.infer<typeof schema>;

/** The `SampleType` enum as the API accepts it, with its Spanish labels.
 *  Unchanged from `order_register.tsx` — CEL-131-07 modernizes the control,
 *  not the catalogue. */
const SAMPLE_TYPE_OPTIONS = [
    { value: "SANGRE", label: "Sangre" },
    { value: "BIOPSIA", label: "Biopsia" },
    { value: "LAMINILLA", label: "Laminilla" },
    { value: "TEJIDO", label: "Tejido" },
    { value: "OTRO", label: "Otro" },
];

type UnifiedResponse = {
    order: { id: string; order_code: string; status: string; patient_id?: string | null; tenant_id: string; branch_id: string };
    samples: Array<{ id: string; sample_code: string; type: string; state: string; order_id: string; tenant_id: string; branch_id: string }>;
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

/**
 * OrderForm — registers a laboratory order together with its samples in a
 * single `POST /v1/laboratory/orders/unified` call.
 *
 * Céluma 1.3.1 Block E (CEL-131-07): this was `order_register.tsx` /
 * `OrderRegister`, one of the last two screens still built from the older
 * form generation (`SelectField` / `DateField` in a hand-rolled `FormCard`,
 * with bare `<h3>` section headings and no cancel action). It now follows the
 * same architecture as `patient_form.tsx` and `requesting_physician_form.tsx`:
 * `PageHeader` + `Card`, `SectionTitle`, the FloatingCaption field family, and
 * the shared submit/cancel footer.
 *
 * The `_form` name is architectural consistency with the newer screens, NOT a
 * statement that orders became editable. This component only creates; there is
 * no `orderId` route param and no update path.
 */
export default function OrderForm() {
    usePageTitle();
    const navigate = useNavigate();
    const { search } = useLocation();
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const session = useMemo(() => getSessionContext(), []);
    const [patients, setPatients] = useState<Array<{ id: string; label: string }>>([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [requestingPhysicians, setRequestingPhysicians] = useState<Array<{ id: string; label: string }>>([]);
    const [loadingRequestingPhysicians, setLoadingRequestingPhysicians] = useState(false);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [studyTypes, setStudyTypes] = useState<Array<{ id: string; code: string; name: string; is_active: boolean }>>([]);
    const [loadingStudyTypes, setLoadingStudyTypes] = useState(false);
    const [currentUserId] = useState<string>(() => localStorage.getItem("user_id") || sessionStorage.getItem("user_id") || "");

    const prefilledPatientId = useMemo(() => {
        const qs = new URLSearchParams(search);
        return qs.get("patientId") || "";
    }, [search]);

    const prefilledRequestingPhysicianId = useMemo(() => {
        const qs = new URLSearchParams(search);
        return qs.get("requestingPhysicianId") || "";
    }, [search]);

    const { control, handleSubmit, reset } = useForm<OrderFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: session.tenantId,
            branch_id: "",
            patient_id: prefilledPatientId,
            requesting_physician_id: prefilledRequestingPhysicianId,
            study_type_id: "",
            requested_by: "",
            notes: "",
            samples: [
                { sample_code: "", type: undefined as unknown as OrderFormData["samples"][0]["type"], notes: "", collected_date: "", received_date: "" },
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
            try {
                setLoadingRequestingPhysicians(true);
                const data = await getJSON<Array<{
                    id: string;
                    physician_code: string;
                    full_name: string;
                    specialty?: string | null;
                    institution?: string | null;
                }>>("/v1/requesting-physicians/");
                const mapped = (data || []).map((physician) => ({
                    id: physician.id,
                    label: `${physician.physician_code} - ${physician.full_name}${physician.specialty ? ` · ${physician.specialty}` : ""}${physician.institution ? ` · ${physician.institution}` : ""}`.trim(),
                }));
                setRequestingPhysicians(mapped);
            } finally {
                setLoadingRequestingPhysicians(false);
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

    useEffect(() => {
        (async () => {
            try {
                setLoadingStudyTypes(true);
                const data = await getJSON<{ study_types: Array<{ id: string; code: string; name: string; is_active: boolean }> }>("/v1/study-types/");
                setStudyTypes(data.study_types.filter(st => st.is_active));
            } catch (err) {
                console.error("Error loading study types:", err);
            } finally {
                setLoadingStudyTypes(false);
            }
        })();
    }, []);

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
                patient_id: data.patient_id || undefined,
                requesting_physician_id: data.requesting_physician_id || undefined,
                study_type_id: data.study_type_id,
                notes: data.notes || undefined,
                created_by: (currentUserId || undefined),
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
                selectedKey="/orders"
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .of-grid-2 { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
                  .of-grid-3 { display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
                  @media (max-width: 768px) {
                    .of-grid-2, .of-grid-3 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <PageHeader
                        title="Registrar Caso"
                        subtitle="Cree una orden y una o más muestras en una sola operación."
                    />

                    <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 28 }}>
                            {!session.tenantId ? (
                                <section style={{ display: "grid", gap: 16 }}>
                                    <SectionTitle>Contexto</SectionTitle>
                                    <div className="of-grid-2" style={{ alignItems: "start" }}>
                                        <FormField
                                            control={control}
                                            name="tenant_id"
                                            render={(p) => (
                                                <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Tenant ID" requiredMark />
                                            )}
                                        />
                                    </div>
                                </section>
                            ) : null}

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Sucursal</SectionTitle>
                                <div className="of-grid-2">
                                    <FormField
                                        control={control}
                                        name="branch_id"
                                        render={(p) => (
                                            <FloatingCaptionSelect
                                                label="Sucursal"
                                                requiredMark
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val ?? "")}
                                                placeholder="Seleccione la sucursal"
                                                options={branches.map(b => ({ value: b.id, label: `${b.code ?? ""} ${b.name ?? ""}`.trim() }))}
                                                showSearch
                                                loading={loadingBranches}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Paciente</SectionTitle>
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Seleccione un paciente, un médico solicitante o ambos.</p>
                                <div className="of-grid-2">
                                    <FormField
                                        control={control}
                                        name="patient_id"
                                        render={(p) => (
                                            <FloatingCaptionSelect
                                                label="Paciente"
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val ?? "")}
                                                placeholder="Seleccione un paciente"
                                                options={patients.map((pt) => ({ value: pt.id, label: pt.label }))}
                                                showSearch
                                                loading={loadingPatients}
                                                disabled={Boolean(prefilledPatientId)}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Orden</SectionTitle>
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Seleccione el tipo de estudio que se realizará. El código de la orden se asignará automáticamente a partir de él.</p>
                                <div className="of-grid-2">
                                    <FormField
                                        control={control}
                                        name="study_type_id"
                                        render={(p) => (
                                            <FloatingCaptionSelect
                                                label="Tipo de estudio"
                                                requiredMark
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val ?? "")}
                                                placeholder="Seleccionar tipo de estudio"
                                                // C-003: alphabetical by the label the user actually
                                                // scans — here "{name} ({code})" — not by API order.
                                                options={sortByLabel(
                                                    studyTypes.map((st) => ({ value: st.id, label: `${st.name} (${st.code})` })),
                                                    (option) => option.label,
                                                )}
                                                showSearch
                                                loading={loadingStudyTypes}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="requesting_physician_id"
                                        render={(p) => (
                                            <FloatingCaptionSelect
                                                label="Médico solicitante (opcional)"
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val ?? "")}
                                                placeholder="Seleccione un médico solicitante"
                                                options={requestingPhysicians.map((physician) => ({ value: physician.id, label: physician.label }))}
                                                showSearch
                                                loading={loadingRequestingPhysicians}
                                                disabled={Boolean(prefilledRequestingPhysicianId)}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                </div>

                                <div className="of-grid-2">
                                    <FormField
                                        control={control}
                                        name="notes"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Descripción (opcional)" />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Muestras</SectionTitle>
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Registre una o más muestras asociadas a esta orden. Complete el código, tipo y las fechas de recolección y recepción de cada una.</p>
                                <div style={{ display: "grid", gap: 16 }}>
                                    {fields.map((field, index) => (
                                        <Panel key={field.id} style={{ display: "grid", gap: 16 }}>
                                            <div className="of-grid-3">
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.sample_code`}
                                                    render={(p) => (
                                                        <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Código de Muestra" requiredMark />
                                                    )}
                                                />
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.type`}
                                                    render={(p) => (
                                                        <FloatingCaptionSelect
                                                            label="Tipo de muestra"
                                                            requiredMark
                                                            value={typeof p.value === "string" ? p.value : undefined}
                                                            onChange={(val) => p.onChange(val)}
                                                            placeholder="Seleccione el tipo de muestra"
                                                            options={SAMPLE_TYPE_OPTIONS}
                                                            error={p.error}
                                                        />
                                                    )}
                                                />
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.notes`}
                                                    render={(p) => (
                                                        <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Descripción (opcional)" />
                                                    )}
                                                />
                                            </div>

                                            <div className="of-grid-2">
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.collected_date`}
                                                    render={(p) => (
                                                        <FloatingCaptionDate
                                                            label="Fecha de recolección"
                                                            value={typeof p.value === "string" ? p.value : ""}
                                                            onChange={(v) => p.onChange(v)}
                                                            error={p.error}
                                                        />
                                                    )}
                                                />
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.received_date`}
                                                    render={(p) => (
                                                        <FloatingCaptionDate
                                                            label="Fecha de recepción"
                                                            value={typeof p.value === "string" ? p.value : ""}
                                                            onChange={(v) => p.onChange(v)}
                                                            error={p.error}
                                                        />
                                                    )}
                                                />
                                            </div>

                                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                                <Button htmlType="button" size="small" danger onClick={() => remove(index)} disabled={fields.length === 1}>
                                                    Eliminar muestra
                                                </Button>
                                            </div>
                                        </Panel>
                                    ))}

                                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                                        <Button
                                            htmlType="button"
                                            type="default"
                                            onClick={() =>
                                                append({ sample_code: "", type: undefined as unknown as OrderFormData["samples"][0]["type"], notes: "", collected_date: "", received_date: "" })
                                            }
                                        >
                                            Agregar otra muestra
                                        </Button>
                                    </div>
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
                                        Registrar
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
