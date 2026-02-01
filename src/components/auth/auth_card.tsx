import { Card } from "antd";
import { tokens, cardStyle } from "../design/tokens";

export default function AuthCard({children, header, footer, maxWidth = 480,}: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode; maxWidth?: number }) {
    return (
        <div style = {{
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: tokens.bg,
            fontFamily: tokens.textFont,
        }}>
            <Card 
                style = {{
                    ...cardStyle,
                    width: "100%",
                    maxWidth,
                }}
                bodyStyle = {{
                    padding: tokens.cardPadding,
                    display: "grid",
                    gap: tokens.gap,
                }}
            >
                {header && <div>{header}</div>}
                <div style = {{ display: "grid", gap: tokens.gap }}>{children}</div>
                {footer && <div>{footer}</div>}
            </Card>
        </div>
    );
}
