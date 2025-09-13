// components/report_images.tsx
import { useEffect, useMemo, useState } from "react";
import { Upload, Modal, Typography, message, Button, Space, Input, Popconfirm } from "antd";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import { PlusOutlined, UploadOutlined, DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import {
    uploadReportImage,
    deleteReportImage,
    fetchReportImages, // <- si ya lo tienes en tu servicio
} from "../../services/report_service";

export type ReportImage = {
    id?: string;
    url: string;
    caption?: string;
};

const ACCEPT_IMAGES =
    "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml";

type Props = {
    sampleId: string;
    value?: ReportImage[];
    onChange?: (images: ReportImage[]) => void;
    maxCount?: number;
    maxSizeMB?: number;
    disabled?: boolean;
    label?: string;
    helpText?: string;
    listType?: "picture-card" | "picture" | "text";
    dragAndDrop?: boolean;
    deleteInBackend?: boolean;
};

const DEFAULT_MAX_MB = 10;

/** Convierte rutas relativas a absolutas para que <img> las pueda cargar. */
function normalizeUrl(u: string): string {
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u; // ya es absoluta
    const base =
        import.meta.env.DEV
            ? "/api"
            : (import.meta.env.VITE_API_BASE_URL as string) || "/api";
    const baseAbs = /^https?:\/\//i.test(base)
        ? base
        : `${window.location.origin}${base.startsWith("/") ? "" : "/"}${base}`;
    return `${baseAbs.replace(/\/+$/, "")}/${u.replace(/^\/+/, "")}`;
}

export default function ReportImages({
                                         sampleId,
                                         value,
                                         onChange,
                                         maxCount = 8,
                                         maxSizeMB = DEFAULT_MAX_MB,
                                         disabled,
                                         label = "Imágenes",
                                         helpText = `Arrastra o haz clic. Máx ${DEFAULT_MAX_MB}MB por imagen.`,
                                         listType = "picture-card",
                                         dragAndDrop = true,
                                         deleteInBackend = false,
                                     }: Props) {
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [preview, setPreview] = useState<{ open: boolean; title?: string; src?: string }>({ open: false });
    const [loadingList, setLoadingList] = useState(false);

    const emit = (next: ReportImage[]) => onChange?.(next.slice(0, maxCount));

    // value -> fileList (uid + status tipado y URL normalizada)
    useEffect(() => {
        const mapped: UploadFile[] =
            (value ?? [])
                .slice(0, maxCount)
                .map((img, i): UploadFile => ({
                    uid: img.id && img.id.trim() ? img.id : `img-${i}`,
                    name: img.caption || `Figura ${i + 1}`,
                    status: "done" as UploadFile["status"],
                    url: normalizeUrl(img.url),
                }));
        setFileList(mapped);
    }, [value, maxCount]);

    // Carga desde backend (útil si subiste fuera o para consolidar URLs/IDs reales)
    const loadFromServer = async () => {
        if (!sampleId) return;
        try {
            setLoadingList(true);
            const items = await fetchReportImages(sampleId); // [{id,url,caption?}]
            emit(items.map(it => ({ ...it, url: normalizeUrl(it.url) })));
        } catch (e) {
            message.error(e instanceof Error ? e.message : "No se pudieron cargar las imágenes.");
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => { void loadFromServer(); }, [sampleId]); // al montar/cambiar sample

    // Validaciones
    const validateFile = (file: File) => {
        if (!file.type.startsWith("image/")) {
            message.error("Solo se permiten imágenes.");
            return false;
        }
        const ok = file.size / 1024 / 1024 < maxSizeMB;
        if (!ok) {
            message.error(`La imagen debe pesar menos de ${maxSizeMB} MB.`);
            return false;
        }
        return true;
    };
    const beforeUpload: UploadProps["beforeUpload"] = (file) =>
        validateFile(file as File) ? true : Upload.LIST_IGNORE;

    // Subida: escoger la URL correcta del response y refrescar
    const customRequest: UploadProps["customRequest"] = useMemo(() => {
        return async (options) => {
            const { file, onError, onProgress, onSuccess } = options;
            try {
                if (!sampleId) throw new Error("Falta sampleId");
                if (!(file instanceof File)) throw new Error("Archivo inválido");

                onProgress?.({ percent: 25 });

                const resp: any = await uploadReportImage(sampleId, file, "");
                // <-- AQUI el FIX: tomar la mejor URL disponible
                const displayUrl: string | undefined =
                    resp?.url ??
                    resp?.urls?.processed ??
                    resp?.urls?.thumbnail ??
                    resp?.urls?.original;

                if (!displayUrl) {
                    // Si no vino, recarga del backend para no quedar “en blanco”
                    await loadFromServer();
                    throw new Error("El servidor no devolvió una URL de imagen utilizable.");
                }

                const newImg: ReportImage = {
                    id: resp?.id || resp?.sample_image_id || "",
                    url: normalizeUrl(displayUrl),
                    caption: resp?.caption ?? "",
                };

                // 1) Actualiza el padre (para que la vista previa derecha se pinte)
                const next = [...(value ?? []), newImg].slice(0, maxCount);
                emit(next);

                // 2) Actualiza miniatura de AntD al instante
                setFileList((prev) => {
                    const uid = newImg.id && String(newImg.id).trim() ? String(newImg.id) : `img-${prev.length}`;
                    const fileItem: UploadFile = {
                        uid,
                        name: newImg.caption || `Figura ${prev.length + 1}`,
                        status: "done" as UploadFile["status"],
                        url: newImg.url,
                    };
                    return [...prev, fileItem].slice(0, maxCount);
                });

                onProgress?.({ percent: 90 });

                // 3) Sincroniza contra backend para consolidar
                await loadFromServer();

                onSuccess?.({}, {} as any);
                message.success("Imagen subida correctamente.");
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Error al subir imagen.";
                onError?.(err as Error);
                message.error(msg);
            }
        };
    }, [sampleId, value, maxCount]);

    const handlePreview = (file: UploadFile) => {
        setPreview({ open: true, title: file.name, src: file.url || file.thumbUrl });
    };

    // Eliminar (local) + opcional en backend
    const removeAt = async (idx: number) => {
        const item = (value ?? [])[idx];
        if (!item) return;

        if (deleteInBackend && item.id) {
            try {
                await deleteReportImage(sampleId, item.id);
            } catch (e) {
                message.error(e instanceof Error ? e.message : "No se pudo eliminar la imagen en el servidor.");
                return;
            }
        }

        const next = (value ?? []).slice();
        next.splice(idx, 1);
        emit(next);
    };

    const handleRemove: UploadProps["onRemove"] = async (file) => {
        const idx = (value ?? []).findIndex(
            (img, i) =>
                (img.id ?? `img-${i}`) === file.uid ||
                normalizeUrl(img.url) === file.url
        );
        if (idx >= 0) await removeAt(idx);
        return false;
    };

    const changeCaption = (idx: number, caption: string) => {
        const next = (value ?? []).slice();
        if (next[idx]) next[idx] = { ...next[idx], caption };
        emit(next);
    };

    const UploadCore = dragAndDrop ? Upload.Dragger : Upload;
    const addButton =
        listType === "picture-card" ? (
            <button type="button" style={{ border: 0, background: "none" }} disabled={disabled}>
                <PlusOutlined />
                <div style={{ marginTop: 8 }}>Subir</div>
            </button>
        ) : (
            <Button icon={<UploadOutlined />} disabled={disabled}>
                Seleccionar imágenes
            </Button>
        );

    return (
        <div>
            <Space direction="vertical" style={{ width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {label && <Typography.Text strong>{label}</Typography.Text>}
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={loadFromServer}
                        loading={loadingList}
                        size="small"
                    >
                        Sincronizar
                    </Button>
                </div>

                <UploadCore
                    name="file"
                    listType={listType}
                    multiple
                    maxCount={maxCount}
                    fileList={fileList}
                    accept={ACCEPT_IMAGES}
                    disabled={disabled}
                    beforeUpload={beforeUpload}
                    customRequest={customRequest}
                    onPreview={handlePreview}
                    onRemove={handleRemove}
                    action={undefined}
                >
                    {fileList.length >= maxCount ? null : addButton}
                </UploadCore>

                {helpText && (
                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                        {helpText}
                    </Typography.Paragraph>
                )}

                {(value?.length ?? 0) > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                        {(value ?? []).map((img, idx) => (
                            <div key={img.id ?? idx} style={{ display: "grid", gap: 6 }}>
                                <div
                                    style={{
                                        position: "relative",
                                        border: "1px solid #f0f0f0",
                                        borderRadius: 8,
                                        overflow: "hidden",
                                        background: "#fff",
                                    }}
                                >
                                    <img
                                        src={normalizeUrl(img.url)}
                                        alt={img.caption || `Figura ${idx + 1}`}
                                        style={{ width: "100%", height: 140, objectFit: "contain", background: "#fafafa" }}
                                    />
                                    <div style={{ position: "absolute", top: 6, right: 6 }}>
                                        <Popconfirm
                                            title="Eliminar imagen"
                                            description="¿Deseas eliminar esta imagen?"
                                            okText="Sí"
                                            cancelText="No"
                                            disabled={disabled}
                                            onConfirm={() => removeAt(idx)}
                                        >
                                            <Button size="small" type="text" icon={<DeleteOutlined />} disabled={disabled} />
                                        </Popconfirm>
                                    </div>
                                </div>

                                <Input
                                    size="small"
                                    placeholder={`Leyenda (Figura ${idx + 1})`}
                                    value={img.caption ?? ""}
                                    onChange={(e) => changeCaption(idx, e.target.value)}
                                    disabled={disabled}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </Space>

            <Modal
                open={preview.open}
                title={preview.title}
                footer={null}
                onCancel={() => setPreview({ open: false })}
                centered
            >
                <img style={{ width: "100%" }} src={preview.src} />
            </Modal>
        </div>
    );
}
