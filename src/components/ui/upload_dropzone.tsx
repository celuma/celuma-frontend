import { useRef, useState } from "react";
import { Upload, Spin, Typography } from "antd";
import type { UploadProps } from "antd";
import { PlusOutlined, LoadingOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";

type Props = {
    /** rc-upload custom request — receives the file and handles the upload. */
    customRequest: UploadProps["customRequest"];
    /** Allow selecting/dropping multiple files (default true). */
    multiple?: boolean;
    /** Accepted file types (e.g. "image/*"). */
    accept?: string;
    /** Whether an upload is currently in flight (swaps the tile to a spinner). */
    uploading?: boolean;
    /** Names of files currently uploading — shown under the spinner. */
    uploadingFiles?: string[];
    /** Tile height in px. */
    height?: number;
    /** Idle title (default "Agregar"). */
    title?: string;
    /** Idle hint under the title (default "Clic o arrastra"). */
    hint?: string;
    disabled?: boolean;
};

/**
 * UploadDropzone — a Céluma dashed-border drop tile built on antd
 * `Upload.Dragger`. Manages its own drag state and animates on drag-over
 * (teal dashed border + soft tint + focus ring + subtle scale). Swaps to a
 * Céluma spinner with file names while uploading. 100% reusable — used by the
 * sample gallery today and the report editor next.
 */
export default function UploadDropzone({
    customRequest,
    multiple = true,
    accept,
    uploading = false,
    uploadingFiles = [],
    height = 160,
    title = "Agregar",
    hint = "Clic o arrastra",
    disabled,
}: Props) {
    const [isDragging, setIsDragging] = useState(false);
    // Depth counter: dragenter/dragleave fire for every child the cursor crosses,
    // so a simple boolean flickers. Counting keeps the tile active while the file
    // is held anywhere inside it, and only clears when it truly leaves.
    const dragDepth = useRef(0);

    const resetDrag = () => {
        dragDepth.current = 0;
        setIsDragging(false);
    };

    const uploadProps: UploadProps = {
        name: "file",
        multiple,
        accept,
        showUploadList: false,
        customRequest,
        disabled,
        onDrop: resetDrag,
    };

    return (
        <div
            onDragEnter={() => {
                dragDepth.current += 1;
                setIsDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => {
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) resetDrag();
            }}
            onDrop={resetDrag}
            style={{ height: "100%" }}
        >
            <Upload.Dragger
                {...uploadProps}
                style={{
                    borderRadius: tokens.radius,
                    border: isDragging ? `2px dashed ${tokens.primary}` : "2px dashed #e5e7eb",
                    background: isDragging ? "#eaf7f5" : "#fafbfc",
                    boxShadow: isDragging ? `0 0 0 4px ${tokens.primary}1a` : "none",
                    padding: 12,
                    height,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    color: isDragging ? tokens.primary : tokens.textSecondary,
                    transition: "border-color .2s ease, background .2s ease, box-shadow .2s ease, transform .2s ease",
                    transform: isDragging ? "scale(1.02)" : "scale(1)",
                }}
            >
                {uploading ? (
                    <>
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: tokens.primary }} spin />} />
                        <Typography.Text strong style={{ marginTop: 8 }}>
                            Subiendo {uploadingFiles.length > 0 ? `(${uploadingFiles.length})` : "..."}
                        </Typography.Text>
                        {uploadingFiles.length > 0 && (
                            <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", textAlign: "center", fontSize: 11 }}>
                                {uploadingFiles.slice(0, 2).join(", ")}
                                {uploadingFiles.length > 2 ? ` y ${uploadingFiles.length - 2} más` : ""}
                            </Typography.Paragraph>
                        )}
                    </>
                ) : (
                    <>
                        <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                        <Typography.Text strong style={{ color: isDragging ? tokens.primary : tokens.textPrimary }}>
                            {isDragging ? "Suelta aquí" : title}
                        </Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", textAlign: "center", fontSize: 12 }}>
                            {isDragging ? "Suelta para subir" : hint}
                        </Typography.Paragraph>
                    </>
                )}
            </Upload.Dragger>
        </div>
    );
}
