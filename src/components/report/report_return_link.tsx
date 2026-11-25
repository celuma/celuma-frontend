import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import { currentHistoryIdx } from "../../lib/list_return";

/** History state the Reports list puts on the report it opens (Céluma 1.5). */
export interface ReportReturnState {
    reportReturn?: { url: string; fromIdx?: number };
}

/**
 * The report editor's way back (Céluma 1.5): "Volver a Reportes" when the report
 * was opened from the Reports list, otherwise "Volver a la orden". Unsaved edits
 * are guarded like any other in-app navigation (`UnsavedChangesGuard`).
 */
export default function ReportReturnLink({ orderId }: { orderId?: string | null }) {
    const location = useLocation();
    const navigate = useNavigate();
    const fromList = (location.state as ReportReturnState | null)?.reportReturn;
    const fromReports = fromList && typeof fromList.url === "string" ? fromList : null;
    if (!fromReports && !orderId) return null;

    const href = fromReports ? fromReports.url : `/orders/${orderId}`;
    const goBack = () => {
        if (fromReports) {
            // A real Back when the list is the previous entry keeps its search and page.
            const idx = currentHistoryIdx();
            if (fromReports.fromIdx !== undefined && idx === fromReports.fromIdx + 1) {
                navigate(-1);
                return;
            }
        }
        navigate(href);
    };

    return (
        <a
            href={href}
            onClick={(event) => {
                event.preventDefault();
                goBack();
            }}
            data-testid="report-return-link"
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                width: "fit-content",
                fontFamily: tokens.textFont,
                fontSize: 14,
                fontWeight: 600,
                color: tokens.primary,
                textDecoration: "none",
                marginBottom: 12,
            }}
        >
            <ArrowLeftOutlined aria-hidden="true" />
            {fromReports ? "Volver a Reportes" : "Volver a la orden"}
        </a>
    );
}
