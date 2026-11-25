/**
 * Céluma 1.5 (#65): the list of what must be fixed before "Enviar a revisión",
 * shown in the report editor header. Each item names the affected section and,
 * where possible, takes the user there.
 */
import { forwardRef } from "react";
import { ExclamationCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import { REVIEW_SECTION_ACTION, type ReviewBlocker } from "../../lib/review_submission";

interface Props {
    blockers: ReviewBlocker[];
    /** Takes the user to the blocker's section (scroll + focus, route or reload). */
    onGo: (blocker: ReviewBlocker) => void;
}

const ReviewSubmissionBlockers = forwardRef<HTMLDivElement, Props>(function ReviewSubmissionBlockers({ blockers, onGo }, ref) {
    if (blockers.length === 0) return null;
    const hasBlocker = blockers.some((b) => b.severity === "blocker");
    const palette = hasBlocker
        ? { background: "#fef2f2", border: "#fecaca", color: "#991b1b", icon: "#dc2626" }
        : { background: "#fffbeb", border: "#fde68a", color: "#92400e", icon: "#d97706" };

    return (
        <div
            ref={ref}
            tabIndex={-1}
            role="region"
            aria-label="Requisitos para enviar a revisión"
            aria-live="polite"
            data-testid="review-submission-blockers"
            style={{
                marginTop: 12,
                borderRadius: 10,
                padding: "10px 12px",
                background: palette.background,
                border: `1px solid ${palette.border}`,
                color: palette.color,
                fontSize: 12.5,
                lineHeight: 1.45,
                outline: "none",
            }}
        >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {hasBlocker ? "Antes de enviar a revisión" : "Revisa antes de enviar a revisión"}
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {blockers.map((b) => {
                    const action = REVIEW_SECTION_ACTION[b.section];
                    return (
                        <li
                            key={b.id}
                            data-testid={`review-blocker-${b.id}`}
                            data-section={b.section}
                            style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                        >
                            {b.severity === "blocker" ? (
                                <ExclamationCircleOutlined aria-label="Bloquea el envío" style={{ color: palette.icon, marginTop: 3 }} />
                            ) : (
                                <InfoCircleOutlined aria-label="Aviso" style={{ color: "#d97706", marginTop: 3 }} />
                            )}
                            <div style={{ minWidth: 0 }}>
                                <b>{b.title}.</b> {b.detail}
                                {action && (
                                    <>
                                        {" "}
                                        <button
                                            type="button"
                                            onClick={() => onGo(b)}
                                            data-testid={`review-blocker-go-${b.id}`}
                                            style={{
                                                background: "none",
                                                border: "none",
                                                padding: 0,
                                                font: "inherit",
                                                fontWeight: 600,
                                                color: tokens.primary,
                                                cursor: "pointer",
                                                textDecoration: "underline",
                                            }}
                                        >
                                            {action}
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
});

export default ReviewSubmissionBlockers;
