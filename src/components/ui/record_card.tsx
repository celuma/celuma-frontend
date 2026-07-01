import React from "react";
import { Card } from "antd";
import { tokens, cardStyle } from "../design/tokens";

/**
 * RecordCard (Céluma "ficha") — the shared entity-detail header used across order,
 * sample and report detail screens. A card with a salmon left border and a fluid
 * badge: avatar + title/subtitle on the left, optional meta row and stats, an
 * optional right-aligned action rail, and code/status chips pinned top-right.
 * Below the badge it renders `children` (typically the description `Panel`).
 *
 * It's layout-only and slot-driven: callers pass fully-formed nodes (the clickable
 * <h1>, the MetaItems, the Stats, the ActionButtonPanel…) so each screen keeps its
 * own content while sharing one visual language.
 */

// ── Shared chip styles (entity code = salmon, status = its palette tint) ──
export const codeChipStyle: React.CSSProperties = {
    background: tokens.secondary,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
};

export const statusChipStyle = (cfg: { color: string; bg: string }): React.CSSProperties => ({
    background: cfg.bg,
    color: cfg.color,
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 999,
    lineHeight: 1.5,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
});

/** A teal-iconed metadata item for the ficha meta row. */
export const MetaItem = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: tokens.textSecondary, fontSize: 14 }}>
        <span style={{ color: tokens.primary, fontSize: 16, display: "inline-flex" }}>{icon}</span>
        {children}
    </span>
);

/** A big Baloo number + label for the ficha stats strip. */
export const Stat = ({ value, label, color }: { value: number | string; label: string; color: string }) => (
    <div style={{ textAlign: "center", padding: "0 18px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: tokens.titleFont, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{label}</div>
    </div>
);

/** Thin vertical divider placed between Stats. */
export const StatDivider = () => <div className="cf-stat-divider" />;

const FICHA_CSS = `
.cf-badge { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: stretch; }
.cf-badge-info { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; }
.cf-name-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.cf-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 12px; }
.cf-stats { display: flex; flex-wrap: wrap; align-items: stretch; margin-left: -18px; margin-top: 18px; }
.cf-stat-divider { width: 1px; background: #eef1f0; }
.cf-rail { display: flex; flex-direction: row; flex-wrap: wrap; align-items: flex-end; justify-content: flex-end; gap: 12px 20px; margin-left: auto; align-self: flex-end; }
@media (max-width: 640px) {
    .cf-badge { flex-direction: column; align-items: center; text-align: center; }
    .cf-meta { justify-content: center; }
    .cf-name-row { justify-content: center; }
    .cf-stats { margin-left: 0; justify-content: center; }
    .cf-rail { width: 100%; flex-wrap: wrap; justify-content: center; align-self: auto; margin-left: 0; }
}
`;

type RecordCardProps = {
    loading?: boolean;
    /** Large avatar node (entity/patient avatar or type circle). */
    avatar: React.ReactNode;
    /** Title node — typically a clickable <h1>. */
    title: React.ReactNode;
    /** Small muted subtitle shown next to the title (e.g. a code). */
    subtitle?: React.ReactNode;
    /** Top-right chips (code + status). */
    chips?: React.ReactNode;
    /** Meta row content — usually a set of <MetaItem>. */
    meta?: React.ReactNode;
    /** Stats strip — usually <Stat> separated by <StatDivider>. */
    stats?: React.ReactNode;
    /** Right rail — usually an ActionButtonPanel and/or alert Panel. */
    rail?: React.ReactNode;
    /** Content rendered below the badge (e.g. the description Panel). */
    children?: React.ReactNode;
    /** Extra style merged onto the card. */
    style?: React.CSSProperties;
};

export default function RecordCard({
    loading,
    avatar,
    title,
    subtitle,
    chips,
    meta,
    stats,
    rail,
    children,
    style,
}: RecordCardProps) {
    return (
        <Card
            loading={loading}
            style={{ ...cardStyle, borderLeft: `5px solid ${tokens.secondary}`, position: "relative", ...style }}
        >
            <style>{FICHA_CSS}</style>
            {chips && (
                <div style={{ position: "absolute", top: 16, right: 20, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {chips}
                </div>
            )}
            <div className="cf-badge">
                {avatar}
                <div className="cf-badge-info">
                    <div className="cf-name-row">
                        {title}
                        {subtitle != null && (
                            <span style={{ fontSize: 13, color: tokens.textSecondary }}>{subtitle}</span>
                        )}
                    </div>
                    {meta && <div className="cf-meta">{meta}</div>}
                    {stats && <div className="cf-stats">{stats}</div>}
                </div>
                {rail && <div className="cf-rail">{rail}</div>}
            </div>
            {children}
        </Card>
    );
}
