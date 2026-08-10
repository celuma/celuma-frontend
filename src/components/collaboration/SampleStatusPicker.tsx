import { useState } from "react";
import { Dropdown } from "antd";
import { FlagOutlined, SettingOutlined, CheckCircleOutlined, CheckOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import { RailSectionHeader, RailConfigButton } from "./RailSectionHeader";
import { SAMPLE_STATE_CONFIG } from "../ui/status_configs";

// All valid sample states for the picker. Order matches the canonical
// SAMPLE_STATE_CONFIG (src/components/ui/status_configs.tsx), the one place
// the enum's Spanish labels/colors/icons live — not re-declared here.
const SAMPLE_STATES = ["RECEIVED", "PROCESSING", "READY", "DAMAGED", "CANCELLED"] as const;

type SampleStatusPickerProps = {
    /** The sample's current state (a raw `SampleState` value). */
    state: string;
    /** Applies a new state; the caller owns the PATCH call and the refresh. */
    onChange: (newState: string) => void | Promise<void>;
    /** True while a change is in flight — disables the trigger and shows a spinner. */
    updating?: boolean;
};

/**
 * Sample-status rail picker — same Céluma language as the Asignados/Etiquetas
 * pickers (`AssigneesSection`/`LabelsSection`): rounded popup card, soft-circle
 * icon rows with navy labels, the current state highlighted in teal tint.
 *
 * Deliberately its own component, not inline JSX in the page. The sample
 * detail page renders its whole sidebar twice (desktop + mobile responsive
 * layout, both always mounted — CSS only hides one), and a page-level
 * `open` boolean shared by both `<Dropdown>` instances meant clicking either
 * trigger opened *both* popups at once, with the CSS-hidden instance's
 * zero-size trigger corrupting the visible one's positioning. A real
 * component gives each of the two mounts its own independent `useState`,
 * exactly like `AssigneesSection`/`LabelsSection` already do.
 */
export default function SampleStatusPicker({ state, onChange, updating = false }: SampleStatusPickerProps) {
    const [open, setOpen] = useState(false);

    const stateConfig = SAMPLE_STATE_CONFIG[state] || { color: "#6b7280", bg: "#f3f4f6", label: state || "—", icon: <CheckCircleOutlined /> };

    const popupContent = (
        <div
            style={{
                background: "#fff",
                borderRadius: 14,
                boxShadow: tokens.shadow,
                border: "1px solid #eef1f0",
                width: 260,
                maxWidth: "92vw",
                overflow: "hidden",
                padding: "6px 8px",
                display: "grid",
                gap: 2,
            }}
        >
            {SAMPLE_STATES.map((candidate) => {
                const config = SAMPLE_STATE_CONFIG[candidate];
                const active = state === candidate;
                const baseBg = active ? "#eaf7f5" : "transparent";
                return (
                    <div
                        key={candidate}
                        role="button"
                        onClick={() => {
                            setOpen(false);
                            if (!active) onChange(candidate);
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f1faf8"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = baseBg; }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "7px 10px",
                            borderRadius: 10,
                            cursor: active ? "default" : "pointer",
                            background: baseBg,
                            transition: "background .15s ease",
                        }}
                    >
                        <span style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: `${config.color}1a`,
                            color: config.color,
                            border: `2px solid ${config.color}33`,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            flexShrink: 0,
                        }}>
                            {config.icon}
                        </span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: tokens.textPrimary }}>
                            {config.label}
                        </span>
                        {active && <CheckOutlined style={{ color: tokens.primary, fontSize: 13, flexShrink: 0 }} />}
                    </div>
                );
            })}
        </div>
    );

    return (
        <>
            <RailSectionHeader
                icon={<FlagOutlined />}
                color={tokens.primary}
                title="Estado"
                trigger={
                    <Dropdown
                        popupRender={() => popupContent}
                        trigger={["click"]}
                        disabled={updating}
                        open={open}
                        onOpenChange={setOpen}
                        placement="bottomRight"
                    >
                        <RailConfigButton disabled={updating} />
                    </Dropdown>
                }
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    background: `${stateConfig.color}1a`,
                    color: stateConfig.color,
                    border: `2px solid ${stateConfig.color}33`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    flexShrink: 0,
                }}>
                    {updating ? <SettingOutlined spin /> : stateConfig.icon}
                </span>
                <span style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 500,
                    color: tokens.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}>
                    {stateConfig.label}
                </span>
            </div>
        </>
    );
}
