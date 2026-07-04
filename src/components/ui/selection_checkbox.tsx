import type { CSSProperties } from "react";
import { CheckOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";

type Props = {
    checked: boolean;
    style?: CSSProperties;
};

/**
 * SelectionCheckbox — the Céluma "pill" selection indicator used inside clickable
 * rows (multi-select pickers, lists). A rounded square that fills teal with a white
 * check when selected, neutral 2px outline when not. Distinct from `checkbox.tsx`,
 * which is the antd-backed form checkbox (with label) for forms.
 */
export default function SelectionCheckbox({ checked, style }: Props) {
    return (
        <span
            style={{
                width: 18,
                height: 18,
                borderRadius: 6,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: checked ? tokens.primary : "#fff",
                border: `2px solid ${checked ? tokens.primary : "#d1d5db"}`,
                color: "#fff",
                fontSize: 10,
                transition: "background .15s ease, border-color .15s ease",
                ...style,
            }}
        >
            {checked && <CheckOutlined />}
        </span>
    );
}
