import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const routeTitleMap: Record<string, string> = {
    "/": "Céluma",
    "/login": "Iniciar Sesión - Céluma",
    "/register": "Registro - Céluma",
    "/home": "Inicio - Céluma",
    "/worklist": "Lista de Trabajo - Céluma",
    "/reports": "Reportes - Céluma",
    "/reports/editor": "Editor de Reportes - Céluma",
    "/patients": "Pacientes - Céluma",
    "/patients/register": "Registrar Paciente - Céluma",
    "/orders": "Órdenes - Céluma",
    "/orders/register": "Registrar Orden - Céluma",
    "/samples": "Muestras - Céluma",
    "/samples/register": "Registrar Muestra - Céluma",
    "/profile": "Mi Perfil - Céluma",
    "/users": "Usuarios - Céluma",
    "/settings": "Configuración - Céluma",
    "/catalog": "Catálogo de Precios - Céluma",
    "/password-reset": "Recuperar Contraseña - Céluma",
    "/reset-password": "Restablecer Contraseña - Céluma",
    "/physician-portal": "Portal del Médico - Céluma",
    "/patient-portal": "Portal del Paciente - Céluma",
    "/accept-invitation": "Aceptar Invitación - Céluma",
};

/**
 * Hook to dynamically update the page title based on the current route
 */
export function usePageTitle() {
    const location = useLocation();

    useEffect(() => {
        const pathname = location.pathname;
        
        // Check for exact match first
        if (routeTitleMap[pathname]) {
            document.title = routeTitleMap[pathname];
            return;
        }

        // Check for parameterized routes (e.g., /patients/:patientId)
        const pathSegments = pathname.split("/").filter(Boolean);
        
        if (pathSegments.length >= 2) {
            // Try to match base route (e.g., /patients for /patients/123)
            const baseRoute = `/${pathSegments[0]}`;
            if (routeTitleMap[baseRoute]) {
                document.title = routeTitleMap[baseRoute];
                return;
            }
            
            // Try to match with second segment for nested routes (e.g., /reports/:reportId)
            const nestedRoute = `/${pathSegments[0]}/${pathSegments[1]}`;
            if (routeTitleMap[nestedRoute]) {
                document.title = routeTitleMap[nestedRoute];
                return;
            }
        }

        // Default title if no match found
        document.title = "Céluma";
    }, [location.pathname]);
}
