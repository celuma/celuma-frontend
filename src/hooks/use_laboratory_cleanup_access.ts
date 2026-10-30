import { useEffect, useState } from "react";
import { getCleanupAuthorization } from "../services/laboratory_cleanup_service";

/**
 * Whether to SHOW the laboratory-content cleanup entry point (Céluma 1.4, issue #39).
 *
 * Presentation only. The server checks the active user's live system `superuser` role and own-tenant scope.
 * Profile role labels never replace that check. A request failure means "not authorized".
 */
export function useLaboratoryCleanupAccess(tenantId?: string) {
    const [authorized, setAuthorized] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let alive = true;
        if (!tenantId) {
            setAuthorized(false);
            setChecked(false);
            return () => {
                alive = false;
            };
        }
        getCleanupAuthorization(tenantId).then((ok) => {
            if (!alive) return;
            setAuthorized(ok);
            setChecked(true);
        });
        return () => {
            alive = false;
        };
    }, [tenantId]);

    return { authorized, checked };
}
