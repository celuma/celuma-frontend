import { forwardRef, useState } from "react";
import type { ReactNode, HTMLAttributes } from "react";
import { SettingOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";

/**
 * Shared header for the order-detail right-rail cards (Revisores / Asignados / Etiquetas).
 * Céluma "soft circle" language: tinted icon bubble + Baloo title + optional soft count chip,
 * with a teal borderless config affordance on the right (replaces the generic gray gear).
 */
type RailSectionHeaderProps = {
    icon: ReactNode;
    /** Tinta color for the icon bubble (drawn from the status palette). */
    color: string;
    title: string;
    /** Soft teal count chip shown when > 0. */
    count?: number;
    /** Right-aligned control — typically a <Dropdown> wrapping <RailConfigButton>. */
    trigger?: ReactNode;
};

export function RailSectionHeader({ icon, color, title, count, trigger }: RailSectionHeaderProps) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span
                style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: `${color}1a`,
                    color,
                    border: `2px solid ${color}33`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    flexShrink: 0,
                }}
            >
                {icon}
            </span>
            <span
                style={{
                    flex: 1,
                    fontFamily: tokens.titleFont,
                    fontSize: 15,
                    fontWeight: 700,
                    color: tokens.textPrimary,
                    lineHeight: 1.1,
                }}
            >
                {title}
            </span>
            {typeof count === "number" && count > 0 && (
                <span
                    style={{
                        minWidth: 20,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 999,
                        background: "#eaf7f5",
                        color: tokens.primary,
                        fontSize: 12,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {count}
                </span>
            )}
            {trigger}
        </div>
    );
}

/**
 * Teal borderless icon button used as the <Dropdown> trigger in rail headers.
 * forwardRef so antd's Dropdown can attach its handlers/ref.
 */
type RailConfigButtonProps = { disabled?: boolean } & HTMLAttributes<HTMLButtonElement>;

export const RailConfigButton = forwardRef<HTMLButtonElement, RailConfigButtonProps>(
    function RailConfigButton({ disabled, onMouseEnter, onMouseLeave, ...rest }, ref) {
        const [hover, setHover] = useState(false);
        return (
            <button
                ref={ref}
                type="button"
                aria-label="Configurar"
                disabled={disabled}
                {...rest}
                onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
                onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
                style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    border: "none",
                    background: hover && !disabled ? "#eaf7f5" : "transparent",
                    color: disabled ? "#cbd5e1" : tokens.primary,
                    cursor: disabled ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    transition: "background .15s ease",
                    flexShrink: 0,
                    padding: 0,
                }}
            >
                <SettingOutlined />
            </button>
        );
    }
);
