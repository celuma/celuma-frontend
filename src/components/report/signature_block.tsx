import { useState, type CSSProperties } from "react";
import type { ResolvedSignatureMetadata } from "../../models/report";

export interface SignatureBlockSigner {
    full_name: string;
}

interface SignatureBlockProps {
    signatureMetadata: ResolvedSignatureMetadata | null | undefined;
    signedBy?: SignatureBlockSigner | null;
    /** ISO 8601 timestamp from ReportVersion.signed_at */
    signedAt?: string | null;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

function formatSignedDate(iso?: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return DATE_FORMATTER.format(date).replace(/\./g, "");
}

const containerStyle: CSSProperties = {
    marginTop: 36,
    paddingTop: 8,
    breakInside: "avoid",
    pageBreakInside: "avoid",
};

const lineStyle: CSSProperties = {
    height: 0,
    borderTop: "1px solid #000",
    margin: "0 auto 6px auto",
    width: "60%",
};

const captionStyle: CSSProperties = {
    fontSize: "10pt",
    fontWeight: 600,
    color: "#000",
    textAlign: "center",
    lineHeight: 1.3,
};

const subCaptionStyle: CSSProperties = {
    fontSize: "9pt",
    fontWeight: 400,
    color: "#444",
    marginTop: 2,
    textAlign: "center",
};

const imageWrapStyle: CSSProperties = {
    height: 70,
    width: "60%",
    margin: "0 auto",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
};

const imageStyle: CSSProperties = {
    maxHeight: "100%",
    maxWidth: "100%",
    objectFit: "contain",
};

/**
 * Renders the signature block at the end of a report (preview + PDF).
 *
 * The signed state is derived from the presence of `signedAt`. Cases:
 *   - signatureMetadata.show_signature_section === false → renders nothing
 *   - show && !signed                                    → line + signer name (pending)
 *   - show && signed && !require_digital_signature       → line + name + signed date
 *   - show && signed && require_digital_signature        → PNG image + line + name + signed date
 *
 * If the PNG fails to load (broken / expired URL), falls back gracefully to the
 * non-digital signed layout so the document still prints meaningfully.
 */
const SignatureBlock: React.FC<SignatureBlockProps> = ({
    signatureMetadata,
    signedBy,
    signedAt,
}) => {
    const [imageFailed, setImageFailed] = useState(false);

    if (!signatureMetadata?.show_signature_section) return null;

    const isSigned = Boolean(signedAt);
    const showImage = Boolean(
        signatureMetadata.require_digital_signature
        && isSigned
        && signatureMetadata.signature_url
        && !imageFailed,
    );

    const formattedDate = formatSignedDate(signedAt);
    const signerName = signedBy?.full_name?.trim() || (isSigned ? "Firmante" : "");

    return (
        <div style={containerStyle}>
            {showImage && signatureMetadata.signature_url && (
                <div style={imageWrapStyle}>
                    <img
                        src={signatureMetadata.signature_url}
                        alt="Firma digital del revisor"
                        style={imageStyle}
                        onError={() => setImageFailed(true)}
                    />
                </div>
            )}
            <div style={lineStyle} />
            <div style={captionStyle}>
                {signerName ? signerName : (
                    <span style={{ color: "#666", fontWeight: 400 }}>Pendiente de firma</span>
                )}
            </div>
            {isSigned && formattedDate && (
                <div style={subCaptionStyle}>
                    Firmado{signatureMetadata.require_digital_signature ? " digitalmente" : ""} el {formattedDate}
                </div>
            )}
        </div>
    );
};

export default SignatureBlock;
