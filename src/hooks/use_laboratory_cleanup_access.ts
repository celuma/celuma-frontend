import { useEffect, useState } from "react";
import { getCleanupAuthorization } from "../services/laboratory_cleanup_service";

/**
 * Whether to SHOW the laboratory-content cleanup entry point (Céluma 1.4, issue #39).
 *
 * Presentation only. The authority is the backend's: the signed-in user must be the active person who CREATED
 * this laboratory at its initial registration (a persisted, write-once binding), acting on their own laboratory.
 * No role in the profile decides it — a tenant administrator, a `superuser` role or a custom role never grants it —
 * so the screen asks the server for every authenticated user and any failure means "not authorized".
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
