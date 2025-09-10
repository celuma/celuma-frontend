import React, { useState, useEffect, useRef } from "react";
import { Row, Col, Input, DatePicker, Button, Form, message } from "antd";
import ReactQuill from "react-quill-new";
import dayjs, { Dayjs } from "dayjs";
import "react-quill-new/dist/quill.snow.css";
import type{ Report } from "../../models/report";
import { useAutoSave, loadAutoSave } from "../../hooks/auto_save";
import { saveReport, uploadReportImage } from "../../services/report_service";

interface ReportDraft {
    paciente: string;
    folio: string;
    examen: string;
    fechaRecepcion: string;
    especimen: string;
    diagnosticoEnvio: string;
    descMacroscopia: string;
}

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
                const result = await uploadReportImage("123", file); // sampleId real aquí
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

    const handleSubmitReport = async () => {
        const payload: Report = {
            id: "",
            tipo: "histopatologico",
            base: {
                paciente,
                folio,
                examen,
                fechaRecepcion: fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : "",
                especimen,
                diagnosticoEnvio: diagnosticoEnvio || "",
            },
            secciones: {
                descripcionMacroscopia: descMacroscopia,
                descripcionMicroscopia: "",
                descripcionCitomorfologica: null,
                interpretacion: null,
                diagnostico: "",
                comentario: "",
                inmunofluorescenciaHTML: null,
                inmunohistoquimicaHTML: null,
                microscopioElectronicoHTML: null,
            },
            flags: {
                incluirIF: false,
                incluirIHQ: false,
                incluirME: false,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            await saveReport(payload);
            message.success("Reporte guardado exitosamente");
        } catch {
            message.error("Error al guardar el reporte");
        }
    };

    return (
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
                    <Form.Item>
                        <Button type="primary" onClick={handleSubmitReport}>
                            Guardar Reporte
                        </Button>
                    </Form.Item>
                </Form>
            </Col>

            <Col span={12}>
                <h2>Vista Previa del Reporte</h2>
                <div style={{ padding: 16, border: "1px solid #f0f0f0", minHeight: 400 }}>
                    <p><b>Paciente:</b> {paciente || <em>(Sin especificar)</em>}</p>
                    <p><b>Folio:</b> {folio || <em>(Sin especificar)</em>}</p>
                    <p><b>Examen:</b> {examen || <em>(Sin especificar)</em>}</p>
                    <p><b>Fecha:</b> {fechaRecepcion ? fechaRecepcion.format("YYYY-MM-DD") : <em>(Sin especificar)</em>}</p>
                    <p><b>Especimen:</b> {especimen || <em>(Sin especificar)</em>}</p>
                    <p><b>Diagnóstico de Envío:</b> {diagnosticoEnvio || <em>(Sin especificar)</em>}</p>
                    <hr />
                    <h3>Descripción Macroscópica</h3>
                    <div dangerouslySetInnerHTML={{ __html: descMacroscopia }} />
                </div>
            </Col>
        </Row>
    );
};

export default ReportEditor;
