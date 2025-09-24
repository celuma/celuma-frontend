import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Modal, Typography, message, Button, Space, Checkbox, Popconfirm, Tooltip } from "antd";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import { PlusOutlined, UploadOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { deleteReportImage, fetchReportImages, uploadReportImage } from "../../services/report_service";

export type SampleImageItem = {
    id: string;
    url: string;
    thumbnailUrl?: string;
    caption?: string;
};

type Props = {
    sampleId: string;
    selectedIds: string[];
    onToggleSelect: (image: SampleImageItem, selected: boolean) => void;
    allowDelete?: boolean;
    dragAndDrop?: boolean;
};

// Basic limits and accepted formats
const RAW_EXT = [".cr2", ".cr3", ".nef", ".nrw", ".arw", ".sr2", ".raf", ".rw2", ".orf", ".pef", ".dng"];
const NONRAW_EXT = [".jpg", ".jpeg", ".png"];
const MAX_MB_RAW = 500;
const MAX_MB_NONRAW = 50;
const ACCEPT_EXTENSIONS = [...RAW_EXT, ...NONRAW_EXT].join(",");

function getExt(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export default function SampleImagesPicker({ sampleId, selectedIds, onToggleSelect, allowDelete = false, dragAndDrop = true }: Props) {
    const [images, setImages] = useState<SampleImageItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [viewModal, setViewModal] = useState<{ open: boolean; image: SampleImageItem | null }>({ open: false, image: null });
    const abortRef = useRef<AbortController | null>(null);

    const selectedIdsSet = useMemo(() => new Set((selectedIds || []).filter((v): v is string => typeof v === "string" && v.length > 0)), [selectedIds]);

    const load = useMemo(() => async () => {
        if (!sampleId) return;
        setLoading(true);
        try {
            const list = await fetchReportImages(sampleId);
            setImages(list);
            setFileList(
                list.map((img, i): UploadFile => ({
                    uid: img.id ?? `img-${i}`,
                    name: img.caption || `Figura ${i + 1}`,
                    status: "done",
                    url: img.thumbnailUrl || img.url,
                }))
            );
        } catch (e) {
            message.error(e instanceof Error ? e.message : "No se pudieron cargar las imágenes de la muestra");
        } finally {
            setLoading(false);
        }
    }, [sampleId]);

    useEffect(() => {
        load();
        return () => abortRef.current?.abort();
    }, [load]);

    const validateFile = (file: File) => {
        const ext = getExt(file.name);
        const sizeMB = file.size / 1024 / 1024;
        if (RAW_EXT.includes(ext)) {
            if (sizeMB > MAX_MB_RAW) {
                message.error(`El archivo RAW excede el límite de ${MAX_MB_RAW} MB.`);
                return false;
            }
            return true;
        }
        if (NONRAW_EXT.includes(ext)) {
            if (sizeMB > MAX_MB_NONRAW) {
                message.error(`La imagen excede el límite de ${MAX_MB_NONRAW} MB.`);
                return false;
            }
            return true;
        }
        message.error(
            "Formato no compatible. Formatos permitidos:\n" +
            `RAW: ${RAW_EXT.join(", ")}\n` +
            `NO-RAW: ${NONRAW_EXT.join(", ")}`
        );
        return false;
    };

    const beforeUpload: UploadProps["beforeUpload"] = (file) => validateFile(file as File) ? true : Upload.LIST_IGNORE;

    const customRequest: UploadProps["customRequest"] = async (options) => {
        const { file, onError, onProgress, onSuccess } = options;
        try {
            if (!sampleId) throw new Error("Falta sampleId");
            if (!(file instanceof File)) throw new Error("Archivo inválido");
            onProgress?.({ percent: 20 });
            abortRef.current = new AbortController();
            await uploadReportImage(sampleId, file, "");
            onProgress?.({ percent: 90 });
            onSuccess?.({}, {} as never);
            message.success("Imagen subida correctamente.");
            await load();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Error al subir imagen.";
            onError?.(err as Error);
            message.error(msg);
        }
    };

    const handleDelete = async (img: SampleImageItem) => {
        try {
            await deleteReportImage(sampleId, img.id);
            await load();
        } catch (e) {
            message.error(e instanceof Error ? e.message : "No se pudo eliminar la imagen");
        }
    };

    const isSelected = (id: string) => selectedIdsSet.has(id);

    const uploadCommonProps: UploadProps = {
        name: "file",
        multiple: true,
        fileList,
        showUploadList: false,
        accept: ACCEPT_EXTENSIONS,
        beforeUpload,
        customRequest,
        action: undefined,
        disabled: !sampleId || loading,
    };

    return (
        <div>
            <Space direction="vertical" style={{ width: "100%" }} size="small">
                <Typography.Text strong>Galería de la muestra</Typography.Text>

                <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                    Marca las imágenes que deseas anexar al reporte. Subir aquí guarda en la muestra.
                </Typography.Paragraph>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 12,
                    }}
                >
                    {dragAndDrop ? (
                        <Upload.Dragger
                            {...uploadCommonProps}
                            style={{
                                borderRadius: 6,
                                border: "1px dashed #d9d9d9",
                                background: "#fafafa",
                                padding: 12,
                                height: 190,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexDirection: "column",
                                color: "#8c8c8c",
                            }}
                        >
                            <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                            <Typography.Text strong>Agregar imágenes</Typography.Text>
                            <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", textAlign: "center" }}>
                                Haz clic o arrastra archivos para subirlos
                            </Typography.Paragraph>
                        </Upload.Dragger>
                    ) : (
                        <div
                            style={{
                                borderRadius: 6,
                                border: "1px dashed #d9d9d9",
                                background: "#fafafa",
                                padding: 12,
                                height: 190,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Upload {...uploadCommonProps}>
                                <Button icon={<UploadOutlined />} disabled={!sampleId || loading}>
                                    Seleccionar imágenes
                                </Button>
                            </Upload>
                        </div>
                    )}

                    {images.map((img, idx) => (
                        <div
                            key={img.id ?? idx}
                            style={{
                                position: "relative",
                                width: "100%",
                                borderRadius: 6,
                                overflow: "hidden",
                                border: "1px solid #f0f0f0",
                                background: "#fafafa",
                                paddingBottom: 8,
                            }}
                        >
                            <img
                                src={img.thumbnailUrl || img.url}
                                alt={img.caption || `Figura ${idx + 1}`}
                                style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
                            />

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", gap: 6 }}>
                                <Checkbox
                                    checked={isSelected(img.id)}
                                    onChange={(e) => onToggleSelect(img, e.target.checked)}
                                >
                                    Anexar al reporte
                                </Checkbox>

                                <div style={{ display: "flex", gap: 4 }}>
                                    <Tooltip title="Ver imagen">
                                        <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setViewModal({ open: true, image: img })} />
                                    </Tooltip>
                                    {allowDelete && (
                                        <Popconfirm title="Eliminar imagen" okText="Sí" cancelText="No" onConfirm={() => handleDelete(img)}>
                                            <Button size="small" type="text" icon={<DeleteOutlined />} />
                                        </Popconfirm>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Space>

            <Modal
                open={viewModal.open}
                title="Imagen"
                footer={null}
                onCancel={() => setViewModal({ open: false, image: null })}
                width={720}
                centered
            >
                {viewModal.image && (
                    <img src={viewModal.image.url} alt={viewModal.image.caption || "imagen"} style={{ width: "100%", maxHeight: 520, objectFit: "contain" }} />
                )}
            </Modal>
        </div>
    );
}
