import Panel from "../ui/panel";
import UsageStatusIcon from "./usage_status_icon";
import { tokens } from "../design/tokens";
import {
    INTEGRITY_FINDING_ORDER,
    INTEGRITY_FINDING_UI,
    USAGE_TONE_COLORS,
    formatCount,
    type IntegrityFindingKey,
} from "../../lib/usage_ui";
import type { ReconciliationSummary } from "../../models/tenant_usage";

interface ReconciliationFindingsProps {
    reconciliation: ReconciliationSummary;
}

/**
 * Céluma 1.3, Phase 4, Block F — the individual integrity findings of a
 * WARNING run.
 *
 * **The three counters are never summed.** "3 incidencias" would flatten a
 * possible loss of a clinical artifact, a storage-cost question and a stale
 * database row into one number, and they call for three different operational
 * responses. Each finding gets its own row, its own count and its own copy,
 * ordered strongest-first by `INTEGRITY_FINDING_ORDER`.
 *
 * Only non-zero findings are rendered. A `0` means the check ran and found
 * nothing — worth not cluttering the card with — while a `null` means it was
 * never measured, which is a different state entirely and is why neither is
 * treated as "no findings" by arithmetic here: both are simply not `> 0`, and
 * the surrounding card's `integrity_status` already distinguishes them
 * (`HEALTHY` vs `ACCOUNTING_ONLY`).
 *
 * Rows, not a table: three metrics do not need column headers, and a table
 * would need horizontal scrolling on a phone.
 */
export default function ReconciliationFindings({ reconciliation }: ReconciliationFindingsProps) {
    const counts: Record<IntegrityFindingKey, number | null> = {
        missing: reconciliation.missing_objects_found,
        orphans: reconciliation.orphans_found,
        metadata: reconciliation.metadata_mismatches_found,
    };

    const present = INTEGRITY_FINDING_ORDER.filter((key) => (counts[key] ?? 0) > 0);
    if (present.length === 0) return null;

    return (
        <div style={{ display: "grid", gap: 10 }}>
            {present.map((key) => {
                const ui = INTEGRITY_FINDING_UI[key];
                const tone = USAGE_TONE_COLORS[ui.tone];
                return (
                    <Panel
                        key={key}
                        data-testid={`usage-finding-${key}`}
                        style={{
                            background: tone.bg,
                            borderColor: `${tone.color}44`,
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                        }}
                    >
                        <UsageStatusIcon icon={ui.icon} tone={ui.tone} size={32} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: tokens.textPrimary }}>
                                    {ui.label}
                                </span>
                                <span
                                    style={{
                                        fontFamily: tokens.titleFont,
                                        fontSize: 16,
                                        fontWeight: 800,
                                        color: tone.color,
                                    }}
                                >
                                    {formatCount(counts[key] as number)}
                                </span>
                            </div>
                            <p style={{ margin: "4px 0 0", fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>
                                {ui.description}
                            </p>
                        </div>
                    </Panel>
                );
            })}
        </div>
    );
}
