import React, { useEffect, useMemo, useRef, useState } from "react";
import { Row, Col, Input, DatePicker, Form, message, Select, Divider, Button } from "antd";
import dayjs, { Dayjs } from "dayjs";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { useAutoSave, loadAutoSave } from "../../hooks/auto_save";
import { saveReport, saveReportVersion } from "../../services/report_service";
import ReportImages, { type ReportImage } from "./report_images";
import logo from "../../images/report_logo.png";
// Types of the models
import type { ReportType, ReportEnvelope, ReportFlags } from "../../models/report";

// Map of flags by report type
const FLAGS_BY_TYPE: Record<ReportType, ReportFlags> = {
    Histopatologia: {
        incluirMacroscopia: true,
        incluirMicroscopia: true,
        incluirCitomorfologia: true,
        incluirInterpretacion: true,
        incluirDiagnostico: true,
        incluirComentario: true,
        incluirIF: false,
        incluirME: false,
        incluirEdad: false,
        incluirCU: false,
        incluirInmunotinciones: false,
    },
    Histoquimica: {
        incluirMacroscopia: true,
        incluirMicroscopia: true,
        incluirCitomorfologia: false,
        incluirInterpretacion: false,
        incluirDiagnostico: true,
        incluirComentario: true,
        incluirIF: true,
        incluirME: true,
        incluirEdad: false,
        incluirCU: false,
        incluirInmunotinciones: false,
    },
    Citologia_mamaria: {
        incluirMacroscopia: false,
        incluirMicroscopia: false,
        incluirCitomorfologia: true,
        incluirInterpretacion: true,
        incluirDiagnostico: false,
        incluirComentario: false,
        incluirIF: false,
        incluirME: false,
        incluirEdad: true,
        incluirCU: false,
        incluirInmunotinciones: false,
    },
    Citologia_urinaria: {
        incluirMacroscopia: true,
        incluirMicroscopia: false,
        incluirCitomorfologia: true,
        incluirInterpretacion: false,
        incluirDiagnostico: false,
        incluirComentario: true,
        incluirIF: false,
        incluirME: false,
        incluirEdad: false,
        incluirCU: true,
        incluirInmunotinciones: false,
    },
    Quirurgico: {
        incluirMacroscopia: true,
        incluirMicroscopia: true,
        incluirCitomorfologia: false,
        incluirInterpretacion: false,
        incluirDiagnostico: true,
        incluirComentario: false,
        incluirIF: false,
        incluirME: false,
        incluirEdad: false,
        incluirCU: false,
        incluirInmunotinciones: false,
    },
    Revision_laminillas: {
        incluirMacroscopia: true,
        incluirMicroscopia: false,
        incluirCitomorfologia: false,
        incluirInterpretacion: false,
        incluirDiagnostico: false,
        incluirComentario: true,
        incluirIF: false,
        incluirME: false,
        incluirEdad: false,
        incluirCU: false,
        incluirInmunotinciones: true,
    },
};

// Styles for the report, mimicking a letter-sized paper
const letterStyles = `
.report-page {
  width: 8.5in;
  min-height: 11in;
  margin: 16px auto;
  background: #ffffff;
  color: #000;
  box-shadow: 0 0 8px rgba(0,0,0,.15);
  position: relative;
  padding-top: 110pt;        
  padding-bottom: 90pt;    
  padding-left: 48pt;
  padding-right: 48pt;
  box-sizing: border-box;
  overflow: hidden;
  font-family: "Arial", sans-serif;
}
.report-header {
  position: absolute;
  top: 24pt;
  left: 24pt;
  right: 48pt;
  text-align: left;
  font-size: 8pt;
  font-weight: 700;
  color: #002060;
}
.report-header__title { font-size: 8pt; }
.report-header__subtitle { font-size: 8pt; }

.report-footer {
  position: absolute;
  bottom: 0pt;
  left: 24pt;
  right: 24pt;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  text-align: right;
  font-size: 7pt;
  font-weight: 700;
  color: #002060;
}
.report-footer__logo {
  width: 200pt;
  height: 100pt;
  object-fit: contain;
}
.report-footer__subtitle { font-size: 7.5pt; }

@media print {
  @page { size: Letter; margin: 0; }
  body { background: #fff; }
  .report-page { box-shadow: none; margin: 0; }
}
`;

const SAMPLE_ID = "dc225711-480a-4bd7-9531-c566d2a6f197";

const ReportEditor: React.FC = () => {
    // Selected type of report
    const [tipo, setTipo] = useState<ReportType>("Histopatologia");
    // Base
    const [paciente, setPaciente] = useState("");
    const [examen, setExamen] = useState("");
    const [folio, setFolio] = useState("");
    const [fechaRecepcion, setFechaRecepcion] = useState<Dayjs | null>(null);
    const [especimen, setEspecimen] = useState("");
    const [diagnosticoEnvio, setDiagnosticoEnvio] = useState("");
    // Sections
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
    // Existing envelope (for editing existing reports)
    const [envelopeExistente, setEnvelopeExistente ] = useState<Partial<ReportEnvelope> | undefined>(undefined);
    // Loading state for auto-save
    const [isLoaded, setIsLoaded] = useState(false);
    // Insert image in Quill when using the toolbar button
    const quillRef = useRef<ReactQuill>(null);

    // Upload draft on mount
    useEffect(() => {
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
        }
        setIsLoaded(true);
    }, []);

    // Quill modules (toolbar configuration)
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

    // Build the report envelope from the current state
    const buildEnvelope = (existing?: Partial<ReportEnvelope>): ReportEnvelope => {
        return {
            id: existing?.id ?? "",
            tenant_id: "2de8ffdf-025f-4f2a-839d-eac3473cfaa6",
            branch_id: "8cd740ad-1be3-4dd0-bcea-93d5e84786d4",
            order_id: "f4dca87f-ca63-4bb2-8f79-77f7f1d8def6",
            version_no: existing?.version_no ?? 1,
            status: existing?.status ?? "DRAFT",
            title: `Reporte ${tipo} - ${paciente || "Sin paciente"}`,
            diagnosis_text: (diagnosticoEnvio || "").replace(/<[^>]+>/g, "").slice(0, 1000),
            created_by: "b388feca-84b5-48c6-a6da-963ba95352ee",
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

    // Auto-save draft on change
    useAutoSave("reportEnvelopeDraft", isLoaded ? buildEnvelope(envelopeExistente) : undefined);

    // Save the report (new or new version)
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

    return (
        <>
            <style>{letterStyles}</style>

            <Row gutter={24} style={{ padding: 16 }}>
                {/* Columna izquierda: edición */}
                <Col span={12}>
                    <h2>Llenado de Reporte</h2>

                    <Form.Item label="Tipo de reporte">
                        <Select<ReportType>
                            value={tipo}
                            onChange={setTipo}
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

                    <Divider />

                    <Form layout="vertical">
                        <Form.Item label="Paciente">
                            <Input value={paciente} onChange={(e) => setPaciente(e.target.value)} />
                        </Form.Item>

                        <Form.Item label="Folio">
                            <Input value={folio} onChange={(e) => setFolio(e.target.value)} />
                        </Form.Item>

                        <Form.Item label="Examen">
                            <Input value={examen} onChange={(e) => setExamen(e.target.value)} />
                        </Form.Item>

                        <Form.Item label="Fecha de recepción">
                            <DatePicker
                                value={fechaRecepcion}
                                onChange={setFechaRecepcion}
                                format="YYYY-MM-DD"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>

                        {FLAGS_BY_TYPE[tipo]?.incluirEdad && (
                            <Form.Item label="Edad">
                                <Input value={edad} onChange={(e) => setEdad(e.target.value)} />
                            </Form.Item>
                        )}

                        <Form.Item label="Espécimen recibido">
                            <Input value={especimen} onChange={(e) => setEspecimen(e.target.value)} />
                        </Form.Item>

                        <Form.Item label="Diagnóstico de envío">
                            <Input value={diagnosticoEnvio} onChange={(e) => setDiagnosticoEnvio(e.target.value)} />
                        </Form.Item>

                        <Form.Item label="Imágenes del reporte">
                            {/* Aquí se dispara la carga al endpoint apenas se elige el archivo */}
                            <ReportImages
                                sampleId={SAMPLE_ID}
                                value={reportImages}
                                onChange={setReportImages}
                            />
                        </Form.Item>

                        {FLAGS_BY_TYPE[tipo]?.incluirMacroscopia && (
                            <Form.Item label="Descripción macroscópica">
                                <ReactQuill
                                    ref={quillRef}
                                    theme="snow"
                                    value={descripcionMacroscopia || ""}
                                    onChange={(html) => setDescMacro(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirMicroscopia && (
                            <Form.Item label="Descripción microscópica">
                                <ReactQuill
                                    theme="snow"
                                    value={descripcionMicroscopia || ""}
                                    onChange={(html) => setDescMicro(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirCitomorfologia && (
                            <Form.Item label="Descripción citomorfológica">
                                <ReactQuill
                                    theme="snow"
                                    value={descripcionCitomorfologica || ""}
                                    onChange={(html) => setDescCito(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirInterpretacion && (
                            <Form.Item label="Interpretación / Conclusiones">
                                <ReactQuill
                                    theme="snow"
                                    value={interpretacion || ""}
                                    onChange={(html) => setInterpretacion(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirDiagnostico && (
                            <Form.Item label="Diagnóstico">
                                <ReactQuill
                                    theme="snow"
                                    value={diagnostico || ""}
                                    onChange={(html) => setDiagnostico(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirComentario && (
                            <Form.Item label="Comentario / Notas">
                                <ReactQuill
                                    theme="snow"
                                    value={comentario || ""}
                                    onChange={(html) => setComentario(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirCU && (
                            <Form.Item label="Citología urinaria">
                                <ReactQuill
                                    theme="snow"
                                    value={citologiaUrinariaHTML || ""}
                                    onChange={(html) => setCU(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirIF && (
                            <Form.Item label="Inmunofluorescencia (panel)">
                                <ReactQuill
                                    theme="snow"
                                    value={inmunofluorescenciaHTML || ""}
                                    onChange={(html) => setIF(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirInmunotinciones && (
                            <Form.Item label="Inmunotinciones">
                                <ReactQuill
                                    theme="snow"
                                    value={inmunotincionesHTML || ""}
                                    onChange={(html) => setInmunotinciones(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo]?.incluirME && (
                            <Form.Item label="Microscopía electrónica (descripción)">
                                <ReactQuill
                                    theme="snow"
                                    value={microscopioElectronicoHTML || ""}
                                    onChange={(html) => setME(html)}
                                    modules={quillModules}
                                />
                            </Form.Item>
                        )}

                        <Divider />
                        <Button type="primary" onClick={handleSave}>
                            Guardar reporte
                        </Button>
                    </Form>
                </Col>

                {/* Columna derecha: vista previa */}
                <Col span={12}>
                    <h2>Vista Previa del Reporte</h2>
                    <div className="report-page">
                        <div className="report-header">
                            <div className="report-header__title">Dra. Arisbeth Villanueva Pérez.</div>
                            <div className="report-header__subtitle">Anatomía Patológica, Nefropatología y Citología Exfoliativa</div>
                            <div className="report-header__subtitle">Centro Médico Nacional de Occidente IMSS. INCMNSZ</div>
                            <div className="report-header__subtitle">DGP3833349 | DGP. ESP 6133871</div>
                        </div>

                        <div id="reporte-content">
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

                            {/* Bloque de imágenes */}
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

                        <div className="report-footer">
                            <img className="report-footer__logo" src={logo} alt="Logo" />
                            <div className="report-footer__subtitle">
                                Francisco Rojas González No. 654 Col. Ladrón de Guevara, Guadalajara, Jalisco, México C.P. 44600
                                Tel. 33 2015 0100, 33 2015 0101. Cel. 33 2823-1959  patologiaynefropatologia@gmail.com
                            </div>
                        </div>
                    </div>
                </Col>
            </Row>
        </>
    );
};

export default ReportEditor;