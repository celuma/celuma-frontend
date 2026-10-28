import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";
import { useActiveSampleTypes } from "../hooks/use_active_sample_types";
import { createIdempotencySession, IDEMPOTENCY_HEADER } from "../lib/idempotency";
import AutoCodeHint from "../components/numbering/auto_code_hint";
import SampleTypeSetupNotice from "../components/catalog/sample_type_setup_notice";
import { formatHttpError } from "../lib/api_error";
import { collectionDateSchema, receiptDateSchema } from "../lib/receipt_date";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getSessionContext() {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
    const branchId = localStorage.getItem("branch_id") || sessionStorage.getItem("branch_id") || "";
    return { token, tenantId, branchId };
}

async function postJSON<TReq extends object, TRes>(path: string, body: TReq, extraHeaders: Record<string, string> = {}): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        accept: "application/json",
        ...extraHeaders,
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
        const message = (parsed as { message?: string } | undefined)?.message ?? formatHttpError(res.status, text);
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

const schema = z.object({
    tenant_id: z.string().trim().nonempty("El tenant es requerido."),
    branch_id: z.string().trim().nonempty("La sucursal es requerida."),
    order_id: z.string().trim().nonempty("La orden es requerida."),
    // Céluma 1.4 (#17): an active type of the laboratory catalog, always required.
    sample_type_id: z.string().trim().nonempty("El tipo de muestra es requerido."),
    notes: z.string().trim().optional(),
    collected_date: collectionDateSchema,
    // Céluma 1.4 (#33): required. The monthly code is numbered by the receipt date; collection stays optional.
    received_date: receiptDateSchema,
});

type SampleFormData = z.infer<typeof schema>;

type CreateSampleResponse = {
    id: string;
    sample_code: string;
    sample_type: { id: string; code: string; name: string; is_active: boolean } | null;
    state: string;
    order_id: string;
    tenant_id: string;
    branch_id: string;
};

type OrdersListResponse = {
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
    }>;
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
 * SampleForm — registers a single sample against an existing order
 * (`POST /v1/laboratory/samples/`).
 *
 * Céluma 1.3.1 Block E (CEL-131-07): this was `sample_register.tsx` /
 * `SampleRegister`, built from the older form generation (`SelectField` /
 * `DateField` inside a hand-rolled `FormCard`). It now follows the same
 * architecture as `patient_form.tsx` and `requesting_physician_form.tsx`.
 *
 * The `_form` name is architectural consistency with the newer screens, NOT a
 * statement that samples became editable here. This component only creates;
 * sample fields are edited from `sample_detail.tsx`.
 */
export default function SampleForm() {
    usePageTitle();
    const navigate = useNavigate();
    const { search } = useLocation();
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const session = useMemo(() => getSessionContext(), []);
    const [orders, setOrders] = useState<Array<{ id: string; label: string }>>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const sampleTypes = useActiveSampleTypes();
    const idempotency = useMemo(() => createIdempotencySession(), []);

    const prefilledOrderId = useMemo(() => {
        const qs = new URLSearchParams(search);
        return qs.get("orderId") || "";
    }, [search]);

    const { control, handleSubmit, reset } = useForm<SampleFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: session.tenantId,
            branch_id: "",
            order_id: prefilledOrderId,
            sample_type_id: "",
            notes: "",
            collected_date: "",
            received_date: "",
        },
        mode: "onTouched",
    });

    const watchedType = useWatch({ control, name: "sample_type_id" });
    const watchedBranch = useWatch({ control, name: "branch_id" });
    const watchedReceived = useWatch({ control, name: "received_date" });

    useEffect(() => {
        (async () => {
            try {
                setLoadingOrders(true);
                const data = await getJSON<OrdersListResponse>("/v1/laboratory/orders/");
                const mapped = (data.orders || []).map((o) => ({ id: o.id, label: `${o.order_code} - ${o.status}` }));
                setOrders(mapped);
            } finally {
                setLoadingOrders(false);
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
            // The sample code is never sent: the server always generates it (Céluma 1.4).
            const payload = {
                tenant_id: finalTenant,
                branch_id: finalBranch,
                order_id: data.order_id,
                sample_type_id: data.sample_type_id,
                notes: data.notes || undefined,
                // Date-only values (YYYY-MM-DD), never `…T00:00:00Z`: the API reads them as the laboratory's
                // local calendar date (#33). A UTC midnight is the previous evening in Mexico City.
                collected_at: data.collected_date || undefined,
                received_at: data.received_date,
            };
            const created = await postJSON<SampleFormData, CreateSampleResponse>(
                "/v1/laboratory/samples/", payload as unknown as SampleFormData, { [IDEMPOTENCY_HEADER]: idempotency.keyFor(payload) },
            );
            idempotency.succeeded();
            reset();
            navigate(`/samples/${created.id}`, { replace: true });
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    });

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey="/samples"
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .sf-grid-2 { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
                  .sf-grid-3 { display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
                  @media (max-width: 768px) {
                    .sf-grid-2, .sf-grid-3 { grid-template-columns: 1fr; }
                  }
                `}</style>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <PageHeader
                        title="Registrar Muestra"
                        subtitle="Complete los datos para registrar una muestra en una orden existente."
                    />

                    <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 28 }}>
                            {!session.tenantId ? (
                                <section style={{ display: "grid", gap: 16 }}>
                                    <SectionTitle>Contexto</SectionTitle>
                                    <div className="sf-grid-2" style={{ alignItems: "start" }}>
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
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Seleccione la sucursal donde se recibirá y procesará la muestra.</p>
                                <div className="sf-grid-2">
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
                                <SectionTitle>Orden</SectionTitle>
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Seleccione la orden a la que pertenece esta muestra.</p>
                                <div className="sf-grid-2">
                                    <FormField
                                        control={control}
                                        name="order_id"
                                        render={(p) => (
                                            <FloatingCaptionSelect
                                                label="Orden"
                                                requiredMark
                                                value={typeof p.value === "string" ? p.value : undefined}
                                                onChange={(val) => p.onChange(val ?? "")}
                                                placeholder="Seleccione una orden"
                                                options={orders.map((o) => ({ value: o.id, label: o.label }))}
                                                showSearch
                                                loading={loadingOrders}
                                                disabled={Boolean(prefilledOrderId)}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Muestra</SectionTitle>
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Complete los datos de la muestra. El código se asigna automáticamente al registrar.</p>
                                <div className="sf-grid-3">
                                    <div style={{ alignContent: "center", display: "grid" }}>
                                        <AutoCodeHint kind="sample" scopeId={watchedType || undefined} branchId={watchedBranch || undefined} referenceDate={watchedReceived || undefined} />
                                    </div>
                                    <FormField
                                        control={control}
                                        name="sample_type_id"
                                        render={(p) => (
                                            <FloatingCaptionSelect
                                                label="Tipo de muestra"
                                                requiredMark
                                                value={typeof p.value === "string" && p.value ? p.value : undefined}
                                                onChange={(val) => p.onChange(val ?? "")}
                                                placeholder="Seleccione el tipo de muestra"
                                                options={sampleTypes.types.map((t) => ({ value: t.id, label: t.name }))}
                                                showSearch
                                                loading={sampleTypes.loading}
                                                disabled={sampleTypes.empty}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="notes"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Descripción (opcional)" />
                                        )}
                                    />
                                </div>

                                <div className="sf-grid-2">
                                    <FormField
                                        control={control}
                                        name="collected_date"
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
                                        name="received_date"
                                        render={(p) => (
                                            <FloatingCaptionDate
                                                label="Fecha de recepción"
                                                requiredMark
                                                value={typeof p.value === "string" ? p.value : ""}
                                                onChange={(v) => p.onChange(v)}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                </div>
                            </section>

                            {sampleTypes.empty && <SampleTypeSetupNotice />}
                            {sampleTypes.error && <ErrorText>{sampleTypes.error}</ErrorText>}
                            {serverError && <ErrorText>{serverError}</ErrorText>}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                    Los campos marcados con <span style={{ color: "#e5484d", fontWeight: 700 }}>*</span> son obligatorios.
                                </div>
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    <Button htmlType="button" danger onClick={() => navigate(-1)} disabled={loading}>
                                        Cancelar
                                    </Button>
                                    <Button htmlType="submit" type="primary" loading={loading} disabled={sampleTypes.empty}>
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
