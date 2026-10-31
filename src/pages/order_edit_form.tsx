import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout, Card } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import FloatingCaptionMultiSelect from "../components/ui/floating_caption_multiselect";
import CelumaTextArea from "../components/ui/textarea_field";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import BlockersNotice from "../components/management/blockers_notice";
import { tokens, cardStyle } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";
import { useOrderManagement } from "../hooks/use_capture_management";
import { apiFetch } from "../lib/api_fetch";
import { getErrorMessage } from "../lib/api_error";
import { updateOrder, type OrderUpdateInput } from "../services/order_management_service";
import ReportTemplateField from "../components/order/report_template_field";
import { getReportTemplates } from "../services/report_service";
import type { OrderReportTemplateSelection, ReportTemplateRef } from "../models/report_letterhead";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";
export const MAX_REQUESTING_PHYSICIANS = 10;

const schema = z.object({
    patient_id: z.string().trim().optional(),
    requesting_physician_ids: z.array(z.string()).max(MAX_REQUESTING_PHYSICIANS, `Máximo ${MAX_REQUESTING_PHYSICIANS}`),
    expediente: z.string().trim().optional(),
    notes: z.string().trim().max(500).optional(),
});

type OrderEditData = z.infer<typeof schema>;

type OrderResponse = {
    order: {
        id: string;
        order_code: string;
        requesting_physicians?: Array<{ id: string }> | null;
        expediente?: string | null;
        notes?: string | null;
        /** Céluma 1.4.1; absent on an older API. */
        report_template?: OrderReportTemplateSelection | null;
    };
    patient?: { id: string } | null;
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 18, fontWeight: 700, color: tokens.textPrimary, letterSpacing: "-0.01em" }}>
        {children}
    </h3>
);

/** Basic order edit (#9): patient, requesting physicians, expediente, description and (Céluma 1.4.1) the report
 *  template. Same page pattern as the patient/requester forms. */
export default function OrderEditForm() {
    usePageTitle();
    const navigate = useNavigate();
    const { orderId } = useParams();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [orderCode, setOrderCode] = useState("");
    const [physicians, setPhysicians] = useState<Array<{ value: string; label: string }>>([]);
    const [patients, setPatients] = useState<Array<{ value: string; label: string }>>([]);
    const { state } = useOrderManagement(orderId);
    // Céluma 1.4.1: the stored explicit choice and what the catalog alone resolves to. `templateId` is what the
    // form holds (null = follow the default); it is sent only when it differs from the stored choice, and null
    // then means "reset to the default", never "omitted".
    const [templateSelection, setTemplateSelection] = useState<OrderReportTemplateSelection | null>(null);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [templates, setTemplates] = useState<ReportTemplateRef[]>([]);

    const { control, handleSubmit, reset } = useForm<OrderEditData>({
        resolver: zodResolver(schema),
        defaultValues: { patient_id: "", requesting_physician_ids: [], expediente: "", notes: "" },
        mode: "onTouched",
    });

    useEffect(() => {
        if (!orderId) return;
        (async () => {
            try {
                const [orderRes, physiciansRes, patientsRes, templatesRes] = await Promise.all([
                    apiFetch(`${base}/v1/laboratory/orders/${orderId}/full`),
                    apiFetch(`${base}/v1/requesting-physicians/`),
                    apiFetch(`${base}/v1/patients/`),
                    // Names only; without `reports:read` the choices are the defaults themselves.
                    getReportTemplates(true).catch(() => null),
                ]);
                if (!orderRes.ok) throw new Error(`${orderRes.status} ${orderRes.statusText}`);
                const detail = (await orderRes.json()) as OrderResponse;
                setOrderCode(detail.order.order_code);
                reset({
                    patient_id: detail.patient?.id ?? "",
                    requesting_physician_ids: (detail.order.requesting_physicians ?? []).map((p) => p.id),
                    expediente: detail.order.expediente ?? "",
                    notes: detail.order.notes ?? "",
                });
                const selection = detail.order.report_template ?? null;
                setTemplateSelection(selection);
                setTemplateId(selection?.report_template_id ?? null);
                setTemplates((templatesRes?.templates ?? []).map((t) => ({ id: t.id, name: t.name })));
                if (patientsRes.ok) {
                    const rows = (await patientsRes.json()) as Array<{ id: string; patient_code: string; first_name?: string; last_name?: string }>;
                    setPatients(rows.map((p) => ({
                        value: p.id,
                        label: `${p.patient_code}${p.first_name ? ` - ${p.first_name} ${p.last_name ?? ""}` : ""}`.trim(),
                    })));
                }
                if (physiciansRes.ok) {
                    const rows = (await physiciansRes.json()) as Array<{ id: string; physician_code: string; full_name: string }>;
                    setPhysicians(rows.map((p) => ({ value: p.id, label: `${p.physician_code} - ${p.full_name}` })));
                }
            } catch (err) {
                setServerError(getErrorMessage(err));
            } finally {
                setLoading(false);
            }
        })();
    }, [orderId, reset]);

    const closed = state ? !state.edit.allowed : false;
    // The template also locks once a report exists (its template is frozen in its snapshot).
    const templateLocked = closed || (state?.report_template ? !state.report_template.allowed : false);
    const templateBlockers = state?.report_template && state.edit.allowed ? state.report_template.blockers : [];
    const storedTemplateId = templateSelection?.report_template_id ?? null;

    const onSubmit = handleSubmit(async (data) => {
        if (!orderId) return;
        setServerError(null);
        setSaving(true);
        try {
            const input: OrderUpdateInput = {
                patient_id: data.patient_id?.trim() || null,
                requesting_physician_ids: data.requesting_physician_ids,
                expediente: data.expediente?.trim() || null,
                notes: data.notes?.trim() || null,
            };
            if (templateSelection && templateId !== storedTemplateId) input.report_template_id = templateId;
            await updateOrder(orderId, input);
            navigate(`/orders/${orderId}`, { replace: true });
        } catch (err) {
            setServerError(getErrorMessage(err));
            setSaving(false);
        }
    });

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/orders" onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <PageHeader
                        title={orderCode ? `Editar Orden ${orderCode}` : "Editar Orden"}
                        subtitle="Corrige el paciente, los solicitantes, el expediente, la descripción y la plantilla del reporte. El tipo de estudio, la sucursal y el código no se editan aquí."
                    />

                    <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }} loading={loading}>
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 28 }} data-testid="order-edit-form">
                            {state && (
                                <BlockersNotice
                                    testId="order-edit-blockers"
                                    blockers={state.edit.blockers}
                                    lead="Esta orden ya no admite cambios directos (solo de Recepción a Diagnóstico y sin historial de revisión). Use el flujo de corrección o enmienda."
                                />
                            )}

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Paciente</SectionTitle>
                                <FormField
                                    control={control}
                                    name="patient_id"
                                    render={(props) => (
                                        <FloatingCaptionSelect
                                            label="Paciente"
                                            value={typeof props.value === "string" && props.value ? props.value : undefined}
                                            onChange={(value) => props.onChange(value ?? "")}
                                            options={patients}
                                            placeholder="Seleccione el paciente"
                                            showSearch
                                            allowClear
                                            disabled={closed}
                                            error={props.error}
                                        />
                                    )}
                                />
                                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                    Para una orden registrada en el paciente equivocado. Sus muestras y reportes en borrador pasan al nuevo paciente; una orden sin paciente necesita al menos un médico solicitante.
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Solicitantes</SectionTitle>
                                <FormField
                                    control={control}
                                    name="requesting_physician_ids"
                                    render={(props) => (
                                        <FloatingCaptionMultiSelect
                                            label="Médicos solicitantes"
                                            value={Array.isArray(props.value) ? props.value : []}
                                            onChange={(value) => props.onChange(value)}
                                            options={physicians}
                                            placeholder="Seleccione uno o más médicos solicitantes"
                                            disabled={closed}
                                            error={props.error}
                                        />
                                    )}
                                />
                                <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                    Los médicos solicitantes no tienen orden de importancia; agregar uno no le da acceso ni le envía resultados.
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Datos de la orden</SectionTitle>
                                <FormField
                                    control={control}
                                    name="expediente"
                                    render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Expediente" disabled={closed} />}
                                />
                                <FormField
                                    control={control}
                                    name="notes"
                                    render={(props) => (
                                        <CelumaTextArea
                                            value={String(props.value ?? "")}
                                            onChange={(v) => props.onChange(v)}
                                            placeholder="Descripción o notas de la orden"
                                            ariaLabel="Descripción"
                                            rows={4}
                                            maxLength={500}
                                            disabled={closed}
                                            error={props.error}
                                        />
                                    )}
                                />
                            </section>

                            {templateSelection && (
                                <section style={{ display: "grid", gap: 16 }}>
                                    <SectionTitle>Reporte</SectionTitle>
                                    <BlockersNotice
                                        testId="order-edit-template-blockers"
                                        blockers={templateBlockers}
                                        lead="La plantilla ya no se puede cambiar desde la orden."
                                    />
                                    <ReportTemplateField
                                        mode="edit"
                                        value={templateId}
                                        onChange={setTemplateId}
                                        options={templates}
                                        fallback={{
                                            status: templateSelection.default_status,
                                            template: templateSelection.default_template,
                                            source: templateSelection.default_source,
                                            candidates: templateSelection.candidates,
                                        }}
                                        inactiveChoice={templateSelection.status === "INACTIVE" ? templateSelection.template : null}
                                        disabled={templateLocked}
                                    />
                                    {templateSelection.status === "INACTIVE" && templateId === storedTemplateId && (
                                        <ErrorText>La plantilla elegida para esta orden está desactivada: elige otra o restablece la predeterminada.</ErrorText>
                                    )}
                                </section>
                            )}

                            {serverError && <ErrorText>{serverError}</ErrorText>}

                            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <Button htmlType="button" danger onClick={() => navigate(-1)} disabled={saving}>
                                    Cancelar
                                </Button>
                                <Button htmlType="submit" type="primary" loading={saving} disabled={closed}>
                                    Guardar cambios
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}
