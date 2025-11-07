import { useState, useEffect } from "react";
import { Card, Form, Input, Button, message, Typography, Spin } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";

const { Title, Paragraph } = Typography;

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function PasswordResetConfirm() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            message.error("Token inválido");
            navigate("/login");
            return;
        }

        // Verify token
        (async () => {
            try {
                const res = await fetch(`${getApiBase()}/v1/auth/password-reset/verify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });

                if (res.ok) {
                    setTokenValid(true);
                } else {
                    message.error("El enlace ha expirado o es inválido");
                    setTimeout(() => navigate("/login"), 2000);
                }
            } catch (error) {
                message.error("Error al verificar el enlace");
                setTimeout(() => navigate("/login"), 2000);
            } finally {
                setVerifying(false);
            }
        })();
    }, [token, navigate]);

    const handleSubmit = async (values: { new_password: string; confirm_password: string }) => {
        if (values.new_password !== values.confirm_password) {
            message.error("Las contraseñas no coinciden");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${getApiBase()}/v1/auth/password-reset/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, new_password: values.new_password }),
            });

            if (!res.ok) {
                throw new Error("Error al restablecer contraseña");
            }

            setSuccess(true);
            message.success("Contraseña restablecida exitosamente");
            setTimeout(() => navigate("/login"), 2000);
        } catch (error) {
            message.error("Error al restablecer la contraseña");
        } finally {
            setLoading(false);
        }
    };

    if (verifying) {
        return (
            <div style={{ 
                minHeight: "100vh", 
                display: "flex", 
                justifyContent: "center", 
                alignItems: "center",
                background: "linear-gradient(135deg, #49b6ad 0%, #0f8b8d 100%)"
            }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div style={{ 
            minHeight: "100vh", 
            display: "flex", 
            justifyContent: "center", 
            alignItems: "center",
            background: "linear-gradient(135deg, #49b6ad 0%, #0f8b8d 100%)"
        }}>
            <Card style={{ width: 400, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
                {tokenValid && !success ? (
                    <>
                        <Title level={2} style={{ textAlign: "center", marginBottom: 8 }}>
                            Nueva Contraseña
                        </Title>
                        <Paragraph style={{ textAlign: "center", color: "#666", marginBottom: 24 }}>
                            Ingresa tu nueva contraseña
                        </Paragraph>

                        <Form layout="vertical" onFinish={handleSubmit}>
                            <Form.Item
                                name="new_password"
                                label="Nueva Contraseña"
                                rules={[
                                    { required: true, message: "Requerido" },
                                    { min: 8, message: "Mínimo 8 caracteres" }
                                ]}
                            >
                                <Input.Password 
                                    prefix={<LockOutlined />}
                                    placeholder="Mínimo 8 caracteres"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item
                                name="confirm_password"
                                label="Confirmar Contraseña"
                                rules={[{ required: true, message: "Requerido" }]}
                            >
                                <Input.Password 
                                    prefix={<LockOutlined />}
                                    placeholder="Repite la contraseña"
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
                                    Restablecer Contraseña
                                </Button>
                            </Form.Item>
                        </Form>
                    </>
                ) : success ? (
                    <>
                        <Title level={3} style={{ textAlign: "center", color: "#52c41a" }}>
                            ✓ Contraseña Restablecida
                        </Title>
                        <Paragraph style={{ textAlign: "center" }}>
                            Redirigiendo al inicio de sesión...
                        </Paragraph>
                    </>
                ) : null}
            </Card>
        </div>
    );
}

export default PasswordResetConfirm;

