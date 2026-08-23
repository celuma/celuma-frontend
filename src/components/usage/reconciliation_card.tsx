import { Card } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import Button from "../ui/button";
import Panel from "../ui/panel";
import UsageStatusIcon from "./usage_status_icon";
import ReconciliationFindings from "./reconciliation_findings";
import { tokens, cardStyle } from "../design/tokens";
import {
    INTEGRITY_STATUS_UI,
    RECONCILIATION_CARD_SUBTITLE,
    RECONCILIATION_CARD_TITLE,
    RECONCILIATION_LAST_RUN,
    RECONCILIATION_NEVER_RUN,
    RECONCILIATION_OBJECTS_CHECKED,
    RECONCILIATION_VERIFY,
    RECONCILIATION_VERIFYING,
    USAGE_TONE_COLORS,
    formatCount,
    formatUsageDateTime,
    reconciliationErrorMessage,
} from "../../lib/usage_ui";
import type { ReconciliationSummary } from "../../models/tenant_usage";

interface ReconciliationCardProps {
    reconciliation: ReconciliationSummary;
    onVerify: () => void;
    /** True while the manual POST is in flight. */
    verifying: boolean;
}

const titleStyle: React.CSSProperties = {
    fontFamily: tokens.titleFont,
    fontSize: 18,
    fontWeight: 800,
    color: tokens.textPrimary,
    margin: 0,
};

/**
 * Céluma 1.3, Phase 4, Block F — the latest storage verification and the manual
 * "Verificar ahora" action.
 *
 * Named for what it does for the tenant, not for the infrastructure it happens
 * to touch: "Verificación del almacenamiento", never "Estado de S3" or "AWS".
 * The provider is an implementation detail the product does not expose, and the
 * response carries no bucket, key or object identifier to expose in the first
 * place.
 *
 * Every state comes from `INTEGRITY_STATUS_UI` — the card writes no
 * `status === "…"` branch of its own beyond the three things that genuinely
 * differ in structure: `FAILED` swaps the standing description for the
 * error-code copy, `WARNING` adds the per-finding breakdown, and `RUNNING`
 * disables the action so a second run cannot be requested while one is going.
 *
 * `objects_checked` is shown when it was measured, but never an object
 * identifier, a name or a key: those are not in the response by design, and
 * asking for them is explicitly out of contract.
 */
export default function ReconciliationCard({
    reconciliation,
    onVerify,
    verifying,
}: ReconciliationCardProps) {
    const { integrity_status, has_run, started_at, completed_at, objects_checked, error_code } =
        reconciliation;

    const ui = INTEGRITY_STATUS_UI[integrity_status];
    const tone = USAGE_TONE_COLORS[ui.tone];
    const running = integrity_status === "RUNNING";

    // FAILED speaks through its sanitized code; every other state has one
    // standing description.
    const description =
        integrity_status === "FAILED" ? reconciliationErrorMessage(error_code) : ui.description;

    // While a run is in progress there is no completion time yet, so the start
    // is what there is to show.
    const timestamp = formatUsageDateTime(running ? started_at : completed_at ?? started_at);

    return (
        <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
            <div style={{ display: "grid", gap: 16 }}>
                <div
                    className="celuma-page-header"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <SafetyCertificateOutlined aria-hidden="true" style={{ color: tokens.primary, fontSize: 18 }} />
                            <h2 style={titleStyle}>{RECONCILIATION_CARD_TITLE}</h2>
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>
                            {RECONCILIATION_CARD_SUBTITLE}
                        </p>
                    </div>
                    <div className="celuma-page-cta" style={{ flexShrink: 0 }}>
                        <Button
                            type="primary"
                            size="small"
                            onClick={onVerify}
                            loading={verifying}
                            /* A run already in progress: the POST would answer 409,
                               and polling will pick up the result on its own. */
                            disabled={running}
                        >
                            {verifying || running ? RECONCILIATION_VERIFYING : RECONCILIATION_VERIFY}
                        </Button>
                    </div>
                </div>

                <Panel
                    data-testid="usage-integrity-status"
                    style={{
                        background: tone.bg,
                        borderColor: `${tone.color}44`,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                    }}
                >
                    <UsageStatusIcon icon={ui.icon} tone={ui.tone} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                        {/* The state is written out, so it never depends on the
                            icon or the background colour to be understood. */}
                        <div style={{ fontWeight: 700, fontSize: 15, color: tokens.textPrimary }}>{ui.label}</div>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>
                            {description}
                        </p>
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: tokens.textSecondary }}>
                            <span>
                                {RECONCILIATION_LAST_RUN}:{" "}
                                <strong style={{ color: tokens.textPrimary, fontWeight: 600 }}>
                                    {has_run && timestamp ? timestamp : RECONCILIATION_NEVER_RUN}
                                </strong>
                            </span>
                            {objects_checked !== null && (
                                <span>
                                    {RECONCILIATION_OBJECTS_CHECKED}:{" "}
                                    <strong style={{ color: tokens.textPrimary, fontWeight: 600 }}>
                                        {formatCount(objects_checked)}
                                    </strong>
                                </span>
                            )}
                        </div>
                    </div>
                </Panel>

                <ReconciliationFindings reconciliation={reconciliation} />
            </div>
        </Card>
    );
}
