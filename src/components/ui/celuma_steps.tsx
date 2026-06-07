import type { ReactNode } from "react";
import { tokens } from "../design/tokens";

export type CelumaStep = {
    key: string;
    title: string;
    icon: ReactNode;
    /** Characteristic color for this step (same hue as its status chip). */
    color: string;
};

type Props = {
    steps: CelumaStep[];
    /** Index of the current step. Steps before it are "done", after it are "pending". */
    current: number;
};

/**
 * CelumaSteps — a Céluma-styled progress bar. Each step carries its own
 * characteristic color and icon (shared with the matching status chip), so the
 * journey reads as a colorful, cohesive progression: reached steps fill with
 * their color, the current one gets a soft ring, and pending steps stay muted.
 */
export default function CelumaSteps({ steps, current }: Props) {
    return (
        <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
            {steps.map((step, i) => {
                const done = i < current;
                const active = i === current;
                const reached = done || active;

                const circleBg = reached ? step.color : "#fff";
                const circleBorder = reached ? step.color : "#d8dde3";
                const iconColor = reached ? "#fff" : "#9ca3af";
                const labelColor = active ? step.color : done ? tokens.textPrimary : tokens.textSecondary;
                const isLast = i === steps.length - 1;

                return (
                    <div
                        key={step.key}
                        style={{ display: "flex", alignItems: "flex-start", flex: isLast ? "0 0 auto" : 1, minWidth: 0 }}
                    >
                        {/* Node: circle + label */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, padding: "0 6px" }}>
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
                                    boxShadow: active ? `0 0 0 4px ${step.color}22` : "none",
                                    transition: "background .2s, border-color .2s, color .2s, box-shadow .2s",
                                }}
                            >
                                {step.icon}
                            </div>
                            <div
                                style={{
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

                        {/* Connector to the next step (colored once this step is completed) */}
                        {!isLast && (
                            <div
                                style={{
                                    flex: 1,
                                    minWidth: 16,
                                    height: 3,
                                    borderRadius: 3,
                                    marginTop: 18,
                                    background: done ? step.color : "#e8ebee",
                                    transition: "background .2s",
                                }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
