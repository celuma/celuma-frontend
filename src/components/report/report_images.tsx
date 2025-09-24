import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Modal, Typography, message, Button, Space, Input, Popconfirm, Tooltip } from "antd";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import { PlusOutlined, UploadOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { uploadReportImage, deleteReportImage, type UploadImageResponse } from "../../services/report_service";

export type ReportImage = {
    id?: string;
    url: string; // Allways the PROCESSED URL
    thumbnailUrl?: string;
    caption?: string;
};

type UploadImageServerResp = UploadImageResponse & {
    urls?: {
        original?: string;
        processed?: string;
        thumbnail?: string;
    };
    sample_image_id?: string;
};

// Formats and limits for upload
const RAW_EXT = [".cr2", ".cr3", ".nef", ".nrw", ".arw", ".sr2", ".raf", ".rw2", ".orf", ".pef", ".dng"];
const NONRAW_EXT = [".jpg", ".jpeg", ".png"];
const MAX_MB_RAW = 500;
const MAX_MB_NONRAW = 50;

// Validation in the <input type="file" />
const ACCEPT_EXTENSIONS = [...RAW_EXT, ...NONRAW_EXT].join(",");

// Props is controlled component for images in a report
type Props = {
    sampleId: string;
    // Control
    value?: ReportImage[];
    onChange?: (images: ReportImage[]) => void;
    maxCount?: number;
    disabled?: boolean;
    label?: string;
    helpText?: string;
    // Drag and drop
    dragAndDrop?: boolean;
    // If true, when deleting also tries to delete in backend if there's `id`
    deleteInBackend?: boolean;
};

function getExt(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isRawExt(ext: string): boolean {
    return RAW_EXT.includes(ext);
}

function isNonRawExt(ext: string): boolean {
    return NONRAW_EXT.includes(ext);
}

export default function ReportImages({ sampleId, value, onChange, maxCount = 8, disabled, label = "Imágenes", helpText = `Arrastra o haz clic. RAW hasta ${MAX_MB_RAW}MB • JPG/PNG hasta ${MAX_MB_NONRAW}MB`, dragAndDrop = true, deleteInBackend = false }: Props) {
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    // Models for viewing image and editing caption
    const [viewModal, setViewModal] = useState<{ open: boolean; index: number | null }>({
        open: false,
        index: null,
    });

    // Abort controller for upload
    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => () => abortRef.current?.abort(), []);

    // Sync internal fileList with value
    useEffect(() => {
        const mapped: UploadFile[] =
            (value ?? []).slice(0, maxCount).map((img, i): UploadFile => ({
                uid: img.id ?? `img-${i}`,
                name: img.caption || `Figura ${i + 1}`,
                status: "done" as UploadFile["status"],
                url: img.thumbnailUrl || img.url,
            }));
        setFileList(mapped);
    }, [value, maxCount]);

    const emit = useCallback(
        (next: ReportImage[]) => onChange?.(next.slice(0, maxCount)),
        [onChange, maxCount]
    );

    // Validations
    const validateFile = (file: File) => {
        const ext = getExt(file.name);
        const sizeMB = file.size / 1024 / 1024;

        if (isRawExt(ext)) {
            if (sizeMB > MAX_MB_RAW) {
                message.error(`El archivo RAW excede el límite de ${MAX_MB_RAW} MB.`);
                return false;
            }
            return true;
        }

        if (isNonRawExt(ext)) {
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

    // Upload only processed image is stored
    const customRequest: UploadProps["customRequest"] = useMemo(() => {
        return async (options) => {
            const { file, onError, onProgress, onSuccess } = options;
            try {
                if (!sampleId) throw new Error("Falta sampleId");
                if (!(file instanceof File)) throw new Error("Archivo inválido");
                onProgress?.({ percent: 20 });
                abortRef.current = new AbortController();
                const resp = (await uploadReportImage(sampleId, file, "")) as UploadImageServerResp;
                onProgress?.({ percent: 90 });

                // Proccesed URL is mandatory, thumbnail optional
                const processed = resp.urls?.processed ?? resp.url;
                const thumb = resp.urls?.thumbnail ?? processed;

                const newItem: ReportImage = {
                    id: resp.id || resp.sample_image_id,
                    url: processed,         // Always the processed
                    thumbnailUrl: thumb,
                    caption: resp.caption ?? "",
                };
                const next = [...(value ?? []), newItem].slice(0, maxCount);
                emit(next);

                // View in internal list (even if not shown)
                setFileList((prev) => {
                    const uid = newItem.id ?? `img-${prev.length}`;
                    const fileItem: UploadFile = {
                        uid,
                        name: newItem.caption || `Figura ${prev.length + 1}`,
                        status: "done" as UploadFile["status"],
                        url: newItem.thumbnailUrl || newItem.url,
                    };
                    return [...prev, fileItem].slice(0, maxCount);
                });

                onSuccess?.({}, {} as never);
                message.success("Imagen subida correctamente.");
            } catch (error) {
                const msg = error instanceof Error ? error.message : "Error al subir imagen.";
                onError?.(error as Error);
                message.error(msg);
            }
        };
    }, [sampleId, value, maxCount, emit]);

    // Delete
    const removeAt = async (idx: number) => {
        const item = (value ?? [])[idx];
        if (!item) return;

        if (deleteInBackend && item.id) {
            try {
                await deleteReportImage(sampleId, item.id);
            } catch (error) {
                message.error(
                    error instanceof Error ? error.message : "No se pudo eliminar la imagen en el servidor."
                );
                return;
            }
        }

        const next = (value ?? []).slice();
        next.splice(idx, 1);
        emit(next);
    };

    // Open modals
    const openView = (idx: number) => setViewModal({ open: true, index: idx });

    // Update caption inline
    const updateCaption = (idx: number, caption: string) => {
        const next = (value ?? []).slice();
        if (!next[idx]) return;
        next[idx] = { ...next[idx], caption };
        emit(next);
    };

    // Selected image in view modal
    const currentView = viewModal.index != null ? (value ?? [])[viewModal.index] ?? null : null;
    const UploadCore = dragAndDrop ? Upload.Dragger : Upload;

    return (
        <div>
            <Space direction="vertical" style={{ width: "100%" }} size="small">
                {label && (
                    <Typography.Text strong style={{ display: "block" }}>
                        {label}
                    </Typography.Text>
                )}

                <UploadCore
                    name="file"
                    multiple
                    maxCount={maxCount}
                    fileList={fileList}
                    showUploadList={false}
                    accept={ACCEPT_EXTENSIONS}
                    disabled={disabled}
                    beforeUpload={beforeUpload}
                    customRequest={customRequest}
                    action={undefined}
                >
                    {dragAndDrop ? (
                        <div>
                            <PlusOutlined />
                            <div style={{ marginTop: 8 }}>Subir</div>
                        </div>
                    ) : (
                        <Button icon={<UploadOutlined />} disabled={disabled}>
                            Seleccionar imágenes
                        </Button>
                    )}
                </UploadCore>

                {helpText && (
                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                        {helpText}
                    </Typography.Paragraph>
                )}

                {(value?.length ?? 0) > 0 && (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                            gap: 12,
                        }}
                    >
                        {(value ?? []).map((img, idx) => (
                            <div
                                key={img.id ?? idx}
                                style={{
                                    position: "relative",
                                    width: "100%",
                                    borderRadius: 6,
                                    overflow: "hidden",
                                    border: "1px solid #f0f0f0",
                                    background: "#fafafa",
                                }}
                            >
                                {/* Thumbnail */}
                                <img
                                    src={img.thumbnailUrl || img.url}
                                    alt={img.caption || `Figura ${idx + 1}`}
                                    style={{
                                        width: "100%",
                                        height: 80,
                                        objectFit: "cover",
                                        display: "block",
                                    }}
                                />

                                <div
                                    style={{
                                        position: "absolute",
                                        top: 4,
                                        right: 4,
                                        display: "flex",
                                        gap: 4,
                                    }}
                                >
                                    <Tooltip title="Ver imagen">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<EyeOutlined />}
                                            onClick={() => openView(idx)}
                                        />
                                    </Tooltip>

                                    <Popconfirm
                                        title="Eliminar imagen"
                                        okText="Sí"
                                        cancelText="No"
                                        disabled={disabled}
                                        onConfirm={() => removeAt(idx)}
                                    >
                                        <Button size="small" type="text" icon={<DeleteOutlined />} disabled={disabled} />
                                    </Popconfirm>
                                </div>

                                <div style={{ padding: "8px 8px 12px" }}>
                                    <Input.TextArea
                                        placeholder="Escribe una nota para esta imagen"
                                        autoSize={{ minRows: 2, maxRows: 3 }}
                                        value={img.caption || ""}
                                        onChange={(e) => updateCaption(idx, e.target.value)}
                                        disabled={disabled}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Space>

            <Modal
                open={viewModal.open}
                title="Imagen procesada"
                footer={null}
                onCancel={() => setViewModal({ open: false, index: null })}
                width={720}
                centered
            >
                {currentView && (
                    <img
                        src={currentView.url}
                        alt={currentView.caption || "imagen"}
                        style={{ width: "100%", maxHeight: 520, objectFit: "contain" }}
                    />
                )}
            </Modal>

        </div>
    );
}
