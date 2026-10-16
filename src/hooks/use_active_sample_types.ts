import { useEffect, useState } from "react";
import { listSampleTypes } from "../services/sample_type_service";
import type { SampleType } from "../models/sample_type";
import { getErrorMessage } from "../lib/api_error";

/**
 * The active sample types of the caller's laboratory — the only choices a NEW
 * sample may use (Céluma 1.4, issue #17). The API enforces the same rule; this
 * keeps the form honest and drives the empty-catalog guidance.
 */
export function useActiveSampleTypes() {
    const [types, setTypes] = useState<SampleType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        listSampleTypes(true)
            .then((rows) => alive && setTypes(rows))
            .catch((err) => alive && setError(getErrorMessage(err)))
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, []);

    return { types, loading, error, empty: !loading && !error && types.length === 0 };
}
