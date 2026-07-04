import type { ReactNode } from "react";
import { tokens } from "../design/tokens";

export type CelumaStep = {
    key: string;
    title: string;
    icon: ReactNode;
    /** Ink color of the matching status chip (used for icon, border and connector). */
    color: string;
    /** Soft fill of the matching status chip (used for the circle background). */
    bg: string;
};

type Props = {
    steps: CelumaStep[];
    /** Index of the current step. Steps before it are "done", after it are "pending". */
    current: number;
};

/**
 * CelumaSteps — a Céluma-styled progress bar. Each step mirrors its status chip:
 * a soft-filled circle with the ink-colored icon, so the journey reads as the
 * same gentle palette used across the UI. Connectors between completed steps are
 * a left→right gradient (first third left color, middle transition, last third
 * right color) and always start a fixed 4px from each circle.
 */
export default function CelumaSteps({ steps, current }: Props) {
    return (
        <div style={{ display: "flex", overflowX: "auto", padding: "10px 4px 4px" }}>
            {steps.map((step, i) => {
                const done = i < current;
                const active = i === current;
                const reached = done || active;
                const isLast = i === steps.length - 1;
                const next = steps[i + 1];

                const circleBg = reached ? step.bg : "#fff";
                const circleBorder = reached ? step.color : "#e2e8f0";
                const iconColor = reached ? step.color : "#cbd5e1";
                const labelColor = active ? step.color : done ? tokens.textPrimary : tokens.textSecondary;

                return (
                    <div
                        key={step.key}
                        style={{
                            flex: 1,
                            minWidth: 78,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            position: "relative",
                        }}
                    >
                        {/* Connector to the next step — gradient when completed, starts 4px off each circle */}
                        {!isLast && (
                            <div
                                style={{
                                    position: "absolute",
                                    top: 19,
                                    left: "calc(50% + 24px)",
                                    width: "calc(100% - 48px)",
                                    height: 3,
                                    borderRadius: 3,
                                    background: done
                                        ? `linear-gradient(to right, ${step.color} 0%, ${step.color} 33%, ${next.color} 67%, ${next.color} 100%)`
                                        : "#e8ebee",
                                    transition: "background .2s",
                                }}
                            />
                        )}

                        {/* Circle */}
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: "50%",
                                background: circleBg,
                                border: `2px solid ${circleBorder}`,
                                color: iconColor,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 17,
                                flexShrink: 0,
                                position: "relative",
                                zIndex: 1,
                                boxShadow: active ? `0 0 0 4px ${step.color}1f` : "none",
                                transition: "background .2s, border-color .2s, color .2s, box-shadow .2s",
                            }}
                        >
                            {step.icon}
                        </div>

                        {/* Label */}
                        <div
                            style={{
                                marginTop: 8,
                                fontSize: 12,
                                fontWeight: active ? 700 : 600,
                                color: labelColor,
                                textAlign: "center",
                                lineHeight: 1.2,
                                whiteSpace: "nowrap",
                                transition: "color .2s",
                            }}
                        >
                            {step.title}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
