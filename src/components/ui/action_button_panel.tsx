import { useState, type ReactNode, type MouseEvent } from "react";
import Panel from "./panel";
import Tooltip from "./tooltip";

type PanelSize = "default" | "xsmall";

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
          onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
          /** aria-label for accessibility (falls back to tooltip). */
          ariaLabel?: string;
      };

type PanelButtonProps = Exclude<ActionButtonItem, { divider: true }> & { size?: PanelSize };

// Per-size metrics so the pill can line up with `default` / `xsmall` buttons.
const SIZES = {
    default: { h: 30, minW: 30, font: 13, radius: 8, padX: 10 },
    xsmall: { h: 22, minW: 22, font: 12, radius: 6, padX: 8 },
} as const;

/** A single borderless, tinted button that lives inside the segmented pill. */
function PanelButton({ icon, label, tooltip, active, danger, disabled, onClick, ariaLabel, size = "default" }: PanelButtonProps) {
    const [hover, setHover] = useState(false);
    const pal = danger ? RED : TEAL;
    const sz = SIZES[size];

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
                height: sz.h,
                minWidth: sz.minW,
                padding: label != null ? `0 ${sz.padX}px` : 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                border: "none",
                background,
                color,
                borderRadius: sz.radius,
                fontSize: sz.font,
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

const Divider = ({ size = "default" }: { size?: PanelSize }) => (
    <span style={{ width: 1, alignSelf: "stretch", background: "#e2e8f0", margin: size === "xsmall" ? "3px 2px" : "4px 2px" }} />
);

type Props = {
    actions: ActionButtonItem[];
    /**
     * Insert a divider automatically between every button (default true — ideal
     * for toolbars like the detail badge). Set false to place dividers manually
     * via `{ divider: true }` items (e.g. pagination groups its arrows).
     */
    autoDividers?: boolean;
    /** `xsmall` shrinks the pill to line up with `size="xsmall"` buttons. */
    size?: PanelSize;
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
export default function ActionButtonPanel({ actions, autoDividers = true, size = "default" }: Props) {
    const rendered: ReactNode[] = [];
    let realCount = 0;

    actions.forEach((action, index) => {
        if (action.divider) {
            rendered.push(<Divider key={`divider-${index}`} size={size} />);
            return;
        }
        if (autoDividers && realCount > 0) {
            rendered.push(<Divider key={`auto-divider-${index}`} size={size} />);
        }
        realCount += 1;
        rendered.push(<PanelButton key={index} size={size} {...action} />);
    });

    return (
        <Panel style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: size === "xsmall" ? "2px 3px" : 5 }}>
            {rendered}
        </Panel>
    );
}
