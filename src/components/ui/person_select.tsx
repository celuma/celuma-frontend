import type { SelectProps } from "antd";
import type { PersonOption } from "../../lib/person_options";
import "./catalog_type_select.css";

/** The Select props the Patient / Requesting-physician selectors add (Céluma 1.5, #69 review). */
export type PersonSelectProps = Pick<SelectProps, "optionRender" | "popupMatchSelectWidth" | "classNames">;

/**
 * Presentation only, reusing the #69 catalog-selector styling: the full name wraps, the code is a chip at
 * the row's end, specialty/institution go on a secondary line, and the popup may grow up to the viewport.
 *
 * Search, order, the closed field's text and the chips are untouched: no `filterOption` (the select keeps
 * matching on `label`) and no `labelRender`. The row's DOM text is the unchanged `label` — the code comes
 * first in the DOM and is moved to the end only visually (CSS `order`), and the label's separators are
 * visually hidden — so screen readers announce what they did before. The one addition is
 * `extraDetail` (order edit), which the label never carried and which stays unsearched.
 */
export function personSelectProps(): PersonSelectProps {
    return {
        optionRender: (option) => {
            const data = option.data as PersonOption;
            if (!data.name) return data.label;
            return (
                <span className="ct-option ct-option--person">
                    <span className="ct-option__code ct-option__code--end">{data.code}</span>
                    <span className="ct-option__body">
                        <span className="ct-sr">{data.separator}</span>
                        <span className="ct-option__name">{data.name}</span>
                        {data.detail ? (
                            <span className="ct-option__detail">
                                <span className="ct-sr">{data.detailSeparator}</span>
                                {data.detail}
                            </span>
                        ) : null}
                        {data.extraDetail ? <span className="ct-option__detail">{data.extraDetail}</span> : null}
                    </span>
                </span>
            );
        },
        popupMatchSelectWidth: false,
        classNames: { popup: { root: "ct-popup" } },
    };
}
