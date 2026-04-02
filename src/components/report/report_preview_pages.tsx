import { useEffect, useRef, forwardRef, useImperativeHandle, type CSSProperties } from "react";
import type { ReportEnvelope, ReportSectionText, TemplateImageItem } from "../../models/report";
import { normalizeReportTemplateJSON, resolveBaseOrder, resolveSectionOrder } from "../../models/report";
import { markdownTableToHtml } from "./table_utils";
import logo from "../../images/report_logo.png";

// Page layout constants (Letter size)
const PX_TO_MM = 0.264583;
const PAGE_W_MM = 215.9;
const PAGE_H_MM = 279.4;
const MARGIN_L_MM = 18;
const MARGIN_R_MM = 18;
const HEADER_H_MM = 28;
const FOOTER_H_MM = 20;

// Keys that are pre-populated from order/patient data (not custom)
const PREDEFINED_BASE_KEYS = new Set(["order_code", "patient", "study_type", "patient_age"]);

interface ReportPreviewPagesProps {
    report: ReportEnvelope;
    style?: CSSProperties;
}

export interface ReportPreviewPagesRef {
    getPages: () => HTMLElement[];
}

const ReportPreviewPages = forwardRef<ReportPreviewPagesRef, ReportPreviewPagesProps>(({ report, style }, ref) => {
    const previewHostRef = useRef<HTMLDivElement>(null);
    const hiddenSourceRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
        getPages: () => {
            if (!previewHostRef.current) return [];
            return Array.from(previewHostRef.current.children).filter(
                (el) => el instanceof HTMLElement
            ) as HTMLElement[];
        },
    }), []);

    useEffect(() => {
        const host = previewHostRef.current;
        const sourceInDOM = hiddenSourceRef.current?.querySelector("#reporte-content") as HTMLElement | null;
        if (!host || !sourceInDOM) return;

        host.innerHTML = "";

        const contentWpx = Math.round((PAGE_W_MM - MARGIN_L_MM - MARGIN_R_MM) / PX_TO_MM);
        const contentHpx = Math.round((PAGE_H_MM - HEADER_H_MM - FOOTER_H_MM) / PX_TO_MM);

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

            // Header
            const header = document.createElement("div");
            header.style.position = "absolute";
            header.style.top = "0";
            header.style.left = `${MARGIN_L_MM}mm`;
            header.style.right = `${MARGIN_R_MM}mm`;
            header.style.height = `${HEADER_H_MM}mm`;
            header.style.display = "flex";
            header.style.alignItems = "flex-end";
            header.style.paddingBottom = "4mm";
            header.style.color = "#002060";
            header.style.fontWeight = "bold";
            header.style.fontSize = "8pt";
            header.style.fontFamily = "Arial, sans-serif";
            header.innerHTML = `
                <div>
                  <div>Dra. Arisbeth Villanueva Pérez.</div>
                  <div>Anatomía Patológica, Nefropatología y Citología Exfoliativa</div>
                  <div>Centro Médico Nacional de Occidente IMSS. INCMNSZ</div>
                  <div>DGP3833349 | DGP. ESP 6133871</div>
                </div>
            `;

            // Body
            const body = document.createElement("div");
            body.style.position = "absolute";
            body.style.top = `${HEADER_H_MM}mm`;
            body.style.bottom = `${FOOTER_H_MM}mm`;
            body.style.left = `${MARGIN_L_MM}mm`;
            body.style.right = `${MARGIN_R_MM}mm`;
            body.style.overflow = "hidden";
            body.style.width = `${contentWpx}px`;
            body.style.height = `${contentHpx}px`;
            body.style.paddingTop = "4mm";
            body.style.boxSizing = "border-box";
            body.style.background = "#ffffff";
            body.style.backgroundColor = "#ffffff";
            body.style.fontFamily = "Arial, sans-serif";
            body.style.fontSize = "10pt";
            body.style.color = "#000000";

            // Footer
            const footer = document.createElement("div");
            footer.style.position = "absolute";
            footer.style.bottom = "0";
            footer.style.left = `${MARGIN_L_MM}mm`;
            footer.style.right = `${MARGIN_R_MM}mm`;
            footer.style.height = `${FOOTER_H_MM}mm`;
            footer.style.display = "flex";
            footer.style.alignItems = "center";
            footer.style.justifyContent = "space-between";
            footer.style.color = "#002060";
            footer.style.fontSize = "7pt";
            footer.style.fontFamily = "Arial, sans-serif";
            footer.style.fontWeight = "bold";
            footer.innerHTML = `
                <img
                    src="${logo}"
                    alt="Logo"
                    style="display:block; height: calc(${FOOTER_H_MM}mm - 4mm); width: auto; max-width: 35%; object-fit: contain;"
                />
                <div style="max-width:65%; text-align: right;">
                  Francisco Rojas González No. 654 Col. Ladrón de Guevara, Guadalajara, Jalisco, México C.P. 44600<br/>
                  Tel. 33 2015 0100, 33 2015 0101. Cel. 33 2823-1959  patologiaynefropatologia@gmail.com
                </div>
            `;

            page.appendChild(header);
            page.appendChild(body);
            page.appendChild(footer);
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

            // Split by children
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
    }, [report]);

    // ---------------------------------------------------------------------------
    // Build content from new ReportTemplateJSON structure
    // ---------------------------------------------------------------------------

    const tmpl = normalizeReportTemplateJSON(report.template ?? { base: {}, sections: {} });
    const contentData = report.report ?? { base: {}, sections: {} };

    // Base header rows: single list ordered by template.base_order (predefined + custom interleaved as configured)
    const orderedBaseRows = resolveBaseOrder(tmpl)
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

    // Sections in template.section_order
    const sections = resolveSectionOrder(tmpl)
        .map((k) => {
            const v = tmpl.sections[k];
            if (!v?.is_visible) return null;
            const savedSection = contentData.sections[k];
            return { key: k, section: v, savedContent: savedSection };
        })
        .filter((row): row is { key: string; section: NonNullable<typeof tmpl.sections[string]>; savedContent: typeof contentData.sections[string] } => row !== null);

    // Collect all images across image sections
    const allImages: { sectionLabel: string; images: TemplateImageItem[] }[] = sections
        .filter(({ section }) => section.type === "images")
        .map(({ section, savedContent }) => ({
            sectionLabel: section.label,
            images: (savedContent && Array.isArray(savedContent.content) ? savedContent.content : []) as TemplateImageItem[],
        }))
        .filter(({ images }) => images.length > 0);

    return (
        <div style={style}>
            {/* Hidden source used for pagination */}
            <div
                ref={hiddenSourceRef}
                style={{ position: "fixed", left: "-10000px", top: 0, width: 0, height: 0, overflow: "hidden" }}
                aria-hidden
            >
                <div id="reporte-content" style={{ fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000" }}>

                    {/* Base fields in template.base_order */}
                    <div style={{ marginBottom: 12 }}>
                        {orderedBaseRows.map(({ key, label, value }) => (
                            <p key={key} style={{ margin: "2px 0", fontSize: "10pt" }}>
                                <b>{label}:</b>{" "}
                                {value || <em style={{ color: "#888" }}>Sin especificar</em>}
                            </p>
                        ))}
                    </div>

                    <hr style={{ border: "none", borderTop: "1px solid #ccc", margin: "12px 0" }} />

                    {/* Dynamic sections */}
                    {sections.map(({ key, section, savedContent }) => {
                        if (section.type === "images") {
                            // Images sections rendered separately below
                            return null;
                        }

                        const rawContent = savedContent
                            ? (savedContent as ReportSectionText).content || ""
                            : "";

                        if (!rawContent) return null;

                        const sectionHeader = (
                            <h3 style={{
                                margin: "0 0 6px 0",
                                fontSize: "11pt",
                                fontWeight: 700,
                                color: "#002060",
                                borderBottom: "1px solid #e5e7eb",
                                paddingBottom: 3,
                            }}>
                                {section.label}
                            </h3>
                        );

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

                    {/* Images */}
                    {allImages.map(({ sectionLabel, images }) => (
                        <div key={sectionLabel} style={{ marginBottom: 14 }}>
                            <hr style={{ border: "none", borderTop: "1px solid #ccc", margin: "12px 0" }} />
                            <h3 style={{
                                margin: "0 0 8px 0",
                                fontSize: "11pt",
                                fontWeight: 700,
                                color: "#002060",
                                borderBottom: "1px solid #e5e7eb",
                                paddingBottom: 3,
                            }}>
                                {sectionLabel}
                            </h3>
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
                    ))}

                </div>
            </div>

            {/* Visible preview pages (populated by the effect) */}
            <div ref={previewHostRef} />
        </div>
    );
});

ReportPreviewPages.displayName = "ReportPreviewPages";

export default ReportPreviewPages;
