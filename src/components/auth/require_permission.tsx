import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useUserProfile } from "../../hooks/use_user_profile";
import { defaultRouteForPermissions } from "../../lib/rbac";

interface RequirePermissionProps {
    /** Permission code that must be present, e.g. "lab:read" */
    permission: string;
    children: ReactNode;
}

/**
 * Route guard that checks a single RBAC permission.
 *
 * - Loading   → centered spinner.
 * - Unauthenticated → /login (with `state.from` and optional `state.sessionExpired`).
 * - Authenticated but missing permission → safest landing route for their
 *   actual permissions (never loops back to a guarded route they can't access).
 */
export default function RequirePermission({ permission, children }: RequirePermissionProps) {
    const { authStatus, sessionExpired, hasPermission, profile } = useUserProfile();
    const location = useLocation();

    if (authStatus === "loading") {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
                <Spin size="large" />
            </div>
        );
    }

    if (authStatus === "unauthenticated") {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location.pathname, sessionExpired }}
            />
        );
    }

    if (!hasPermission(permission)) {
        // User is authenticated but lacks this specific permission.
        // Route them to the best landing page for their actual permissions.
        const perms = profile?.permissions ?? [];
        const safeRoute = defaultRouteForPermissions(perms);
        return <Navigate to={safeRoute} replace />;
    }

    return <>{children}</>;
}
