import { useEffect, useState } from "react";
import { getNumberingConfigs } from "../services/numbering_service";
import type { ManualEntry } from "../models/numbering";

/**
 * How each registration form should offer the code input to THIS user (Céluma 1.4, issue #8).
 *
 * The API computes it from the laboratory's policy AND the user's capability and enforces both
 * on every request; this only shapes the form. A failed or slow load falls back to `optional`
 * (an input the server can still refuse).
 */
export function useManualEntryModes() {
    const [modes, setModes] = useState<{ order: ManualEntry; sample: ManualEntry }>({ order: "optional", sample: "optional" });
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let alive = true;
        getNumberingConfigs()
            .then((c) => alive && setModes({ order: c.order.manual_entry, sample: c.sample.manual_entry }))
            .catch(() => undefined)
            .finally(() => alive && setLoaded(true));
        return () => {
            alive = false;
        };
    }, []);

    return { ...modes, loaded };
}
