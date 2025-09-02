import celuma from "../../images/celuma-isotipo.png";

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
            gap: "-4px",
            marginBottom: "28px",
            position: "relative" as const,
        },
        logoWrap: {
            position: "relative" as const,
            width: "100px",
            height: "auto",
            display: "inline-block",
        },
        logo: {
            width: "100%",
            height: "auto",
            objectFit: "contain" as const,
            display: "block",
        },
        brandName: {
            fontSize: "56px",
            fontWeight: 900,
            color: "#0d1b2a",
            margin: 0,
            lineHeight: 1,
        },
    };

    return (
        <div style={styles.brand}>
            <div style={styles.logoWrap}>
                <img src={logoSrc} alt="Logo" style={styles.logo} />
            </div>
            <h1 style={styles.brandName}>{title}</h1>
        </div>
    );
}
