// components/report_images.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Upload,
    Modal,
    Typography,
    message,
    Button,
    Space,
    Input,
    Popconfirm,
    Tooltip,
} from "antd";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import {
    PlusOutlined,
    UploadOutlined,
    DeleteOutlined,
    EyeOutlined,
    FileTextOutlined,
} from "@ant-design/icons";
import {
    uploadReportImage,
    deleteReportImage,
    type UploadImageResponse,
} from "../../services/report_service";

export type ReportImage = {
    id?: string;
    /** SIEMPRE la URL PROCESADA (no la original) */
    url: string;
    /** Miniatura si el backend la provee; si no, cae en url */
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

const ACCEPT_IMAGES =
    "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml";

type Props = {
    sampleId: string;

    /** Controlado */
    value?: ReportImage[];
    onChange?: (images: ReportImage[]) => void;

    maxCount?: number;
    maxSizeMB?: number;
    disabled?: boolean;

    label?: string;
    helpText?: string;

    /** Arrastrar y soltar para el uploader */
    dragAndDrop?: boolean;

    /** Si true, al eliminar también lo intenta en backend si hay `id` */
    deleteInBackend?: boolean;
};

const DEFAULT_MAX_MB = 10;

export default function ReportImages({
                                         sampleId,
                                         value,
                                         onChange,
                                         maxCount = 8,
                                         maxSizeMB = DEFAULT_MAX_MB,
                                         disabled,
                                         label = "Imágenes",
                                         helpText = `Arrastra o haz clic. Máx ${DEFAULT_MAX_MB}MB por imagen.`,
                                         dragAndDrop = true,
                                         deleteInBackend = false,
                                     }: Props) {
    const [fileList, setFileList] = useState<UploadFile[]>([]);

    // Modales separados
    const [viewModal, setViewModal] = useState<{ open: boolean; index: number | null }>({
        open: false,
        index: null,
    });
    const [captionModal, setCaptionModal] = useState<{ open: boolean; index: number | null; draft: string }>(
        { open: false, index: null, draft: "" }
    );

    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => () => abortRef.current?.abort(), []);

    // value -> fileList (solo para el uploader; no se muestra su lista)
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

    const emit = (next: ReportImage[]) => onChange?.(next.slice(0, maxCount));

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

    // Subida (solo procesada)
    const customRequest: UploadProps["customRequest"] = useMemo(() => {
        return async (options) => {
            const { file, onError, onProgress, onSuccess } = options;
            try {
                if (!sampleId) throw new Error("Falta sampleId");
                if (!(file instanceof File)) throw new Error("Archivo inválido");

                onProgress?.({ percent: 20 });
                abortRef.current = new AbortController();

                const resp = (await uploadReportImage(
                    sampleId,
                    file,
                    ""
                )) as UploadImageServerResp;

                onProgress?.({ percent: 90 });

                // Procesada por defecto, miniatura si existe.
                const processed = resp.urls?.processed ?? resp.url;
                const thumb = resp.urls?.thumbnail ?? processed;

                const newItem: ReportImage = {
                    id: resp.id || resp.sample_image_id,
                    url: processed,         // 👈 SIEMPRE procesada
                    thumbnailUrl: thumb,
                    caption: resp.caption ?? "",
                };

                const next = [...(value ?? []), newItem].slice(0, maxCount);
                emit(next);

                // Reflejar en lista interna (aunque no se muestra)
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
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Error al subir imagen.";
                onError?.(err as Error);
                message.error(msg);
            }
        };
    }, [sampleId, value, maxCount]);

    // Eliminar
    const removeAt = async (idx: number) => {
        const item = (value ?? [])[idx];
        if (!item) return;

        if (deleteInBackend && item.id) {
            try {
                await deleteReportImage(sampleId, item.id);
            } catch (e) {
                message.error(
                    e instanceof Error ? e.message : "No se pudo eliminar la imagen en el servidor."
                );
                return;
            }
        }

        const next = (value ?? []).slice();
        next.splice(idx, 1);
        emit(next);
    };

    // Abrir modales
    const openView = (idx: number) => setViewModal({ open: true, index: idx });
    const openCaption = (idx: number) => {
        const current = (value ?? [])[idx];
        setCaptionModal({ open: true, index: idx, draft: current?.caption ?? "" });
    };

    // Guardar descripción desde modal
    const saveCaption = () => {
        if (captionModal.index == null) return;
        const next = (value ?? []).slice();
        next[captionModal.index] = { ...next[captionModal.index], caption: captionModal.draft };
        emit(next);
        setCaptionModal({ open: false, index: null, draft: "" });
    };

    // Seleccionados
    const currentView =
        viewModal.index != null ? (value ?? [])[viewModal.index] ?? null : null;

    const UploadCore = dragAndDrop ? Upload.Dragger : Upload;

    return (
        <div>
            <Space direction="vertical" style={{ width: "100%" }} size="small">
                {label && (
                    <Typography.Text strong style={{ display: "block" }}>
                        {label}
                    </Typography.Text>
                )}

                {/* Uploader sin lista visible */}
                <UploadCore
                    name="file"
                    multiple
                    maxCount={maxCount}
                    fileList={fileList}
                    showUploadList={false}
                    accept={ACCEPT_IMAGES}
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

                {/* Miniaturas (chico) con acciones separadas */}
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

                                {/* Acciones arriba a la derecha: ojo, descripción, borrar */}
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

                                    <Tooltip title="Editar descripción">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<FileTextOutlined />}
                                            onClick={() => openCaption(idx)}
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
                            </div>
                        ))}
                    </div>
                )}
            </Space>

            {/* Modal: SOLO ver la imagen procesada */}
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

            {/* Modal: SOLO editar la descripción */}
            <Modal
                open={captionModal.open}
                title="Descripción de la imagen"
                okText="Guardar"
                cancelText="Cancelar"
                onOk={saveCaption}
                onCancel={() => setCaptionModal({ open: false, index: null, draft: "" })}
                centered
            >
                <Input.TextArea
                    placeholder="Descripción / leyenda"
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    value={captionModal.draft}
                    onChange={(e) =>
                        setCaptionModal((s) => ({ ...s, draft: e.target.value }))
                    }
                    disabled={disabled}
                />
            </Modal>
        </div>
    );
}
