import { Tooltip as AntTooltip } from "antd";
import type { TooltipProps } from "antd";
import type { ReactNode } from "react";
import { tokens } from "../design/tokens";

type Props = {
    title: ReactNode;
    children: ReactNode;
    placement?: TooltipProps["placement"];
};

/**
 * Tooltip — Céluma-styled hint bubble. A dark navy (brand) rounded bubble that
 * describes an element's action. Wrap any single element with it; reusable
 * wherever a small informational hint is needed.
 */
export default function Tooltip({ title, children, placement = "top" }: Props) {
    return (
        <AntTooltip
            title={title}
            placement={placement}
            color={tokens.textPrimary}
            overlayInnerStyle={{
                fontFamily: tokens.textFont,
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 8,
                padding: "6px 11px",
                minHeight: "auto",
            }}
        >
            {children}
        </AntTooltip>
    );
}
