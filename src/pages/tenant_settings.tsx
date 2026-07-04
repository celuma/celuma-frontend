import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Layout, Card, Upload, Image, message } from "antd";
import { UploadOutlined, LockOutlined, ShopOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { useUserProfile } from "../hooks/use_user_profile";
import PageHeader from "../components/ui/page_header";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import Panel from "../components/ui/panel";
import Button from "../components/ui/button";
import { tokens, cardStyle } from "../components/design/tokens";
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

const schema = z.object({
    name: z.string().trim().nonempty("El nombre es requerido."),
    legal_name: z.string().trim().optional(),
    tax_id: z.string().trim().optional(),
});

type TenantFormData = z.infer<typeof schema>;

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 style={{
        margin: 0,
        fontFamily: tokens.titleFont,
        fontSize: 18,
        fontWeight: 700,
        color: tokens.textPrimary,
        letterSpacing: "-0.01em",
    }}>
        {children}
    </h3>
);

interface TenantSettingsProps {
    embedded?: boolean;
}

function TenantSettings({ embedded = false }: TenantSettingsProps) {
    const navigate = useNavigate();
    const { canManageTenant } = useUserProfile();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tenant, setTenant] = useState<TenantInfo | null>(null);
    const [logoFile, setLogoFile] = useState<UploadFile | null>(null);
    const [uploading, setUploading] = useState(false);

    const { control, handleSubmit, reset } = useForm<TenantFormData>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", legal_name: "", tax_id: "" },
        mode: "onTouched",
    });

    useEffect(() => {
        loadTenant();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadTenant = async () => {
        setLoading(true);
        try {
            const tenantId = localStorage.getItem("tenant_id") || sessionStorage.getItem("tenant_id");
            if (!tenantId) {
                message.error("No se encontró el identificador de la empresa");
                return;
            }
            const data = await getJSON<TenantInfo>(`/v1/tenants/${tenantId}`);
            setTenant(data);
            reset({
                name: data.name || "",
                legal_name: data.legal_name || "",
                tax_id: data.tax_id || "",
            });
        } catch {
            message.error("Error al cargar la configuración");
        } finally {
            setLoading(false);
        }
    };

    const onSubmit = handleSubmit(async (values) => {
        if (!tenant) return;
        setSaving(true);
        try {
            await patchJSON(`/v1/tenants/${tenant.id}`, {
                name: values.name,
                legal_name: values.legal_name || undefined,
                tax_id: values.tax_id || undefined,
            });
            message.success("Configuración actualizada");
            await loadTenant();
        } catch {
            message.error("Error al actualizar la configuración");
        } finally {
            setSaving(false);
        }
    });

    const handleLogoUpload = async () => {
        if (!logoFile || !tenant) return;
        const fileObject = logoFile.originFileObj;
        if (!fileObject) return;

        const formData = new FormData();
        formData.append("file", fileObject);
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = token;

        setUploading(true);
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
            message.error("Error al subir el logo");
        } finally {
            setUploading(false);
        }
    };

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
            <style>{`
              .ts-grid-2 { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
              @media (max-width: 768px) { .ts-grid-2 { grid-template-columns: 1fr; } }
            `}</style>
            <PageHeader
                title="Empresa"
                subtitle="Configura los datos y la identidad de tu laboratorio."
            />

            <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }} loading={loading}>
                <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 28 }}>
                    {!canManageTenant && (
                        <Panel style={{ background: "#fffbeb", border: "2px solid #fde68a", display: "flex", alignItems: "center", gap: 12 }}>
                            <LockOutlined style={{ color: "#b45309", fontSize: 18 }} />
                            <div style={{ fontSize: 13, color: "#92400e" }}>
                                Solo lectura — se requiere el permiso <strong>admin:manage_tenant</strong> para guardar cambios.
                            </div>
                        </Panel>
                    )}

                    <section style={{ display: "grid", gap: 16 }}>
                        <SectionTitle>Datos de la empresa</SectionTitle>
                        <div className="ts-grid-2">
                            <FormField control={control} name="name" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Nombre del laboratorio" requiredMark disabled={!canManageTenant} />} />
                            <FormField control={control} name="legal_name" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="Razón social" disabled={!canManageTenant} />} />
                        </div>
                        <div className="ts-grid-2">
                            <FormField control={control} name="tax_id" render={(props) => <FloatingCaptionInput {...props} value={String(props.value ?? "")} label="RFC / Tax ID" disabled={!canManageTenant} />} />
                        </div>
                    </section>

                    <section style={{ display: "grid", gap: 16 }}>
                        <SectionTitle>Logotipo</SectionTitle>
                        <Panel style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                            <div style={{
                                width: 120,
                                height: 120,
                                borderRadius: tokens.radius,
                                border: "2px dashed #e5e7eb",
                                background: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                overflow: "hidden",
                            }}>
                                {tenant?.logo_url ? (
                                    <Image src={tenant.logo_url} alt="Logo actual" style={{ maxWidth: 110, maxHeight: 110, objectFit: "contain" }} />
                                ) : (
                                    <ShopOutlined style={{ fontSize: 34, color: "#cbd5e1" }} />
                                )}
                            </div>
                            <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: tokens.textSecondary, maxWidth: 360 }}>
                                    Sube el logotipo de tu laboratorio. Se mostrará en reportes y documentos. Formato de imagen recomendado con fondo transparente.
                                </div>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                    <Upload
                                        beforeUpload={(file) => { setLogoFile(file); return false; }}
                                        fileList={logoFile ? [logoFile] : []}
                                        onRemove={() => setLogoFile(null)}
                                        accept="image/*"
                                        maxCount={1}
                                        disabled={!canManageTenant}
                                    >
                                        <Button htmlType="button" icon={<UploadOutlined />} disabled={!canManageTenant}>
                                            Seleccionar logo
                                        </Button>
                                    </Upload>
                                    {logoFile && canManageTenant && (
                                        <Button htmlType="button" type="primary" onClick={handleLogoUpload} loading={uploading}>
                                            Subir logo
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Panel>
                    </section>

                    {canManageTenant && (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
                            <Button htmlType="submit" type="primary" loading={saving}>
                                Guardar cambios
                            </Button>
                        </div>
                    )}
                </form>
            </Card>
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <SidebarCeluma selectedKey="/config" onNavigate={(k) => navigate(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: 900, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
}

export default TenantSettings;
