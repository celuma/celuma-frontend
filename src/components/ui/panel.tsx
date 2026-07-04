import React from "react";

type Props = {
    children: React.ReactNode;
    style?: React.CSSProperties;
};

/**
 * Panel — a neutral bordered container for grouping content inside forms and
 * cards (e.g. a settings row with a toggle). It matches the form fields' 2px
 * border width and 12px radius so it sits consistently among inputs, with a
 * soft neutral fill. Pass layout props (display, etc.) via `style`.
 */
export default function Panel({ children, style }: Props) {
    return (
        <div
            style={{
                border: "2px solid #e5e7eb",
                borderRadius: 12,
                background: "#fafbfc",
                padding: "14px 16px",
                ...style,
            }}
        >
            {children}
        </div>
    );
}
