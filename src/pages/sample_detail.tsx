import { useEffect, useState } from "react";
import { Layout, Card, Descriptions, Tag, Upload, Button as AntButton, List, Image, Empty, message } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SidebarCeluma from "../components/ui/sidebar_menu";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import ErrorText from "../components/ui/error_text";

function getApiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

async function getJSON<TRes>(path: string): Promise<TRes> {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${getApiBase()}${path}`, { method: "GET", headers, credentials: "include" });
    const text = await res.text();
    let parsed: unknown = undefined;
    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
    if (!res.ok) {
        const message = (parsed as { message?: string } | undefined)?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(message);
    }
    return parsed as TRes;
}

type SampleDetail = {
    id: string;
    sample_code: string;
    type: string;
    state: string;
    collected_at?: string | null;
    received_at?: string | null;
    notes?: string | null;
    tenant_id: string;
    branch: { id: string; name?: string; code?: string | null };
    order: { id: string; order_code: string; status: string };
    patient: { id: string; full_name: string; patient_code: string };
};

type SampleImages = {
    sample_id: string;
    images: Array<{
        id: string;
        label?: string | null;
        is_primary: boolean;
        created_at: string;
        urls: Record<string, string>;
    }>;
};

export default function SampleDetailPage() {
    const { sampleId } = useParams();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [detail, setDetail] = useState<SampleDetail | null>(null);
    const [images, setImages] = useState<SampleImages | null>(null);
    const [uploading, setUploading] = useState(false);

    async function refresh() {
        if (!sampleId) return;
        setLoading(true);
        setError(null);
        try {
            const [d, imgs] = await Promise.all([
                getJSON<SampleDetail>(`/v1/laboratory/samples/${sampleId}`),
                getJSON<SampleImages>(`/v1/laboratory/samples/${sampleId}/images`),
            ]);
            setDetail(d);
            setImages(imgs);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { refresh(); }, [sampleId]);

    const uploadProps = {
        name: "file",
        multiple: false,
        customRequest: async (options: any) => {
            if (!sampleId) return;
            const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
            const formData = new FormData();
            formData.append("file", options.file as File);
            setUploading(true);
            try {
                const res = await fetch(`${getApiBase()}/v1/laboratory/samples/${sampleId}/images`, {
                    method: "POST",
                    headers: token ? { Authorization: token } : undefined,
                    body: formData,
                    credentials: "include",
                });
                if (!res.ok) {
                    const text = await res.text();
                    let parsed: any = undefined;
                    try { parsed = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }
                    throw new Error(parsed?.message ?? `${res.status} ${res.statusText}`);
                }
                message.success("Imagen subida correctamente");
                options.onSuccess?.({}, options.file);
                await refresh();
            } catch (e: any) {
                message.error(e?.message || "Error al subir la imagen");
                options.onError?.(e);
            } finally {
                setUploading(false);
            }
        },
        showUploadList: false,
    } as const;

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/home"}
                onNavigate={(k) => navigate(k)}
                logoSrc={logo}
            />
            <Layout.Content style={{ padding: 24, background: "#f6f8fa" }}>
                <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
                    <Card title="Perfil de Muestra" loading={loading} style={{ borderRadius: 12 }}>
                        {detail && (
                            <Descriptions bordered column={2} size="middle">
                                <Descriptions.Item label="Código">{detail.sample_code}</Descriptions.Item>
                                <Descriptions.Item label="Tipo">{detail.type}</Descriptions.Item>
                                <Descriptions.Item label="Estado"><Tag color="#49b6ad">{detail.state}</Tag></Descriptions.Item>
                                <Descriptions.Item label="Orden">
                                    <a onClick={() => navigate(`/orders/${detail.order.id}`)}>{detail.order.order_code}</a>
                                </Descriptions.Item>
                                <Descriptions.Item label="Paciente">
                                    <a onClick={() => navigate(`/patients/${detail.patient.id}`)}>{detail.patient.full_name || detail.patient.patient_code}</a>
                                </Descriptions.Item>
                                <Descriptions.Item label="Sucursal">{`${detail.branch.code ?? ""} ${detail.branch.name ?? ""}`.trim()}</Descriptions.Item>
                                <Descriptions.Item label="Recolectada">{detail.collected_at ?? "—"}</Descriptions.Item>
                                <Descriptions.Item label="Recibida">{detail.received_at ?? "—"}</Descriptions.Item>
                                <Descriptions.Item label="Notas" span={2}>{detail.notes ?? "—"}</Descriptions.Item>
                            </Descriptions>
                        )}
                        <ErrorText>{error}</ErrorText>
                    </Card>

                    <Card title="Imágenes" extra={<Upload {...uploadProps}><AntButton loading={uploading} icon={<UploadOutlined />}>Subir imagen</AntButton></Upload>} style={{ borderRadius: 12 }}>
                        {images && images.images.length > 0 ? (
                            <List
                                grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }}
                                dataSource={images.images}
                                renderItem={(img) => (
                                    <List.Item>
                                        <Card size="small" hoverable>
                                            <Image
                                                width="100%"
                                                src={img.urls.thumbnail || img.urls.processed}
                                                fallback={img.urls.processed}
                                            />
                                            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <span style={{ color: "#64748b" }}>{new Date(img.created_at).toLocaleString()}</span>
                                                {img.is_primary && <Tag color="#22c55e">Principal</Tag>}
                                            </div>
                                        </Card>
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty description="Sin imágenes" />
                        )}
                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
}


