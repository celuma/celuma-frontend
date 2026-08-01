import { useEffect, useRef, forwardRef, useImperativeHandle, type CSSProperties } from "react";
import type { ReportEnvelope, ReportSectionText, TemplateImageItem, TemplateOrderInput } from "../../../models/report";
import { normalizeReportTemplateJSON, resolveDisplayOrder, resolveSignatureMetadata } from "../../../models/report";
import { markdownTableToHtml } from "../table_utils";
import SignatureBlock, { type SignatureBlockSigner } from "../signature_block";
import type { ReportRendererRef, SignerLookupEntry } from "../legacy/legacy_report_types";
import { extractRenderingSnapshot } from "./report_snapshot_validation";
import {
    DEFAULT_FOOTER_TEXT,
    DEFAULT_INSTITUTION_NAME,
    DEFAULT_NEUTRAL_LOGO_SRC,
} from "./default_report_presentation_v2";

/**
 * VersionedReportRendererV2 (Céluma 1.3 Fase 2, Bloque C, Historia C4).
 *
 * Renders reports with `schema_version = 2` using EXCLUSIVELY
 * `report.report.rendering_snapshot` as the source of presentation/branding
 * (paper, margins, header, footer, color, institutional signer) — never a
 * live Tenant/Branch/ReportTemplateVersion query. See
 * phase-2-block-b-architecture-decision.md and
 * versioned-renderer-v2-contract.md for the full contract.
 *
 * Pagination is a deliberate, documented DUPLICATION of
 * LegacyReportRendererV1's fits()/makePage() algorithm, adapted to
 * configurable margins and optional header/footer bands — Legacy is frozen
 * and must never be touched or share code with this renderer (see
 * legacy-renderer-contract.md and Céluma1.3-Fase2.md §6.2).
 */

// Page layout constants (Letter, PORTRAIT only in this block — same physical
// page as Legacy; A4/landscape are explicitly out of scope).
const PX_TO_MM = 0.264583;
const PAGE_W_MM = 215.9;
const PAGE_H_MM = 279.4;
const CM_TO_MM = 10;
// Fixed band heights for header/footer content when enabled. Margins from
// the snapshot control the GAP between these bands and the page edge / body
// content, not the bands' own height — see versioned-renderer-v2-contract.md
// "Interpretación de márgenes".
const HEADER_BAND_MM = 24;
const FOOTER_BAND_MM = 16;
const BAND_GAP_MM = 4;

// Same concept as Legacy's PREDEFINED_BASE_KEYS — duplicated deliberately
// (see module docstring) rather than imported from legacy/, to keep V2
// fully independent of the legacy module.
const PREDEFINED_BASE_KEYS = new Set(["order_code", "patient", "study_type", "patient_age", "requesting_physician"]);

// Segunda remediación post-Fase 2 (UX) — paridad Legacy. Todos los campos
// que consumen estos helpers son opcionales/aditivos en el snapshot; los
// defaults reproducen exactamente el comportamiento previo (línea única de
// 1px en el color primario, Arial, tamaños fijos, logo a la izquierda,
// contenido centrado).
type DividerLike = {
    enabled: boolean;
    style: "SINGLE" | "DOUBLE";
    primary_width_px: number;
    secondary_width_px: number;
    gap_mm: number;
    color?: string | null;
} | undefined;

const DEFAULT_DIVIDER: NonNullable<DividerLike> = {
    enabled: true,
    style: "SINGLE",
    primary_width_px: 1,
    secondary_width_px: 1,
    gap_mm: 1,
    color: null,
};

function buildDividerElement(divider: DividerLike, primaryColor: string, edge: "bottom" | "top"): HTMLElement | null {
    const cfg = divider ?? DEFAULT_DIVIDER;
    if (!cfg.enabled) return null;
    const color = cfg.color || primaryColor;
    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.left = "0";
    wrapper.style.right = "0";
    wrapper.style[edge] = "0";
    const line1 = document.createElement("div");
    line1.style.borderTop = `${cfg.primary_width_px}px solid ${color}`;
    wrapper.appendChild(line1);
    if (cfg.style === "DOUBLE") {
        const gap = document.createElement("div");
        gap.style.height = `${cfg.gap_mm}mm`;
        wrapper.appendChild(gap);
        const line2 = document.createElement("div");
        line2.style.borderTop = `${cfg.secondary_width_px}px solid ${color}`;
        wrapper.appendChild(line2);
    }
    return wrapper;
}

function fontFamilyCss(family: string | undefined): string {
    switch (family) {
        case "HELVETICA":
            return "Helvetica, Arial, sans-serif";
        case "TIMES":
            return "'Times New Roman', Times, serif";
        case "CALIBRI":
            return "Calibri, Arial, sans-serif";
        case "ARIAL":
        default:
            return "Arial, sans-serif";
    }
}

const DEFAULT_TYPOGRAPHY = {
    font_family: "ARIAL" as const,
    base_font_size_pt: 10,
    header_font_size_pt: 10,
    footer_font_size_pt: 7,
};

function alignItemsForHeaderAlignment(alignment: string | undefined): string {
    if (alignment === "TOP") return "flex-start";
    if (alignment === "BOTTOM") return "flex-end";
    return "center";
}

function justifyContentForAlignment(alignment: string | undefined): string {
    if (alignment === "LEFT") return "flex-start";
    if (alignment === "RIGHT") return "flex-end";
    return "center";
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

interface VersionedReportRendererV2Props {
    report: ReportEnvelope;
    /** Candidates the signature block can use to resolve `report.signed_by`. */
    signerLookup?: SignerLookupEntry[];
    style?: CSSProperties;
}

export type VersionedReportRendererV2Ref = ReportRendererRef;

const VersionedReportRendererV2 = forwardRef<VersionedReportRendererV2Ref, VersionedReportRendererV2Props>(
    ({ report, style, signerLookup }, ref) => {
        const previewHostRef = useRef<HTMLDivElement>(null);
        const hiddenSourceRef = useRef<HTMLDivElement>(null);

        useImperativeHandle(ref, () => ({
            getPages: () => {
                if (!previewHostRef.current) return [];
                return Array.from(previewHostRef.current.children).filter(
                    (el) => el instanceof HTMLElement,
                ) as HTMLElement[];
            },
        }), []);

        // Validated once per render; the effect below closes over this
        // render's result. A missing/invalid snapshot never throws — it
        // just leaves previewHostRef empty (getPages() returns []) and the
        // component renders a controlled fallback below.
        const validation = extractRenderingSnapshot(report.report);

        useEffect(() => {
            const host = previewHostRef.current;
            if (!host) return;
            host.innerHTML = "";
            // Recomputed here (not taken from the outer `validation` const)
            // so this effect's dependency array can stay [report,
            // signerLookup] — same stability as LegacyReportRendererV1 —
            // instead of depending on a freshly-allocated object every render.
            const effectValidation = extractRenderingSnapshot(report.report);
            if (!effectValidation.valid) return;

            const sourceInDOM = hiddenSourceRef.current?.querySelector("#reporte-content-v2") as HTMLElement | null;
            if (!sourceInDOM) return;

            const { presentation } = effectValidation.snapshot;
            const marginTopMm = presentation.paper.margins_cm.top * CM_TO_MM;
            const marginRightMm = presentation.paper.margins_cm.right * CM_TO_MM;
            const marginBottomMm = presentation.paper.margins_cm.bottom * CM_TO_MM;
            const marginLeftMm = presentation.paper.margins_cm.left * CM_TO_MM;

            const headerEnabled = presentation.header.enabled;
            const footerEnabled = presentation.footer.enabled;
            const headerHeightMm = headerEnabled ? HEADER_BAND_MM : 0;
            const footerHeightMm = footerEnabled ? FOOTER_BAND_MM : 0;
            const headerGapMm = headerEnabled ? BAND_GAP_MM : 0;
            const footerGapMm = footerEnabled ? BAND_GAP_MM : 0;

            const bodyTopMm = marginTopMm + headerHeightMm + headerGapMm;
            const bodyBottomMm = marginBottomMm + footerHeightMm + footerGapMm;

            const contentWpx = Math.round((PAGE_W_MM - marginLeftMm - marginRightMm) / PX_TO_MM);
            const contentHpx = Math.round((PAGE_H_MM - bodyTopMm - bodyBottomMm) / PX_TO_MM);

            const primaryColor = presentation.style.primary_color;
            const logoSrc = report.resolved_resources?.header_logo_url || DEFAULT_NEUTRAL_LOGO_SRC;
            const footerLogoUrl = report.resolved_resources?.footer_logo_url || null;
            const institutionName = presentation.header.institution_name || DEFAULT_INSTITUTION_NAME;
            const subtitle = presentation.header.subtitle;
            const address = presentation.header.address;
            const phone = presentation.header.phone;
            const email = presentation.header.email;
            const signer = presentation.signer;
            const footerText = presentation.footer.custom_text || DEFAULT_FOOTER_TEXT;
            // Segunda remediación post-Fase 2 (UX) — paridad Legacy:
            const typography = presentation.style.typography ?? DEFAULT_TYPOGRAPHY;
            const bodyFontFamily = fontFamilyCss(typography.font_family);
            const headerFontSizePt = typography.header_font_size_pt ?? DEFAULT_TYPOGRAPHY.header_font_size_pt;
            const footerFontSizePt = typography.footer_font_size_pt ?? DEFAULT_TYPOGRAPHY.footer_font_size_pt;
            const baseFontSizePt = typography.base_font_size_pt ?? DEFAULT_TYPOGRAPHY.base_font_size_pt;
            const headerAlignItems = alignItemsForHeaderAlignment(presentation.header.content_alignment);
            const headerLogoRight = presentation.header.logo_position === "RIGHT";
            const footerLogoRight = presentation.footer.logo_position === "RIGHT";
            const footerContentJustify = justifyContentForAlignment(presentation.footer.content_alignment);
            const footerTextAlign = presentation.footer.content_alignment === "LEFT"
                ? "left"
                : presentation.footer.content_alignment === "RIGHT"
                    ? "right"
                    : "center";

            const makePage = () => {
                const page = document.createElement("div");
                page.style.width = "8.5in";
                page.style.height = "11in";
                page.style.background = "#ffffff";
                page.style.backgroundColor = "#ffffff";
                page.style.boxShadow = "0 0 6px rgba(0,0,0,.2)";
                page.style.margin = "16px auto";
                page.style.position = "relative";
                page.style.overflow = "hidden";

                if (headerEnabled) {
                    const header = document.createElement("div");
                    header.style.position = "absolute";
                    header.style.top = `${marginTopMm}mm`;
                    header.style.left = `${marginLeftMm}mm`;
                    header.style.right = `${marginRightMm}mm`;
                    header.style.height = `${HEADER_BAND_MM}mm`;
                    header.style.display = "flex";
                    header.style.alignItems = headerAlignItems;
                    header.style.justifyContent = "space-between";
                    header.style.gap = "8px";
                    header.style.color = primaryColor;
                    header.style.fontFamily = bodyFontFamily;
                    header.style.paddingBottom = "3mm";

                    const identity = document.createElement("div");
                    identity.style.display = "flex";
                    identity.style.alignItems = "center";
                    identity.style.gap = "8px";
                    if (headerLogoRight) identity.style.flexDirection = "row-reverse";
                    identity.innerHTML = `
                        <img
                            src="${logoSrc}"
                            alt="Logo"
                            style="display:block; height: calc(${HEADER_BAND_MM}mm - 6mm); width: auto; max-width: 32mm; object-fit: contain;"
                            crossOrigin="anonymous"
                        />
                        <div>
                          <div style="font-weight:bold;font-size:${headerFontSizePt}pt;">${escapeHtml(institutionName)}</div>
                          ${subtitle ? `<div style="font-size:8pt;">${escapeHtml(subtitle)}</div>` : ""}
                          ${address ? `<div style="font-size:7pt;">${escapeHtml(address)}</div>` : ""}
                          ${(phone || email) ? `<div style="font-size:7pt;">${[phone, email].filter(Boolean).map((v) => escapeHtml(v as string)).join(" · ")}</div>` : ""}
                        </div>
                    `;

                    header.appendChild(identity);

                    if (signer && (signer.display_name || signer.specialty || signer.affiliation || signer.license_number)) {
                        const signerBlock = document.createElement("div");
                        signerBlock.style.textAlign = "right";
                        signerBlock.style.fontSize = "7pt";
                        signerBlock.style.fontWeight = "bold";
                        signerBlock.innerHTML = `
                            ${signer.display_name ? `<div>${escapeHtml(signer.display_name)}</div>` : ""}
                            ${signer.specialty ? `<div style="font-weight:normal;">${escapeHtml(signer.specialty)}</div>` : ""}
                            ${signer.affiliation ? `<div style="font-weight:normal;">${escapeHtml(signer.affiliation)}</div>` : ""}
                            ${signer.license_number ? `<div style="font-weight:normal;">${escapeHtml(signer.license_number)}</div>` : ""}
                        `;
                        header.appendChild(signerBlock);
                    }

                    const headerDivider = buildDividerElement(presentation.header.divider, primaryColor, "bottom");
                    if (headerDivider) header.appendChild(headerDivider);

                    page.appendChild(header);
                }

                const body = document.createElement("div");
                body.style.position = "absolute";
                body.style.top = `${bodyTopMm}mm`;
                body.style.bottom = `${bodyBottomMm}mm`;
                body.style.left = `${marginLeftMm}mm`;
                body.style.right = `${marginRightMm}mm`;
                body.style.overflow = "hidden";
                body.style.width = `${contentWpx}px`;
                body.style.height = `${contentHpx}px`;
                body.style.boxSizing = "border-box";
                body.style.background = "#ffffff";
                body.style.backgroundColor = "#ffffff";
                body.style.fontFamily = bodyFontFamily;
                body.style.fontSize = `${baseFontSizePt}pt`;
                body.style.color = "#000000";

                if (footerEnabled) {
                    const footer = document.createElement("div");
                    footer.style.position = "absolute";
                    footer.style.bottom = `${marginBottomMm}mm`;
                    footer.style.left = `${marginLeftMm}mm`;
                    footer.style.right = `${marginRightMm}mm`;
                    footer.style.height = `${FOOTER_BAND_MM}mm`;
                    footer.style.display = "flex";
                    footer.style.alignItems = "center";
                    footer.style.justifyContent = "space-between";
                    footer.style.color = primaryColor;
                    footer.style.fontSize = `${footerFontSizePt}pt`;
                    footer.style.fontFamily = bodyFontFamily;
                    footer.style.paddingTop = "2mm";

                    // Segunda remediación post-Fase 2 (UX): grupo logo+texto,
                    // como el header — necesario para paridad Legacy (su
                    // logo vive en el pie, no en el header).
                    const identity = document.createElement("div");
                    identity.style.display = "flex";
                    identity.style.alignItems = "center";
                    identity.style.justifyContent = footerContentJustify;
                    identity.style.gap = "8px";
                    identity.style.flex = "1";
                    if (footerLogoRight) identity.style.flexDirection = "row-reverse";

                    if (footerLogoUrl) {
                        const img = document.createElement("img");
                        img.src = footerLogoUrl;
                        img.alt = "Logo";
                        img.crossOrigin = "anonymous";
                        img.style.display = "block";
                        img.style.height = `calc(${FOOTER_BAND_MM}mm - 6mm)`;
                        img.style.width = "auto";
                        img.style.maxWidth = "28mm";
                        img.style.objectFit = "contain";
                        identity.appendChild(img);
                    }

                    const text = document.createElement("div");
                    text.textContent = footerText;
                    text.style.textAlign = footerTextAlign;
                    identity.appendChild(text);

                    footer.appendChild(identity);

                    if (presentation.footer.show_page_number) {
                        const pageNum = document.createElement("div");
                        pageNum.dataset.pageNumber = "true";
                        pageNum.textContent = "";
                        footer.appendChild(pageNum);
                    }

                    const footerDivider = buildDividerElement(presentation.footer.divider, primaryColor, "top");
                    if (footerDivider) footer.appendChild(footerDivider);

                    page.appendChild(footer);
                }

                page.appendChild(body);
                host.appendChild(page);
                return { page, body };
            };

            const work = sourceInDOM.cloneNode(true) as HTMLElement;
            const nodes = Array.from(work.childNodes);

            const fits = (container: HTMLElement, el: HTMLElement) => {
                container.appendChild(el);
                const ok = container.scrollHeight <= container.clientHeight;
                if (!ok) container.removeChild(el);
                return ok;
            };

            let { body } = makePage();

            nodes.forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const span = document.createElement("span");
                    span.textContent = node.textContent || "";
                    if (!fits(body, span)) {
                        ({ body } = makePage());
                        body.appendChild(span);
                    }
                    return;
                }

                const elem = node as HTMLElement;
                if (!(elem instanceof HTMLElement)) return;

                const block = elem.cloneNode(true) as HTMLElement;
                if (fits(body, block)) return;

                ({ body } = makePage());
                if (block.scrollHeight <= body.clientHeight) {
                    body.appendChild(block);
                    return;
                }

                const shell = block.cloneNode(false) as HTMLElement;
                body.appendChild(shell);
                Array.from(block.childNodes).forEach((child) => {
                    const c = child.cloneNode(true) as HTMLElement;
                    if (!fits(body, c)) {
                        ({ body } = makePage());
                        body.appendChild(c);
                    } else {
                        shell.appendChild(c);
                    }
                });
            });

            // Second pass: page numbers depend on the final page count, only
            // known once pagination above has finished.
            if (footerEnabled && presentation.footer.show_page_number) {
                const pages = Array.from(host.children);
                pages.forEach((p, i) => {
                    const numEl = p.querySelector('[data-page-number="true"]');
                    if (numEl) numEl.textContent = `Página ${i + 1} de ${pages.length}`;
                });
            }
        }, [report, signerLookup]);

        if (!validation.valid) {
            return (
                <div
                    style={{
                        ...style,
                        padding: 24,
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        background: "#fafbfc",
                        color: "#374151",
                        fontFamily: "Arial, sans-serif",
                    }}
                    data-testid="invalid-report-snapshot"
                >
                    <p style={{ margin: 0, fontWeight: 700 }}>Reporte no disponible</p>
                    <p style={{ margin: "8px 0 0 0" }}>
                        Este reporte usa el formato de plantilla versionada pero su configuración de
                        presentación no es válida o no está disponible.
                    </p>
                    <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#6b7280" }}>{validation.error}</p>
                </div>
            );
        }

        const snapshot = validation.snapshot;
        const tmpl = normalizeReportTemplateJSON(
            (snapshot.template ?? { base: {}, sections: {} }) as unknown as TemplateOrderInput,
        );
        const contentData = report.report ?? { base: {}, sections: {} };

        const { baseOrder, sectionOrder } = resolveDisplayOrder(tmpl, contentData);

        const signatureMeta = resolveSignatureMetadata(
            contentData as { signatureMetadata?: ReportEnvelope["report"]["signatureMetadata"] },
        );
        const signerEntry = report.signed_by
            ? signerLookup?.find((u) => u.id === report.signed_by)
            : undefined;
        const signerDisplay: SignatureBlockSigner | undefined = signerEntry
            ? { full_name: signerEntry.name }
            : undefined;

        const orderedBaseRows = baseOrder
            .map((k) => {
                const v = tmpl.base[k];
                if (!v?.is_visible) return null;
                const isCustom = (v as { is_custom?: boolean }).is_custom === true;
                if (!PREDEFINED_BASE_KEYS.has(k) && !isCustom) return null;
                return {
                    key: k,
                    label: v.label,
                    value: (contentData.base[k]?.value as string) ?? "",
                };
            })
            .filter((row): row is { key: string; label: string; value: string } => row !== null);

        const sections = sectionOrder
            .map((k) => {
                const v = tmpl.sections[k];
                if (!v?.is_visible) return null;
                const savedSection = contentData.sections[k];
                return { key: k, section: v, savedContent: savedSection };
            })
            .filter((row): row is { key: string; section: NonNullable<typeof tmpl.sections[string]>; savedContent: typeof contentData.sections[string] } => row !== null);

        return (
            <div style={style}>
                <div
                    ref={hiddenSourceRef}
                    style={{ position: "fixed", left: "-10000px", top: 0, width: 0, height: 0, overflow: "hidden" }}
                    aria-hidden
                >
                    <div id="reporte-content-v2" style={{ fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000" }}>
                        <div style={{ marginBottom: 12 }}>
                            {orderedBaseRows.map(({ key, label, value }) => (
                                <p key={key} style={{ margin: "2px 0", fontSize: "10pt" }}>
                                    <b>{label}:</b>{" "}
                                    {value || <em style={{ color: "#888" }}>Sin especificar</em>}
                                </p>
                            ))}
                        </div>

                        <hr style={{ border: "none", borderTop: "1px solid #ccc", margin: "12px 0" }} />

                        {sections.map(({ key, section, savedContent }) => {
                            const sectionHeader = (
                                <h3 style={{
                                    margin: "0 0 6px 0",
                                    fontSize: "11pt",
                                    fontWeight: 700,
                                    color: snapshot.presentation.style.primary_color,
                                    borderBottom: "1px solid #e5e7eb",
                                    paddingBottom: 3,
                                }}>
                                    {section.label}
                                </h3>
                            );

                            if (section.type === "images") {
                                const images = (
                                    savedContent && Array.isArray(savedContent.content)
                                        ? savedContent.content
                                        : []
                                ) as TemplateImageItem[];
                                if (images.length === 0) return null;
                                return (
                                    <div key={key} style={{ marginBottom: 14 }}>
                                        <hr style={{ border: "none", borderTop: "1px solid #ccc", margin: "12px 0" }} />
                                        {sectionHeader}
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                            gap: 10,
                                        }}>
                                            {images.map((img, idx) => (
                                                <div key={img.id || idx} style={{
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 6,
                                                    overflow: "hidden",
                                                    background: "#fff",
                                                }}>
                                                    <img
                                                        src={img.url}
                                                        alt={img.caption || `Figura ${idx + 1}`}
                                                        style={{ width: "100%", height: 200, objectFit: "contain", background: "#fafafa", display: "block" }}
                                                        crossOrigin="anonymous"
                                                    />
                                                    <div style={{ padding: "5px 8px", fontSize: "9pt", borderTop: "1px solid #f0f0f0" }}>
                                                        <b>Figura {idx + 1}.</b>{" "}
                                                        {img.caption && img.caption.trim().length > 0
                                                            ? img.caption
                                                            : <em> </em>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }

                            const rawContent = savedContent
                                ? (savedContent as ReportSectionText).content || ""
                                : "";

                            if (!rawContent) return null;

                            if (section.type === "table") {
                                return (
                                    <div key={key} style={{ marginBottom: 14 }}>
                                        {sectionHeader}
                                        <div
                                            style={{ fontSize: "10pt" }}
                                            dangerouslySetInnerHTML={{ __html: markdownTableToHtml(rawContent) }}
                                        />
                                    </div>
                                );
                            }

                            return (
                                <div key={key} style={{ marginBottom: 14 }}>
                                    {sectionHeader}
                                    <div
                                        style={{ fontSize: "10pt", lineHeight: 1.5 }}
                                        dangerouslySetInnerHTML={{ __html: rawContent }}
                                    />
                                </div>
                            );
                        })}

                        <SignatureBlock
                            signatureMetadata={signatureMeta}
                            signedBy={signerDisplay}
                            signedAt={report.signed_at}
                        />
                    </div>
                </div>

                <div ref={previewHostRef} />
            </div>
        );
    },
);

VersionedReportRendererV2.displayName = "VersionedReportRendererV2";

export default VersionedReportRendererV2;
