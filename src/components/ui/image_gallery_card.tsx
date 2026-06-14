import { useEffect } from "react";
import { Image } from "antd";
import { DeleteOutlined, LoadingOutlined } from "@ant-design/icons";
import Panel from "./panel";
import ActionButtonPanel from "./action_button_panel";

type Props = {
    /** Thumbnail/displayed source. */
    src: string;
    /** Full-resolution source used for the lightbox preview (falls back to `src`). */
    previewSrc?: string;
    alt?: string;
    /** Upload date — rendered in the footer (es-MX short date). */
    date?: string | number | Date | null;
    /** Shows a soft "Principal" chip over the image. */
    isPrimary?: boolean;
    /** Card height in px (the image fills the whole card). */
    imageHeight?: number;
    /** Spinner on the delete button while the deletion is in flight. */
    deleting?: boolean;
    /** Disables the delete button (e.g. while another deletion runs). */
    deleteDisabled?: boolean;
    /** When provided, renders the xsmall delete action floating over the image. */
    onDelete?: () => void;
};

/**
 * ImageGalleryCard — a Céluma `Panel` filled edge-to-edge by a single gallery
 * image, with a frosted date chip and an `ActionButtonPanel` (xsmall) delete
 * action floating over it. Presentational and 100% reusable: drop it into any
 * grid (sample detail, report editor, …). It auto-registers with a surrounding
 * antd `<Image.PreviewGroup>` so clicking opens the shared lightbox.
 */
export default function ImageGalleryCard({
    src,
    previewSrc,
    alt,
    date,
    isPrimary,
    imageHeight = 170,
    deleting,
    deleteDisabled,
    onDelete,
}: Props) {
    const dateText = date ? new Date(date).toLocaleDateString("es-MX") : null;

    // Preload the full-res preview source so opening the lightbox is instant — without
    // it antd briefly shows the previously-opened image while the new one downloads.
    useEffect(() => {
        const full = previewSrc || src;
        if (!full) return;
        const img = new window.Image();
        img.src = full;
    }, [previewSrc, src]);

    return (
        <Panel style={{ padding: 0, overflow: "hidden", position: "relative", height: imageHeight, background: "#f1f5f9" }}>
            <Image
                src={src}
                alt={alt}
                fallback={previewSrc || src}
                preview={{ src: previewSrc || src }}
                wrapperStyle={{ width: "100%", height: "100%", display: "block" }}
                style={{ width: "100%", height: imageHeight, objectFit: "cover", cursor: "pointer", display: "block" }}
            />

            {isPrimary && (
                <span
                    style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        background: "#ecfdf5",
                        color: "#10b981",
                        border: "1px solid #10b98133",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        lineHeight: 1.5,
                    }}
                >
                    Principal
                </span>
            )}

            {/* Floating date — salmon (secondary) chip, slightly transparent, matching
                the sample-code / header chips. */}
            {dateText && (
                <span
                    style={{
                        position: "absolute",
                        left: 8,
                        bottom: 8,
                        zIndex: 2,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "rgba(249, 141, 132, 0.88)",
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: 11,
                        lineHeight: 1.5,
                        boxShadow: "0 1px 2px rgba(0,0,0,.12)",
                    }}
                >
                    {dateText}
                </span>
            )}

            {/* Floating delete — bottom-right, its own white pill (ActionButtonPanel)
                reads over any image. */}
            {onDelete && (
                <div style={{ position: "absolute", bottom: 8, right: 8, zIndex: 2 }}>
                    <ActionButtonPanel
                        size="xxsmall"
                        actions={[
                            {
                                icon: deleting ? <LoadingOutlined spin /> : <DeleteOutlined />,
                                tooltip: "Eliminar",
                                ariaLabel: "Eliminar imagen",
                                danger: true,
                                disabled: deleteDisabled || deleting,
                                onClick: onDelete,
                            },
                        ]}
                    />
                </div>
            )}
        </Panel>
    );
}
