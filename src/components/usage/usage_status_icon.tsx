import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    FileExclamationOutlined,
    FileSyncOutlined,
    InfoCircleOutlined,
    LoadingOutlined,
    LinkOutlined,
    QuestionCircleOutlined,
} from "@ant-design/icons";
import type { UsageIconKey, UsageTone } from "../../lib/usage_ui";
import { USAGE_TONE_COLORS } from "../../lib/usage_ui";

/**
 * Céluma 1.3, Phase 4, Block F — the single resolution point from a
 * `UsageIconKey` to an actual icon element.
 *
 * `lib/usage_ui.ts` owns *which* icon each backend state gets (it is a `.ts`
 * module and cannot hold JSX); this owns *what that icon is*. Splitting it this
 * way keeps every backend enum mapped in one place while still giving each
 * state its own glyph, so no component ever writes
 * `status === "FAILED" ? <X/> : …`.
 */
const ICONS: Record<UsageIconKey, React.ReactNode> = {
    unverified: <QuestionCircleOutlined />,
    running: <LoadingOutlined />,
    healthy: <CheckCircleOutlined />,
    partial: <InfoCircleOutlined />,
    warning: <ExclamationCircleOutlined />,
    failed: <CloseCircleOutlined />,
    missing: <FileExclamationOutlined />,
    orphan: <LinkOutlined />,
    mismatch: <FileSyncOutlined />,
};

interface UsageStatusIconProps {
    icon: UsageIconKey;
    tone: UsageTone;
    /** Diameter of the soft circle. */
    size?: number;
}

/**
 * The Céluma "soft circle" status glyph: ink-coloured icon on the same ink at
 * low opacity (CELUMA_DESIGN_SYSTEM.md §3).
 *
 * `aria-hidden`, always. The state it illustrates is written out in text right
 * beside it — the icon is decoration, and announcing it twice would be noise.
 * That is also why status is never carried by colour alone here.
 */
export default function UsageStatusIcon({ icon, tone, size = 40 }: UsageStatusIconProps) {
    const { color } = USAGE_TONE_COLORS[tone];
    return (
        <span
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: `${color}1a`,
                border: `1px solid ${color}33`,
                color,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: Math.round(size * 0.45),
                flexShrink: 0,
            }}
        >
            {ICONS[icon]}
        </span>
    );
}
