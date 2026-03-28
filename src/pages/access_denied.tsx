import { useEffect } from "react";
import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "../hooks/use_user_profile";
import { defaultRouteForPermissions } from "../lib/rbac";
import { clearStoredAuth } from "../lib/auth_session";

export default function AccessDenied() {
    useEffect(() => { document.title = "Acceso Denegado - Céluma"; }, []);
    const navigate = useNavigate();
    const { profile } = useUserProfile();
    const perms = profile?.permissions ?? [];

    const handleGoBack = () => {
        const route = defaultRouteForPermissions(perms);
        navigate(route, { replace: true });
    };

    const handleLogout = () => {
        clearStoredAuth();
        navigate("/login", { replace: true });
    };

    return (
        <div
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "100vh",
                padding: 24,
            }}
        >
            <Result
                status="403"
                title="Acceso Denegado"
                subTitle="Tu cuenta no tiene los permisos necesarios para acceder a esta sección."
                extra={[
                    <Button key="back" type="primary" onClick={handleGoBack}>
                        Ir a mi área
                    </Button>,
                    <Button key="logout" onClick={handleLogout}>
                        Cerrar sesión
                    </Button>,
                ]}
            />
        </div>
    );
}
