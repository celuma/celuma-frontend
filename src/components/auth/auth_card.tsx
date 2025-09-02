import { tokens } from "../design/tokens";

export default function AuthCard({children, header, footer, maxWidth = 480,}: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode; maxWidth?: number }) {
    return (
        <div style = {{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: tokens.bg,
            fontFamily: tokens.textFont,
        }}>
            <div style = {{
                width: "100%",
                maxWidth,
                background: tokens.cardBg,
                borderRadius: tokens.radius,
                boxShadow: tokens.shadow,
                padding: 28,
                display: "grid",
                gap: tokens.gap,
            }}>
                {header && <div>{header}</div>}
                <div style = {{ display: "grid", gap: tokens.gap }}>{children}</div>
                {footer && <div>{footer}</div>}
            </div>
        </div>
    );
}
