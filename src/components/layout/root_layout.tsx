import { Outlet } from "react-router-dom";
import { NotificationProvider } from "../../providers/notification_provider";

/**
 * Céluma 1.5 (#68): the pathless root route of the app's data router
 * (`src/main.tsx`). It replaces the former
 * `<BrowserRouter><NotificationProvider><Routes>` nesting, so every page still
 * renders inside the provider.
 *
 * Céluma 1.3 Phase 3, Block C. The single owner of Notification Center
 * state — unread count, recent items and the one polling interval.
 * Mounted here, above every page, rather than inside SidebarCeluma:
 * every page renders its own sidebar, so state living there would be
 * torn down and re-polled on every navigation. Public routes are
 * inside it too, harmlessly — it polls only while a session token is
 * stored, so the login screen makes no notification request.
 */
export default function RootLayout() {
    return (
        <NotificationProvider>
            <Outlet />
        </NotificationProvider>
    );
}
