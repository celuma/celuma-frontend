import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExclamationCircleFilled } from "@ant-design/icons";
import Button from "./button";
import { tokens } from "../design/tokens";

type Props = {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    /** Red accent + solid red confirm button for destructive actions. */
    danger?: boolean;
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

/**
 * ConfirmDialog — a Céluma-styled confirmation dialog (replaces antd Popconfirm).
 * Centered modal card with a soft tinted icon badge, Baloo title, and the
 * Céluma button system in the footer. Closes on overlay click or Escape.
 */
export default function ConfirmDialog({
    open,
    title,
    description,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    danger = false,
    loading = false,
    onConfirm,
    onCancel,
}: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onCancel(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, loading, onCancel]);

    if (!open) return null;

    const accent = danger ? "#e5484d" : tokens.primary;
    const tint = danger ? "#fff0f1" : "#eaf7f5";

    return createPortal(
        <div
            onClick={() => { if (!loading) onCancel(); }}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1100,
                background: "rgba(13,27,42,.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                animation: "cd-fade .15s ease-out",
            }}
        >
            <style>{`
                @keyframes cd-fade { from { opacity: 0; } to { opacity: 1; } }
                @keyframes cd-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
            `}</style>
            <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#fff",
                    borderRadius: 16,
                    boxShadow: "0 20px 60px rgba(13,27,42,.25)",
                    maxWidth: 440,
                    width: "100%",
                    padding: 24,
                    fontFamily: tokens.textFont,
                    animation: "cd-pop .18s ease-out",
                }}
            >
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: tint,
                        color: accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        flexShrink: 0,
                    }}>
                        <ExclamationCircleFilled />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontFamily: tokens.titleFont, fontSize: 18, fontWeight: 700, color: tokens.textPrimary }}>
                            {title}
                        </h3>
                        {description && (
                            <p style={{ margin: "6px 0 0", fontSize: 14, color: tokens.textSecondary, lineHeight: 1.5 }}>
                                {description}
                            </p>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 22 }}>
                    <Button size="xsmall" onClick={onCancel} disabled={loading}>{cancelText}</Button>
                    <Button size="xsmall" type="primary" danger={danger} loading={loading} onClick={onConfirm}>{confirmText}</Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
