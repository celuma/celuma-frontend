import React, { useState } from "react";
import { SearchOutlined, CloseCircleFilled } from "@ant-design/icons";

type Props = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** Compact height that lines up with `size="small"` buttons. */
    small?: boolean;
    style?: React.CSSProperties;
};

/**
 * SearchField — a search input that matches the Céluma text-field look: the
 * same 2px teal outline, 12px radius and focus ring as FloatingCaptionInput,
 * with a teal search icon and a clear button. Reusable across list/detail views.
 * Use `small` to match the compact `size="small"` buttons.
 */
export default function SearchField({ value, onChange, placeholder = "Buscar", small = false, style }: Props) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const colors = {
        base: "#49b6ad",
        baseHover: "#3da8a0",
        ring: "rgba(73,182,173,.20)",
        text: "#0d1b2a",
        placeholder: "#6b7280",
        clear: "#94a3b8",
        clearHover: "#64748b",
    };
    const active = hovered || focused;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: small ? 38 : 48,
                padding: small ? "0 12px" : "0 14px",
                border: `2px solid ${active ? colors.baseHover : colors.base}`,
                borderRadius: small ? 10 : 12,
                background: "#fff",
                boxShadow: active ? `0 0 0 3px ${colors.ring}` : "none",
                transition: "border-color .2s, box-shadow .2s",
                ...style,
            }}
        >
            <SearchOutlined style={{ color: colors.base, fontSize: small ? 14 : 16, flexShrink: 0 }} />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                style={{
                    flex: 1,
                    minWidth: 0,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: small ? 14 : 15,
                    color: colors.text,
                    fontFamily: "inherit",
                    height: "100%",
                }}
            />
            {value && (
                <button
                    type="button"
                    aria-label="Limpiar"
                    onClick={() => onChange("")}
                    style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: colors.clear,
                        display: "flex",
                        alignItems: "center",
                        padding: 0,
                        fontSize: 15,
                        flexShrink: 0,
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = colors.clearHover)}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = colors.clear)}
                >
                    <CloseCircleFilled />
                </button>
            )}
        </div>
    );
}
