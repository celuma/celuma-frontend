import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Layout, Card, message } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionDate from "../components/ui/floating_caption_date";
import CelumaTextArea from "../components/ui/textarea_field";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import BlockersNotice from "../components/management/blockers_notice";
import { tokens, cardStyle } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";
import { useSampleManagement } from "../hooks/use_capture_management";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import { apiFetch } from "../lib/api_fetch";
import { getErrorMessage } from "../lib/api_error";
import { collectionDateSchema, isValidReceiptDate } from "../lib/receipt_date";
import { correctSampleCode, updateSampleDates, updateSampleNotes } from "../services/order_management_service";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";

/** Alphabet of a corrected code (the generated-code alphabet); the API validates it too. */
export const SAMPLE_CODE_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

const schema = z.object({
    sample_code: z.string().trim().regex(SAMPLE_CODE_PATTERN, "Solo letras, números, '.', '_' y '-' (máx. 100)"),
    // Optional here: a legacy sample may have no receipt date (its description must stay editable). Clearing an
    // existing one is refused on submit (and by the API).
    received_date: z.string().trim().optional().refine((v) => !v || isValidReceiptDate(v), "Fecha no válida (use AAAA-MM-DD)."),
    collected_date: collectionDateSchema,
    reason: z.string().trim().optional(),
    notes: z.string().trim().max(500).optional(),
});

type SampleEditData = z.infer<typeof schema>;

type SampleResponse = {
    id: string;
    sample_code: string;
    notes?: string | null;
    received_at?: string | null;
    collected_at?: string | null;
    order: { id: string };
};

/** The API stores local calendar dates; the picker works with the `YYYY-MM-DD` part. */
const dayOf = (value?: string | null) => (value ? value.slice(0, 10) : "");

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 18, fontWeight: 700, color: tokens.textPrimary, letterSpacing: "-0.01em" }}>
        {children}
    </h3>
);

/** Sample edit (#10): code correction (with its reason) and description. Same page pattern as the patient/requester forms. */
export default function SampleEditForm() {
    usePageTitle();
    const navigate = useNavigate();
    const { sampleId } = useParams();
    const { hasPermission } = useUserProfile();
    const canCorrectCode = hasPermission(PERMS.UPDATE_SAMPLE) && hasPermission(PERMS.ENTER_MANUAL_CODE);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [original, setOriginal] = useState<{ code: string; notes: string; received: string; collected: string } | null>(null);
    const { state } = useSampleManagement(sampleId);

    const { control, handleSubmit, reset, watch, setError } = useForm<SampleEditData>({
        resolver: zodResolver(schema),
        defaultValues: { sample_code: "", received_date: "", collected_date: "", reason: "", notes: "" },
        mode: "onTouched",
    });
    const watchedCode = watch("sample_code");
    const watchedReceived = watch("received_date");
    const watchedCollected = watch("collected_date");

    useEffect(() => {
        if (!sampleId) return;
        (async () => {
            try {
                const res = await apiFetch(`${base}/v1/laboratory/samples/${sampleId}`);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const detail = (await res.json()) as SampleResponse;
                const received = dayOf(detail.received_at);
                const collected = dayOf(detail.collected_at);
                setOriginal({ code: detail.sample_code, notes: detail.notes ?? "", received, collected });
                reset({ sample_code: detail.sample_code, received_date: received, collected_date: collected, reason: "", notes: detail.notes ?? "" });
            } catch (err) {
                setServerError(getErrorMessage(err));
            } finally {
                setLoading(false);
            }
        })();
    }, [sampleId, reset]);

    // The direct-edit window (Reception through Diagnosis, no review evidence) governs the code and the dates;
    // outside it those sections are not offered at all, only the description.
    const windowOpen = state ? (state.dates?.allowed ?? state.correction.allowed) : false;
    const codeClosed = !canCorrectCode || !state?.correction.allowed;
    const codeChanged = !!original && watchedCode.trim() !== original.code;
    const datesChanged = !!original && ((watchedReceived ?? "") !== original.received || (watchedCollected ?? "") !== original.collected);
    // Moving the receipt date into another month regenerates a monthly-generated code (the API decides; this only warns).
    const regenerates = !!original && !!state?.code_follows_receipt_month && !codeChanged && !!original.received
        && !!watchedReceived && watchedReceived.slice(0, 7) !== original.received.slice(0, 7);

    const onSubmit = handleSubmit(async (data) => {
        if (!sampleId || !original) return;
        const newCode = data.sample_code.trim();
        const newNotes = (data.notes ?? "").trim();
        const newReceived = (data.received_date ?? "").trim();
        if (original.received && !newReceived) {
            setError("received_date", { message: "La fecha de recepción es requerida." });
            return;
        }
        const newCollected = (data.collected_date ?? "").trim();
        const datesEdited = newReceived !== original.received || newCollected !== original.collected;
        if ((newCode !== original.code || datesEdited) && (data.reason ?? "").trim().length < 3) {
            setError("reason", { message: "El motivo de la corrección es obligatorio." });
            return;
        }
        setServerError(null);
        setSaving(true);
        try {
            if (newCode !== original.code) await correctSampleCode(sampleId, newCode, (data.reason ?? "").trim());
            if (datesEdited) {
                const res = await updateSampleDates(sampleId, {
                    ...(newReceived !== original.received ? { received_at: newReceived } : {}),
                    ...(newCollected !== original.collected ? { collected_at: newCollected || null } : {}),
                    reason: (data.reason ?? "").trim(),
                });
                if (res.old_code) message.success(`Código regenerado: ${res.old_code} → ${res.sample_code}. El código anterior no se reutilizará.`);
            }
            if (newNotes !== original.notes) await updateSampleNotes(sampleId, newNotes || null);
            navigate(`/samples/${sampleId}`, { replace: true });
        } catch (err) {
            setServerError(getErrorMessage(err));
            setSaving(false);
        }
    });

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey="/samples" onNavigate={(key) => navigate(key)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                  .se-grid-2 { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
                  @media (max-width: 768px) { .se-grid-2 { grid-template-columns: 1fr; } }
                `}</style>
                <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    <PageHeader
                        title={original ? `Editar Muestra ${original.code}` : "Editar Muestra"}
                        subtitle="Corrige el código, las fechas de recepción y recolección, y la descripción. La muestra conserva su identidad, su orden y sus relaciones."
                    />

                    <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }} loading={loading}>
                        <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 28 }} data-testid="sample-edit-form">
                            {state && !windowOpen && (
                                <BlockersNotice
                                    testId="sample-blockers"
                                    blockers={state.correction.blockers}
                                    lead="Esta muestra ya no admite cambios de su código ni de sus fechas (solo de Recepción a Diagnóstico y sin historial de revisión). La descripción sigue siendo editable."
                                />
                            )}

                            {windowOpen && (
                                <section style={{ display: "grid", gap: 16 }}>
                                    <SectionTitle>Identificación</SectionTitle>
                                    <FormField
                                        control={control}
                                        name="sample_code"
                                        render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Código" disabled={codeClosed} />}
                                    />
                                    <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                        {canCorrectCode
                                            ? "El código anterior queda retirado y la numeración automática no se modifica. Letras, números, «.», «_» y «-»."
                                            : "Corregir el código a mano requiere el permiso de captura manual de códigos."}
                                    </div>
                                </section>
                            )}

                            {windowOpen && (
                                <section style={{ display: "grid", gap: 16 }}>
                                    <SectionTitle>Fechas</SectionTitle>
                                    <div className="se-grid-2">
                                        <FormField
                                            control={control}
                                            name="received_date"
                                            render={(props) => (
                                                <FloatingCaptionDate
                                                    label="Fecha de recepción"
                                                    requiredMark={!!original?.received}
                                                    value={typeof props.value === "string" ? props.value : ""}
                                                    onChange={(v) => props.onChange(v)}
                                                    error={props.error}
                                                />
                                            )}
                                        />
                                        <FormField
                                            control={control}
                                            name="collected_date"
                                            render={(props) => (
                                                <FloatingCaptionDate
                                                    label="Fecha de recolección"
                                                    value={typeof props.value === "string" ? props.value : ""}
                                                    onChange={(v) => props.onChange(v)}
                                                    error={props.error}
                                                />
                                            )}
                                        />
                                    </div>
                                    {regenerates ? (
                                        <Alert
                                            type="warning"
                                            showIcon
                                            data-testid="sample-code-regenerates"
                                            message={`La nueva fecha de recepción cae en otro mes: al guardar se generará un código nuevo en ese mes y ${original?.code} quedará retirado (no se reutilizará).`}
                                        />
                                    ) : (
                                        <div style={{ color: tokens.textSecondary, fontSize: 13 }}>
                                            {state?.code_follows_receipt_month
                                                ? "El código se numera por el mes de recepción: si la fecha cambia de mes, se generará un código nuevo en ese mes."
                                                : "Cambiar las fechas no modifica el código de esta muestra."}
                                        </div>
                                    )}
                                </section>
                            )}

                            {(codeChanged || datesChanged) && (
                                <FormField
                                    control={control}
                                    name="reason"
                                    render={(props) => (
                                        <CelumaTextArea
                                            value={String(props.value ?? "")}
                                            onChange={(v) => props.onChange(v)}
                                            placeholder="Motivo de la corrección (obligatorio)"
                                            ariaLabel="Motivo de la corrección"
                                            rows={2}
                                            maxLength={1000}
                                            error={props.error}
                                        />
                                    )}
                                />
                            )}

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Descripción</SectionTitle>
                                <FormField
                                    control={control}
                                    name="notes"
                                    render={(props) => (
                                        <CelumaTextArea
                                            value={String(props.value ?? "")}
                                            onChange={(v) => props.onChange(v)}
                                            placeholder="Escribe una descripción para esta muestra"
                                            ariaLabel="Descripción"
                                            rows={4}
                                            maxLength={500}
                                            error={props.error}
                                        />
                                    )}
                                />
                            </section>

                            {serverError && <ErrorText>{serverError}</ErrorText>}

                            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <Button htmlType="button" danger onClick={() => navigate(-1)} disabled={saving}>
                                    Cancelar
                                </Button>
                                <Button htmlType="submit" type="primary" loading={saving}>
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
