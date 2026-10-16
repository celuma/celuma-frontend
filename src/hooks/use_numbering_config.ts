import { useEffect, useState } from "react";
import { getNumberingConfigs } from "../services/numbering_service";
import type { NumberingMode } from "../models/numbering";

/**
 * The laboratory's numbering mode per entity kind (Céluma 1.4, issue #8).
 *
 * It only shapes the registration forms (is the code optional, required or
 * hidden). The API enforces the mode regardless, so a failed or slow load
 * falls back to `automatic`: an optional field that the server can still refuse.
 */
export function useNumberingModes() {
    const [modes, setModes] = useState<{ order: NumberingMode; sample: NumberingMode }>({
        order: "automatic",
        sample: "automatic",
    });
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let alive = true;
        getNumberingConfigs()
            .then((c) => alive && setModes({ order: c.order.mode, sample: c.sample.mode }))
            .catch(() => undefined)
            .finally(() => alive && setLoaded(true));
        return () => {
            alive = false;
        };
    }, []);

    return { ...modes, loaded };
}
