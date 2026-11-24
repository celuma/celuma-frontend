import { useState } from "react";
import { useLocation } from "react-router-dom";
import CelumaAlert from "../ui/celuma_alert";
import { registrationNoticeFromState } from "../../lib/registration_notice";

/**
 * The outcome of a registration that had to be resolved from an earlier attempt (Céluma 1.5, #67),
 * shown on the record page the form opened. A persistent notice, not a toast: when the user's later
 * corrections were not applied they must see it until they dismiss it. Renders nothing otherwise.
 */
export default function RegistrationNotice() {
    const { state } = useLocation();
    const notice = registrationNoticeFromState(state);
    const [open, setOpen] = useState(true);
    if (!notice || !open) return null;
    return (
        <div data-testid="registration-notice" style={{ marginBottom: 12 }}>
            <CelumaAlert
                type={notice.kind === "recovered" ? "warning" : "info"}
                message={notice.title}
                description={notice.text}
                closable
                onClose={() => setOpen(false)}
            />
        </div>
    );
}
