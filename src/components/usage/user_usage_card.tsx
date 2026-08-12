import { Card } from "antd";
import { TeamOutlined, WarningOutlined } from "@ant-design/icons";
import Panel from "../ui/panel";
import Tooltip from "../ui/tooltip";
import UsageProgress from "./usage_progress";
import { tokens, cardStyle } from "../design/tokens";
import {
    USERS_CARD_TITLE,
    USERS_OVER_LIMIT,
    USERS_PHYSICIAN_PORTAL_HINT,
    USERS_PHYSICIAN_PORTAL_LABEL,
    USERS_REGISTERED_HINT,
    USERS_REGISTERED_LABEL,
    USERS_SECONDARY_TITLE,
    USERS_UNLIMITED,
    USAGE_OVER_LIMIT_PERCENT,
    USAGE_TONE_COLORS,
    activeInternalUsersLabel,
    formatCount,
    formatUsagePercent,
    usageAccentColor,
    usageTone,
    userProgressLabel,
    usersOfLimitLabel,
} from "../../lib/usage_ui";
import type { UserUsage } from "../../models/tenant_usage";

interface UserUsageCardProps {
    users: UserUsage;
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

/** One informational count — registered users, physician-portal accounts. */
function SecondaryCount({ label, value, hint }: { label: string; value: number; hint?: string }) {
    const caption = (
        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 4, cursor: hint ? "help" : undefined }}>
            {label}
        </div>
    );
    return (
        <Panel style={{ flex: "1 1 140px", minWidth: 0, padding: "12px 14px" }}>
            <div style={{ fontFamily: tokens.titleFont, fontSize: 22, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1 }}>
                {formatCount(value)}
            </div>
            {hint ? <Tooltip title={hint}>{caption}</Tooltip> : caption}
        </Panel>
    );
}

/**
 * Céluma 1.3, Phase 4, Block F — licensed seats against the tenant's user
 * limit, plus the two counts that do not consume it.
 *
 * The numerator is **`active_internal_users`** and nothing else. That is the
 * licensed-seat metric the backend decided (usage-response-semantics.md §3);
 * `registered_users` counts every row of the tenant including inactive ones,
 * and `active_physician_portal_users` counts external portal accounts, which
 * are disjoint from internal users by construction. Using either as the
 * numerator would reimplement — and contradict — Céluma's commercial rules in
 * React. They are shown as informational counts instead, with copy that says
 * plainly that portal accounts do not consume a seat.
 *
 * Unlimited and over-limit behave exactly as the storage card's: no invented
 * denominator, no clamped percentage, and no suggestion that a user is blocked
 * or deactivated — Phase 4 measures and does not enforce.
 */
export default function UserUsageCard({ users }: UserUsageCardProps) {
    const {
        active_internal_users,
        registered_users,
        active_physician_portal_users,
        user_limit,
        unlimited,
        usage_percent,
        usage_ratio,
    } = users;

    const tone = usageTone(usage_percent);
    const percentLabel = formatUsagePercent(usage_percent);
    const overLimit = usage_percent !== null && usage_percent >= USAGE_OVER_LIMIT_PERCENT;

    const secondary = (
        <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tokens.textSecondary }}>
                {USERS_SECONDARY_TITLE}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <SecondaryCount
                    label={USERS_REGISTERED_LABEL}
                    value={registered_users}
                    hint={USERS_REGISTERED_HINT}
                />
                <SecondaryCount
                    label={USERS_PHYSICIAN_PORTAL_LABEL}
                    value={active_physician_portal_users}
                />
            </div>
            {/* Visible rather than a tooltip: this is the one distinction a
                reader needs to make sense of two different user numbers on the
                same card, and hover-only text is unavailable on touch and to a
                screen reader that is not pointing at the element. */}
            <p style={{ margin: 0, fontSize: 12, color: tokens.textSecondary, lineHeight: 1.5 }}>
                {USERS_PHYSICIAN_PORTAL_HINT}
            </p>
        </div>
    );

    return (
        <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
            <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TeamOutlined aria-hidden="true" style={{ color: tokens.primary, fontSize: 18 }} />
                    <h2 style={titleStyle}>{USERS_CARD_TITLE}</h2>
                </div>

                {unlimited || user_limit === null ? (
                    <div>
                        <div style={numberStyle}>{activeInternalUsersLabel(active_internal_users)}</div>
                        <div style={{ marginTop: 8 }}>
                            <Panel style={{ display: "inline-block", padding: "6px 12px", fontSize: 13, color: tokens.textSecondary }}>
                                {USERS_UNLIMITED}
                            </Panel>
                        </div>
                    </div>
                ) : (
                    <>
                        <div>
                            <div style={numberStyle}>
                                {usersOfLimitLabel(active_internal_users, user_limit)}
                            </div>
                            <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 4 }}>
                                usuarios internos activos
                            </div>
                        </div>

                        <div style={{ display: "grid", gap: 8 }}>
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
                            <UsageProgress
                                percent={usage_percent}
                                ratio={usage_ratio}
                                label={userProgressLabel(usage_percent)}
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
                                <WarningOutlined aria-hidden="true" style={{ color: USAGE_TONE_COLORS.danger.color }} />
                                <span>{USERS_OVER_LIMIT}</span>
                            </Panel>
                        )}
                    </>
                )}

                {secondary}
            </div>
        </Card>
    );
}
