import { Alert } from "antd";
import type { AlertProps } from "antd";

interface CelumaAlertProps {
    type?: AlertProps["type"];
    message: React.ReactNode;
    description?: React.ReactNode;
    showIcon?: boolean;
    closable?: boolean;
    onClose?: () => void;
    style?: React.CSSProperties;
}

/**
 * Thin wrapper over Ant Design's Alert that applies consistent Céluma
 * styling (border-radius, margin) and sane defaults.
 *
 * Use for inline feedback inside pages/forms. For transient toasts use
 * showCelumaApiError / showCelumaPermissionDenied from lib/celuma_feedback.
 */
export default function CelumaAlert({
    type = "error",
    message,
    description,
    showIcon = true,
    closable = false,
    onClose,
    style,
}: CelumaAlertProps) {
    return (
        <Alert
            type={type}
            message={message}
            description={description}
            showIcon={showIcon}
            closable={closable}
            onClose={onClose}
            style={{ borderRadius: 8, marginBottom: 0, ...style }}
        />
    );
}
