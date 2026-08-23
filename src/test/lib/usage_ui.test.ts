/**
 * Céluma 1.3, Phase 4, Block F — the usage presentation map.
 *
 * This is where the block's honesty rules are enforceable as assertions rather
 * than as review comments: which states may look green, which percentages may
 * be clamped, which findings may be merged, and which backend strings may reach
 * a user.
 */
import { describe, expect, it } from "vitest";
import {
    INTEGRITY_FINDING_ORDER,
    INTEGRITY_FINDING_UI,
    INTEGRITY_STATUS_UI,
    RECONCILIATION_ERROR_FALLBACK,
    USAGE_OVER_LIMIT_PERCENT,
    USAGE_WARNING_PERCENT,
    formatCount,
    formatUsageDateTime,
    formatUsagePercent,
    progressBarWidthPercent,
    reconciliationErrorMessage,
    storageProgressLabel,
    usageTone,
    userProgressLabel,
    usersOfLimitLabel,
    activeInternalUsersLabel,
} from "../../lib/usage_ui";
import {
    INTEGRITY_STATUSES,
    RECONCILIATION_ERROR_CODES,
    type ReconciliationErrorCode,
} from "../../models/tenant_usage";

// ---------------------------------------------------------------------------
// integrity_status
// ---------------------------------------------------------------------------

describe("INTEGRITY_STATUS_UI", () => {
    it("covers every backend value, so no state can fall through to undefined", () => {
        for (const status of INTEGRITY_STATUSES) {
            expect(INTEGRITY_STATUS_UI[status]).toBeDefined();
            expect(INTEGRITY_STATUS_UI[status].label).not.toBe("");
            expect(INTEGRITY_STATUS_UI[status].description).not.toBe("");
        }
    });

    it("shows green for HEALTHY only", () => {
        // A check that never ran, or ran with its integrity half disabled, must
        // not look like a check that passed.
        expect(INTEGRITY_STATUS_UI.HEALTHY.tone).toBe("success");
        for (const status of INTEGRITY_STATUSES) {
            if (status === "HEALTHY") continue;
            expect(INTEGRITY_STATUS_UI[status].tone).not.toBe("success");
        }
    });

    it("keeps NOT_RUN and ACCOUNTING_ONLY neutral rather than positive or alarming", () => {
        expect(["neutral", "info"]).toContain(INTEGRITY_STATUS_UI.NOT_RUN.tone);
        expect(["neutral", "info"]).toContain(INTEGRITY_STATUS_UI.ACCOUNTING_ONLY.tone);
        // ACCOUNTING_ONLY says both halves out loud: usage verified, files not.
        expect(INTEGRITY_STATUS_UI.ACCOUNTING_ONLY.description).toMatch(/uso fue verificado/i);
        expect(INTEGRITY_STATUS_UI.ACCOUNTING_ONLY.description).toMatch(/no se comprobó/i);
    });

    it("marks WARNING amber and FAILED red", () => {
        expect(INTEGRITY_STATUS_UI.WARNING.tone).toBe("warning");
        expect(INTEGRITY_STATUS_UI.FAILED.tone).toBe("danger");
    });

    it("gives every state its own icon, so tone alone never identifies it", () => {
        const icons = INTEGRITY_STATUSES.map((s) => INTEGRITY_STATUS_UI[s].icon);
        expect(new Set(icons).size).toBe(INTEGRITY_STATUSES.length);
    });

    it("names no cloud provider anywhere", () => {
        // The UI stays provider-agnostic: the response carries no bucket, key
        // or vendor, and the product does not expose one.
        const copy = INTEGRITY_STATUSES.map(
            (s) => `${INTEGRITY_STATUS_UI[s].label} ${INTEGRITY_STATUS_UI[s].description}`,
        ).join(" ");
        expect(copy).not.toMatch(/s3|aws|amazon|bucket/i);
    });
});

// ---------------------------------------------------------------------------
// error_code
// ---------------------------------------------------------------------------

describe("reconciliationErrorMessage", () => {
    it("maps every sanitized code to human Spanish", () => {
        for (const code of RECONCILIATION_ERROR_CODES) {
            const message = reconciliationErrorMessage(code);
            expect(message).not.toBe("");
            // The raw operator token is never the user copy.
            expect(message).not.toContain(code);
            expect(message).not.toMatch(/s3|aws|_/i);
        }
    });

    it("distinguishes the five causes from one another", () => {
        const messages = RECONCILIATION_ERROR_CODES.map(reconciliationErrorMessage);
        expect(new Set(messages).size).toBe(RECONCILIATION_ERROR_CODES.length);
    });

    it("explains a recovered stale run as an interruption, not an outage", () => {
        expect(reconciliationErrorMessage("stale_run_recovered")).toMatch(/interrumpió/i);
    });

    it("falls back rather than echoing an unknown or absent code", () => {
        expect(reconciliationErrorMessage(null)).toBe(RECONCILIATION_ERROR_FALLBACK);
        expect(reconciliationErrorMessage(undefined)).toBe(RECONCILIATION_ERROR_FALLBACK);
        expect(reconciliationErrorMessage("brand_new_code" as ReconciliationErrorCode)).toBe(
            RECONCILIATION_ERROR_FALLBACK,
        );
    });
});

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

describe("INTEGRITY_FINDING_UI", () => {
    it("gives missing objects stronger copy and a stronger tone than orphans", () => {
        // A missing object may be the loss of a clinical artifact; an orphan is
        // a cost question. They must not read the same.
        expect(INTEGRITY_FINDING_UI.missing.tone).toBe("danger");
        expect(INTEGRITY_FINDING_UI.orphans.tone).toBe("warning");
        expect(INTEGRITY_FINDING_UI.missing.description).toMatch(/requieren revisión/i);
    });

    it("orders findings strongest first", () => {
        expect(INTEGRITY_FINDING_ORDER[0]).toBe("missing");
    });

    it("keeps the three labels and descriptions distinct", () => {
        const labels = INTEGRITY_FINDING_ORDER.map((k) => INTEGRITY_FINDING_UI[k].label);
        const descriptions = INTEGRITY_FINDING_ORDER.map((k) => INTEGRITY_FINDING_UI[k].description);
        expect(new Set(labels).size).toBe(3);
        expect(new Set(descriptions).size).toBe(3);
    });

    it("never states a cause the backend does not know", () => {
        const copy = INTEGRITY_FINDING_ORDER.map(
            (k) => `${INTEGRITY_FINDING_UI[k].label} ${INTEGRITY_FINDING_UI[k].description}`,
        ).join(" ");
        // Not "deleted" (the backend does not know why an object is absent),
        // not "corrupt" (a mismatch is a disagreement), and no suggestion that
        // an orphan belongs to a patient or should be removed.
        expect(copy).not.toMatch(/eliminad|borrad|corrupt|paciente/i);
    });
});

// ---------------------------------------------------------------------------
// Thresholds and the bar
// ---------------------------------------------------------------------------

describe("usageTone", () => {
    it("is neutral below 80, warning from 80, danger from 100", () => {
        expect(usageTone(0)).toBe("neutral");
        expect(usageTone(79.99)).toBe("neutral");
        expect(usageTone(USAGE_WARNING_PERCENT)).toBe("warning");
        expect(usageTone(99.99)).toBe("warning");
        expect(usageTone(USAGE_OVER_LIMIT_PERCENT)).toBe("danger");
        expect(usageTone(120)).toBe("danger");
    });

    it("is neutral when there is no percentage — nothing to warn about", () => {
        expect(usageTone(null)).toBe("neutral");
        expect(usageTone(undefined)).toBe("neutral");
    });
});

describe("progressBarWidthPercent", () => {
    it("clamps the bar's geometry to its track", () => {
        expect(progressBarWidthPercent(120, 1.2)).toBe(100);
        expect(progressBarWidthPercent(-5, null)).toBe(0);
    });

    it("prefers the unrounded ratio for the width", () => {
        expect(progressBarWidthPercent(0.01, 0.000123456789)).toBeCloseTo(0.0123456789, 8);
    });

    it("is zero when there is no denominator", () => {
        expect(progressBarWidthPercent(null, null)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Number and date formatting
// ---------------------------------------------------------------------------

describe("formatUsagePercent", () => {
    it("never clamps a real over-limit percentage", () => {
        expect(formatUsagePercent(120)).toBe("120%");
        expect(formatUsagePercent(1234.56)).toBe("1,234.56%");
    });

    it("strips the trailing zeros of a round value and keeps real decimals", () => {
        expect(formatUsagePercent(80)).toBe("80%");
        expect(formatUsagePercent(0)).toBe("0%");
        expect(formatUsagePercent(12.34)).toBe("12.34%");
        expect(formatUsagePercent(12.3)).toBe("12.3%");
    });

    it("returns null when absent, so no caller can render a fake 0%", () => {
        expect(formatUsagePercent(null)).toBeNull();
        expect(formatUsagePercent(undefined)).toBeNull();
    });
});

describe("formatUsageDateTime", () => {
    it("reads a naive backend timestamp as UTC, not as local time", () => {
        // 00:30 UTC. Parsed as local it would be a different instant, and in a
        // negative-offset timezone a different day.
        const utcMidnight = formatUsageDateTime("2026-08-11T00:30:00");
        const explicitUtc = formatUsageDateTime("2026-08-11T00:30:00Z");
        expect(utcMidnight).toBe(explicitUtc);
    });

    it("renders in the viewer's own timezone with a readable month", () => {
        const formatted = formatUsageDateTime("2026-08-11T12:00:00");
        expect(formatted).toContain("2026");
        expect(formatted).toMatch(/ago/i);
        // No hand-appended offset — the browser already localized it.
        expect(formatted).not.toMatch(/utc|gmt|[+-]\d{2}:\d{2}/i);
    });

    it("returns null for an absent or unparseable timestamp", () => {
        expect(formatUsageDateTime(null)).toBeNull();
        expect(formatUsageDateTime(undefined)).toBeNull();
        expect(formatUsageDateTime("not a date")).toBeNull();
    });
});

describe("counts and labels", () => {
    it("groups counts in the es-MX convention", () => {
        expect(formatCount(8)).toBe("8");
        expect(formatCount(1234)).toBe("1,234");
    });

    it("reads seats as 'usados de límite'", () => {
        expect(usersOfLimitLabel(8, 10)).toBe("8 de 10");
        expect(usersOfLimitLabel(12, 10)).toBe("12 de 10");
    });

    it("pluralizes the unlimited user label", () => {
        expect(activeInternalUsersLabel(1)).toBe("1 usuario interno activo");
        expect(activeInternalUsersLabel(8)).toBe("8 usuarios internos activos");
    });
});

describe("accessible progress labels", () => {
    it("states the percentage in words rather than leaving it to the bar", () => {
        expect(userProgressLabel(80)).toBe("80% de usuarios internos utilizados");
        expect(storageProgressLabel(12.34)).toBe("12.34% del almacenamiento utilizado");
    });

    it("says there is no percentage instead of announcing 0%", () => {
        expect(storageProgressLabel(null)).not.toContain("0%");
        expect(userProgressLabel(null)).not.toContain("0%");
    });
});
