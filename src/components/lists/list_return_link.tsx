import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { tokens } from "../design/tokens";
import { currentHistoryIdx, returnFromState, type RestoreState } from "../../lib/list_return";

/**
 * "Volver a Órdenes" — Céluma's in-app return from a record to the list it was opened from.
 *
 * When the list is the previous history entry this is a real Back, so the history stays
 * list → record. Otherwise (a related record was opened in between, or the page was reloaded
 * into a new history) it opens the list's saved URL and asks it to restore like a Back
 * would. Rendered only when the page was opened from a list.
 */
export default function ListReturnLink() {
    const location = useLocation();
    const navigate = useNavigate();
    const ret = returnFromState(location.state);
    if (!ret) return null;

    const goBack = () => {
        const idx = currentHistoryIdx();
        if (ret.fromIdx !== undefined && idx !== undefined && idx === ret.fromIdx + 1) {
            navigate(-1);
            return;
        }
        const state: RestoreState = { celumaRestore: ret.listKey };
        navigate(ret.url, { state });
    };

    return (
        <a
            href={ret.url}
            onClick={(event) => {
                event.preventDefault();
                goBack();
            }}
            data-testid="list-return-link"
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
            Volver a {ret.label}
        </a>
    );
}
