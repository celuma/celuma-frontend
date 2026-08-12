import { Card } from "antd";
import { CloudServerOutlined, WarningOutlined } from "@ant-design/icons";
import Button from "../ui/button";
import Panel from "../ui/panel";
import UsageProgress from "./usage_progress";
import { tokens, cardStyle } from "../design/tokens";
import { formatBytes } from "../../lib/format_bytes";
import {
    STORAGE_CARD_TITLE,
    STORAGE_NOT_CALCULATED_DESCRIPTION,
    STORAGE_NOT_CALCULATED_TITLE,
    STORAGE_OVER_LIMIT,
    STORAGE_UNLIMITED,
    STORAGE_USED_LABEL,
    RECONCILIATION_VERIFY,
    RECONCILIATION_VERIFYING,
    USAGE_OVER_LIMIT_PERCENT,
    USAGE_TONE_COLORS,
    formatUsagePercent,
    usageAccentColor,
    storageProgressLabel,
    usageTone,
} from "../../lib/usage_ui";
import type { StorageUsage } from "../../models/tenant_usage";

interface StorageUsageCardProps {
    storage: StorageUsage;
    /** Fires the same reconciliation the verification card does. */
    onVerify: () => void;
    verifying: boolean;
    /**
     * Whether the backend already reports a run in progress.
     *
     * The uninitialized state below offers the *same* action as the
     * verification card, so it must be gated the same way: a second request
     * while a run is going can only earn a 409, and an enabled button that
     * cannot succeed is a worse answer than a disabled one that explains
     * itself. This is exactly the combination a first-ever verification
     * produces — no counter yet, and a run underway.
     */
    runInProgress?: boolean;
}

const titleStyle: React.CSSProperties = {
    fontFamily: tokens.titleFont,
    fontSize: 18,
    fontWeight: 800,
    color: tokens.textPrimary,
    margin: 0,
};

const numberStyle: React.CSSProperties = {
    fontFamily: tokens.titleFont,
    fontSize: 30,
    fontWeight: 800,
    color: tokens.textPrimary,
    lineHeight: 1.1,
};

/**
 * Céluma 1.3, Phase 4, Block F — current billable storage against the tenant's
 * configured limit.
 *
 * The primary number is **`billable_bytes`**, Céluma's authoritative billable
 * total. `reconciliation.actual_storage_bytes` is deliberately not shown here:
 * it is a recomputation from database relationships, not the tenant's physical
 * footprint, and presenting it as "the storage number" would invite exactly the
 * misreading block-f-dependencies.md §10 warns about.
 *
 * Three states, and the difference between them is the point of the card:
 *
 * 1. **Not initialized** (`initialized === false`, `billable_bytes === null`) —
 *    usage tracking has never been initialized. Renders "Uso aún no calculado"
 *    and a verify action, and shows **no bar, no `0 B`, and no `0%`**. This is
 *    not an error; it is the honest statement that nothing has been counted
 *    yet. A tenant with real, uncounted storage rendered as "0 B used" would
 *    silently under-report its own data.
 * 2. **Unlimited** (`unlimited === true`) — a real amount with no denominator.
 *    The absolute value and "Sin límite configurado", and again no bar: a
 *    progress indicator with no limit would have to invent 0% or 100%.
 * 3. **Limited** — value, limit, the backend's percentage and the bar.
 *
 * Over 100% the percentage is shown as it is (`123%`, never clamped) with an
 * over-limit visual state, and the copy says the usage is above the configured
 * limit — not that anything is blocked, because nothing in Céluma is.
 */
export default function StorageUsageCard({
    storage,
    onVerify,
    verifying,
    runInProgress = false,
}: StorageUsageCardProps) {
    const { initialized, billable_bytes, limit_bytes, unlimited, usage_percent, usage_ratio } = storage;

    const tone = usageTone(usage_percent);
    const percentLabel = formatUsagePercent(usage_percent);
    const overLimit = usage_percent !== null && usage_percent >= USAGE_OVER_LIMIT_PERCENT;

    const header = (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CloudServerOutlined aria-hidden="true" style={{ color: tokens.primary, fontSize: 18 }} />
            <h2 style={titleStyle}>{STORAGE_CARD_TITLE}</h2>
        </div>
    );

    // State 1 — nothing has been counted yet.
    if (!initialized || billable_bytes === null) {
        return (
            <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                <div style={{ display: "grid", gap: 14 }}>
                    {header}
                    <div>
                        <div style={{ ...numberStyle, fontSize: 22, color: tokens.textSecondary }}>
                            {STORAGE_NOT_CALCULATED_TITLE}
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>
                            {STORAGE_NOT_CALCULATED_DESCRIPTION}
                        </p>
                    </div>
                    <div>
                        <Button
                            type="primary"
                            size="small"
                            onClick={onVerify}
                            loading={verifying}
                            disabled={runInProgress}
                        >
                            {verifying || runInProgress ? RECONCILIATION_VERIFYING : RECONCILIATION_VERIFY}
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    // State 2 — a real amount, no denominator.
    if (unlimited) {
        return (
            <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                <div style={{ display: "grid", gap: 14 }}>
                    {header}
                    <div>
                        <div style={numberStyle}>{formatBytes(billable_bytes)} utilizados</div>
                        <div style={{ marginTop: 8 }}>
                            <Panel style={{ display: "inline-block", padding: "6px 12px", fontSize: 13, color: tokens.textSecondary }}>
                                {STORAGE_UNLIMITED}
                            </Panel>
                        </div>
                    </div>
                </div>
            </Card>
        );
    }

    // State 3 — value against a configured limit.
    return (
        <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
            <div style={{ display: "grid", gap: 14 }}>
                {header}

                <div>
                    <div style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 6 }}>
                        {STORAGE_USED_LABEL}
                    </div>
                    <div style={numberStyle}>{formatBytes(billable_bytes)}</div>
                    <div style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 4 }}>
                        de {formatBytes(limit_bytes)}
                    </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                        <span
                            style={{
                                fontFamily: tokens.titleFont,
                                fontSize: 18,
                                fontWeight: 800,
                                color: usageAccentColor(tone),
                            }}
                        >
                            {percentLabel}
                        </span>
                    </div>
                    <UsageProgress
                        percent={usage_percent}
                        ratio={usage_ratio}
                        label={storageProgressLabel(usage_percent)}
                    />
                </div>

                {overLimit && (
                    <Panel
                        style={{
                            background: USAGE_TONE_COLORS.danger.bg,
                            borderColor: `${USAGE_TONE_COLORS.danger.color}55`,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            fontSize: 13,
                            color: "#7f1d1d",
                        }}
                    >
                        {/* Icon + text, never colour alone — and the same
                            warning glyph the user card uses, so the two
                            over-limit notices read as one state. */}
                        <WarningOutlined aria-hidden="true" style={{ color: USAGE_TONE_COLORS.danger.color }} />
                        <span>{STORAGE_OVER_LIMIT}</span>
                    </Panel>
                )}
            </div>
        </Card>
    );
}
