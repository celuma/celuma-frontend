import { useState } from "react";
import { Card, Form, Input, Button, message, Typography } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Title, Paragraph } = Typography;

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function PasswordResetRequest() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (values: { email: string }) => {
        setLoading(true);
        try {
            const res = await fetch(`${getApiBase()}/v1/auth/password-reset/request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            if (!res.ok) {
                throw new Error("Error al solicitar recuperación");
            }

            setSubmitted(true);
            message.success("Si existe una cuenta con ese email, recibirás un enlace de recuperación");
        } catch (error) {
            message.error("Error al procesar la solicitud");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ 
            minHeight: "100vh", 
            display: "flex", 
            justifyContent: "center", 
            alignItems: "center",
            background: "linear-gradient(135deg, #49b6ad 0%, #0f8b8d 100%)"
        }}>
            <Card style={{ width: 400, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
                {!submitted ? (
                    <>
                        <Title level={2} style={{ textAlign: "center", marginBottom: 8 }}>
                            Recuperar Contraseña
                        </Title>
                        <Paragraph style={{ textAlign: "center", color: "#666", marginBottom: 24 }}>
                            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña
                        </Paragraph>

                        <Form layout="vertical" onFinish={handleSubmit}>
                            <Form.Item
                                name="email"
                                label="Email"
                                rules={[
                                    { required: true, message: "Por favor ingresa tu email" },
                                    { type: "email", message: "Email inválido" }
                                ]}
                            >
                                <Input 
                                    prefix={<MailOutlined />}
                                    placeholder="tu@email.com"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item>
                                <Button 
                                    type="primary" 
                                    htmlType="submit" 
                                    loading={loading}
                                    block
                                    size="large"
                                >
                                    Enviar Enlace de Recuperación
                                </Button>
                            </Form.Item>

                            <Button 
                                type="link" 
                                onClick={() => navigate("/login")}
                                block
                            >
                                Volver al inicio de sesión
                            </Button>
                        </Form>
                    </>
                ) : (
                    <>
                        <Title level={3} style={{ textAlign: "center", color: "#52c41a" }}>
                            ✓ Solicitud Enviada
                        </Title>
                        <Paragraph style={{ textAlign: "center", marginBottom: 24 }}>
                            Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
                            Revisa tu bandeja de entrada y spam.
                        </Paragraph>
                        <Button 
                            type="primary"
                            onClick={() => navigate("/login")}
                            block
                            size="large"
                        >
                            Ir al Inicio de Sesión
                        </Button>
                    </>
                )}
            </Card>
        </div>
    );
}

export default PasswordResetRequest;

