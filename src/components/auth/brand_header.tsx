import { Typography } from "antd";
import celuma from "../../images/celuma-isotipo.png";
import { pageTitleStyle } from "../design/tokens";

const { Title } = Typography;

type Props = {
    title?: string;
    logoSrc?: string;
};

export default function BrandHeader({title = "Céluma", logoSrc = celuma,}: Props) {
    const styles = {
        brand: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "20px",
            position: "relative" as const,
        },
        logoWrap: {
            position: "relative" as const,
            width: "60px",
            height: "auto",
            display: "inline-block",
        },
        logo: {
            width: "100%",
            height: "auto",
            objectFit: "contain" as const,
            display: "block",
        },
    };

    return (
        <div style={styles.brand}>
            <div style={styles.logoWrap}>
                <img src={logoSrc} alt="Logo" style={styles.logo} />
            </div>
            <Title level={2} style={{ ...pageTitleStyle, margin: 0, fontSize: 36 }}>{title}</Title>
        </div>
    );
}
