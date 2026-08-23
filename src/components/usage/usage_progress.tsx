import { progressBarWidthPercent, usageAccentColor, usageTone } from "../../lib/usage_ui";

interface UsageProgressProps {
    /**
     * The backend's `usage_percent`. Drives the tone and the accessible value;
     * `null` means there is no denominator, and the caller should normally be
     * rendering a limitless/uncalculated state instead of this component.
     */
    percent: number | null;
    /** The backend's unrounded `usage_ratio`, preferred for the bar's width. */
    ratio?: number | null;
    /** Spoken description of what this bar measures, e.g. "80% de usuarios internos utilizados". */
    label: string;
}

/**
 * Céluma 1.3, Phase 4, Block F — the usage bar.
 *
 * Visually the same 8px rounded track the dashboard summary already uses, so
 * this reads as the same language rather than a second progress style.
 *
 * Two contract points:
 *
 * - **The width is clamped, the number is not.** `progressBarWidthPercent`
 *   caps the geometry at 100% because a bar cannot overflow its track; the
 *   caller renders the real percentage, which may read 120%.
 * - **It is a real `progressbar`.** `aria-valuenow` carries the unclamped
 *   value and `aria-valuetext` the spoken label, so the state is available
 *   without seeing the colour or the width.
 */
export default function UsageProgress({ percent, ratio, label }: UsageProgressProps) {
    const color = usageAccentColor(usageTone(percent));
    const width = progressBarWidthPercent(percent, ratio);

    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-valuetext={label}
            aria-label={label}
            style={{
                height: 8,
                borderRadius: 100,
                background: "#f1f3f5",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    height: "100%",
                    width: `${width}%`,
                    background: color,
                    borderRadius: 100,
                    transition: "width 0.4s ease",
                }}
            />
        </div>
    );
}
