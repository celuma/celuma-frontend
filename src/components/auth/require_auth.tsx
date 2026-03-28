import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useUserProfile } from "../../hooks/use_user_profile";

interface RequireAuthProps {
    children: ReactNode;
}

/**
 * Lightweight guard that only checks authentication, with no permission
 * requirement.  Use this for pages accessible by any logged-in user
 * (e.g. /profile) so they still get a proper redirect instead of a blank screen.
 */
export default function RequireAuth({ children }: RequireAuthProps) {
    const { authStatus, sessionExpired } = useUserProfile();
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

    return <>{children}</>;
}
