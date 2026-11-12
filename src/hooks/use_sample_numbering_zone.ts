import { useEffect, useState } from "react";
import { getNumberingConfigs } from "../services/numbering_service";
import type { SampleNumberingZone } from "../lib/receipt_today";

/**
 * The sample numbering's scope and timezone (`GET /numbering/config`), null until known or if it cannot be read
 * (the forms then use the default zone; the API still decides the real month on save).
 */
export function useSampleNumberingZone(): SampleNumberingZone | null {
    const [zone, setZone] = useState<SampleNumberingZone | null>(null);
    useEffect(() => {
        let alive = true;
        getNumberingConfigs()
            .then((c) => alive && setZone({ scope: c.sample.scope, timezone: c.sample.timezone }))
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, []);
    return zone;
}
