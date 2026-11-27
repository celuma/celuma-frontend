import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray, useWatch, type Path } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout, Card, message } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import PageHeader from "../components/ui/page_header";
import logo from "../images/celuma-isotipo.png";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionSelect from "../components/ui/floating_caption_select";
import FloatingCaptionMultiSelect from "../components/ui/floating_caption_multiselect";
import FloatingCaptionDate from "../components/ui/floating_caption_date";
import Panel from "../components/ui/panel";
import Button from "../components/ui/button";
import ErrorText from "../components/ui/error_text";
import { tokens, cardStyle } from "../components/design/tokens";
import { usePageTitle } from "../hooks/use_page_title";
import { catalogTypeOptions } from "../lib/catalog_type_options";
import { catalogTypeSelectProps } from "../components/ui/catalog_type_select";
import { patientSelectProps, personSelectProps } from "../components/ui/person_select";
import { patientOption, physicianOption, type PersonOption } from "../lib/person_options";
import { useActiveSampleTypes } from "../hooks/use_active_sample_types";
import SampleTypeSetupNotice from "../components/catalog/sample_type_setup_notice";
import { createRegistrationSubmission, postForAnswer } from "../lib/registration_submission";
import { registrationProblem } from "../lib/registration_errors";
import CelumaAlert from "../components/ui/celuma_alert";
import { registrationNotice, type RegistrationNoticeState } from "../lib/registration_notice";
import OrderCodeField from "../components/numbering/order_code_field";
import SampleCodeField from "../components/numbering/sample_code_field";
import { useSampleCodeSuggestions } from "../hooks/use_sample_code_suggestions";
import { useUserProfile } from "../hooks/use_user_profile";
import { PERMS } from "../lib/rbac";
import {
    describeSavedCodes,
    isManualCodeValid,
    MANUAL_SAMPLE_CODE_MESSAGE,
    payloadCode,
    resolveRowCode,
    type RowCodeState,
    type SampleCodeRow,
} from "../lib/sample_code_rows";
import { collectionDateSchema, isValidReceiptDate, receiptDateSchema } from "../lib/receipt_date";
import { DEFAULT_NUMBERING_ZONE, receiptZone, todayInZone } from "../lib/receipt_today";
import { useSampleNumberingZone } from "../hooks/use_sample_numbering_zone";
import ReportTemplateField from "../components/order/report_template_field";
import { describeTemplateOrigin, suggestReportTemplate } from "../lib/report_template_suggestion";
import { getReportTemplates } from "../services/report_service";
import type { ReportTemplateRef } from "../models/report_letterhead";
import { getErrorMessage, formatHttpError } from "../lib/api_error";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getSessionContext() {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
    const branchId = localStorage.getItem("branch_id") || sessionStorage.getItem("branch_id") || "";
    return { token, tenantId, branchId };
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
        const message = formatHttpError(res.status, JSON.stringify(parsed ?? ""));
        throw new Error(message);
    }
    return parsed as TRes;
}

/** Order-level fields the API may name in a refusal (Céluma 1.5, #67); sample fields are `samples.N.<field>`. */
const ORDER_FIELDS = new Set(["branch_id", "patient_id", "requesting_physician_ids", "expediente", "study_type_id", "requested_by", "notes", "report_template_id"]);
const SAMPLE_FIELDS = new Set(["sample_type_id", "notes", "collected_date", "received_date", "sample_code"]);

/** Engineering bound shared with the API (`MAX_REQUESTING_PHYSICIANS`); not an owner decision. */
const MAX_REQUESTING_PHYSICIANS = 10;

const sampleSchema = z.object({
    // Céluma 1.4 (#17): every sample of the order needs an active type of the laboratory catalog.
    sample_type_id: z.string().trim().nonempty("El tipo de muestra es requerido."),
    notes: z.string().trim().optional(),
    collected_date: collectionDateSchema,
    // Céluma 1.4 (#33): required per sample. Each sample is numbered by ITS OWN receipt date.
    received_date: receiptDateSchema,
    // Hotfix 1.4.3: the "Código de muestra" field. `sample_code` is what the user typed and only counts while
    // `code_manual` is set; an automatic row sends none and its code is assigned on save.
    sample_code: z.string().optional(),
    code_manual: z.boolean().optional(),
}).superRefine((row, ctx) => {
    if (row.code_manual && (row.sample_code ?? "").trim() !== "" && !isManualCodeValid(row.sample_code ?? "")) {
        ctx.addIssue({ code: "custom", path: ["sample_code"], message: MANUAL_SAMPLE_CODE_MESSAGE });
    }
});

/** A new row starts with today's receipt date (hotfix 1.4.3); the user can change it. */
const emptySample = (today: string) => ({ sample_type_id: "", notes: "", collected_date: "", received_date: today, sample_code: "", code_manual: false });

const schema = z.object({
    tenant_id: z.string().trim().nonempty("El tenant es requerido."),
    branch_id: z.string().trim().nonempty("La sucursal es requerida."),
    patient_id: z.string().trim().optional(),
    // Céluma 1.4 (#16): several external requesting physicians (no primary), and an optional expediente.
    requesting_physician_ids: z.array(z.string()).max(MAX_REQUESTING_PHYSICIANS, `Máximo ${MAX_REQUESTING_PHYSICIANS} médicos solicitantes.`).optional(),
    expediente: z.string().trim().max(100, "Máximo 100 caracteres").optional(),
    study_type_id: z.string().trim().nonempty("El tipo de estudio es requerido."),
    requested_by: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    created_by: z.string().trim().optional(),
    samples: z.array(sampleSchema).min(1, "Agregue al menos una muestra."),
}).refine((data) => Boolean(data.patient_id || (data.requesting_physician_ids ?? []).length > 0), {
    path: ["patient_id"],
    message: "Seleccione un paciente, al menos un médico solicitante o ambos.",
});

type OrderFormData = z.infer<typeof schema>;

type StudyTypeOption = {
    id: string; code: string; name: string; is_active: boolean;
    /** Céluma 1.4.1: an optional default; the sample types' template outranks it. */
    default_template?: { id: string; name: string } | null;
};

type UnifiedResponse = {
    order: { id: string; order_code: string; status: string; patient_id?: string | null; tenant_id: string; branch_id: string };
    samples: Array<{ id: string; sample_code: string; sample_type: { id: string; code: string; name: string; is_active: boolean } | null; state: string; order_id: string; tenant_id: string; branch_id: string }>;
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
    const [patients, setPatients] = useState<PersonOption[]>([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [requestingPhysicians, setRequestingPhysicians] = useState<PersonOption[]>([]);
    const [loadingRequestingPhysicians, setLoadingRequestingPhysicians] = useState(false);
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string; timezone?: string }>>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [studyTypes, setStudyTypes] = useState<StudyTypeOption[]>([]);
    const [loadingStudyTypes, setLoadingStudyTypes] = useState(false);
    const sampleTypes = useActiveSampleTypes();
    // Céluma 1.4.1: the report template. `manualTemplateId` is the user's explicit choice (null = follow the
    // suggestion); only an explicit choice is sent, and changing samples or the study type never overwrites it.
    const [templates, setTemplates] = useState<ReportTemplateRef[] | null>(null);
    const [loadingTemplates, setLoadingTemplates] = useState(true);
    const [manualTemplateId, setManualTemplateId] = useState<string | null>(null);
    const [templateError, setTemplateError] = useState<string | undefined>(undefined);
    const [currentUserId] = useState<string>(() => localStorage.getItem("user_id") || sessionStorage.getItem("user_id") || "");

    const prefilledPatientId = useMemo(() => {
        const qs = new URLSearchParams(search);
        return qs.get("patientId") || "";
    }, [search]);

    const prefilledRequestingPhysicianId = useMemo(() => {
        const qs = new URLSearchParams(search);
        return qs.get("requestingPhysicianId") || "";
    }, [search]);

    const { hasPermission } = useUserProfile();
    // Typing a code is a privileged capture (`lab:enter_manual_code`); the API enforces it too.
    const canEnterManual = hasPermission(PERMS.ENTER_MANUAL_CODE);

    const { control, handleSubmit, reset, setValue, getValues, setError, formState: { errors } } = useForm<OrderFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tenant_id: session.tenantId,
            branch_id: "",
            patient_id: prefilledPatientId,
            requesting_physician_ids: prefilledRequestingPhysicianId ? [prefilledRequestingPhysicianId] : [],
            expediente: "",
            study_type_id: "",
            requested_by: "",
            notes: "",
            samples: [
                emptySample(todayInZone(DEFAULT_NUMBERING_ZONE)),
            ],
        },
        mode: "onTouched",
    });

    const { fields, append, remove } = useFieldArray({ control, name: "samples" });
    // Céluma 1.5 (#67): one idempotency key for this form until a registration succeeds, kept across
    // corrections; an unanswered attempt is remembered so a retry never creates a second order.
    const submission = useMemo(() => createRegistrationSubmission<UnifiedResponse, RowCodeState[]>(), []);
    const [outcomeUnknown, setOutcomeUnknown] = useState(false);
    const watchedStudyType = useWatch({ control, name: "study_type_id" });
    const watchedBranch = useWatch({ control, name: "branch_id" });
    const watchedSamples = useWatch({ control, name: "samples" });
    // Hotfix 1.4.3: every row's receipt date starts on today's date in the zone the numbering uses (the branch's
    // for a branch-scoped numbering). It is the SAME visible date that is suggested for and saved. A date the user
    // changed is never touched again; the others follow the zone when the branch or the configuration is known.
    const numberingZone = useSampleNumberingZone();
    const branchTimezone = branches.find((b) => b.id === watchedBranch)?.timezone;
    const today = todayInZone(receiptZone(numberingZone, branchTimezone));
    const touchedDates = useRef(new Set<string>());
    const previousToday = useRef(today);
    useEffect(() => {
        const previous = previousToday.current;
        previousToday.current = today;
        fields.forEach((f, i) => {
            const current = getValues(`samples.${i}.received_date`) ?? "";
            if (!touchedDates.current.has(f.id) && (current === "" || current === previous)) {
                setValue(`samples.${i}.received_date`, today);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of "today" re-dates the untouched rows
    }, [today]);

    // Hotfix 1.4.3: one row per sample, keyed by the field id so a removed row never hands its state to another.
    const codeRows: SampleCodeRow[] = fields.map((f, i) => ({
        key: f.id,
        sampleTypeId: watchedSamples?.[i]?.sample_type_id ?? "",
        receivedDate: watchedSamples?.[i]?.received_date ?? "",
        manual: Boolean(watchedSamples?.[i]?.code_manual),
        typedCode: watchedSamples?.[i]?.sample_code ?? "",
    }));
    const codeSuggestions = useSampleCodeSuggestions(codeRows, watchedBranch || undefined);
    const codeStates = codeRows.map((row) => resolveRowCode(row, codeSuggestions.byKey[row.key], codeSuggestions.failed));

    useEffect(() => {
        (async () => {
            try {
                setLoadingPatients(true);
                const data = await getJSON<Array<{ id: string; patient_code: string; first_name?: string; last_name?: string }>>("/v1/patients/");
                // Céluma 1.5 (#69 review): same label and API order; the row only presents it differently.
                setPatients((data || []).map(patientOption));
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
                setRequestingPhysicians((data || []).map(physicianOption));
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
                const data = await getJSON<{ study_types: StudyTypeOption[] }>("/v1/study-types/");
                setStudyTypes(data.study_types.filter(st => st.is_active));
            } catch (err) {
                console.error("Error loading study types:", err);
            } finally {
                setLoadingStudyTypes(false);
            }
        })();
    }, []);

    useEffect(() => {
        let alive = true;
        // The lightweight catalog (names only; structures are read when a report is authored). It needs
        // `reports:read`; without it the choices are the suggestions themselves, and the API still decides.
        getReportTemplates(true)
            .then(({ templates: rows }) => alive && setTemplates(rows ? rows.map((t) => ({ id: t.id, name: t.name })) : null))
            .catch(() => alive && setTemplates(null))
            .finally(() => alive && setLoadingTemplates(false));
        return () => {
            alive = false;
        };
    }, []);

    // Céluma 1.5 (#69): stable alphabetical order, search by name or code, complete names.
    // Eligibility is unchanged: only active study types and active sample types are offered.
    const studyTypeOptions = useMemo(() => catalogTypeOptions(studyTypes), [studyTypes]);
    const studyTypeSelect = useMemo(() => catalogTypeSelectProps(studyTypeOptions), [studyTypeOptions]);
    const sampleTypeOptions = useMemo(() => catalogTypeOptions(sampleTypes.types), [sampleTypes.types]);
    const sampleTypeSelect = useMemo(() => catalogTypeSelectProps(sampleTypeOptions), [sampleTypeOptions]);
    const personSelect = useMemo(() => personSelectProps(), []);
    const patientSelect = useMemo(() => patientSelectProps(patients), [patients]);
    const templateSuggestion = useMemo(
        () => suggestReportTemplate(
            (watchedSamples ?? []).map((s) => s?.sample_type_id),
            sampleTypes.types,
            studyTypes.find((st) => st.id === watchedStudyType),
            templates ? new Set(templates.map((t) => t.id)) : null,
        ),
        [watchedSamples, sampleTypes.types, studyTypes, watchedStudyType, templates],
    );
    // Céluma 1.5 (#70): which of the chosen sample types (or the study type) explain that suggestion.
    const templateOrigin = useMemo(
        () => describeTemplateOrigin(
            (watchedSamples ?? []).map((s) => s?.sample_type_id),
            sampleTypes.types,
            studyTypes.find((st) => st.id === watchedStudyType),
        ),
        [watchedSamples, sampleTypes.types, studyTypes, watchedStudyType],
    );

    const chooseTemplate = (templateId: string | null) => {
        setManualTemplateId(templateId);
        setTemplateError(undefined);
    };

    const onSubmit = handleSubmit(async (data) => {
        setServerError(null);
        // Samples that suggest different templates need a deliberate choice: none is taken by list order.
        if (!manualTemplateId && templateSuggestion.status === "AMBIGUOUS") {
            setTemplateError("Elige la plantilla del reporte: las muestras sugieren plantillas distintas.");
            return;
        }
        setLoading(true);
        try {
            const finalTenant = session.tenantId || data.tenant_id || "";
            const finalBranch = data.branch_id || "";
            if (!finalTenant || !finalBranch) {
                throw new Error("Faltan tenant_id o branch_id en el contexto de sesión.");
            }
            // No order or sample code is ever sent: the server always generates them (Céluma 1.4).
            const physicianIds = data.requesting_physician_ids ?? [];
            const payload = {
                tenant_id: finalTenant,
                branch_id: finalBranch,
                patient_id: data.patient_id || undefined,
                requesting_physician_ids: physicianIds.length > 0 ? physicianIds : undefined,
                expediente: (data.expediente ?? "").trim() || undefined,
                study_type_id: data.study_type_id,
                notes: data.notes || undefined,
                created_by: (currentUserId || undefined),
                // Only an explicit choice; a followed suggestion stays a live catalog default on the server.
                report_template_id: manualTemplateId || undefined,
                samples: data.samples.map((s, i) => ({
                    sample_type_id: s.sample_type_id,
                    notes: s.notes || undefined,
                    // Date-only values (YYYY-MM-DD), never `…T00:00:00Z` (see sample_form.tsx, #33).
                    collected_at: s.collected_date || undefined,
                    received_at: s.received_date,
                    // Only a code the user typed (and may type); an automatic row sends none.
                    sample_code: payloadCode(codeRows[i], canEnterManual),
                })),
            };
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const outcome = await submission.submit(
                payload, postForAnswer(`${getApiBase()}/v1/laboratory/orders/unified`, token), codeStates,
            );
            if (outcome.kind === "unknown") {
                setOutcomeUnknown(true);
                return;
            }
            setOutcomeUnknown(false);
            if (outcome.kind === "gone") {
                setServerError("La orden que se registró en un intento anterior fue retirada después. Puede registrarla de nuevo con estos datos.");
                return;
            }
            if (outcome.kind === "refused") {
                const problem = registrationProblem(outcome.status, outcome.body, (field) => {
                    const parts = field.split(".");
                    if (parts.length === 1) return ORDER_FIELDS.has(field);
                    return parts[0] === "samples" && Number(parts[1]) < data.samples.length && SAMPLE_FIELDS.has(parts[2] ?? "");
                });
                for (const f of problem.fields) {
                    if (f.field === "report_template_id") setTemplateError(f.message);
                    else setError(f.field as Path<OrderFormData>, { type: "server", message: f.message });
                }
                setServerError(problem.summary);
                const firstRow = problem.fields.find((f) => f.row !== undefined)?.row;
                if (firstRow !== undefined) {
                    document.querySelector(`[data-testid="sample-row-${firstRow}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                }
                return;
            }
            const created = outcome.result;
            // The real result, not the suggestion: the definitive codes the API returned, compared with what
            // the form showed for the attempt that was saved.
            const saved = describeSavedCodes(outcome.meta, created.samples).text;
            // A registration resolved from an earlier attempt is said on the order itself, persistently
            // (Céluma 1.5, #67): above all when the later corrections were not applied.
            const notice = registrationNotice("La orden", created.order.order_code, outcome, saved);
            if (!notice) message.success({ content: saved, duration: 8 });
            reset();
            setManualTemplateId(null);
            const state: RegistrationNoticeState | undefined = notice ? { registrationNotice: notice } : undefined;
            navigate(`/orders/${created.order.id}`, state ? { replace: true, state } : { replace: true });
        } catch (err) {
            setServerError(getErrorMessage(err, "Ocurrió un error inesperado."));
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
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Seleccione un paciente, uno o más médicos solicitantes (sin orden de importancia) o ambos.</p>
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
                                                options={patients}
                                                selectProps={patientSelect}
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
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Seleccione el tipo de estudio que se realizará. El código de la orden y los de las muestras se asignan automáticamente al registrar.</p>
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
                                                // C-003 / #69: alphabetical by name, then code — not by API order.
                                                options={studyTypeOptions}
                                                selectProps={studyTypeSelect}
                                                showSearch
                                                loading={loadingStudyTypes}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                    <OrderCodeField studyTypeId={watchedStudyType || undefined} branchId={watchedBranch || undefined} />
                                </div>

                                <div className="of-grid-2">
                                    <FormField
                                        control={control}
                                        name="requesting_physician_ids"
                                        render={(p) => (
                                            <FloatingCaptionMultiSelect
                                                label="Médicos solicitantes (opcional)"
                                                value={Array.isArray(p.value) ? (p.value as string[]) : []}
                                                onChange={(vals) => p.onChange(vals)}
                                                placeholder={loadingRequestingPhysicians ? "Cargando médicos…" : "Seleccione uno o más médicos solicitantes"}
                                                options={requestingPhysicians}
                                                selectProps={personSelect}
                                                error={p.error}
                                            />
                                        )}
                                    />
                                    <FormField
                                        control={control}
                                        name="expediente"
                                        render={(p) => (
                                            <FloatingCaptionInput {...p} value={String(p.value ?? "")} label="Expediente (opcional)" />
                                        )}
                                    />
                                </div>
                                <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                                    El expediente es una referencia de la solicitud (por ejemplo, ISSSTE): puede capturarse solo o junto con los médicos y se conserva tal cual, con sus ceros a la izquierda.
                                </span>

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
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>Registre una o más muestras asociadas a esta orden. Elija el tipo y las fechas de recolección y recepción de cada una (la fecha de recepción es obligatoria y define el mes del código); el código de cada muestra se sugiere según el numerador y se asigna al guardar, salvo que se escriba uno propio.</p>
                                <div style={{ display: "grid", gap: 16 }}>
                                    {fields.map((field, index) => (
                                        <Panel
                                            key={field.id}
                                            data-testid={`sample-row-${index}`}
                                            style={{
                                                display: "grid",
                                                gap: 16,
                                                // Céluma 1.5 (#67): the row to correct stands out; its fields say what.
                                                ...(errors.samples?.[index] ? { borderColor: "#e5484d", background: "#fff8f8" } : {}),
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, fontSize: 14, color: errors.samples?.[index] ? "#e5484d" : tokens.textPrimary }}>
                                                Muestra {index + 1}{errors.samples?.[index] ? " · revise los campos marcados" : ""}
                                            </div>
                                            <div className="of-grid-3">
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.sample_code`}
                                                    render={(p) => (
                                                        <SampleCodeField
                                                            state={codeStates[index] ?? { kind: "need_type" }}
                                                            manual={codeRows[index]?.manual ?? false}
                                                            typedCode={watchedSamples?.[index]?.sample_code ?? ""}
                                                            permitted={canEnterManual}
                                                            ready={Boolean(codeRows[index]?.sampleTypeId) && isValidReceiptDate(codeRows[index]?.receivedDate)}
                                                            testId={`sample-code-${index}`}
                                                            error={p.error}
                                                            onType={(value) => {
                                                                setValue(`samples.${index}.sample_code`, value, { shouldDirty: true, shouldValidate: true });
                                                                setValue(`samples.${index}.code_manual`, true, { shouldDirty: true });
                                                            }}
                                                            onBlurEmpty={() => {
                                                                setValue(`samples.${index}.sample_code`, "");
                                                                setValue(`samples.${index}.code_manual`, false);
                                                            }}
                                                            onUseSuggestion={() => {
                                                                setValue(`samples.${index}.sample_code`, "", { shouldValidate: true });
                                                                setValue(`samples.${index}.code_manual`, false, { shouldDirty: true });
                                                            }}
                                                        />
                                                    )}
                                                />
                                                <FormField
                                                    control={control}
                                                    name={`samples.${index}.sample_type_id`}
                                                    render={(p) => (
                                                        <FloatingCaptionSelect
                                                            label="Tipo de muestra"
                                                            requiredMark
                                                            value={typeof p.value === "string" && p.value ? p.value : undefined}
                                                            onChange={(val) => p.onChange(val ?? "")}
                                                            placeholder="Seleccione el tipo de muestra"
                                                            options={sampleTypeOptions}
                                                            selectProps={sampleTypeSelect}
                                                            showSearch
                                                            loading={sampleTypes.loading}
                                                            disabled={sampleTypes.empty}
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
                                                            requiredMark
                                                            value={typeof p.value === "string" ? p.value : ""}
                                                            onChange={(v) => { touchedDates.current.add(field.id); p.onChange(v); }}
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
                                                append(emptySample(today))
                                            }
                                        >
                                            Agregar otra muestra
                                        </Button>
                                    </div>
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 16 }}>
                                <SectionTitle>Reporte</SectionTitle>
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>La plantilla clínica con la que se creará el reporte. Se sugiere la del tipo de muestra (o, si no tiene, la del tipo de estudio); puedes elegir otra.</p>
                                <div className="of-grid-2">
                                    <ReportTemplateField
                                        mode="create"
                                        value={manualTemplateId}
                                        onChange={chooseTemplate}
                                        options={templates ?? []}
                                        fallback={templateSuggestion}
                                        origin={templateOrigin}
                                        loading={loadingTemplates}
                                        error={templateError}
                                    />
                                </div>
                            </section>

                            {sampleTypes.empty && <SampleTypeSetupNotice />}
                            {sampleTypes.error && <ErrorText>{sampleTypes.error}</ErrorText>}
                            {outcomeUnknown && (
                                <CelumaAlert
                                    type="warning"
                                    message="No se pudo confirmar si la orden se registró"
                                    description="Se interrumpió la conexión o el servidor no respondió. Todos los datos capturados se conservaron. Pulse «Reintentar registro»: si la orden ya se había guardado, Céluma la mostrará sin duplicarla; si no, la registrará una sola vez. Si corrige algún dato antes, Céluma también comprobará primero el intento anterior."
                                />
                            )}
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
                                        {outcomeUnknown ? "Reintentar registro" : "Registrar"}
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
