import { Alert } from "antd";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "../../hooks/use_user_profile";
import CelumaButton from "../ui/button";

/**
 * Shown by the sample / order registration forms when the laboratory has no
 * active sample type: registration is blocked (every new sample needs one), so
 * the screen says why and sends an authorized user to the catalog setup.
 */
export default function SampleTypeSetupNotice() {
    const navigate = useNavigate();
    const { hasPermission } = useUserProfile();
    const canSetUp = hasPermission("admin:manage_catalog");
    return (
        <Alert
            type="warning"
            showIcon
            data-testid="sample-type-empty"
            message="No hay tipos de muestra activos"
            description={
                canSetUp ? (
                    <div style={{ display: "grid", gap: 8 }}>
                        <span>
                            Cada muestra nueva requiere un tipo. Crea tus tipos de muestra, o impórtalos desde un archivo JSON o copiándolos
                            de tus tipos de estudio.
                        </span>
                        <div>
                            <CelumaButton size="small" onClick={() => navigate("/config/sample-types")}>
                                Configurar tipos de muestra
                            </CelumaButton>
                        </div>
                    </div>
                ) : (
                    "Cada muestra nueva requiere un tipo. Pide a un administrador del laboratorio que configure los tipos de muestra."
                )
            }
        />
    );
}
