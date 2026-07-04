import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { tokens } from "../design/tokens";

/**
 * CelumaTabs — antd `Tabs` re-skinned to the Céluma language: teal active ink,
 * a 3px rounded teal ink-bar, soft divider and teal hover. Centralises the tab
 * styling that order / sample / report detail screens previously duplicated
 * inline (`.od-tabs` / `.sd-tabs`). Pass-through of all antd Tabs props.
 */
const TABS_CSS = `
.celuma-tabs .ant-tabs-tab .ant-tabs-tab-btn { font-weight: 600; color: ${tokens.textSecondary}; }
.celuma-tabs .ant-tabs-tab:hover .ant-tabs-tab-btn { color: #3da8a0; }
.celuma-tabs .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn { color: ${tokens.primary}; }
.celuma-tabs .ant-tabs-ink-bar { background: ${tokens.primary}; height: 3px; border-radius: 3px; }
.celuma-tabs .ant-tabs-nav::before { border-bottom-color: #eef1f0; }
`;

export default function CelumaTabs({ className, ...props }: TabsProps) {
    return (
        <>
            <style>{TABS_CSS}</style>
            <Tabs className={`celuma-tabs${className ? ` ${className}` : ""}`} {...props} />
        </>
    );
}
