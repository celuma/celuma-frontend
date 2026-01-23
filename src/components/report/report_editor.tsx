import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type CSSProperties } from "react";
import { Form, message, Divider, Button, Tabs, Tag, Typography, Input, Popconfirm, Card, Image, Modal } from "antd";
import dayjs, { Dayjs } from "dayjs";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useAutoSave, loadAutoSave } from "../../hooks/auto_save";
import { saveReport, saveReportVersion, submitReport, approveReport, requestChanges, signReport } from "../../services/report_service";
import type { ReportImage } from "./report_images";
import SampleImagesPicker from "./sample_images_picker";
import ReportPreviewPages, { type ReportPreviewPagesRef } from "./report_preview_pages";
import { DeleteOutlined } from "@ant-design/icons";
import { usePdfExport } from "../../hooks/use_pdf_export";
import type { ReportType, ReportEnvelope, ReportFlags, ReportStatus } from "../../models/report";
import SelectField from "../ui/select_field";
import TextField from "../ui/text_field";
import DateField from "../ui/date_field";
import { tokens } from "../design/tokens";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import CommentInput from "../comments/comment_input";
import { getReport } from "../../services/report_service";

/* Flags by report type */
const FLAGS_BY_TYPE: Record<ReportType, ReportFlags> = {
    Histopatologia: { incluirMacroscopia: true, incluirMicroscopia: true, incluirCitomorfologia: true, incluirInterpretacion: true, incluirDiagnostico: true, incluirComentario: true, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: false, incluirInmunotinciones: false },
    Histoquimica: { incluirMacroscopia: true, incluirMicroscopia: true, incluirCitomorfologia: false, incluirInterpretacion: false, incluirDiagnostico: true, incluirComentario: true, incluirIF: true, incluirME: true, incluirEdad: false, incluirCU: false, incluirInmunotinciones: false },
    Citologia_mamaria: { incluirMacroscopia: false, incluirMicroscopia: false, incluirCitomorfologia: true, incluirInterpretacion: true, incluirDiagnostico: false, incluirComentario: false, incluirIF: false, incluirME: false, incluirEdad: true, incluirCU: false, incluirInmunotinciones: false },
    Citologia_urinaria: { incluirMacroscopia: true, incluirMicroscopia: false, incluirCitomorfologia: true, incluirInterpretacion: false, incluirDiagnostico: false, incluirComentario: true, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: true, incluirInmunotinciones: false },
    Quirurgico: { incluirMacroscopia: true, incluirMicroscopia: true, incluirCitomorfologia: false, incluirInterpretacion: false, incluirDiagnostico: true, incluirComentario: false, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: false, incluirInmunotinciones: false },
    Revision_laminillas: { incluirMacroscopia: true, incluirMicroscopia: false, incluirCitomorfologia: false, incluirInterpretacion: false, incluirDiagnostico: false, incluirComentario: true, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: false, incluirInmunotinciones: true },
};

/* Styles (Letter) */
const letterStyles = `
.report-page {
  width: 8.5in;
  min-height: 11in;
  margin: 16px auto;
  background: #ffffff;
  color: #000;
  position: relative;

  /* Header/Footer spacing */
  --header-top: 24pt;
  --header-bottom-space: 86pt;
  --footer-height: 72pt;
  --footer-side-pad: 24pt;

  padding-top: calc(var(--header-top) + var(--header-bottom-space));
  padding-bottom: calc(var(--footer-height) + 12pt);
  padding-left: 48pt;
  padding-right: 48pt;
  box-sizing: border-box;
  font-family: "Arial", sans-serif;
}

.report-header {
  position: absolute;
  top: var(--header-top);
  left: 24pt;
  right: 48pt;
  font-size: 8pt;
  font-weight: 700;
  color: #002060;
}

.report-footer {
  position: absolute;
  left: var(--footer-side-pad);
  right: var(--footer-side-pad);
  bottom: 0;
  height: var(--footer-height);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 7pt;
  font-weight: 700;
  color: #002060;
}

.report-footer__logo {
  height: calc(var(--footer-height) - 8pt);
  max-width: 40%;
  object-fit: contain;
}

.report-footer__subtitle {
  font-size: 7.5pt;
  line-height: 1.2;
  max-width: 55%;
}
`;


const NOTE_MAX_LENGTH = 25;
const NOTE_CONTROL_KEYS = new Set([
    "Backspace",
    "Delete",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Tab",
    "Escape",
    "Home",
    "End",
    "PageUp",
    "PageDown",
]);

// API helpers and session
function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getSessionContext() {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id") || "";
    const branchId = localStorage.getItem("branch_id") || sessionStorage.getItem("branch_id") || "";
    const userId = localStorage.getItem("user_id") || sessionStorage.getItem("user_id") || "";
    return { token, tenantId, branchId, userId };
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

type OrdersListResponse = {
    orders: Array<{
        id: string;
        order_code: string;
        status: string;
        branch?: { id: string; name?: string; code?: string | null };
        patient?: { id: string; full_name?: string | null; patient_code?: string | null };
        has_report?: boolean;
    }>;
};

type OrderFullResponse = {
    order: {
        id: string;
        order_code: string;
        status: string;
        patient_id: string;
        tenant_id: string;
        branch_id: string;
        requested_by?: string | null;
        notes?: string | null;
        billed_lock?: boolean;
    };
    patient: {
        id: string;
        patient_code: string;
        first_name?: string;
        last_name?: string;
        dob?: string | null;
        sex?: string | null;
    };
    samples: Array<{
        id: string;
        sample_code: string;
        type: string;
        state: string;
        order_id: string;
        tenant_id: string;
        branch_id: string;
    }>;
};

const ReportEditor: React.FC = () => {
    // Routing params
    const { reportId } = useParams();
    const { search } = useLocation();
    const navigate = useNavigate();
    const prefilledOrderId = useMemo(() => {
        const qs = new URLSearchParams(search);
        return qs.get("orderId") || "";
    }, [search]);

    // Selected report type
    const REPORT_TYPE_OPTIONS: Array<{ value: ReportType; label: string }> = useMemo(
        () => ([
            { value: "Histopatologia", label: "Histopatología / Biopsia" },
            { value: "Histoquimica", label: "Histoquímica" },
            { value: "Citologia_mamaria", label: "Citología mamaria" },
            { value: "Citologia_urinaria", label: "Citología urinaria" },
            { value: "Quirurgico", label: "Quirúrgico" },
            { value: "Revision_laminillas", label: "Revisión de laminillas/bloques" },
        ]),
        []
    );
    const resolveReportType = useCallback(
        (raw?: string | null): ReportType | undefined => {
            if (!raw) return undefined;
            if (raw in FLAGS_BY_TYPE) return raw as ReportType;
            const exactLabel = REPORT_TYPE_OPTIONS.find((opt) => opt.label.toLowerCase() === raw.toLowerCase());
            if (exactLabel) return exactLabel.value;
            const normalizedRaw = raw
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, "_")
                .replace(/[^A-Za-z_]/g, "")
                .toLowerCase();
            const normalizedValue = REPORT_TYPE_OPTIONS.find(
                (opt) =>
                    opt.value.toLowerCase() === normalizedRaw ||
                    opt.label
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/\s+/g, "_")
                        .replace(/[^A-Za-z_]/g, "")
                        .toLowerCase() === normalizedRaw
            );
            return normalizedValue?.value;
        },
        [REPORT_TYPE_OPTIONS]
    );
    const [tipo, setTipo] = useState<ReportType | undefined>(undefined);
    // Base fields
    const [paciente, setPaciente] = useState("");
    const [examen, setExamen] = useState("");
    const [folio, setFolio] = useState("");
    const [fechaRecepcion, setFechaRecepcion] = useState<Dayjs | null>(null);
    const [especimen, setEspecimen] = useState("");
    const [diagnosticoEnvio, setDiagnosticoEnvio] = useState("");
    // Context and selections
    const session = useMemo(() => getSessionContext(), []);
    const [selectedBranchId, setSelectedBranchId] = useState<string>(session.branchId || "");
    const [selectedOrderId, setSelectedOrderId] = useState<string>("");
    const [orders, setOrders] = useState<Array<{ id: string; order_code: string; patient_name: string; has_report: boolean; branch_id?: string }>>([]);
    const [orderFull, setOrderFull] = useState<OrderFullResponse | null>(null);
    // Sections (HTML strings for Quill)
    const [descripcionMacroscopia, setDescMacro] = useState<string | null>("<p><br/></p>");
    const [descripcionMicroscopia, setDescMicro] = useState<string | null>("<p><br/></p>");
    const [descripcionCitomorfologica, setDescCito] = useState<string | null>("<p><br/></p>");
    const [interpretacion, setInterpretacion] = useState<string | null>("<p><br/></p>");
    const [diagnostico, setDiagnostico] = useState<string | null>("<p><br/></p>");
    const [comentario, setComentario] = useState<string | null>("<p><br/></p>");
    const [inmunofluorescenciaHTML, setIF] = useState<string | null>("<p><br/></p>");
    const [inmunotincionesHTML, setInmunotinciones] = useState<string | null>("<p><br/></p>");
    const [microscopioElectronicoHTML, setME] = useState<string | null>("<p><br/></p>");
    const [citologiaUrinariaHTML, setCU] = useState<string | null>("<p><br/></p>");
    const [edad, setEdad] = useState<string>("");
    // Images
    const [reportImages, setReportImages] = useState<ReportImage[]>([]);
    const [reportPreview, setReportPreview] = useState<{ visible: boolean; index: number }>({ visible: false, index: 0 });
    // Existing envelope (editing mode)
    const [envelopeExistente, setEnvelopeExistente] = useState<Partial<ReportEnvelope> | undefined>(undefined);
    const orderLockSourceId = envelopeExistente?.order_id;
    const isOrderSelectionLocked = useMemo(() => Boolean(reportId || prefilledOrderId || orderLockSourceId), [reportId, prefilledOrderId, orderLockSourceId]);
    const isAutofilledFieldsLocked = Boolean(selectedOrderId);
    const orderOptions = useMemo(
        () =>
            orders
                .filter((order) => !order.has_report || order.id === selectedOrderId)
                .map((order) => ({
                    value: order.id,
                    label: `${order.order_code} - ${order.patient_name}`,
                })),
        [orders, selectedOrderId]
    );
    const noOrdersAvailable = useMemo(
        () => orders.filter((order) => !order.has_report).length === 0,
        [orders]
    );
    const tipoActivo = useMemo<ReportType>(() => (tipo && tipo in FLAGS_BY_TYPE ? (tipo as ReportType) : "Histopatologia"), [tipo]);
    // Autosave loading state
    const [isLoaded, setIsLoaded] = useState(false);
    // User role for state transitions
    const [userRole, setUserRole] = useState<string>("");
    // Modal for request changes
    const [isChangesModalVisible, setIsChangesModalVisible] = useState(false);
    const [changesComment, setChangesComment] = useState("");
    // Modal for approve with optional comment
    const [isApproveModalVisible, setIsApproveModalVisible] = useState(false);
    const [approveComment, setApproveComment] = useState("");
    // Read-only mode: reports that are not in DRAFT are read-only
    const isReadOnly = useMemo(() => {
        return envelopeExistente?.status && envelopeExistente.status !== "DRAFT";
    }, [envelopeExistente?.status]);
    // Quill ref (if needed later)
    const quillRef = useRef<ReactQuill>(null);

    // Preview pages reference for PDF export
    const previewPagesRef = useRef<ReportPreviewPagesRef>(null);
    const leftColumnRef = useRef<HTMLDivElement>(null);
    const previewColumnRef = useRef<HTMLDivElement>(null);
    const [previewBounds, setPreviewBounds] = useState<{ minHeight: number; maxHeight: number }>({ minHeight: 0, maxHeight: 0 });

    // PDF export hook
    const { exportToPDF } = usePdfExport();

    const updatePreviewDimensions = useCallback(() => {
        const columnEl = previewColumnRef.current;
        if (!columnEl) return;

        const width = columnEl.getBoundingClientRect().width;
        const desiredMinHeight = width > 0 ? width * 1.4142 : 0;
        const leftHeight = leftColumnRef.current?.getBoundingClientRect().height ?? 0;

        let desiredMaxHeight = leftHeight > 0 ? leftHeight : desiredMinHeight;
        if (desiredMaxHeight < desiredMinHeight) {
            desiredMaxHeight = desiredMinHeight;
        }

        setPreviewBounds((prev) => {
            if (
                Math.abs(prev.minHeight - desiredMinHeight) < 0.5 &&
                Math.abs(prev.maxHeight - desiredMaxHeight) < 0.5
            ) {
                return prev;
            }
            return { minHeight: desiredMinHeight, maxHeight: desiredMaxHeight };
        });
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;

        let frame = 0;
        const scheduleUpdate = () => {
            if (frame) window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(updatePreviewDimensions);
        };

        scheduleUpdate();
        window.addEventListener("resize", scheduleUpdate);

        let leftObserver: ResizeObserver | undefined;
        let previewObserver: ResizeObserver | undefined;

        if (typeof ResizeObserver !== "undefined") {
            if (leftColumnRef.current) {
                leftObserver = new ResizeObserver(scheduleUpdate);
                leftObserver.observe(leftColumnRef.current);
            }
            if (previewColumnRef.current) {
                previewObserver = new ResizeObserver(scheduleUpdate);
                previewObserver.observe(previewColumnRef.current);
            }
        }

        return () => {
            window.removeEventListener("resize", scheduleUpdate);
            if (frame) window.cancelAnimationFrame(frame);
            leftObserver?.disconnect();
            previewObserver?.disconnect();
        };
    }, [updatePreviewDimensions]);

    useEffect(() => {
        updatePreviewDimensions();
    }, [
        updatePreviewDimensions,
        descripcionMacroscopia,
        descripcionMicroscopia,
        descripcionCitomorfologica,
        interpretacion,
        diagnostico,
        comentario,
        citologiaUrinariaHTML,
        inmunofluorescenciaHTML,
        inmunotincionesHTML,
        microscopioElectronicoHTML,
        edad,
        reportImages,
        paciente,
        examen,
        folio,
        fechaRecepcion,
        especimen,
        diagnosticoEnvio,
        tipoActivo,
    ]);

    // Export to PDF
    const handleExportPDF = async () => {
        await exportToPDF(previewPagesRef);
    };

    // Load report by id or autosaved draft
    useEffect(() => {
        (async () => {
            // Report by param takes precedence
            if (reportId) {
                try {
                    const envelope = await getReport(reportId);
                    setEnvelopeExistente(envelope);
                    setTipo(resolveReportType(envelope.report.tipo));
                    setPaciente(envelope.report.base.paciente);
                    setExamen(envelope.report.base.examen);
                    setFolio(envelope.report.base.folio);
                    setFechaRecepcion(envelope.report.base.fechaRecepcion ? dayjs(envelope.report.base.fechaRecepcion) : null);
                    setEspecimen(envelope.report.base.especimen);
                    setDiagnosticoEnvio(envelope.report.base.diagnosticoEnvio ?? "");
                    setSelectedBranchId(envelope.branch_id || session.branchId || "");
                    setSelectedOrderId(envelope.order_id || "");
                    setDescMacro(envelope.report.secciones.descripcionMacroscopia ?? "<p><br/></p>");
                    setDescMicro(envelope.report.secciones.descripcionMicroscopia ?? "<p><br/></p>");
                    setDescCito(envelope.report.secciones.descripcionCitomorfologica ?? "<p><br/></p>");
                    setInterpretacion(envelope.report.secciones.interpretacion ?? "<p><br/></p>");
                    setDiagnostico(envelope.report.secciones.diagnostico ?? "<p><br/></p>");
                    setComentario(envelope.report.secciones.comentario ?? "<p><br/></p>");
                    setIF(envelope.report.secciones.inmunofluorescenciaHTML ?? "<p><br/></p>");
                    setInmunotinciones(envelope.report.secciones.inmunotincionesHTML ?? "<p><br/></p>");
                    setME(envelope.report.secciones.microscopioElectronicoHTML ?? "<p><br/></p>");
                    setCU(envelope.report.secciones.citologiaUrinariaHTML ?? "<p><br/></p>");
                    setEdad(envelope.report.secciones.edad ?? "");
                    setReportImages(
                        (envelope.report.images ?? []).map((img) => ({
                            id: img.id,
                            url: img.url,
                            thumbnailUrl: (img as ReportImage).thumbnailUrl || img.url,
                            caption: img.caption,
                        }))
                    );
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "No se pudo cargar el reporte");
                } finally {
                    setIsLoaded(true);
                }
                return;
            }

            // No report id: use autosave and prefilled order if present
            const envelope = loadAutoSave<ReportEnvelope>("reportEnvelopeDraft");
            if (envelope) {
                setEnvelopeExistente(envelope);
                setTipo(resolveReportType(envelope.report.tipo));
                setPaciente(envelope.report.base.paciente);
                setExamen(envelope.report.base.examen);
                setFolio(envelope.report.base.folio);
                setFechaRecepcion(envelope.report.base.fechaRecepcion ? dayjs(envelope.report.base.fechaRecepcion) : null);
                setEspecimen(envelope.report.base.especimen);
                setDiagnosticoEnvio(envelope.report.base.diagnosticoEnvio ?? "");
                setSelectedBranchId(envelope.branch_id || session.branchId || "");
                setSelectedOrderId(envelope.order_id || prefilledOrderId || "");
                setDescMacro(envelope.report.secciones.descripcionMacroscopia ?? "<p><br/></p>");
                setDescMicro(envelope.report.secciones.descripcionMicroscopia ?? "<p><br/></p>");
                setDescCito(envelope.report.secciones.descripcionCitomorfologica ?? "<p><br/></p>");
                setInterpretacion(envelope.report.secciones.interpretacion ?? "<p><br/></p>");
                setDiagnostico(envelope.report.secciones.diagnostico ?? "<p><br/></p>");
                setComentario(envelope.report.secciones.comentario ?? "<p><br/></p>");
                setIF(envelope.report.secciones.inmunofluorescenciaHTML ?? "<p><br/></p>");
                setInmunotinciones(envelope.report.secciones.inmunotincionesHTML ?? "<p><br/></p>");
                setME(envelope.report.secciones.microscopioElectronicoHTML ?? "<p><br/></p>");
                setCU(envelope.report.secciones.citologiaUrinariaHTML ?? "<p><br/></p>");
                setEdad(envelope.report.secciones.edad ?? "");
                setReportImages(
                    (envelope.report.images ?? []).map((img) => ({
                        id: img.id,
                        url: img.url,
                        thumbnailUrl: (img as ReportImage).thumbnailUrl || img.url,
                        caption: img.caption,
                    }))
                );
            } else if (prefilledOrderId) {
                setSelectedOrderId(prefilledOrderId);
            }
            setIsLoaded(true);
        })();
    }, [reportId, prefilledOrderId, session.branchId, resolveReportType]);

    // Load orders
    useEffect(() => {
        (async () => {
            try {
                const data = await getJSON<OrdersListResponse>("/v1/laboratory/orders/");
                const mapped = (data.orders || []).map((o) => ({
                    id: o.id,
                    order_code: o.order_code,
                    patient_name: o.patient?.full_name || o.patient?.patient_code || "Paciente sin nombre",
                    has_report: Boolean(o.has_report),
                    branch_id: o.branch?.id,
                }));
                setOrders(mapped);
            } catch {
                // ignore softly
            }
        })();
    }, []);

    // Load user role
    useEffect(() => {
        (async () => {
            try {
                const user = await getJSON<{ role: string }>("/v1/auth/me");
                setUserRole(user.role);
            } catch {
                // ignore softly
            }
        })();
    }, []);

    // When order selected, fetch full and populate
    useEffect(() => {
        (async () => {
            if (!selectedOrderId) {
                setOrderFull(null);
                setSelectedBranchId(session.branchId || "");
                return;
            }
            try {
                const full = await getJSON<OrderFullResponse>(`/v1/laboratory/orders/${selectedOrderId}/full`);
                setOrderFull(full);
                const fullName = `${full.patient.first_name ?? ""} ${full.patient.last_name ?? ""}`.trim();
                setPaciente(fullName || full.patient.patient_code);
                setFolio(full.order.order_code || "");
                setSelectedBranchId(full.order.branch_id || "");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "No se pudo cargar la orden seleccionada");
            }
        })();
    }, [selectedOrderId, session.branchId]);

    // Quill toolbar config
    const quillModules = useMemo(
        () => ({
            toolbar: {
                container: [
                    [{ header: [1, 2, false] }],
                    ["bold", "italic", "underline"],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["link"],
                    ["clean"],
                ],
            },
        }),
        []
    );

    // Build a ReportEnvelope from current state
    const buildEnvelope = (existing?: Partial<ReportEnvelope>): ReportEnvelope => {
        return {
            id: existing?.id ?? "",
            tenant_id: orderFull?.order.tenant_id || session.tenantId || "",
            branch_id: selectedBranchId || orderFull?.order.branch_id || "",
            order_id: selectedOrderId || existing?.order_id || "",
            version_no: existing?.version_no ?? 1,
            status: existing?.status ?? "DRAFT",
            title: `Reporte ${tipoActivo} - ${paciente || "Sin paciente"}`,
            diagnosis_text: (diagnosticoEnvio || "").replace(/<[^>]+>/g, "").slice(0, 1000),
            created_by: session.userId || "",
            published_at: null,
            signed_by: existing?.signed_by ?? null,
            signed_at: existing?.signed_at ?? null,
            report: {
                tipo: tipoActivo,
                base: {
                    paciente,
                    examen,
                    folio,
                    fechaRecepcion: fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : "",
                    especimen,
                    diagnosticoEnvio: diagnosticoEnvio || null,
                },
                secciones: {
                    descripcionMacroscopia: descripcionMacroscopia || null,
                    descripcionMicroscopia: descripcionMicroscopia || null,
                    descripcionCitomorfologica: descripcionCitomorfologica || null,
                    interpretacion: interpretacion || null,
                    diagnostico: diagnostico || null,
                    comentario: comentario || null,
                    inmunofluorescenciaHTML: inmunofluorescenciaHTML || null,
                    inmunotincionesHTML: inmunotincionesHTML,
                    microscopioElectronicoHTML: microscopioElectronicoHTML || null,
                    citologiaUrinariaHTML: citologiaUrinariaHTML || null,
                    edad: edad || null,
                },
                flags: FLAGS_BY_TYPE[tipoActivo],
                images: reportImages.map((img) => ({
                    id: img.id,
                    url: img.url,
                    caption: img.caption,
                })),
            },
        };
    };

    // Autosave whenever state is ready/changes
    useAutoSave("reportEnvelopeDraft", isLoaded ? buildEnvelope(envelopeExistente) : undefined);

    // Save new or new version
    const handleSave = async () => {
        try {
            const envelope = buildEnvelope(envelopeExistente);
            let savedEnvelope: ReportEnvelope;
            
            if (!envelope.id) {
                savedEnvelope = await saveReport(envelope);
                setEnvelopeExistente(savedEnvelope);
            } else {
                await saveReportVersion(envelope);
                // For existing reports, update the envelope with the saved data
                savedEnvelope = { ...envelope, status: "DRAFT" as const };
                setEnvelopeExistente(savedEnvelope);
            }
            
            // Update localStorage with the saved version after successful cloud save
            const localStorageKey = "reportEnvelopeDraft";
            localStorage.setItem(localStorageKey, JSON.stringify(savedEnvelope));
            
            message.success("Reporte guardado");
            // Redirect to order detail after successful save
            if (savedEnvelope.order_id) {
                navigate(`/orders/${savedEnvelope.order_id}`);
            }
        } catch (error) {
            console.error(error);
            message.error("No se pudo guardar el reporte");
        }
    };

    // State transition handlers
    const handleSubmit = async () => {
        if (!envelopeExistente?.id) {
            message.warning("Guarda el reporte primero antes de enviarlo a revisión");
            return;
        }
        try {
            const result = await submitReport(envelopeExistente.id);
            setEnvelopeExistente({ ...envelopeExistente, status: result.status as ReportStatus });
            message.success(result.message);
        } catch (error) {
            console.error(error);
            message.error(error instanceof Error ? error.message : "Error al enviar reporte");
        }
    };

    const handleApprove = async () => {
        if (!envelopeExistente?.id) return;
        try {
            const result = await approveReport(envelopeExistente.id, approveComment || undefined);
            setEnvelopeExistente({ ...envelopeExistente, status: result.status as ReportStatus });
            setIsApproveModalVisible(false);
            setApproveComment("");
            message.success(result.message);
        } catch (error) {
            console.error(error);
            message.error(error instanceof Error ? error.message : "Error al aprobar reporte");
        }
    };

    const handleRequestChanges = async () => {
        if (!envelopeExistente?.id) return;
        if (!changesComment.trim()) {
            message.warning("Por favor ingresa un comentario");
            return;
        }
        try {
            const result = await requestChanges(envelopeExistente.id, changesComment);
            setEnvelopeExistente({ ...envelopeExistente, status: result.status as ReportStatus });
            setIsChangesModalVisible(false);
            setChangesComment("");
            message.success(result.message);
        } catch (error) {
            console.error(error);
            message.error(error instanceof Error ? error.message : "Error al solicitar cambios");
        }
    };

    const handleSign = async () => {
        if (!envelopeExistente?.id) return;
        try {
            const result = await signReport(envelopeExistente.id);
            message.success(result.message);
            // Reload the report to get updated signature information
            const updatedReport = await getReport(envelopeExistente.id);
            setEnvelopeExistente(updatedReport);
        } catch (error) {
            console.error(error);
            message.error(error instanceof Error ? error.message : "Error al firmar reporte");
        }
    };

    const updateReportImageCaption = (index: number, caption: string) => {
        setReportImages((prev) =>
            prev.map((img, idx) => (idx === index ? { ...img, caption } : img))
        );
    };

    useEffect(() => {
        setReportPreview((prev) => {
            if (reportImages.length === 0) {
                if (!prev.visible && prev.index === 0) {
                    return prev;
                }
                return { visible: false, index: 0 };
            }
            if (prev.index >= reportImages.length) {
                return { ...prev, index: reportImages.length - 1 };
            }
            return prev;
        });
    }, [reportImages.length]);


    const handleReportPreviewOpen = (index: number) => {
        if (index < 0 || index >= reportImages.length) return;
        setReportPreview({ visible: true, index });
    };

    const handleRemoveReportImage = (index: number) => {
        setReportImages((prev) => prev.filter((_, i) => i !== index));
    };



    const columnGapValue = useMemo(() => {
        if (typeof tokens.gap === "number") return `${tokens.gap}px`;
        return tokens.gap || "16px";
    }, []);

    const previewColumnStyle = useMemo<CSSProperties>(() => {
        const style: CSSProperties = {
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
        };
        if (previewBounds.minHeight > 0) style.minHeight = previewBounds.minHeight;
        if (previewBounds.maxHeight > 0) style.maxHeight = previewBounds.maxHeight;
        return style;
    }, [previewBounds]);

    const previewScrollStyle = useMemo<CSSProperties>(() => {
        const style: CSSProperties = {
            padding: 24,
            overflowY: "auto",
            flex: 1,
        };
        if (previewBounds.minHeight > 0) style.minHeight = previewBounds.minHeight;
        if (previewBounds.maxHeight > 0) style.maxHeight = previewBounds.maxHeight;
        return style;
    }, [previewBounds]);

    return (
        <>
            <style> {letterStyles} </style>

            <style>{`
              .re-grid-2 { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .re-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
              .re-grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
              .re-span-2 { grid-column: 1 / -1; }
              .re-two-column { display: grid; gap: ${columnGapValue}; grid-template-columns: minmax(0, 1fr); align-items: start; }
              @media (min-width: 1280px) {
                .re-two-column { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
              }
              @media (max-width: 768px) {
                .re-grid-2, .re-grid-3, .re-grid-4 { grid-template-columns: 1fr; }
                .re-span-2 { grid-column: 1 / -1; }
              }
            `}</style>

            <div style={{ display: "grid", gap: tokens.gap }}>
                <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
                    <div style={{ padding: 24 }}>
                        <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Configuración del reporte</h2>
                    </div>
                    <div style={{ height: 1, background: "#e5e7eb" }} />
                    <div style={{ padding: 24, display: "grid", gap: 24 }}>
                        <div style={{ display: "grid", gap: 20 }}>
                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Orden</h3>
                                {orderFull?.order.billed_lock && (
                                    <div style={{ 
                                        padding: 12, 
                                        background: "#fff7e6", 
                                        border: "1px solid #ffd591", 
                                        borderRadius: 4,
                                        marginBottom: 8
                                    }}>
                                        <Tag color="orange">Retenido por Pago Pendiente</Tag>
                                        <div style={{ fontSize: 13, color: "#ad6800", marginTop: 4 }}>
                                            Esta orden tiene pagos pendientes. La descarga del PDF está bloqueada.
                                        </div>
                                    </div>
                                )}
                                <div className="re-grid-2">
                                    <SelectField
                                        value={selectedOrderId || undefined}
                                        onChange={(v) => setSelectedOrderId(v || "")}
                                        options={orderOptions}
                                        placeholder="Seleccione una orden"
                                        showSearch
                                        disabled={isOrderSelectionLocked}
                                    />
                                    <SelectField
                                        value={tipo}
                                        onChange={(v) => setTipo((v ?? undefined) as ReportType | undefined)}
                                        options={REPORT_TYPE_OPTIONS}
                                        placeholder="Seleccione el tipo de reporte"
                                    />
                                </div>
                                {!isOrderSelectionLocked && noOrdersAvailable ? (
                                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                                        No hay órdenes disponibles sin reporte.
                                    </Typography.Paragraph>
                                ) : null}
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Paciente</h3>
                                <div className="re-grid-2">
                                    <TextField
                                        value={paciente}
                                        onChange={(e) => setPaciente(e.target.value)}
                                        placeholder="Nombre del paciente"
                                        disabled={isAutofilledFieldsLocked}
                                    />
                                    <TextField
                                        value={folio}
                                        onChange={(e) => setFolio(e.target.value)}
                                        placeholder="Folio / código"
                                        disabled={isAutofilledFieldsLocked}
                                    />
                                </div>
                                <div className="re-grid-2">
                                    <DateField
                                        value={fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : ""}
                                        onChange={(v) => setFechaRecepcion(v ? dayjs(v) : null)}
                                        placeholder="Fecha de recepción (AAAA-MM-DD)"
                                    />
                                    {FLAGS_BY_TYPE[tipoActivo]?.incluirEdad ? (
                                        <TextField
                                            value={edad}
                                            onChange={(e) => setEdad(e.target.value)}
                                            placeholder="Edad"
                                        />
                                    ) : null}
                                </div>
                            </section>

                            <section style={{ display: "grid", gap: 10 }}>
                                <h3 style={{ margin: 0 }}>Detalles del estudio</h3>
                                <div className="re-grid-2">
                                    <div className="re-span-2">
                                        <TextField value={examen} onChange={(e) => setExamen(e.target.value)} placeholder="Nombre del examen" />
                                    </div>
                                    <TextField value={especimen} onChange={(e) => setEspecimen(e.target.value)} placeholder="Espécimen recibido" />
                                    <TextField value={diagnosticoEnvio} onChange={(e) => setDiagnosticoEnvio(e.target.value)} placeholder="Diagnóstico de envío" />
                                </div>
                            </section>
                        </div>

                        {/* Muestras en tabs: galería por muestra con selección para el reporte */}
                        {selectedOrderId && (
                            <div style={{ display: "grid", gap: 8 }}>
                                <Typography.Text strong>Muestras</Typography.Text>
                                {(orderFull?.samples?.length ?? 0) > 0 ? (
                                    <Tabs
                                        destroyInactiveTabPane
                                        items={(orderFull?.samples || []).map((s, idx) => ({
                                            key: s.id,
                                            label: `Muestra ${idx + 1} · ${s.sample_code}`,
                                            children: (
                                                <div style={{ display: "grid", gap: 12 }}>
                                                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                                        <span><b>Código:</b> {s.sample_code}</span>
                                                        <span><b>Tipo:</b> {s.type}</span>
                                                        <span><b>Estado:</b> <Tag color="#94a3b8">{s.state}</Tag></span>
                                                    </div>
                                                    <SampleImagesPicker
                                                        sampleId={s.id}
                                                        selectedIds={(reportImages.filter((i) => !!i.id).map((i) => i.id) as string[])}
                                                        allowDelete={false}
                                                        onToggleSelect={(img, selected) => {
                                                            setReportImages((prev) => {
                                                                const exists = img.id && prev.some((p) => p.id === img.id);
                                                                if (selected) {
                                                                    if (exists) return prev;
                                                                    const toAdd: ReportImage = {
                                                                        id: img.id,
                                                                        url: img.url,
                                                                        thumbnailUrl: img.thumbnailUrl,
                                                                        caption: img.caption,
                                                                    };
                                                                    return [...prev, toAdd];
                                                                }
                                                                // deselect
                                                                return prev.filter((p) => p.id !== img.id);
                                                            });
                                                        }}
                                                    />
                                                </div>
                                            ),
                                        }))}
                                    />
                                ) : (
                                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>Sin muestras para esta orden.</Typography.Paragraph>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Dos columnas: izquierda editor + galería reporte, derecha vista previa */}
                <div className="re-two-column">
                    <div
                        ref={leftColumnRef}
                        style={{
                            display: "grid",
                            gap: tokens.gap,
                            minWidth: 0,
                        }}
                    >
                        <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
                            <div style={{ padding: 24 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Contenido del reporte</h2>
                                        {envelopeExistente?.status === "PUBLISHED" && envelopeExistente.signed_by && envelopeExistente.signed_at && (
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                Firmado por: {envelopeExistente.signed_by} el {new Date(envelopeExistente.signed_at).toLocaleString()}
                                            </Typography.Text>
                                        )}
                                    </div>
                                    {envelopeExistente?.status && (
                                        <Tag color={
                                            envelopeExistente.status === "DRAFT" ? "default" :
                                            envelopeExistente.status === "IN_REVIEW" ? "blue" :
                                            envelopeExistente.status === "APPROVED" ? "cyan" :
                                            envelopeExistente.status === "PUBLISHED" ? "green" :
                                            envelopeExistente.status === "RETRACTED" ? "red" : "default"
                                        }>
                                            {envelopeExistente.status === "DRAFT" ? "Borrador" :
                                             envelopeExistente.status === "IN_REVIEW" ? "En Revisión" :
                                             envelopeExistente.status === "APPROVED" ? "Aprobado" :
                                             envelopeExistente.status === "PUBLISHED" ? "Publicado" :
                                             envelopeExistente.status === "RETRACTED" ? "Retirado" : envelopeExistente.status}
                                        </Tag>
                                    )}
                                </div>
                            </div>
                            <div style={{ height: 1, background: "#e5e7eb" }} />
                            <div style={{ padding: 24 }}>
                                <Form layout="vertical">
                                {isReadOnly && (
                                    <Typography.Paragraph type="secondary" style={{ marginBottom: 16, padding: 12, background: "#f0f0f0", borderRadius: 4 }}>
                                        Este reporte está en modo de solo lectura porque se encuentra en revisión o ya ha sido publicado.
                                    </Typography.Paragraph>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirMacroscopia && (
                                    <Form.Item label="Descripción macroscópica">
                                        <ReactQuill ref={quillRef} theme="snow" value={descripcionMacroscopia || ""} onChange={(html) => setDescMacro(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirMicroscopia && (
                                    <Form.Item label="Descripción microscópica">
                                        <ReactQuill theme="snow" value={descripcionMicroscopia || ""} onChange={(html) => setDescMicro(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirCitomorfologia && (
                                    <Form.Item label="Descripción citomorfológica">
                                        <ReactQuill theme="snow" value={descripcionCitomorfologica || ""} onChange={(html) => setDescCito(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirInterpretacion && (
                                    <Form.Item label="Interpretación / Conclusiones">
                                        <ReactQuill theme="snow" value={interpretacion || ""} onChange={(html) => setInterpretacion(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirDiagnostico && (
                                    <Form.Item label="Diagnóstico">
                                        <ReactQuill theme="snow" value={diagnostico || ""} onChange={(html) => setDiagnostico(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirComentario && (
                                    <Form.Item label="Comentario / Notas">
                                        <ReactQuill theme="snow" value={comentario || ""} onChange={(html) => setComentario(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirCU && (
                                    <Form.Item label="Citología urinaria">
                                        <ReactQuill theme="snow" value={citologiaUrinariaHTML || ""} onChange={(html) => setCU(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirIF && (
                                    <Form.Item label="Inmunofluorescencia (panel)">
                                        <ReactQuill theme="snow" value={inmunofluorescenciaHTML || ""} onChange={(html) => setIF(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirInmunotinciones && (
                                    <Form.Item label="Inmunotinciones">
                                        <ReactQuill theme="snow" value={inmunotincionesHTML || ""} onChange={(html) => setInmunotinciones(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirME && (
                                    <Form.Item label="Microscopía electrónica (descripción)">
                                        <ReactQuill theme="snow" value={microscopioElectronicoHTML || ""} onChange={(html) => setME(html)} modules={quillModules} readOnly={isReadOnly} />
                                    </Form.Item>
                                )}

                                    <Divider />
                                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                        {!isReadOnly && <Button type="primary" onClick={handleSave}>Guardar reporte</Button>}
                                        <Button onClick={handleExportPDF}>Exportar a PDF</Button>
                                        
                                        {/* State transition buttons */}
                                        {envelopeExistente?.status === "DRAFT" && (
                                            <Button type="default" onClick={handleSubmit}>Enviar a Revisión</Button>
                                        )}
                                        {envelopeExistente?.status === "IN_REVIEW" && userRole === "pathologist" && (
                                            <>
                                                <Button type="default" style={{ background: "#52c41a", color: "white", borderColor: "#52c41a" }} onClick={() => setIsApproveModalVisible(true)}>Aprobar</Button>
                                                <Button type="default" style={{ background: "#f59e0b", color: "white", borderColor: "#f59e0b" }} onClick={() => setIsChangesModalVisible(true)}>Solicitar Cambios</Button>
                                            </>
                                        )}
                                        {envelopeExistente?.status === "APPROVED" && userRole === "pathologist" && (
                                            <Button type="default" style={{ background: "#1890ff", color: "white", borderColor: "#1890ff" }} onClick={handleSign}>Firmar y Publicar</Button>
                                        )}
                                    </div>
                                </Form>
                            </div>
                        </div>

                        <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
                            <div style={{ padding: 24 }}>
                                <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Galería del reporte</h2>
                            </div>
                            <div style={{ height: 1, background: "#e5e7eb" }} />
                            <div style={{ padding: 24 }}>
                                <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>Las imágenes aquí mostradas provienen de la selección en las muestras. Eliminar solo desasocia del reporte.</Typography.Paragraph>
                                {reportImages.length > 0 ? (
                                    <div
                                        style={{
                                            display: "grid",
                                            gap: 14,
                                            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                                        }}
                                    >
                                        <Image.PreviewGroup
                                            preview={{
                                                visible: reportPreview.visible,
                                                current: reportPreview.index,
                                                onVisibleChange: (visible) => {
                                                    setReportPreview((prev) => ({ ...prev, visible }));
                                                },
                                                onChange: (current: number) => {
                                                    setReportPreview((prev) => ({ ...prev, index: current }));
                                                },
                                                toolbarRender: (_originalNode, info) => {
                                                    const currentIndex =
                                                        typeof info.current === "number" ? info.current : reportPreview.index;
                                                    const currentImage = reportImages[currentIndex];

                                                    return (
                                                        <div
                                                            className="ant-image-preview-operations"
                                                            style={{ display: "flex", alignItems: "center", gap: 16 }}
                                                        >
                                                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                                                {info.icons.zoomOutIcon}
                                                                {info.icons.zoomInIcon}
                                                            </div>
                                                            {currentImage && (
                                                                <Popconfirm
                                                                    title="Quitar imagen del reporte"
                                                                    okText="Sí"
                                                                    cancelText="No"
                                                                    onConfirm={() => handleRemoveReportImage(currentIndex)}
                                                                >
                                                                    <Button
                                                                        size="small"
                                                                        type="text"
                                                                        icon={<DeleteOutlined />}
                                                                        onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                                                            event.preventDefault();
                                                                            event.stopPropagation();
                                                                        }}
                                                                    >
                                                                        Eliminar
                                                                    </Button>
                                                                </Popconfirm>
                                                            )}
                                                        </div>
                                                    );
                                                },
                                            }}
                                        >
                                            {reportImages.map((img, idx) => {
                                                const noteValue = img.caption ?? "";
                                                const counterId = `figure-${img.id ?? idx}-note-counter`;

                                                return (
                                                    <Card
                                                        key={img.id ?? idx}
                                                        size="small"
                                                        hoverable
                                                        style={{
                                                            width: "100%",
                                                            borderRadius: 12,
                                                            overflow: "hidden",
                                                            border: "1px solid #e2e8f0",
                                                            background: "#ffffff",
                                                            boxShadow: "0 12px 20px -20px rgba(15, 23, 42, 0.35)",
                                                        }}
                                                        bodyStyle={{ padding: 0 }}
                                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 12,
                                                padding: 12,
                                                alignItems: "center",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    flex: "0 0 25%",
                                                    display: "flex",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        position: "relative",
                                                        width: "100%",
                                                        aspectRatio: "1 / 1",
                                                        borderRadius: 10,
                                                        overflow: "hidden",
                                                        background: "#0f172a",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    <Image
                                                        src={img.thumbnailUrl || img.url}
                                                        alt={img.caption || `Figura ${idx + 1}`}
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "cover",
                                                            objectPosition: "center",
                                                            background: "#0f172a",
                                                            display: "block",
                                                        }}
                                                        fallback={img.url}
                                                        preview={{ src: img.url }}
                                                        onClick={() => handleReportPreviewOpen(idx)}
                                                    />
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    flex: "1 1 0",
                                                    minWidth: 0,
                                                    background: "#f8fafc",
                                                    borderRadius: 10,
                                                    padding: 10,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: 6,
                                                    border: "1px solid #e2e8f0",
                                                    height: "100%",
                                                }}
                                            >
                                                <Typography.Text strong>{`Figura ${idx + 1}`}</Typography.Text>
                                                <Input.TextArea
                                                    placeholder="Añade una nota para esta imagen"
                                                    autoSize={{ minRows: 1, maxRows: 2 }}
                                                    maxLength={NOTE_MAX_LENGTH}
                                                    showCount={false}
                                                    aria-describedby={counterId}
                                                    value={noteValue}
                                                    onChange={(event) => {
                                                        const nextValue = event.target.value.slice(0, NOTE_MAX_LENGTH);
                                                        if (nextValue !== noteValue) {
                                                            updateReportImageCaption(idx, nextValue);
                                                        }
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.metaKey || event.ctrlKey || event.altKey) return;
                                                        if (noteValue.length < NOTE_MAX_LENGTH) return;
                                                        if (NOTE_CONTROL_KEYS.has(event.key)) return;
                                                        event.preventDefault();
                                                    }}
                                                    onPaste={(event) => {
                                                        event.preventDefault();
                                                        const target = event.target as HTMLTextAreaElement;
                                                        const selectionStart = target.selectionStart ?? noteValue.length;
                                                        const selectionEnd = target.selectionEnd ?? noteValue.length;
                                                        const pasted = event.clipboardData?.getData("text") ?? "";
                                                        const before = noteValue.slice(0, selectionStart);
                                                        const after = noteValue.slice(selectionEnd);
                                                        const candidate = `${before}${pasted}${after}`.slice(0, NOTE_MAX_LENGTH);
                                                        updateReportImageCaption(idx, candidate);
                                                    }}
                                                    style={{ background: "#ffffff", fontSize: "13px" }}
                                                />
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center",
                                                        marginTop: "auto",
                                                    }}
                                                >
                                                    <div
                                                        id={counterId}
                                                        aria-live="polite"
                                                        style={{
                                                            fontSize: 12,
                                                            color: "#475569",
                                                        }}
                                                    >
                                                        {`${noteValue.length}/${NOTE_MAX_LENGTH}`}
                                                    </div>
                                                    <Popconfirm
                                                        title="Quitar imagen del reporte"
                                                        okText="Sí"
                                                        cancelText="No"
                                                        onConfirm={() => handleRemoveReportImage(idx)}
                                                    >
                                                        <Button
                                                            danger
                                                            type="text"
                                                            icon={<DeleteOutlined />}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                            }}
                                                        >
                                                            Eliminar
                                                        </Button>
                                                    </Popconfirm>
                                                </div>
                                            </div>
                                        </div>
                                                    </Card>
                                                );
                                            })}
                                        </Image.PreviewGroup>
                                    </div>
                                ) : (
                                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                                        No hay imágenes seleccionadas.
                                    </Typography.Paragraph>
                                )}
                            </div>
                        </div>
                    </div>

                    <div ref={previewColumnRef} style={previewColumnStyle}>
                        <div
                            style={{
                                background: tokens.cardBg,
                                borderRadius: tokens.radius,
                                boxShadow: tokens.shadow,
                                padding: 0,
                                display: "flex",
                                flexDirection: "column",
                                flex: 1,
                                overflow: "hidden",
                            }}
                        >
                            <div style={{ padding: 24 }}>
                                <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Vista previa</h2>
                            </div>
                            <div style={{ height: 1, background: "#e5e7eb" }} />
                            <div style={previewScrollStyle}>
                                <ReportPreviewPages ref={previewPagesRef} report={buildEnvelope(envelopeExistente)} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for approving with optional comment */}
            <Modal
                title={
                    <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: 12,
                        padding: "4px 0"
                    }}>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: "#0d1b2a" }}>
                                Aprobar Reporte
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 400, color: "#64748b" }}>
                                Confirma que el reporte está listo para ser publicado
                            </div>
                        </div>
                    </div>
                }
                open={isApproveModalVisible}
                onCancel={() => {
                    setIsApproveModalVisible(false);
                    setApproveComment("");
                }}
                width={600}
                footer={[
                    <Button 
                        key="cancel" 
                        onClick={() => {
                            setIsApproveModalVisible(false);
                            setApproveComment("");
                        }}
                        style={{ borderRadius: 6 }}
                    >
                        Cancelar
                    </Button>,
                    <Button 
                        key="approve" 
                        type="primary"
                        onClick={handleApprove}
                        style={{ 
                            borderRadius: 6,
                            background: "#52c41a",
                            borderColor: "#52c41a",
                            color: "white"
                        }}
                    >
                        Aprobar
                    </Button>
                ]}
                styles={{
                    header: { paddingBottom: 16, borderBottom: "1px solid #e5e7eb" },
                    body: { paddingTop: 20 }
                }}
            >
                <Typography.Paragraph style={{ color: "#475569", marginBottom: 16 }}>
                    Puedes agregar un comentario opcional (con menciones @) al aprobar el reporte:
                </Typography.Paragraph>
                <CommentInput
                    value={approveComment}
                    onChange={setApproveComment}
                    onSubmit={async (text, mentionIds) => {
                        // Update the comment value for handleApprove to use
                        setApproveComment(text);
                        // Note: mentionIds are available but approveReport API doesn't use them yet
                    }}
                    placeholder="Comentario opcional... Usa @ para mencionar a alguien"
                    rows={4}
                    hideSubmitButton={true}
                />
            </Modal>

            {/* Modal for requesting changes */}
            <Modal
                title={
                    <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: 12,
                        padding: "4px 0"
                    }}>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: "#0d1b2a" }}>
                                Solicitar Cambios
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 400, color: "#64748b" }}>
                                Indica qué modificaciones necesita el reporte
                            </div>
                        </div>
                    </div>
                }
                open={isChangesModalVisible}
                onCancel={() => {
                    setIsChangesModalVisible(false);
                    setChangesComment("");
                }}
                width={600}
                footer={[
                    <Button 
                        key="cancel" 
                        onClick={() => {
                            setIsChangesModalVisible(false);
                            setChangesComment("");
                        }}
                        style={{ borderRadius: 6 }}
                    >
                        Cancelar
                    </Button>,
                    <Button 
                        key="send" 
                        type="primary"
                        onClick={handleRequestChanges}
                        disabled={!changesComment.trim()}
                        style={{ 
                            borderRadius: 6,
                            background: "#f59e0b",
                            borderColor: "#f59e0b",
                            color: "white"
                        }}
                    >
                        Solicitar Cambios
                    </Button>
                ]}
                
            >
                <CommentInput
                    value={changesComment}
                    onChange={setChangesComment}
                    onSubmit={async (text, mentionIds) => {
                        // Update the comment value for handleRequestChanges to use
                        setChangesComment(text);
                        // Note: mentionIds are available but requestChanges API doesn't use them yet
                    }}
                    placeholder="Describe los cambios necesarios... Usa @ para mencionar a alguien"
                    rows={4}
                    hideSubmitButton={true}
                />
            </Modal>
        </>
    );
};

export default ReportEditor;
