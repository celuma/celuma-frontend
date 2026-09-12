/**
 * Céluma 1.3.1 Block E (CEL-131-10) — `RecordCard` header scenarios.
 *
 * Same shape as `usage_scenarios.tsx` / `notification_scenarios.tsx`: its own
 * module beside the report harness, mounting the real component with fixed
 * props so a real browser can measure what jsdom cannot.
 *
 * Why a real browser is the only place this defect exists at all: the card's
 * code/status chips were absolutely positioned at the card's top-right with no
 * width bound, while the patient name is the first thing in the normal flow at
 * the top-LEFT. Nothing in the DOM says they collide — they collide when a long
 * sample code makes the chip row grow leftwards far enough to be painted over
 * the name. Only layout can answer that, so these scenarios exist to be
 * measured (`record_card_long_names.visual.spec.ts`), not screenshotted.
 *
 * Nothing here is bundled into the production app — `vite.harness.config.ts` is
 * the only config that serves this directory.
 */
import { ConfigProvider, Avatar } from "antd";
import { ContainerOutlined } from "@ant-design/icons";
import RecordCard, {
    codeChipStyle,
    statusChipStyle,
    MetaItem,
    Stat,
} from "../../src/components/ui/record_card";
import { tokens } from "../../src/components/design/tokens";

/** The real sample-detail header, with only the sample code varying. */
function SampleHeader({ sampleCode }: { sampleCode: string }) {
    return (
        <div style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
            <RecordCard
                avatar={
                    <Avatar
                        size={104}
                        style={{ backgroundColor: "#8b5cf6", fontSize: 38, fontWeight: 700, flexShrink: 0 }}
                    >
                        MR
                    </Avatar>
                }
                chips={
                    <>
                        <span style={codeChipStyle} data-testid="code-chip">{sampleCode}</span>
                        <span style={statusChipStyle({ color: "#0f8b8d", bg: "#f0fdfa" })} data-testid="status-chip">
                            Recibida
                        </span>
                    </>
                }
                title={
                    <h1
                        data-testid="patient-name"
                        style={{
                            margin: 0,
                            fontFamily: tokens.titleFont,
                            fontSize: 26,
                            fontWeight: 800,
                            color: tokens.textPrimary,
                            lineHeight: 1.1,
                        }}
                    >
                        María Fernanda Rodríguez Quintanilla
                    </h1>
                }
                subtitle={<span data-testid="patient-code">PAC-000412</span>}
                meta={
                    <>
                        <MetaItem icon={<ContainerOutlined />}>
                            <span style={{ marginRight: 4 }}>Tipo:</span>
                            <span style={{ fontWeight: 600, color: tokens.textPrimary }}>Biopsia</span>
                        </MetaItem>
                        <MetaItem icon={<ContainerOutlined />}>
                            <span style={{ marginRight: 4 }}>Orden:</span>
                            <span style={{ fontWeight: 600, color: tokens.primary }}>ORD-000412</span>
                        </MetaItem>
                    </>
                }
                stats={<Stat value={3} label="Imágenes" color={tokens.primary} />}
            />
        </div>
    );
}

/**
 * Sample codes a laboratory can genuinely produce. `long` is the customer's
 * case — a descriptive sample name rather than a short code. `unbroken` is the
 * pathological one: a single token with no break opportunity, which no amount
 * of wrapping can shorten.
 */
const SAMPLE_CODES: Record<string, string> = {
    short: "M-001",
    typical: "BX-2026-000412-A",
    long: "Biopsia incisional de lesión pigmentada en región escapular derecha — fragmento A",
    unbroken: "BIOPSIA-INCISIONAL-LESION-PIGMENTADA-REGION-ESCAPULAR-DERECHA-FRAGMENTO-A-0000412",
};

export function RecordCardHarness({ scenarioKey }: { scenarioKey: string }) {
    const code = SAMPLE_CODES[scenarioKey];
    if (!code) {
        return <div data-error="unknown-scenario">Escenario desconocido: {scenarioKey}</div>;
    }
    return (
        <ConfigProvider theme={{ token: { colorPrimary: tokens.primary, borderRadius: 8 } }}>
            <div data-ready="true">
                <SampleHeader sampleCode={code} />
            </div>
        </ConfigProvider>
    );
}
