import type { ReactNode } from "react";
import CelumaButton from "./button";
import Panel from "./panel";
import Tooltip from "./tooltip";

export type ActionButtonItem = {
    /** Icon to render inside the button. */
    icon: ReactNode;
    /** Tooltip label shown on hover. */
    tooltip: string;
    /** Marks the button with danger styling (red). */
    danger?: boolean;
    /** Disables the button. */
    disabled?: boolean;
    /** Click handler. */
    onClick?: () => void;
    /** aria-label for accessibility. */
    ariaLabel?: string;
};

type Props = {
    actions: ActionButtonItem[];
};

/**
 * ActionButtonPanel — a compact pill-shaped panel grouping icon action buttons
 * (edit, toggle active, delete, etc.) separated by thin vertical dividers.
 *
 * Built on top of `Panel` + `CelumaButton` (xsmall) + `Tooltip` so it stays
 * consistent with the Céluma design system.
 *
 * Usage:
 * ```tsx
 * <ActionButtonPanel
 *     actions={[
 *         { icon: <EditOutlined />, tooltip: "Editar", onClick: handleEdit },
 *         { icon: <PoweroffOutlined />, tooltip: "Desactivar", danger: isActive, onClick: handleToggle },
 *     ]}
 * />
 * ```
 */
export default function ActionButtonPanel({ actions }: Props) {
    return (
        <Panel style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 5 }}>
            {actions.map((action, index) => (
                <span key={index} style={{ display: "inline-flex", alignItems: "center" }}>
                    {index > 0 && (
                        <span
                            style={{
                                width: 1,
                                alignSelf: "stretch",
                                background: "#e2e8f0",
                                margin: "4px 2px",
                            }}
                        />
                    )}
                    <Tooltip title={action.tooltip}>
                        <CelumaButton
                            size="xsmall"
                            icon={action.icon}
                            danger={action.danger}
                            disabled={action.disabled}
                            aria-label={action.ariaLabel ?? action.tooltip}
                            onClick={action.onClick}
                        />
                    </Tooltip>
                </span>
            ))}
        </Panel>
    );
}
