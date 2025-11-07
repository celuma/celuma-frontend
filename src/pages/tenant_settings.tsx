import { useEffect, useState } from "react";
import { Layout, Card, Form, Input, Button, message, Upload, Image } from "antd";
import { UploadOutlined, SaveOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";
import type { UploadFile } from "antd/es/upload/interface";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

function getAuthToken(): string | null {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

async function patchJSON<TRes>(path: string, body: unknown): Promise<TRes> {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

interface TenantInfo {
    id: string;
    name: string;
    legal_name?: string;
    tax_id?: string;
    logo_url?: string;
}

function TenantSettings() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [tenant, setTenant] = useState<TenantInfo | null>(null);
    const [logoFile, setLogoFile] = useState<UploadFile | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadTenant();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadTenant = async () => {
        setLoading(true);
        try {
            const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id");
            if (!tenantId) {
                message.error("No tenant ID found");
                return;
            }

            const data = await getJSON<TenantInfo>(`/v1/tenants/${tenantId}`);
            setTenant(data);
            form.setFieldsValue({
                name: data.name,
                legal_name: data.legal_name,
                tax_id: data.tax_id,
            });
        } catch {
            message.error("Error al cargar configuración");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (values: Partial<TenantInfo>) => {
        if (!tenant) return;
        
        setLoading(true);
        try {
            await patchJSON(`/v1/tenants/${tenant.id}`, values);
            message.success("Configuración actualizada");
            await loadTenant();
        } catch {
            message.error("Error al actualizar configuración");
        } finally {
            setLoading(false);
        }
    };

    const handleLogoUpload = async () => {
        if (!logoFile || !tenant) return;

        const formData = new FormData();
        const fileObject = logoFile.originFileObj;
        if (!fileObject) return;
        formData.append("file", fileObject);

        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = token;

        try {
            const res = await fetch(`${getApiBase()}/v1/tenants/${tenant.id}/logo`, {
                method: "POST",
                headers,
                body: formData,
            });

            if (!res.ok) throw new Error("Upload failed");

            message.success("Logo actualizado");
            await loadTenant();
            setLogoFile(null);
        } catch {
            message.error("Error al subir logo");
        }
    };

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/home" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: 24, background: tokens.bg }}>
                <div style={{ maxWidth: 800, margin: "0 auto" }}>
                    <Card
                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 24, fontWeight: 800 }}>Configuración del Laboratorio</span>}
                        loading={loading}
                        style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow }}
                    >
                        <Form form={form} layout="vertical" onFinish={handleSave}>
                            <Form.Item name="name" label="Nombre del Laboratorio" rules={[{ required: true }]}>
                                <Input placeholder="Laboratorio Central" />
                            </Form.Item>

                            <Form.Item name="legal_name" label="Razón Social">
                                <Input placeholder="Laboratorio Central S.A. de C.V." />
                            </Form.Item>

                            <Form.Item name="tax_id" label="RFC / Tax ID">
                                <Input placeholder="ABC123456XYZ" />
                            </Form.Item>

                            <Form.Item label="Logo">
                                {tenant?.logo_url && (
                                    <div style={{ marginBottom: 12 }}>
                                        <Image 
                                            src={tenant.logo_url} 
                                            alt="Logo actual"
                                            style={{ maxWidth: 200, maxHeight: 100, objectFit: "contain" }}
                                        />
                                    </div>
                                )}
                                <Upload
                                    beforeUpload={(file) => {
                                        setLogoFile(file);
                                        return false;
                                    }}
                                    fileList={logoFile ? [logoFile] : []}
                                    onRemove={() => setLogoFile(null)}
                                    accept="image/*"
                                    maxCount={1}
                                >
                                    <Button icon={<UploadOutlined />}>Seleccionar Logo</Button>
                                </Upload>
                                {logoFile && (
                                    <Button 
                                        type="primary" 
                                        onClick={handleLogoUpload}
                                        style={{ marginTop: 8 }}
                                    >
                                        Subir Logo
                                    </Button>
                                )}
                            </Form.Item>

                            <Form.Item>
                                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                                    Guardar Cambios
                                </Button>
                            </Form.Item>
                        </Form>
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default TenantSettings;

