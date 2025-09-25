import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Form, message, Divider, Button, Tabs, Tag, Typography, Modal, Input, Tooltip, Popconfirm } from "antd";
import dayjs, { Dayjs } from "dayjs";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useAutoSave, loadAutoSave } from "../../hooks/auto_save";
import { saveReport, saveReportVersion } from "../../services/report_service";
import type { ReportImage } from "./report_images";
import SampleImagesPicker from "./sample_images_picker";
import { EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import logo from "../../images/report_logo.png";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { ReportType, ReportEnvelope, ReportFlags } from "../../models/report";
import SelectField from "../ui/select_field";
import TextField from "../ui/text_field";
import DateField from "../ui/date_field";
import { tokens } from "../design/tokens";
import { useLocation, useParams } from "react-router-dom";
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

/* PDF constants and helpers */
const PX_TO_MM = 0.264583;
const PAGE_W_MM = 215.9;
const PAGE_H_MM = 279.4;
const MARGIN_L_MM = 18;
const MARGIN_R_MM = 18;
const HEADER_H_MM = 28;
const FOOTER_H_MM = 20;

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
    const [reportGalleryModal, setReportGalleryModal] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
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
    // Quill ref (if needed later)
    const quillRef = useRef<ReactQuill>(null);

    // Visible: paginated pages; Hidden: source content used to paginate and export PDF
    const previewHostRef = useRef<HTMLDivElement>(null);
    const hiddenSourceRef = useRef<HTMLDivElement>(null);
    const sourceContentRef = useRef<HTMLDivElement>(null);

    // Export to PDF (uses hidden source + same styles + vector header/footer)
    const handleExportPDF = async () => {
        const host = previewHostRef.current;
        if (!host) return;

        // Make sure web fonts are loaded before rasterizing
        if ("fonts" in document) {
            await document.fonts.ready;
        }

        // Helper: wait for all images on a page to load
        const waitForImages = (root: HTMLElement) => {
            const imgs = Array.from(root.querySelectorAll("img"));
            return Promise.all(
                imgs.map(
                    (img) =>
                        new Promise<void>((resolve) => {
                            if (img.complete && img.naturalWidth > 0) return resolve();
                            const onDone = () => {
                                img.removeEventListener("load", onDone);
                                img.removeEventListener("error", onDone);
                                resolve();
                            };
                            img.addEventListener("load", onDone);
                            img.addEventListener("error", onDone);
                        })
                )
            );
        };

        // Get the "pages" visible in the preview
        const pages = Array.from(host.children).filter(
            (el) => el instanceof HTMLElement
        ) as HTMLElement[];

        if (pages.length === 0) return;

        // Wait for pictures just in case
        for (const page of pages) {
            await waitForImages(page);
        }

        // Create the PDF in Letter size
        const doc = new jsPDF({
            unit: "mm",
            format: "letter",
            orientation: "portrait",
            compress: true,
        });

        // mm of the letter page
        const PAGE_W_MM = 215.9;
        const PAGE_H_MM = 279.4;

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];

            // Rasterize the FULL PAGE as seen in preview
            const canvas = await html2canvas(page, {
                scale: window.devicePixelRatio || 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                // These two options help html2canvas calculate layout as on screen
                windowWidth: page.offsetWidth,
                windowHeight: page.offsetHeight,
            });

            const imgData = canvas.toDataURL("image/jpeg", 0.95);

            // On the 2nd+ page add new page
            if (i > 0) doc.addPage("letter", "portrait");

            // Paste the image occupying the ENTIRE page (0 margins)
            doc.addImage(imgData, "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
        }

        doc.save("reporte.pdf");
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
            if (!envelope.id) {
                const savedEnvelope = await saveReport(envelope);
                setEnvelopeExistente(savedEnvelope);
            } else {
                await saveReportVersion(envelope);
            }
            message.success("Reporte guardado");
        } catch (error) {
            console.error(error);
            message.error("No se pudo guardar el reporte");
        }
    };

    const updateReportImageCaption = (index: number, caption: string) => {
        setReportImages((prev) =>
            prev.map((img, idx) => (idx === index ? { ...img, caption } : img))
        );
    };

    const fechaRecepcionMs = fechaRecepcion?.valueOf();

    /* Paginated preview (this is the ONLY visible view) */
    useEffect(() => {
        const host = previewHostRef.current;
        const sourceInDOM = hiddenSourceRef.current?.querySelector("#reporte-content") as HTMLElement | null;
        if (!host || !sourceInDOM) return;

        // Clear current pages
        host.innerHTML = "";

        // Useful area (mm → px)
        const contentWpx = Math.round((PAGE_W_MM - MARGIN_L_MM - MARGIN_R_MM) / PX_TO_MM);
        const contentHpx = Math.round((PAGE_H_MM - HEADER_H_MM - FOOTER_H_MM) / PX_TO_MM);

        // Creates a visual "Letter" page with header/body/footer
        const makePage = () => {
            const page = document.createElement("div");
            page.style.width = "8.5in";
            page.style.height = "11in";
            page.style.background = "#fff";
            page.style.boxShadow = "0 0 6px rgba(0,0,0,.2)";
            page.style.margin = "16px auto";
            page.style.position = "relative";
            page.style.overflow = "hidden";

            // Header
            const header = document.createElement("div");
            header.style.position = "absolute";
            header.style.top = "0";
            header.style.left = `${MARGIN_L_MM}mm`;
            header.style.right = `${MARGIN_R_MM}mm`;
            header.style.height = `${HEADER_H_MM}mm`;
            header.style.display = "flex";
            header.style.alignItems = "flex-end";
            header.style.paddingBottom = "4mm";
            header.style.color = "#002060";
            header.style.fontWeight = "bold";
            header.style.fontSize = "8pt";
            header.style.fontFamily = "Arial, sans-serif";
            header.innerHTML = `
                <div>
                  <div>Dra. Arisbeth Villanueva Pérez.</div>
                  <div>Anatomía Patológica, Nefropatología y Citología Exfoliativa</div>
                  <div>Centro Médico Nacional de Occidente IMSS. INCMNSZ</div>
                  <div>DGP3833349 | DGP. ESP 6133871</div>
                </div>
            `;

            // Body (the content area)
            const body = document.createElement("div");
            body.style.position = "absolute";
            body.style.top = `${HEADER_H_MM}mm`;
            body.style.bottom = `${FOOTER_H_MM}mm`;
            body.style.left = `${MARGIN_L_MM}mm`;
            body.style.right = `${MARGIN_R_MM}mm`;
            body.style.overflow = "hidden";
            body.style.width = `${contentWpx}px`;
            body.style.height = `${contentHpx}px`;

            // Footer
            const footer = document.createElement("div");
            footer.style.position = "absolute";
            footer.style.bottom = "0";
            footer.style.left = `${MARGIN_L_MM}mm`;
            footer.style.right = `${MARGIN_R_MM}mm`;
            footer.style.height = `${FOOTER_H_MM}mm`;
            footer.style.display = "flex";
            footer.style.alignItems = "center";
            footer.style.justifyContent = "space-between";
            footer.style.color = "#002060";
            footer.style.fontSize = "7pt";
            footer.style.fontFamily = "Arial, sans-serif";
            footer.style.fontWeight = "bold";
            footer.innerHTML = `
                <img
                    src="${logo}"
                    alt="Logo"
                    style="
                      display:block;
                      height: calc(${FOOTER_H_MM}mm - 4mm);
                      width: auto;
                      max-width: 35%;
                      object-fit: contain;
                    "
                />
                <div style="max-width:65%">
                  Francisco Rojas González No. 654 Col. Ladrón de Guevara, Guadalajara, Jalisco, México C.P. 44600<br/>
                  Tel. 33 2015 0100, 33 2015 0101. Cel. 33 2823-1959  patologiaynefropatologia@gmail.com
                </div>
            `;

            page.appendChild(header);
            page.appendChild(body);
            page.appendChild(footer);
            host.appendChild(page);
            return { page, body };
        };

        // Clone source content and flow it across pages
        const work = sourceInDOM.cloneNode(true) as HTMLElement;
        const nodes = Array.from(work.childNodes);

        // Try to place an element; return whether it fits in the current page body
        const fits = (container: HTMLElement, el: HTMLElement) => {
            container.appendChild(el);
            const ok = container.scrollHeight <= container.clientHeight;
            if (!ok) container.removeChild(el);
            return ok;
        };

        let { body } = makePage();

        // Distribute nodes across pages, splitting blocks if needed
        nodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const span = document.createElement("span");
                span.textContent = node.textContent || "";
                if (!fits(body, span)) {
                    ({ body } = makePage());
                    body.appendChild(span);
                }
                return;
            }

            const elem = node as HTMLElement;
            if (!(elem instanceof HTMLElement)) return;

            // Try whole block
            const block = elem.cloneNode(true) as HTMLElement;
            if (fits(body, block)) return;

            // New page, try as a unit
            ({ body } = makePage());
            if (block.scrollHeight <= body.clientHeight) {
                body.appendChild(block);
                return;
            }

            // Still too big: split by children
            const shell = block.cloneNode(false) as HTMLElement;
            body.appendChild(shell);
            Array.from(block.childNodes).forEach((child) => {
                const c = (child.cloneNode(true) as HTMLElement) || document.createElement("span");
                if (!fits(body, c)) {
                    ({ body } = makePage());
                    body.appendChild(c);
                } else {
                    shell.appendChild(c);
                }
            });
        });
    }, [
        paciente, examen, folio, fechaRecepcionMs, especimen, diagnosticoEnvio,
        descripcionMacroscopia, descripcionMicroscopia, descripcionCitomorfologica,
        interpretacion, diagnostico, comentario, citologiaUrinariaHTML,
        inmunofluorescenciaHTML, inmunotincionesHTML, microscopioElectronicoHTML,
        edad, reportImages, tipoActivo
    ]);

    return (
        <>
            <style> {letterStyles} </style>

            <style>{`
              .re-grid-2 { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .re-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
              .re-grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
              .re-span-2 { grid-column: 1 / -1; }
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
                <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: tokens.gap, alignItems: "start" }}>
                    <div style={{ display: "grid", gap: tokens.gap }}>
                        <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
                            <div style={{ padding: 24 }}>
                                <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Contenido del reporte</h2>
                            </div>
                            <div style={{ height: 1, background: "#e5e7eb" }} />
                            <div style={{ padding: 24 }}>
                                <Form layout="vertical">
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirMacroscopia && (
                                    <Form.Item label="Descripción macroscópica">
                                        <ReactQuill ref={quillRef} theme="snow" value={descripcionMacroscopia || ""} onChange={(html) => setDescMacro(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirMicroscopia && (
                                    <Form.Item label="Descripción microscópica">
                                        <ReactQuill theme="snow" value={descripcionMicroscopia || ""} onChange={(html) => setDescMicro(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirCitomorfologia && (
                                    <Form.Item label="Descripción citomorfológica">
                                        <ReactQuill theme="snow" value={descripcionCitomorfologica || ""} onChange={(html) => setDescCito(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirInterpretacion && (
                                    <Form.Item label="Interpretación / Conclusiones">
                                        <ReactQuill theme="snow" value={interpretacion || ""} onChange={(html) => setInterpretacion(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirDiagnostico && (
                                    <Form.Item label="Diagnóstico">
                                        <ReactQuill theme="snow" value={diagnostico || ""} onChange={(html) => setDiagnostico(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirComentario && (
                                    <Form.Item label="Comentario / Notas">
                                        <ReactQuill theme="snow" value={comentario || ""} onChange={(html) => setComentario(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirCU && (
                                    <Form.Item label="Citología urinaria">
                                        <ReactQuill theme="snow" value={citologiaUrinariaHTML || ""} onChange={(html) => setCU(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirIF && (
                                    <Form.Item label="Inmunofluorescencia (panel)">
                                        <ReactQuill theme="snow" value={inmunofluorescenciaHTML || ""} onChange={(html) => setIF(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirInmunotinciones && (
                                    <Form.Item label="Inmunotinciones">
                                        <ReactQuill theme="snow" value={inmunotincionesHTML || ""} onChange={(html) => setInmunotinciones(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipoActivo]?.incluirME && (
                                    <Form.Item label="Microscopía electrónica (descripción)">
                                        <ReactQuill theme="snow" value={microscopioElectronicoHTML || ""} onChange={(html) => setME(html)} modules={quillModules} />
                                    </Form.Item>
                                )}

                                    <Divider />
                                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                        <Button type="primary" onClick={handleSave}>Guardar reporte</Button>
                                        <Button onClick={handleExportPDF}>Exportar a PDF</Button>
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
                                {(reportImages.length > 0) ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                                        {reportImages.map((img, idx) => (
                                            <div
                                                key={img.id ?? idx}
                                                style={{
                                                    position: "relative",
                                                    border: "1px solid #f0f0f0",
                                                    borderRadius: 6,
                                                    overflow: "hidden",
                                                    background: "#fafafa",
                                                }}
                                            >
                                                <img
                                                    src={img.thumbnailUrl || img.url}
                                                    alt={img.caption || `Figura ${idx + 1}`}
                                                    style={{ width: "100%", height: 100, objectFit: "cover" }}
                                                />

                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        top: 4,
                                                        right: 4,
                                                        display: "flex",
                                                        gap: 4,
                                                    }}
                                                >
                                                    <Tooltip title="Ver imagen">
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<EyeOutlined />}
                                                            onClick={() => setReportGalleryModal({ open: true, index: idx })}
                                                        />
                                                    </Tooltip>
                                                    <Popconfirm
                                                        title="Quitar imagen del reporte"
                                                        okText="Sí"
                                                        cancelText="No"
                                                        onConfirm={() =>
                                                            setReportImages((prev) => prev.filter((_, i) => i !== idx))
                                                        }
                                                    >
                                                        <Button size="small" type="text" icon={<DeleteOutlined />} />
                                                    </Popconfirm>
                                                </div>

                                                <div style={{ padding: "8px 8px 12px" }}>
                                                    <Input.TextArea
                                                        placeholder="Añade una nota para esta imagen"
                                                        autoSize={{ minRows: 2, maxRows: 3 }}
                                                        value={img.caption || ""}
                                                        onChange={(e) => updateReportImageCaption(idx, e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>No hay imágenes seleccionadas.</Typography.Paragraph>
                                )}
                                {/* Modal de vista de imagen seleccionada de la galería del reporte */}
                                <Modal
                                    open={reportGalleryModal.open}
                                    title="Imagen del reporte"
                                    footer={null}
                                    onCancel={() => setReportGalleryModal({ open: false, index: null })}
                                    width={720}
                                    centered
                                >
                                    {reportGalleryModal.index != null && reportImages[reportGalleryModal.index] && (
                                        <img
                                            src={reportImages[reportGalleryModal.index].url}
                                            alt={reportImages[reportGalleryModal.index].caption || "imagen"}
                                            style={{ width: "100%", maxHeight: 520, objectFit: "contain" }}
                                        />
                                    )}
                                </Modal>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
                        <div style={{ padding: 24 }}>
                            <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Vista previa</h2>
                        </div>
                        <div style={{ height: 1, background: "#e5e7eb" }} />
                        <div style={{ padding: 24 }}>
                            <div ref={previewHostRef} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden source content: used to paginate and to export the PDF */}
            <div
                ref={hiddenSourceRef}
                style={{ position: "fixed", left: "-10000px", top: 0, width: 0, height: 0, overflow: "hidden" }}
                aria-hidden
            >
                <div id="reporte-content" ref={sourceContentRef}>
                    <p><b>Dr(a).</b> Presente.</p>
                    <p><b>Paciente:</b> {paciente || <em>(Sin especificar)</em>}</p>
                    <p><b>Examen:</b> {examen || <em>(Sin especificar)</em>}</p>
                    <p><b>No.:</b> {folio || <em>(Sin especificar)</em>}</p>

                    <p>
                        <b>Fecha de recepción de muestra:</b>{" "}
                        {fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : <em>(Sin especificar)</em>}
                    </p>

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirEdad && (
                        <p><b>Edad:</b> {edad || <em>(Sin especificar)</em>}</p>
                    )}

                    <p><b>Espécimen recibido:</b> {especimen || <em>(Sin especificar)</em>}</p>
                    {diagnosticoEnvio && <p><b>Diagnóstico de envío:</b> {diagnosticoEnvio}</p>}

                    <hr className="report-hr" />

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirMacroscopia && (
                        <>
                            <h3>Descripción macroscópica</h3>
                            <div dangerouslySetInnerHTML={{ __html: descripcionMacroscopia || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirMicroscopia && (
                        <>
                            <h3>Descripción microscópica</h3>
                            <div dangerouslySetInnerHTML={{ __html: descripcionMicroscopia || "" }} />
                        </>
                    )}

                    {reportImages.length > 0 && (
                        <>
                            <hr className="report-hr" />
                            <h3>Imágenes</h3>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                    gap: 12,
                                }}
                            >
                                {reportImages.map((img, idx) => (
                                    <div
                                        key={img.id || idx}
                                        style={{
                                            border: "1px solid #f0f0f0",
                                            borderRadius: 8,
                                            overflow: "hidden",
                                            background: "#fff",
                                        }}
                                    >
                                        <img
                                            src={img.url}
                                            alt={img.caption || `Figura ${idx + 1}`}
                                            style={{ width: "100%", height: 220, objectFit: "contain", background: "#fafafa" }}
                                        />
                                        <div style={{ padding: "6px 8px", fontSize: 12 }}>
                                            <b>Figura {idx + 1}.</b>{" "}
                                            {img.caption && img.caption.trim().length > 0 ? img.caption : <em> </em>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirCitomorfologia && (
                        <>
                            <h3>Descripción citomorfológica</h3>
                            <div dangerouslySetInnerHTML={{ __html: descripcionCitomorfologica || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirInterpretacion && (
                        <>
                            <h3>Interpretación</h3>
                            <div dangerouslySetInnerHTML={{ __html: interpretacion || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirDiagnostico && (
                        <>
                            <h3>Diagnóstico</h3>
                            <div dangerouslySetInnerHTML={{ __html: diagnostico || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirComentario && (
                        <>
                            <h3>Comentario</h3>
                            <div dangerouslySetInnerHTML={{ __html: comentario || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirCU && (
                        <>
                            <h3>Citología urinaria</h3>
                            <div dangerouslySetInnerHTML={{ __html: citologiaUrinariaHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirIF && (
                        <>
                            <h3>Inmunofluorescencia</h3>
                            <div dangerouslySetInnerHTML={{ __html: inmunofluorescenciaHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirInmunotinciones && (
                        <>
                            <h3>Inmunotinciones</h3>
                            <div dangerouslySetInnerHTML={{ __html: inmunotincionesHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirME && (
                        <>
                            <h3>Microscopía electrónica</h3>
                            <div dangerouslySetInnerHTML={{ __html: microscopioElectronicoHTML || "" }} />
                        </>
                    )}
                </div>
            </div>
        </>
    );
};

export default ReportEditor;
