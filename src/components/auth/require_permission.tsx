import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { useUserProfile } from "../../hooks/use_user_profile";

interface RequirePermissionProps {
    /** Permission code that must be present, e.g. "lab:read" */
    permission: string;
    /** Where to redirect if the check fails. Defaults to "/home". */
    redirectTo?: string;
    children: ReactNode;
}

/**
 * Route guard that checks a single RBAC permission.
 * While the profile is loading it shows a centered spinner.
 * If the user lacks the permission they are redirected (default: /home).
 */
export default function RequirePermission({
    permission,
    redirectTo = "/home",
    children,
}: RequirePermissionProps) {
    const { loading, hasPermission } = useUserProfile();

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!hasPermission(permission)) {
        return <Navigate to={redirectTo} replace />;
    }

    return <>{children}</>;
}
