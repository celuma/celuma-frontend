import { useEffect, useMemo, useRef, useState } from "react";
import { message, Image } from "antd";
import type { UploadProps } from "antd/es/upload/interface";
import { deleteReportImage, fetchReportImages, uploadReportImage } from "../../services/report_service";
import { tokens } from "../design/tokens";
import SectionTitle from "../ui/section_title";
import UploadDropzone from "../ui/upload_dropzone";
import ImageGalleryCard from "../ui/image_gallery_card";
import ConfirmDialog from "../ui/confirm_dialog";

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

export default function SampleImagesPicker({ sampleId, selectedIds, onToggleSelect, allowDelete = false }: Props) {
    const [images, setImages] = useState<SampleImageItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
    const [confirmDelete, setConfirmDelete] = useState<SampleImageItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const selectedIdsSet = useMemo(
        () => new Set((selectedIds || []).filter((v): v is string => typeof v === "string" && v.length > 0)),
        [selectedIds]
    );

    const load = useMemo(() => async () => {
        if (!sampleId) return;
        setLoading(true);
        try {
            const list = await fetchReportImages(sampleId);
            setImages(list);
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

    const customRequest: UploadProps["customRequest"] = async (options) => {
        const { file, onError, onProgress, onSuccess } = options;
        if (!(file instanceof File)) return;
        if (!validateFile(file)) {
            onError?.(new Error("Archivo inválido"));
            return;
        }
        const fileName = file.name || "archivo";
        setUploadingFiles((prev) => [...prev, fileName]);
        setUploading(true);
        try {
            if (!sampleId) throw new Error("Falta sampleId");
            onProgress?.({ percent: 20 });
            abortRef.current = new AbortController();
            await uploadReportImage(sampleId, file, "");
            onProgress?.({ percent: 90 });
            onSuccess?.({}, {} as never);
            message.success(`"${fileName}" subida correctamente.`);
            await load();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Error al subir imagen.";
            onError?.(err as Error);
            message.error(`Error al subir "${fileName}": ${msg}`);
        } finally {
            setUploadingFiles((prev) => prev.filter((f) => f !== fileName));
            setUploadingFiles((prev) => {
                if (prev.length === 0) setUploading(false);
                return prev;
            });
        }
    };

    const handleDelete = async (img: SampleImageItem) => {
        setDeleting(true);
        try {
            await deleteReportImage(sampleId, img.id);
            await load();
        } catch (e) {
            message.error(e instanceof Error ? e.message : "No se pudo eliminar la imagen");
        } finally {
            setDeleting(false);
            setConfirmDelete(null);
        }
    };

    return (
        <div>
            <SectionTitle style={{ marginBottom: 4 }}>Galería de la muestra</SectionTitle>
            <div style={{ fontSize: 12.5, color: tokens.textSecondary, marginBottom: 12 }}>
                Marca las imágenes que deseas anexar al reporte. Subir aquí guarda en la muestra.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                <UploadDropzone
                    customRequest={customRequest}
                    accept={ACCEPT_EXTENSIONS}
                    uploading={uploading}
                    uploadingFiles={uploadingFiles}
                    disabled={!sampleId || loading}
                    title="Agregar imágenes"
                    hint="Clic o arrastra"
                    height={170}
                />

                <Image.PreviewGroup>
                    {images.map((img, idx) => (
                        <ImageGalleryCard
                            key={img.id ?? idx}
                            src={img.thumbnailUrl || img.url}
                            previewSrc={img.url}
                            alt={img.caption || `Figura ${idx + 1}`}
                            selectable
                            selected={selectedIdsSet.has(img.id)}
                            onToggleSelect={(sel) => onToggleSelect(img, sel)}
                            onDelete={allowDelete ? () => setConfirmDelete(img) : undefined}
                            deleting={deleting && confirmDelete?.id === img.id}
                        />
                    ))}
                </Image.PreviewGroup>
            </div>

            <ConfirmDialog
                open={confirmDelete !== null}
                danger
                title="Eliminar imagen"
                description="¿Estás seguro de eliminar esta imagen de la muestra? Esta acción no se puede deshacer."
                confirmText="Eliminar"
                cancelText="Cancelar"
                loading={deleting}
                onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}
