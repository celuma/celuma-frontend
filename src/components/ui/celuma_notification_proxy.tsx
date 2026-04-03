import { useEffect } from "react";
import { App } from "antd";
import { registerCelumaNotification } from "../../lib/celuma_feedback";

/**
 * Invisible component that wires the context-aware notification instance
 * from Ant Design's App.useApp() into celuma_feedback helpers.
 *
 * Must be rendered inside <AntApp> (see main.tsx). Renders nothing.
 */
export default function CelumaNotificationProxy() {
    const { notification } = App.useApp();
    useEffect(() => {
        registerCelumaNotification(notification);
    }, [notification]);
    return null;
}
