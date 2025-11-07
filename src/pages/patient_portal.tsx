import { useState } from "react";
import { Card, Form, Input, Button, message, Typography, Descriptions, Tag } from "antd";
import { SearchOutlined, DownloadOutlined } from "@ant-design/icons";

const { Title, Paragraph } = Typography;

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

interface ReportInfo {
    report_id: string;
    order_code: string;
    patient_name: string;
    status: string;
    title?: string;
    published_at?: string;
    pdf_url: string;
}

function PatientPortal() {
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<ReportInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (values: { code: string }) => {
        setLoading(true);
        setError(null);
        setReport(null);

        try {
            const res = await fetch(`${getApiBase()}/v1/portal/patient/report?code=${values.code}`, {
                method: "GET",
                headers: { accept: "application/json" },
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "No se encontró el reporte");
            }

            const data = await res.json();
            setReport(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error al buscar reporte");
            message.error("No se encontró el reporte con ese código");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (report?.pdf_url) {
            window.open(report.pdf_url, "_blank");
        }
    };

    return (
        <div style={{ 
            minHeight: "100vh", 
            background: "linear-gradient(135deg, #49b6ad 0%, #0f8b8d 100%)",
            padding: 24,
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
        }}>
            <div style={{ maxWidth: 600, width: "100%" }}>
                <Card style={{ borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                    <Title level={2} style={{ textAlign: "center", marginBottom: 8 }}>
                        Portal del Paciente
                    </Title>
                    <Paragraph style={{ textAlign: "center", color: "#666", marginBottom: 24 }}>
                        Ingresa el código de tu reporte para acceder a tus resultados
                    </Paragraph>

                    <Form layout="vertical" onFinish={handleSearch}>
                        <Form.Item
                            name="code"
                            label="Código de Acceso"
                            rules={[{ required: true, message: "Requerido" }]}
                        >
                            <Input 
                                placeholder="Ingresa tu código"
                                size="large"
                                maxLength={16}
                            />
                        </Form.Item>

                        <Form.Item>
                            <Button 
                                type="primary" 
                                htmlType="submit" 
                                loading={loading}
                                icon={<SearchOutlined />}
                                block
                                size="large"
                            >
                                Buscar Reporte
                            </Button>
                        </Form.Item>
                    </Form>

                    {error && (
                        <div style={{ 
                            padding: 12, 
                            background: "#fff2f0", 
                            border: "1px solid #ffccc7", 
                            borderRadius: 4,
                            color: "#cf1322",
                            textAlign: "center"
                        }}>
                            {error}
                        </div>
                    )}

                    {report && (
                        <div style={{ marginTop: 24 }}>
                            <Title level={4}>Reporte Encontrado</Title>
                            <Descriptions bordered column={1} size="small">
                                <Descriptions.Item label="Paciente">{report.patient_name}</Descriptions.Item>
                                <Descriptions.Item label="Folio">{report.order_code}</Descriptions.Item>
                                <Descriptions.Item label="Título">{report.title || "—"}</Descriptions.Item>
                                <Descriptions.Item label="Estado">
                                    <Tag color="green">Disponible</Tag>
                                </Descriptions.Item>
                                {report.published_at && (
                                    <Descriptions.Item label="Fecha de Publicación">
                                        {new Date(report.published_at).toLocaleDateString('es-MX')}
                                    </Descriptions.Item>
                                )}
                            </Descriptions>

                            <Button
                                type="primary"
                                icon={<DownloadOutlined />}
                                onClick={handleDownload}
                                block
                                size="large"
                                style={{ marginTop: 16 }}
                            >
                                Descargar Reporte PDF
                            </Button>
                        </div>
                    )}
                </Card>

                <Paragraph style={{ textAlign: "center", color: "white", marginTop: 16 }}>
                    Para obtener tu código de acceso, contacta con tu laboratorio
                </Paragraph>
            </div>
        </div>
    );
}

export default PatientPortal;

