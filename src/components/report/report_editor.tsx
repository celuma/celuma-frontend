import React, { useState, useEffect, useRef } from "react";
import { Row, Col, Input, DatePicker, Form, message, Select, Divider } from "antd";
import ReactQuill from "react-quill-new";
import dayjs, { Dayjs } from "dayjs";
import "react-quill-new/dist/quill.snow.css";
import { useAutoSave, loadAutoSave } from "../../hooks/auto_save";
import { uploadReportImage } from "../../services/report_service";
import logo from "../../images/report_logo.png";

interface ReportDraft {
    paciente: string;
    folio: string;
    examen: string;
    fechaRecepcion: string | null;
    especimen: string;
    diagnosticoEnvio: string;

    tipo: ReportType;

    edad: string;
    descMacroscopia: string;
    descMicroscopia: string;
    descCitomorfologica: string;
    interpretacion: string;
    diagnostico: string;
    comentario: string;
    inmunofluorescenciaHTML: string;
    inmunotincionesHTML: string;
    microscopioElectronicoHTML: string;
    citologiaUrinariaHTML: string;
}

type ReportType =
    | "histopatologia"
    | "histoquimica"
    | "citologia_mamaria"
    | "citologia_urinaria"
    | "quirurgico"
    | "revision_laminillas";

const FLAGS_BY_TYPE: Record<ReportType, import("../../models/report").ReportFlags> = {
    histopatologia: {
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
    histoquimica: {
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
    citologia_mamaria: {
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
    citologia_urinaria: {
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
    quirurgico: {
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
    revision_laminillas: {
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
.report-header__title {
  font-size: 8pt;
}
.report-header__subtitle {
  font-size: 8pt;
}

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

.report-footer__subtitle {
  font-size: 7.5pt;
}

@media print {
  @page { size: Letter; margin: 0; }
  body { background: #fff; }
  .report-page { box-shadow: none; margin: 0; }
}
`;

const ReportEditor: React.FC = () => {// Tipo seleccionado (default histopatología)
    const [tipo, setTipo] = useState<ReportType>("histopatologia");

    const [descMacroscopia, setDescMacroscopia] = useState("<p><br/></p>");
    const [descMicroscopia, setDescMicroscopia] = useState("<p><br/></p>");
    const [descCitomorfologica, setDescCitomorfologica] = useState("<p><br/></p>");
    const [interpretacionHTML, setInterpretacionHTML] = useState("<p><br/></p>");
    const [diagnosticoHTML, setDiagnosticoHTML] = useState("<p><br/></p>");
    const [comentarioHTML, setComentarioHTML] = useState("<p><br/></p>");
    const [inmunofluorescenciaHTML, setIFHTML] = useState("<p><br/></p>");
    const [microscopioElectronicoHTML, setMEHTML] = useState("<p><br/></p>");
    const [edad, setEdad] = useState<string>("");
    const [citologiaUrinariaHTML, setCUHTML] = useState("<p><br/></p>");
    const [inmunotincionesHTML, setInmunotincionesHTML] = useState("<p><br/></p>");

    const [paciente, setPaciente] = useState("");
    const [folio, setFolio] = useState("");
    const [examen, setExamen] = useState("");
    const [fechaRecepcion, setFechaRecepcion] = useState<Dayjs | null>(null);
    const [especimen, setEspecimen] = useState("");
    const [diagnosticoEnvio, setDiagnosticoEnvio] = useState("");
    const quillRef = useRef<ReactQuill>(null);

    useEffect(() => {
        const draft = loadAutoSave<ReportDraft>("reportDraft");
        if (draft) {
            setPaciente(draft.paciente || "");
            setFolio(draft.folio || "");
            setExamen(draft.examen || "");
            setFechaRecepcion(draft.fechaRecepcion ? dayjs(draft.fechaRecepcion) : null);
            setEspecimen(draft.especimen || "");
            setDiagnosticoEnvio(draft.diagnosticoEnvio || "");

            setTipo(draft.tipo ?? "histopatologia");

            setDescMacroscopia(draft.descMacroscopia ?? "<p><br/></p>");
            setDescMicroscopia(draft.descMicroscopia ?? "<p><br/></p>");
            setDescCitomorfologica(draft.descCitomorfologica ?? "<p><br/></p>");
            setInterpretacionHTML(draft.interpretacion ?? "<p><br/></p>");
            setDiagnosticoHTML(draft.diagnostico ?? "<p><br/></p>");
            setComentarioHTML(draft.comentario ?? "<p><br/></p>");
            setIFHTML(draft.inmunofluorescenciaHTML ?? "<p><br/></p>");
            setInmunotincionesHTML(draft.inmunotincionesHTML ?? "<p><br/></p>");
            setMEHTML(draft.microscopioElectronicoHTML ?? "<p><br/></p>");
            setEdad(draft.edad ?? "");
            setCUHTML(draft.citologiaUrinariaHTML ?? "<p><br/></p>");
        }
    }, []);

    useAutoSave("reportDraft", {
        paciente,
        folio,
        examen,
        fechaRecepcion: fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : null,
        especimen,
        diagnosticoEnvio,
        tipo,
        descMicroscopia,
        descCitomorfologica,
        interpretacionHTML,
        diagnosticoHTML,
        comentarioHTML,
        inmunofluorescenciaHTML,
        inmunotincionesHTML,
        microscopioElectronicoHTML,
        edad,
        citologiaUrinariaHTML,
    });

    const handleImageUpload = async () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.click();
        input.onchange = async () => {
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];
            try {
                const result = await uploadReportImage("123", file);
                if (result.url) {
                    const editor = quillRef.current?.getEditor();
                    const range = editor?.getSelection(true);
                    if (editor && range) {
                        editor.insertEmbed(range.index, "image", result.url);
                    }
                }
            } catch {
                message.error("Error subiendo imagen");
            }
        };
    };

    return (
        <>
            <style>{letterStyles}</style>
            <Row gutter={24} style={{ padding: 16 }}>
                <Col span={12}>
                    <h2>Llenado de Reporte</h2>
                    <Form.Item label="Tipo de reporte">
                        <Select
                            value={tipo}
                            onChange={(v: ReportType) => setTipo(v)}
                            options={[
                                { value: "histopatologia", label: "Histopatologíco" },
                                { value: "histoquimica", label: "Histoquimico" },
                                { value: "citologia_mamaria", label: "Citología mamaria" },
                                { value: "citologia_urinaria", label: "Citología urinaria" },
                                { value: "quirurgico", label: "Quirúrgico" },
                                { value: "revision_laminillas", label: "Revisión de laminillas/bloques" },
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
                        <Form.Item label="Fecha de Recepción">
                            <DatePicker
                                value={fechaRecepcion}
                                onChange={(d) => setFechaRecepcion(d)}
                                format="YYYY-MM-DD"
                                style={{ width: "100%" }}
                            />
                        </Form.Item>
                        {FLAGS_BY_TYPE[tipo].incluirEdad && (
                            <Form.Item label="Edad">
                                <Input value={edad} onChange={(e) => setEdad(e.target.value)} />
                            </Form.Item>
                        )}
                        <Form.Item label="Especimen">
                            <Input value={especimen} onChange={(e) => setEspecimen(e.target.value)} />
                        </Form.Item>
                        <Form.Item label="Diagnóstico de Envío">
                            <Input value={diagnosticoEnvio} onChange={(e) => setDiagnosticoEnvio(e.target.value)} />
                        </Form.Item>

                        {FLAGS_BY_TYPE[tipo].incluirMacroscopia && (
                            <Form.Item label="Descripción macroscópica">
                                <ReactQuill
                                    ref={quillRef}
                                    theme="snow"
                                    value={descMacroscopia}
                                    onChange={setDescMacroscopia}
                                    modules={{
                                        toolbar: {
                                            container: [
                                                [{ header: [1, 2, false] }],
                                                ["bold", "italic", "underline"],
                                                [{ list: "ordered" }, { list: "bullet" }],
                                                ["image", "link"],
                                                ["clean"],
                                            ],
                                            handlers: { image: handleImageUpload },
                                        },
                                    }}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirMicroscopia && (
                            <Form.Item label="Descripción microscópica">
                                <ReactQuill
                                    theme="snow"
                                    value={descMicroscopia}
                                    onChange={setDescMicroscopia}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirCitomorfologia && (
                            <Form.Item label="Descripción citomorfológica">
                                <ReactQuill
                                    theme="snow"
                                    value={descCitomorfologica}
                                    onChange={setDescCitomorfologica}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirInterpretacion && (
                            <Form.Item label="Interpretación / Conclusiones">
                                <ReactQuill
                                    theme="snow"
                                    value={interpretacionHTML}
                                    onChange={setInterpretacionHTML}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirDiagnostico && (
                            <Form.Item label="Diagnóstico">
                                <ReactQuill
                                    theme="snow"
                                    value={diagnosticoHTML}
                                    onChange={setDiagnosticoHTML}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirComentario && (
                            <Form.Item label="Comentario / Notas">
                                <ReactQuill
                                    theme="snow"
                                    value={comentarioHTML}
                                    onChange={setComentarioHTML}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirCU && (
                            <Form.Item label="Citología urinaria">
                                <ReactQuill
                                    theme="snow"
                                    value={citologiaUrinariaHTML}
                                    onChange={setCUHTML}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirIF && (
                            <Form.Item label="Inmunofluorescencia (panel)">
                                <ReactQuill
                                    theme="snow"
                                    value={inmunofluorescenciaHTML}
                                    onChange={setIFHTML}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirInmunotinciones && (
                            <Form.Item label="Inmunotinciones">
                                <ReactQuill
                                    theme="snow"
                                    value={inmunotincionesHTML}
                                    onChange={setInmunotincionesHTML}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}

                        {FLAGS_BY_TYPE[tipo].incluirME && (
                            <Form.Item label="Microscopía electrónica (descripción)">
                                <ReactQuill
                                    theme="snow"
                                    value={microscopioElectronicoHTML}
                                    onChange={setMEHTML}
                                    modules={{ toolbar: { container: [[{ header: [1, 2, false] }],["bold","italic","underline"],[{ list: "ordered" }, { list: "bullet" }],["image","link"],["clean"]], handlers: { image: handleImageUpload }}}}
                                />
                            </Form.Item>
                        )}
                    </Form>
                </Col>

                <Col span={12}>
                    <h2>Vista Previa del Reporte</h2>
                    <div className="report-page">
                        <div className="report-header">
                            <div className="report-header__title">
                                Dra. Arisbeth Villanueva Pérez.
                            </div>
                            <div className="report-header__subtitle">
                                Anatomía Patológica, Nefropatología y Citología Exfoliativa
                            </div>
                            <div className="report-header__subtitle">
                                Centro Médico Nacional de Occidente IMSS. INCMNSZ
                            </div>
                            <div className="report-header__subtitle">
                                DGP3833349 | DGP. ESP 6133871
                            </div>
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

                            {FLAGS_BY_TYPE[tipo].incluirEdad && (
                                <p><b>Edad:</b> {edad || <em>(Sin especificar)</em>}</p>
                            )}

                            <p><b>Espécimen recibido:</b> {especimen || <em>(Sin especificar)</em>}</p>
                            {diagnosticoEnvio ? (
                                <p><b>Diagnóstico de envío:</b> {diagnosticoEnvio}</p>
                            ) : null}

                            <hr className="report-hr" />

                            {FLAGS_BY_TYPE[tipo].incluirMacroscopia && (
                                <>
                                    <h3>Descripción macroscópica</h3>
                                    <div dangerouslySetInnerHTML={{ __html: descMacroscopia }} />
                                </>
                            )}


                            {FLAGS_BY_TYPE[tipo].incluirMicroscopia && (
                                <>
                                    <h3>Descripción microscópica</h3>
                                    <div dangerouslySetInnerHTML={{ __html: descMicroscopia }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirCitomorfologia && (
                                <>
                                    <h3>Descripción citomorfológica</h3>
                                    <div dangerouslySetInnerHTML={{ __html: descCitomorfologica }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirInterpretacion && (
                                <>
                                    <h3>Interpretación</h3>
                                    <div dangerouslySetInnerHTML={{ __html: interpretacionHTML }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirDiagnostico && (
                                <>
                                    <h3>Diagnóstico</h3>
                                    <div dangerouslySetInnerHTML={{ __html: diagnosticoHTML }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirComentario && (
                                <>
                                    <h3>Comentario</h3>
                                    <div dangerouslySetInnerHTML={{ __html: comentarioHTML }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirCU && (
                                <>
                                    <h3>Citología urinaria</h3>
                                    <div dangerouslySetInnerHTML={{ __html: citologiaUrinariaHTML }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirIF && (
                                <>
                                    <h3>Inmunofluorescencia</h3>
                                    <div dangerouslySetInnerHTML={{ __html: inmunofluorescenciaHTML }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirInmunotinciones && (
                                <>
                                    <h3>Inmunotinciones</h3>
                                    <div dangerouslySetInnerHTML={{ __html: inmunotincionesHTML }} />
                                </>
                            )}

                            {FLAGS_BY_TYPE[tipo].incluirME && (
                                <>
                                    <h3>Microscopía electrónica</h3>
                                    <div dangerouslySetInnerHTML={{ __html: microscopioElectronicoHTML }} />
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
