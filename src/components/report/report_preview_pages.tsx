import { useEffect, useRef, forwardRef, useImperativeHandle, type CSSProperties } from "react";
import type { ReportEnvelope, ReportType, ReportFlags } from "../../models/report";
import logo from "../../images/report_logo.png";

// Constants for page layout (same as in report_editor.tsx)
const PX_TO_MM = 0.264583;
const PAGE_W_MM = 215.9;
const PAGE_H_MM = 279.4;
const MARGIN_L_MM = 18;
const MARGIN_R_MM = 18;
const HEADER_H_MM = 28;
const FOOTER_H_MM = 20;

/* Flags by report type */
const FLAGS_BY_TYPE: Record<ReportType, ReportFlags> = {
    Histopatologia: { incluirMacroscopia: true, incluirMicroscopia: true, incluirCitomorfologia: true, incluirInterpretacion: true, incluirDiagnostico: true, incluirComentario: true, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: false, incluirInmunotinciones: false },
    Histoquimica: { incluirMacroscopia: true, incluirMicroscopia: true, incluirCitomorfologia: false, incluirInterpretacion: false, incluirDiagnostico: true, incluirComentario: true, incluirIF: true, incluirME: true, incluirEdad: false, incluirCU: false, incluirInmunotinciones: false },
    Citologia_mamaria: { incluirMacroscopia: false, incluirMicroscopia: false, incluirCitomorfologia: true, incluirInterpretacion: true, incluirDiagnostico: false, incluirComentario: false, incluirIF: false, incluirME: false, incluirEdad: true, incluirCU: false, incluirInmunotinciones: false },
    Citologia_urinaria: { incluirMacroscopia: true, incluirMicroscopia: false, incluirCitomorfologia: true, incluirInterpretacion: false, incluirDiagnostico: false, incluirComentario: true, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: true, incluirInmunotinciones: false },
    Quirurgico: { incluirMacroscopia: true, incluirMicroscopia: true, incluirCitomorfologia: false, incluirInterpretacion: false, incluirDiagnostico: true, incluirComentario: false, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: false, incluirInmunotinciones: false },
    Revision_laminillas: { incluirMacroscopia: true, incluirMicroscopia: false, incluirCitomorfologia: false, incluirInterpretacion: false, incluirDiagnostico: false, incluirComentario: true, incluirIF: false, incluirME: false, incluirEdad: false, incluirCU: false, incluirInmunotinciones: true },
};

interface ReportPreviewPagesProps {
    report: ReportEnvelope;
    style?: CSSProperties;
}

export interface ReportPreviewPagesRef {
    getPages: () => HTMLElement[];
}

const ReportPreviewPages = forwardRef<ReportPreviewPagesRef, ReportPreviewPagesProps>(({ report, style }, ref) => {
    const previewHostRef = useRef<HTMLDivElement>(null);
    const hiddenSourceRef = useRef<HTMLDivElement>(null);

    // Expose pages for PDF export
    useImperativeHandle(ref, () => ({
        getPages: () => {
            if (!previewHostRef.current) return [];
            return Array.from(previewHostRef.current.children).filter(
                (el) => el instanceof HTMLElement
            ) as HTMLElement[];
        }
    }), []);

    // Generate preview pages
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
            page.style.background = "#ffffff";
            page.style.backgroundColor = "#ffffff";
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
            body.style.background = "#ffffff";
            body.style.backgroundColor = "#ffffff";

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
    }, [report]);

    // Extract report data
    const reportData = report.report;
    const baseData = reportData.base;
    const secciones = reportData.secciones;
    const flags = reportData.flags;
    const tipoActivo = reportData.tipo;

    return (
        <div style={style}>
            {/* Hidden source content: used to paginate */}
            <div
                ref={hiddenSourceRef}
                style={{ position: "fixed", left: "-10000px", top: 0, width: 0, height: 0, overflow: "hidden" }}
                aria-hidden
            >
                <div id="reporte-content">
                    <p><b>Dr(a).</b> Presente.</p>
                    <p><b>Paciente:</b> {baseData.paciente || <em>(Sin especificar)</em>}</p>
                    <p><b>Examen:</b> {baseData.examen || <em>(Sin especificar)</em>}</p>
                    <p><b>No.:</b> {baseData.folio || <em>(Sin especificar)</em>}</p>

                    <p>
                        <b>Fecha de recepción de muestra:</b>{" "}
                        {baseData.fechaRecepcion ? baseData.fechaRecepcion : <em>(Sin especificar)</em>}
                    </p>

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirEdad && (
                        <p><b>Edad:</b> {secciones.edad || <em>(Sin especificar)</em>}</p>
                    )}

                    <p><b>Espécimen recibido:</b> {baseData.especimen || <em>(Sin especificar)</em>}</p>
                    {baseData.diagnosticoEnvio && <p><b>Diagnóstico de envío:</b> {baseData.diagnosticoEnvio}</p>}

                    <hr className="report-hr" />

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirMacroscopia && (
                        <>
                            <h3>Descripción macroscópica</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.descripcionMacroscopia || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirMicroscopia && (
                        <>
                            <h3>Descripción microscópica</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.descripcionMicroscopia || "" }} />
                        </>
                    )}

                    {reportData.images && reportData.images.length > 0 && (
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
                                {reportData.images.map((img, idx) => (
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
                            <div dangerouslySetInnerHTML={{ __html: secciones.descripcionCitomorfologica || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirInterpretacion && (
                        <>
                            <h3>Interpretación</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.interpretacion || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirDiagnostico && (
                        <>
                            <h3>Diagnóstico</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.diagnostico || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirComentario && (
                        <>
                            <h3>Comentario</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.comentario || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirCU && (
                        <>
                            <h3>Citología urinaria</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.citologiaUrinariaHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirIF && (
                        <>
                            <h3>Inmunofluorescencia</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.inmunofluorescenciaHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirInmunotinciones && (
                        <>
                            <h3>Inmunotinciones</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.inmunotincionesHTML || "" }} />
                        </>
                    )}

                    {FLAGS_BY_TYPE[tipoActivo]?.incluirME && (
                        <>
                            <h3>Microscopía electrónica</h3>
                            <div dangerouslySetInnerHTML={{ __html: secciones.microscopioElectronicoHTML || "" }} />
                        </>
                    )}
                </div>
            </div>

            {/* Visible preview pages */}
            <div ref={previewHostRef} />
        </div>
    );
});

ReportPreviewPages.displayName = 'ReportPreviewPages';

export default ReportPreviewPages;
