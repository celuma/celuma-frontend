// src/components/report/report_images.tsx
import React, { useMemo, useState } from "react";
import { Upload, Button, Input, Space, message, Popconfirm } from "antd";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { uploadReportImage } from "../../services/report_service";

export type ReportImage = {
    url: string;
    caption?: string;
};

type Props = {
    sampleId: string;
    value?: ReportImage[];
    onChange?: (v: ReportImage[]) => void;
    disabled?: boolean;
};

const styles = `
.report-images-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.report-image-card {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.report-image-card img {
  display: block;
  width: 100%;
  height: 220px;
  object-fit: contain;
  background: #fafafa;
}
.report-image-card .meta {
  padding: 8px 10px 10px;
}
.report-image-card .meta .caption-input {
  width: 100%;
}
@media (max-width: 920px) {
  .report-images-grid { grid-template-columns: 1fr; }
}
`;

const ReportImages: React.FC<Props> = ({ sampleId, value, onChange, disabled }) => {
    const [uploading, setUploading] = useState(false);
    const images = value ?? [];

    const fileList: UploadFile[] = useMemo(
        () =>
            images.map((img, idx) => ({
                uid: `${idx}`,
                name: img.caption || `imagen_${idx + 1}`,
                status: "done",
                url: img.url,
            })),
        [images]
    );

    const handleAdd = async (file: File) => {
        if (!sampleId) {
            message.warning("Falta el Sample ID para asociar la imagen.");
            return;
        }
        setUploading(true);
        try {
            const { url } = await uploadReportImage(sampleId, file);
            onChange?.([...(value ?? []), { url, caption: "" }]);
            message.success("Imagen subida");
        } catch (e) {
            console.error(e);
            message.error("No se pudo subir la imagen");
        } finally {
            setUploading(false);
        }
    };

    const uploadProps: UploadProps = {
        showUploadList: false,
        multiple: true,
        beforeUpload: () => false,
        customRequest: async (options) => {
            const f = options.file as File;
            await handleAdd(f);
            options.onSuccess?.({}, new XMLHttpRequest());
        },
        disabled: disabled || uploading,
        fileList,
    };

    const updateCaption = (idx: number, caption: string) => {
        const next = images.map((img, i) => (i === idx ? { ...img, caption } : img));
        onChange?.(next);
    };

    const removeOne = (idx: number) => {
        const next = images.filter((_, i) => i !== idx);
        onChange?.(next);
    };

    return (
        <>
            <style>{styles}</style>

            <Upload {...uploadProps}>
                <Button icon={<PlusOutlined />} disabled={disabled || uploading}>
                    Agregar imagen
                </Button>
            </Upload>

            <div style={{ height: 8 }} />

            <div className="report-images-grid">
                {images.map((img, idx) => (
                    <div className="report-image-card" key={img.url + idx}>
                        <img src={img.url} alt={img.caption || `Figura ${idx + 1}`} />
                        <div className="meta">
                            <Space.Compact style={{ width: "100%" }}>
                                <Input
                                    className="caption-input"
                                    placeholder={`Figura ${idx + 1} — descripción`}
                                    value={img.caption}
                                    onChange={(e) => updateCaption(idx, e.target.value)}
                                />
                                <Popconfirm
                                    title="Eliminar imagen"
                                    onConfirm={() => removeOne(idx)}
                                    okText="Sí"
                                    cancelText="No"
                                >
                                    <Button danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            </Space.Compact>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
};

export default ReportImages;
