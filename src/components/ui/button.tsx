import React from "react";
import { Button as AntButton } from "antd";
import type { ButtonProps } from "antd";

type Props = ButtonProps & {
    fullWidth?: boolean;
};

export default function Button({ fullWidth, style, ...rest }: Props) {
    const base: React.CSSProperties = {
        height: 44,
        fontSize: 16,
        fontWeight: 700,
        borderRadius: 999,
        textTransform: "none",
        transition: "background .2s, transform .05s",
        padding: "0 28px",
        width: fullWidth ? "100%" : "auto",
        display: "block",
        margin: "20px auto 0 auto",
    };
    const primaryColors = {
        base: "#0f8b8d",
        hover: "#0c6f71",
        active: "#0a5557",
        disabled: "#9fb8bb",
    };

    return (
        <AntButton
            {...rest}
            style={{
                ...base,
                ...(rest.type === "primary"
                    ? {
                        backgroundColor: rest.disabled ? primaryColors.disabled : primaryColors.base,
                        borderColor: rest.disabled ? primaryColors.disabled : primaryColors.base,
                        color: "#fff",
                        cursor: rest.disabled ? "not-allowed" : "pointer",
                    }
                    : {}),
                ...style,
            }}
            onMouseEnter={(e) => {
                if (!rest.disabled && rest.type === "primary") {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = primaryColors.hover;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = primaryColors.hover;
                }
                rest.onMouseEnter?.(e);
            }}
            onMouseLeave={(e) => {
                if (!rest.disabled && rest.type === "primary") {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = primaryColors.base;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = primaryColors.base;
                }
                rest.onMouseLeave?.(e);
            }}
            onMouseDown={(e) => {
                if (!rest.disabled && rest.type === "primary") {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = primaryColors.active;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = primaryColors.active;
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)";
                }
                rest.onMouseDown?.(e);
            }}
            onMouseUp={(e) => {
                if (!rest.disabled && rest.type === "primary") {
                    (e.currentTarget as HTMLButtonElement).style.transform = "none";
                }
                rest.onMouseUp?.(e);
            }}
        />
    );
}
