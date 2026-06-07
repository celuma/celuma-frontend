import { useState, type ReactNode } from "react";
import Panel from "./panel";
import Tooltip from "./tooltip";

// Céluma palette (mirrors the button system so the whole UI speaks one language).
const TEAL = { base: "#49b6ad", tint: "#eaf7f5" };
const RED = { base: "#e5484d", tint: "#fef2f2" };
const NEUTRAL = { text: "#374151", disabled: "#9ca3af" };

/** A single action inside the panel — either a button or a thin divider. */
export type ActionButtonItem =
    | { divider: true }
    | {
          divider?: false;
          /** Icon to render (use this for icon-only actions like edit/toggle). */
          icon?: ReactNode;
          /** Text label (use this for page numbers, "…", or labelled actions). */
          label?: ReactNode;
          /** Tooltip shown on hover. */
          tooltip?: string;
          /** Active/selected state — solid teal fill, white text. */
          active?: boolean;
          /** Danger styling — red on hover. */
          danger?: boolean;
          /** Disabled — muted, non-interactive. */
          disabled?: boolean;
          /** Click handler. */
          onClick?: () => void;
          /** aria-label for accessibility (falls back to tooltip). */
          ariaLabel?: string;
      };

type PanelButtonProps = Exclude<ActionButtonItem, { divider: true }>;

/** A single borderless, tinted button that lives inside the segmented pill. */
function PanelButton({ icon, label, tooltip, active, danger, disabled, onClick, ariaLabel }: PanelButtonProps) {
    const [hover, setHover] = useState(false);
    const pal = danger ? RED : TEAL;

    let background = "transparent";
    let color = NEUTRAL.text;
    if (disabled) {
        color = NEUTRAL.disabled;
    } else if (active) {
        // Soft teal anchor — present but not saturated, so it doesn't shout.
        background = TEAL.tint;
        color = TEAL.base;
    } else if (hover) {
        background = pal.tint;
        color = pal.base;
    }

    const button = (
        <button
            type="button"
            aria-label={ariaLabel ?? tooltip}
            aria-current={active ? "page" : undefined}
            disabled={disabled}
            onClick={onClick}
            onMouseEnter={() => !disabled && setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                height: 30,
                minWidth: 30,
                padding: label != null ? "0 10px" : 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                border: "none",
                background,
                color,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                fontFamily: "inherit",
                lineHeight: 1,
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "background .15s, color .15s",
            }}
        >
            {icon}
            {label}
        </button>
    );

    return tooltip ? <Tooltip title={tooltip}>{button}</Tooltip> : button;
}

const Divider = () => (
    <span style={{ width: 1, alignSelf: "stretch", background: "#e2e8f0", margin: "4px 2px" }} />
);

type Props = {
    actions: ActionButtonItem[];
    /**
     * Insert a divider automatically between every button (default true — ideal
     * for toolbars like the detail badge). Set false to place dividers manually
     * via `{ divider: true }` items (e.g. pagination groups its arrows).
     */
    autoDividers?: boolean;
};

/**
 * ActionButtonPanel — a compact segmented "pill" panel grouping icon/label
 * buttons, built on the Céluma `Panel` with borderless tinted buttons and thin
 * dividers. The shared building block for toolbars (edit/toggle) and the table
 * pagination control, so the whole product reads with one consistent language.
 *
 * ```tsx
 * <ActionButtonPanel actions={[
 *     { icon: <EditOutlined />, tooltip: "Editar", onClick: edit },
 *     { icon: <PoweroffOutlined />, tooltip: "Desactivar", danger: true, onClick: toggle },
 * ]} />
 * ```
 */
export default function ActionButtonPanel({ actions, autoDividers = true }: Props) {
    const rendered: ReactNode[] = [];
    let realCount = 0;

    actions.forEach((action, index) => {
        if (action.divider) {
            rendered.push(<Divider key={`divider-${index}`} />);
            return;
        }
        if (autoDividers && realCount > 0) {
            rendered.push(<Divider key={`auto-divider-${index}`} />);
        }
        realCount += 1;
        rendered.push(<PanelButton key={index} {...action} />);
    });

    return (
        <Panel style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 5 }}>
            {rendered}
        </Panel>
    );
}
