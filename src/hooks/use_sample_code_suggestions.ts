import { useEffect, useRef, useState } from "react";
import { suggestSampleCodes } from "../services/numbering_service";
import {
    buildSuggestionRequest,
    toRowSuggestions,
    type RowSuggestion,
    type SampleCodeRow,
} from "../lib/sample_code_rows";

/** Typing a manual code changes the reserved list on every key: wait for a pause before asking again. */
const DEBOUNCE_MS = 300;

export interface SampleCodeSuggestions {
    byKey: Record<string, RowSuggestion | undefined>;
    /** The last request failed: the suggestion is unavailable, the code is still assigned on save. */
    failed: boolean;
}

/**
 * Read-only suggestions for the automatic rows of a registration form (hotfix 1.4.3).
 *
 * One request per change of what matters (type, valid receipt date, branch, the other rows' typed codes);
 * a response is applied only if it answers the LATEST request, so a slow answer can never replace a newer
 * one. It never writes into the form: the caller derives what a row shows from the row and this result
 * (`resolveRowCode`), which is what keeps a typed code safe from late answers.
 */
export function useSampleCodeSuggestions(rows: SampleCodeRow[], branchId: string | undefined, enabled = true): SampleCodeSuggestions {
    const [state, setState] = useState<SampleCodeSuggestions>({ byKey: {}, failed: false });
    const latest = useRef(0);
    const request = enabled ? buildSuggestionRequest(rows, branchId) : null;
    const signature = request ? JSON.stringify(request) : "";

    useEffect(() => {
        const ticket = ++latest.current;
        if (!signature) return;
        const asked = JSON.parse(signature) as NonNullable<ReturnType<typeof buildSuggestionRequest>>;
        const timer = setTimeout(() => {
            suggestSampleCodes(asked)
                .then((res) => {
                    if (ticket === latest.current) setState({ byKey: toRowSuggestions(asked, res.suggestions), failed: false });
                })
                .catch(() => {
                    if (ticket === latest.current) setState((prev) => ({ ...prev, failed: true }));
                });
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [signature]);

    useEffect(() => () => { latest.current += 1; }, []);

    return state;
}
