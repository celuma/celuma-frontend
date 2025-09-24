import { Button, Tooltip } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import type { SampleImage } from "../../models/sample_image";

type Props = {
    images: SampleImage[];
    onView?: (image: SampleImage, index: number) => void;
    renderFooter?: (image: SampleImage, index: number) => ReactNode;
    renderActions?: (image: SampleImage, index: number) => ReactNode;
    imageHeight?: number;
    columns?: number;
    minColumnWidth?: number;
    gap?: number;
};

export default function SampleImageGallery({
    images,
    onView,
    renderFooter,
    renderActions,
    imageHeight = 110,
    columns,
    minColumnWidth = 160,
    gap = 12,
}: Props) {
    if (!images || images.length === 0) return null;

    const gridStyle: React.CSSProperties = columns
        ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
        : { gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))` };

    return (
        <div
            style={{
                display: "grid",
                gap,
                ...gridStyle,
            }}
        >
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
                    }}
                >
                    <img
                        src={img.thumbnailUrl || img.url}
                        alt={img.caption || img.label || `Figura ${idx + 1}`}
                        style={{ width: "100%", height: imageHeight, objectFit: "cover", display: "block" }}
                    />

                    {(onView || renderActions) && (
                        <div
                            style={{
                                position: "absolute",
                                top: 4,
                                right: 4,
                                display: "flex",
                                gap: 4,
                            }}
                        >
                            {onView && (
                                <Tooltip title="Ver imagen">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<EyeOutlined />}
                                        onClick={() => onView(img, idx)}
                                    />
                                </Tooltip>
                            )}
                            {renderActions?.(img, idx)}
                        </div>
                    )}

                    {renderFooter && (
                        <div style={{ padding: "8px 8px 12px" }}>
                            {renderFooter(img, idx)}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
