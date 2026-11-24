import type { SelectProps } from "antd";
import type { CatalogTypeOption } from "../../lib/catalog_type_options";
import { catalogTypeMatches } from "../../lib/catalog_type_options";
import CatalogTypeCode from "./catalog_type_code";
import "./catalog_type_select.css";

/** The Select props a study-type or sample-type selector adds (Céluma 1.5, #69). */
export type CatalogTypeSelectProps = Pick<
    SelectProps,
    "filterOption" | "optionRender" | "labelRender" | "popupMatchSelectWidth" | "classNames"
>;

/**
 * Behaviour shared by every study-type and sample-type selector:
 *
 *  - search by name or code (`catalogTypeMatches`), keeping the given order;
 *  - each option shows the **complete** name — it wraps instead of being cut —
 *    with its code beside it, so options that differ only at the end of a long
 *    name can be told apart;
 *  - the popup may grow wider than a narrow field, up to the viewport;
 *  - the closed field truncates the name but never the code.
 *
 * Keyboard navigation is antd's own (arrows, Enter, Escape, typing to search);
 * nothing here replaces it.
 */
export function catalogTypeSelectProps(options: CatalogTypeOption[]): CatalogTypeSelectProps {
    const byValue = new Map(options.map((option) => [option.value, option]));
    return {
        filterOption: (input, option) => catalogTypeMatches(input, option as CatalogTypeOption | undefined),
        optionRender: (option) => {
            const data = option.data as CatalogTypeOption;
            return (
                <span className="ct-option">
                    <span className="ct-option__name">{data.name}</span>
                    <CatalogTypeCode className="ct-option__code" code={data.code} />
                    {data.inactive ? <span className="ct-option__state"><span className="ct-sr"> — </span>inactivo</span> : null}
                </span>
            );
        },
        labelRender: ({ value, label }) => {
            const data = byValue.get(String(value));
            if (!data) return label ?? value;
            return (
                <span className="ct-selected" title={data.label}>
                    <span className="ct-selected__name">{data.name}</span>
                    <CatalogTypeCode className="ct-selected__code" code={data.code} />
                </span>
            );
        },
        popupMatchSelectWidth: false,
        classNames: { popup: { root: "ct-popup" } },
    };
}
