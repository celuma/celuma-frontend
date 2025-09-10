import React, { useState, useEffect, useRef } from "react";
import { Row, Col, Input, DatePicker, Form, message } from "antd";
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
    fechaRecepcion: string;
    especimen: string;
    diagnosticoEnvio: string;
    descMacroscopia: string;
}

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

const ReportEditor: React.FC = () => {
    const [paciente, setPaciente] = useState("");
    const [folio, setFolio] = useState("");
    const [examen, setExamen] = useState("");
    const [fechaRecepcion, setFechaRecepcion] = useState<Dayjs | null>(null);
    const [especimen, setEspecimen] = useState("");
    const [diagnosticoEnvio, setDiagnosticoEnvio] = useState("");
    const [descMacroscopia, setDescMacroscopia] = useState("<p><br/></p>");
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
            setDescMacroscopia(draft.descMacroscopia || "<p><br/></p>");
        }
    }, []);

    useAutoSave("reportDraft", {
        paciente,
        folio,
        examen,
        fechaRecepcion: fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : null,
        especimen,
        diagnosticoEnvio,
        descMacroscopia,
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
                        <Form.Item label="Especimen">
                            <Input value={especimen} onChange={(e) => setEspecimen(e.target.value)} />
                        </Form.Item>
                        <Form.Item label="Diagnóstico de Envío">
                            <Input value={diagnosticoEnvio} onChange={(e) => setDiagnosticoEnvio(e.target.value)} />
                        </Form.Item>
                        <Form.Item label="Descripción Macroscópica">
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
                            <p><b>Espécimen recibido:</b> {especimen || <em>(Sin especificar)</em>}</p>
                            {diagnosticoEnvio ? (
                                <p><b>Diagnóstico de envío:</b> {diagnosticoEnvio}</p>
                            ) : null}

                            <hr className="report-hr" />
                            <h3>Descripción macroscópica</h3>
                            <div dangerouslySetInnerHTML={{ __html: descMacroscopia }} />
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
