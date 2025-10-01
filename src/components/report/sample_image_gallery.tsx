import { useMemo, useState } from "react";
import { Button, Tooltip, Image } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import type { ReactNode, MouseEvent, KeyboardEvent } from "react";
import type { SampleImage } from "../../models/sample_image";

type Props = {
    images: SampleImage[];
    renderFooter?: (image: SampleImage, index: number) => ReactNode;
    renderActions?: (image: SampleImage, index: number) => ReactNode;
    imageHeight?: number;
    columns?: number;
    minColumnWidth?: number;
    gap?: number;
    enablePreview?: boolean;
    previewTitle?: (image: SampleImage, index: number) => ReactNode;
};

export default function SampleImageGallery({
    images,
    renderFooter,
    renderActions,
    imageHeight = 110,
    columns,
    minColumnWidth = 160,
    gap = 12,
    enablePreview = true,
    previewTitle,
}: Props) {
    const [preview, setPreview] = useState<{ visible: boolean; index: number }>({ visible: false, index: 0 });

    const previewImages = useMemo(() => images.map((img) => img.url), [images]);

    if (!images || images.length === 0) return null;

    const gridStyle: React.CSSProperties = columns
        ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
        : { gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))` };

    const openPreview = (index: number) => {
        if (!enablePreview) return;
        setPreview({ visible: true, index });
    };

    return (
        <div style={{ position: "relative" }}>
            <div
                style={{
                    display: "grid",
                    gap,
                    ...gridStyle,
                }}
            >
                {images.map((img, idx) => (
                    <div
                        key={img.id || `img-${idx}`}
                        style={{
                            position: "relative",
                            width: "100%",
                            borderRadius: 6,
                            overflow: "hidden",
                            border: "1px solid #f0f0f0",
                            background: "#fafafa",
                            cursor: enablePreview ? "pointer" : "default",
                            transition: enablePreview ? "transform 0.15s ease" : undefined,
                        }}
                        onClick={() => openPreview(idx)}
                        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                            if (!enablePreview) return;
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openPreview(idx);
                            }
                        }}
                        role={enablePreview ? "button" : undefined}
                        tabIndex={enablePreview ? 0 : undefined}
                    >
                        <div style={{ position: "relative", width: "100%", height: imageHeight }}>
                            <img
                                src={img.thumbnailUrl || img.url}
                                alt={img.caption || img.label || `Figura ${idx + 1}`}
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                        </div>

                        {(enablePreview || renderActions) && (
                            <div
                                style={{
                                    position: "absolute",
                                    top: 4,
                                    right: 4,
                                    display: "flex",
                                    gap: 4,
                                    cursor: "auto",
                                }}
                                onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                            >
                                {enablePreview && (
                                    <Tooltip title="Ver imagen">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<EyeOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openPreview(idx);
                                            }}
                                        />
                                    </Tooltip>
                                )}
                                {renderActions?.(img, idx)}
                            </div>
                        )}

                        {renderFooter && (
                            <div
                                style={{ padding: "8px 8px 12px", cursor: "auto" }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {renderFooter(img, idx)}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {enablePreview && (
                <Image.PreviewGroup
                    preview={{
                        visible: preview.visible,
                        current: preview.index,
                        onVisibleChange: (visible, current) => {
                            setPreview({ visible, index: typeof current === "number" ? current : 0 });
                        },
                        title: previewTitle ? previewTitle(images[preview.index], preview.index) : undefined,
                    }}
                >
                    {previewImages.map((url, idx) => (
                        <Image key={`preview-${idx}`} src={url} style={{ display: "none" }} />
                    ))}
                </Image.PreviewGroup>
            )}
        </div>
    );
}
