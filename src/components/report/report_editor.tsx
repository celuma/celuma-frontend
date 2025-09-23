import { useEffect, useMemo, useRef, useState } from "react";
import { Form, message, Divider, Button } from "antd";
import dayjs, { Dayjs } from "dayjs";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useAutoSave, loadAutoSave } from "../../hooks/auto_save";
import { saveReport, saveReportVersion } from "../../services/report_service";
import ReportImages, { type ReportImage } from "./report_images";
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
    const [tipo, setTipo] = useState<ReportType>("Histopatologia");
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
    const [selectedSampleId, setSelectedSampleId] = useState<string>("");
    const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([]);
    const [orders, setOrders] = useState<Array<{ id: string; label: string; branch_id?: string }>>([]);
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
    // Existing envelope (editing mode)
    const [envelopeExistente, setEnvelopeExistente] = useState<Partial<ReportEnvelope> | undefined>(undefined);
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
                    setTipo(envelope.report.tipo);
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
                    setReportImages((envelope.report.images ?? []).map((img) => ({ id: img.id, url: img.url, caption: img.caption })));
                } catch (e) {
                    message.error(e instanceof Error ? e.message : "No se pudo cargar el reporte");
                } finally {
                    setIsLoaded(true);
                }
                return;
            }

            // No report id: use autosave and prefilled order if present
            const envelope = loadAutoSave<ReportEnvelope>("reportEnvelopeDraft");
            if (envelope) {
                setEnvelopeExistente(envelope);
                setTipo(envelope.report.tipo);
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
                setReportImages(envelope.report.images ?? []);
            } else if (prefilledOrderId) {
                setSelectedOrderId(prefilledOrderId);
            }
            setIsLoaded(true);
        })();
    }, [reportId, prefilledOrderId, session.branchId]);

    // Load branches by tenant
    useEffect(() => {
        (async () => {
            if (!session.tenantId) return;
            try {
                const data = await getJSON<Array<{ id: string; name?: string; code?: string }>>(`/v1/tenants/${session.tenantId}/branches`);
                setBranches(data || []);
            } catch (e) {
                // ignore softly
            }
        })();
    }, [session.tenantId]);

    // Load orders
    useEffect(() => {
        (async () => {
            try {
                const data = await getJSON<OrdersListResponse>("/v1/laboratory/orders/");
                const mapped = (data.orders || []).map((o) => ({ id: o.id, label: `${o.order_code} - ${o.status}`, branch_id: o.branch?.id }));
                setOrders(mapped);
            } catch (e) {
                // ignore softly
            }
        })();
    }, []);

    // When order selected, fetch full and populate
    useEffect(() => {
        (async () => {
            if (!selectedOrderId) {
                setOrderFull(null);
                setSelectedSampleId("");
                return;
            }
            try {
                const full = await getJSON<OrderFullResponse>(`/v1/laboratory/orders/${selectedOrderId}/full`);
                setOrderFull(full);
                const fullName = `${full.patient.first_name ?? ""} ${full.patient.last_name ?? ""}`.trim();
                setPaciente(fullName || full.patient.patient_code);
                setFolio(full.order.order_code || "");
                if (!selectedBranchId) setSelectedBranchId(full.order.branch_id);
                // Default to first sample if any
                if (full.samples?.length > 0) {
                    setSelectedSampleId(full.samples[0].id);
                } else {
                    setSelectedSampleId("");
                }
            } catch (e) {
                message.error(e instanceof Error ? e.message : "No se pudo cargar la orden seleccionada");
            }
        })();
    }, [selectedOrderId]);

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
            title: `Reporte ${tipo} - ${paciente || "Sin paciente"}`,
            diagnosis_text: (diagnosticoEnvio || "").replace(/<[^>]+>/g, "").slice(0, 1000),
            created_by: session.userId || "",
            published_at: null,
            report: {
                tipo,
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
                flags: FLAGS_BY_TYPE[tipo],
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
        } catch (e) {
            console.error(e);
            message.error("No se pudo guardar el reporte");
        }
    };

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
        paciente, examen, folio, fechaRecepcion?.valueOf(), especimen, diagnosticoEnvio,
        descripcionMacroscopia, descripcionMicroscopia, descripcionCitomorfologica,
        interpretacion, diagnostico, comentario, citologiaUrinariaHTML,
        inmunofluorescenciaHTML, inmunotincionesHTML, microscopioElectronicoHTML,
        edad, reportImages, tipo
    ]);

    return (
        <>
            <style> {letterStyles} </style>

            <style>{`
              .re-grid-2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
              .re-grid-3 { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
              .re-grid-4 { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); }
              @media (max-width: 1024px) { .re-grid-2, .re-grid-3, .re-grid-4 { grid-template-columns: 1fr; } }
            `}</style>

            <div style={{ display: "grid", gap: tokens.gap }}>
                <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
                    <div style={{ padding: 24 }}>
                        <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Configuración del reporte</h2>
                    </div>
                    <div style={{ height: 1, background: "#e5e7eb" }} />
                    <div style={{ padding: 24, display: "grid", gap: 12 }}>
                        <div className="re-grid-3">
                            <Form.Item label="Sucursal">
                                <SelectField
                                    value={selectedBranchId || undefined}
                                    onChange={(v) => setSelectedBranchId(v || "")}
                                    options={branches.map((b) => ({ value: b.id, label: `${b.code ?? ""} ${b.name ?? ""}`.trim() }))}
                                    placeholder="Seleccione la sucursal"
                                    showSearch
                                />
                            </Form.Item>
                            <Form.Item label="Orden">
                                <SelectField
                                    value={selectedOrderId || undefined}
                                    onChange={(v) => setSelectedOrderId(v || "")}
                                    options={orders.map((o) => ({ value: o.id, label: o.label }))}
                                    placeholder="Seleccione una orden"
                                    showSearch
                                />
                            </Form.Item>
                            <Form.Item label="Muestra">
                                <SelectField
                                    value={selectedSampleId || undefined}
                                    onChange={(v) => setSelectedSampleId(v || "")}
                                    options={(orderFull?.samples || []).map((s) => ({ value: s.id, label: `${s.sample_code} · ${s.type}` }))}
                                    placeholder={selectedOrderId ? "Seleccione una muestra" : "Seleccione una orden primero"}
                                    disabled={!selectedOrderId}
                                    showSearch
                                />
                            </Form.Item>
                        </div>
                        <div className="re-grid-3">
                            <Form.Item label="Tipo de reporte">
                                <SelectField
                                    value={tipo}
                                    onChange={(v) => setTipo((v as ReportType) || "Histopatologia")}
                                    options={[
                                        { value: "Histopatologia", label: "Histopatología / Biopsia" },
                                        { value: "Histoquimica", label: "Histoquímica" },
                                        { value: "Citologia_mamaria", label: "Citología mamaria" },
                                        { value: "Citologia_urinaria", label: "Citología urinaria" },
                                        { value: "Quirurgico", label: "Quirúrgico" },
                                        { value: "Revision_laminillas", label: "Revisión de laminillas/bloques" },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item label="Paciente">
                                <TextField value={paciente} onChange={(e) => setPaciente(e.target.value)} placeholder="Nombre del paciente" />
                            </Form.Item>
                            <Form.Item label="Folio">
                                <TextField value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Folio / código" />
                            </Form.Item>
                        </div>
                        <div className="re-grid-3">
                            <Form.Item label="Examen">
                                <TextField value={examen} onChange={(e) => setExamen(e.target.value)} placeholder="Nombre del examen" />
                            </Form.Item>
                            <Form.Item label="Fecha de recepción">
                                <DateField
                                    value={fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : ""}
                                    onChange={(v) => setFechaRecepcion(v ? dayjs(v) : null)}
                                    placeholder="Fecha (AAAA-MM-DD)"
                                />
                            </Form.Item>
                            {FLAGS_BY_TYPE[tipo]?.incluirEdad && (
                                <Form.Item label="Edad">
                                    <TextField value={edad} onChange={(e) => setEdad(e.target.value)} placeholder="Edad" />
                                </Form.Item>
                            )}
                        </div>
                        <div className="re-grid-2">
                            <Form.Item label="Espécimen recibido">
                                <TextField value={especimen} onChange={(e) => setEspecimen(e.target.value)} placeholder="Descripción del espécimen" />
                            </Form.Item>
                            <Form.Item label="Diagnóstico de envío">
                                <TextField value={diagnosticoEnvio} onChange={(e) => setDiagnosticoEnvio(e.target.value)} placeholder="Diagnóstico de envío" />
                            </Form.Item>
                        </div>
                        <Form.Item label="Imágenes del reporte">
                            <ReportImages sampleId={selectedSampleId} value={reportImages} onChange={setReportImages} disabled={!selectedSampleId} />
                        </Form.Item>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: tokens.gap }}>
                    <div style={{ background: tokens.cardBg, borderRadius: tokens.radius, boxShadow: tokens.shadow, padding: 0 }}>
                        <div style={{ padding: 24 }}>
                            <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Contenido del reporte</h2>
                        </div>
                        <div style={{ height: 1, background: "#e5e7eb" }} />
                        <div style={{ padding: 24 }}>
                            <Form layout="vertical">
                                {FLAGS_BY_TYPE[tipo]?.incluirMacroscopia && (
                                    <Form.Item label="Descripción macroscópica">
                                        <ReactQuill ref={quillRef} theme="snow" value={descripcionMacroscopia || ""} onChange={(html) => setDescMacro(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirMicroscopia && (
                                    <Form.Item label="Descripción microscópica">
                                        <ReactQuill theme="snow" value={descripcionMicroscopia || ""} onChange={(html) => setDescMicro(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirCitomorfologia && (
                                    <Form.Item label="Descripción citomorfológica">
                                        <ReactQuill theme="snow" value={descripcionCitomorfologica || ""} onChange={(html) => setDescCito(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirInterpretacion && (
                                    <Form.Item label="Interpretación / Conclusiones">
                                        <ReactQuill theme="snow" value={interpretacion || ""} onChange={(html) => setInterpretacion(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirDiagnostico && (
                                    <Form.Item label="Diagnóstico">
                                        <ReactQuill theme="snow" value={diagnostico || ""} onChange={(html) => setDiagnostico(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirComentario && (
                                    <Form.Item label="Comentario / Notas">
                                        <ReactQuill theme="snow" value={comentario || ""} onChange={(html) => setComentario(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirCU && (
                                    <Form.Item label="Citología urinaria">
                                        <ReactQuill theme="snow" value={citologiaUrinariaHTML || ""} onChange={(html) => setCU(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirIF && (
                                    <Form.Item label="Inmunofluorescencia (panel)">
                                        <ReactQuill theme="snow" value={inmunofluorescenciaHTML || ""} onChange={(html) => setIF(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirInmunotinciones && (
                                    <Form.Item label="Inmunotinciones">
                                        <ReactQuill theme="snow" value={inmunotincionesHTML || ""} onChange={(html) => setInmunotinciones(html)} modules={quillModules} />
                                    </Form.Item>
                                )}
                                {FLAGS_BY_TYPE[tipo]?.incluirME && (
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

                    {FLAGS_BY_TYPE[tipo]?.incluirEdad && (
                        <p><b>Edad:</b> {edad || <em>(Sin especificar)</em>}</p>
                    )}

                    <p><b>Espécimen recibido:</b> {especimen || <em>(Sin especificar)</em>}</p>
                    {diagnosticoEnvio && <p><b>Diagnóstico de envío:</b> {diagnosticoEnvio}</p>}

                    <hr className="report-hr" />

                    {FLAGS_BY_TYPE[tipo]?.incluirMacroscopia && (
                        <>
                            <h3>Descripción macroscópica</h3>
                            <div dangerouslySetInnerHTML={{ __html: descripcionMacroscopia || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirMicroscopia && (
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

                    {FLAGS_BY_TYPE[tipo]?.incluirCitomorfologia && (
                        <>
                            <h3>Descripción citomorfológica</h3>
                            <div dangerouslySetInnerHTML={{ __html: descripcionCitomorfologica || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirInterpretacion && (
                        <>
                            <h3>Interpretación</h3>
                            <div dangerouslySetInnerHTML={{ __html: interpretacion || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirDiagnostico && (
                        <>
                            <h3>Diagnóstico</h3>
                            <div dangerouslySetInnerHTML={{ __html: diagnostico || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirComentario && (
                        <>
                            <h3>Comentario</h3>
                            <div dangerouslySetInnerHTML={{ __html: comentario || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirCU && (
                        <>
                            <h3>Citología urinaria</h3>
                            <div dangerouslySetInnerHTML={{ __html: citologiaUrinariaHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirIF && (
                        <>
                            <h3>Inmunofluorescencia</h3>
                            <div dangerouslySetInnerHTML={{ __html: inmunofluorescenciaHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirInmunotinciones && (
                        <>
                            <h3>Inmunotinciones</h3>
                            <div dangerouslySetInnerHTML={{ __html: inmunotincionesHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipo]?.incluirME && (
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
