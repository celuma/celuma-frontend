import { useEffect, useRef, useState } from "react";
import { previewNumbering } from "../services/numbering_service";
import { getErrorMessage } from "../lib/api_error";
import type { NumberingPreview, NumberingPreviewRequest } from "../models/numbering";

const DEBOUNCE_MS = 350;

export interface NumberingPreviewState {
    /** The answer to the LATEST request, or the last good one while a newer request is pending. */
    preview: NumberingPreview | null;
    /** A request for the current inputs is in flight (the shown preview may be for older inputs). */
    loading: boolean;
    /** The latest request failed (network or server error); the inputs are untouched. */
    error: string | null;
    /** The shown preview answers older inputs than the current ones. */
    stale: boolean;
    retry: () => void;
}

/**
 * Céluma 1.5 (#64): the read-only server preview of a numbering candidate (it reserves nothing).
 *
 * Debounced; every request carries a ticket and only the answer to the latest ticket is applied, so a slow
 * answer for older inputs can never replace a newer one. A failure keeps the last good preview, marked stale,
 * and never touches the caller's inputs. `null` request = no preview wanted.
 */
export function useNumberingPreview(request: NumberingPreviewRequest | null): NumberingPreviewState {
    const signature = request ? JSON.stringify(request) : "";
    const [state, setState] = useState<{ preview: NumberingPreview | null; for: string; error: string | null; pending: boolean }>(
        { preview: null, for: "", error: null, pending: false },
    );
    const [attempt, setAttempt] = useState(0);
    const latest = useRef(0);

    useEffect(() => {
        const ticket = ++latest.current;
        if (!signature) return;
        setState((s) => ({ ...s, pending: true }));
        const timer = setTimeout(() => {
            previewNumbering(JSON.parse(signature) as NumberingPreviewRequest)
                .then((p) => {
                    if (ticket === latest.current) setState({ preview: p, for: signature, error: null, pending: false });
                })
                .catch((err) => {
                    if (ticket === latest.current) setState((s) => ({ ...s, error: getErrorMessage(err), pending: false }));
                });
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [signature, attempt]);

    useEffect(() => () => { latest.current += 1; }, []);

    return {
        preview: signature ? state.preview : null,
        loading: state.pending,
        error: state.error,
        stale: !!state.preview && state.for !== signature,
        retry: () => setAttempt((n) => n + 1),
    };
}
