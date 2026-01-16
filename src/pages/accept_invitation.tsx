import { useState, useEffect } from "react";
import { Card, Form, Input, Button, message, Typography, Spin, Tag } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";

const { Title, Paragraph } = Typography;

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

interface InvitationInfo {
    email: string;
    full_name: string;
    role: string;
    tenant_name: string;
}

function AcceptInvitation() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [invitation, setInvitation] = useState<InvitationInfo | null>(null);

    useEffect(() => {
        if (!token) {
            message.error("Token inválido");
            navigate("/login");
            return;
        }

        // Verify token and get invitation info
        (async () => {
            try {
                const res = await fetch(`${getApiBase()}/v1/users/invitations/${token}`, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                });

                if (res.ok) {
                    const data = await res.json();
                    setInvitation(data);
                } else {
                    message.error("La invitación ha expirado o es inválida");
                    setTimeout(() => navigate("/login"), 2000);
                }
            } catch {
                message.error("Error al verificar la invitación");
                setTimeout(() => navigate("/login"), 2000);
            } finally {
                setVerifying(false);
            }
        })();
    }, [token, navigate]);

    const handleSubmit = async (values: { username?: string; password: string; confirm_password: string }) => {
        if (values.password !== values.confirm_password) {
            message.error("Las contraseñas no coinciden");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${getApiBase()}/v1/users/invitations/${token}/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    username: values.username || null,
                    password: values.password 
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text);
            }

            message.success("Cuenta creada exitosamente. Redirigiendo al inicio de sesión...");
            setTimeout(() => navigate("/login"), 2000);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Error al crear cuenta");
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
            <Card style={{ width: 450, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
                {invitation ? (
                    <>
                        <Title level={2} style={{ textAlign: "center", marginBottom: 8 }}>
                            ¡Bienvenido a {invitation.tenant_name}!
                        </Title>
                        <Paragraph style={{ textAlign: "center", color: "#666", marginBottom: 24 }}>
                            Has sido invitado como <Tag color="blue">{invitation.role}</Tag>
                        </Paragraph>

                        <div style={{ marginBottom: 24, padding: 12, background: "#f0f5ff", borderRadius: 4 }}>
                            <div><strong>Nombre:</strong> {invitation.full_name}</div>
                            <div><strong>Email:</strong> {invitation.email}</div>
                        </div>

                        <Form layout="vertical" onFinish={handleSubmit}>
                            <Form.Item
                                name="username"
                                label="Usuario (opcional)"
                            >
                                <Input 
                                    prefix={<UserOutlined />}
                                    placeholder="nombre_usuario"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item
                                name="password"
                                label="Contraseña"
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
                                    Crear Cuenta
                                </Button>
                            </Form.Item>
                        </Form>
                    </>
                ) : null}
            </Card>
        </div>
    );
}

export default AcceptInvitation;

