import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { returnFromState, type ReturnState } from "../lib/list_return";

/**
 * The return context a record page received from a list, to hand on when it opens a
 * related record (order → sample, sample → order), so "Volver a …" still leads back to
 * the list the user started from (Céluma 1.5, #66).
 */
export function useCarriedReturnState(): ReturnState | undefined {
    const { state } = useLocation();
    const ret = returnFromState(state);
    // Stable while the page's history state is: callbacks may depend on it.
    return useMemo(() => (ret ? { celumaReturn: ret } : undefined), [ret]);
}
