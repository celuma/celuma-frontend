import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import App from "./App";
import CelumaNotificationProxy from "./components/ui/celuma_notification_proxy";
import Login from "./pages/login";
import Register from "./pages/register";
import Home from "./pages/home";
import PatientForm from "./pages/patient_form";
import RequestingPhysicianForm from "./pages/requesting_physician_form";
import RequestingPhysicianDetailPage from "./pages/requesting_physician_detail";
import RequestingPhysiciansList from "./pages/requesting_physicians_list";
import Profile from "./pages/profile";
import OrderRegister from "./pages/order_register";
import SampleRegister from "./pages/sample_register";
import PatientsList from "./pages/patients_list";
import PatientDetailPage from "./pages/patient_detail";
import OrderDetail from "./pages/order_detail";
import SampleDetailPage from "./pages/sample_detail";
import OrdersList from "./pages/orders_list";
import SamplesList from "./pages/samples_list";
import Reports from "./pages/reports";
import ReportsList from "./pages/reports_list";
import Worklist from "./pages/worklist";
import BillingDetail from "./pages/billing_detail";
import BillingList from "./pages/billing_list";
import PriceCatalog from "./pages/price_catalog";
import UsersManagement from "./pages/users_management";
import ReviewersManagement from "./pages/reviewers_management";
import PasswordResetRequest from "./pages/password_reset_request";
import PasswordResetConfirm from "./pages/password_reset_confirm";
import TenantSettings from "./pages/tenant_settings";
import TenantUsage from "./pages/tenant_usage";
import PhysicianPortal from "./pages/physician_portal";
import PatientPortal from "./pages/patient_portal";
import AcceptInvitation from "./pages/accept_invitation";
import StudyTypes from "./pages/study_types";
import ReportTemplates from "./pages/report_templates";
import ReportTemplateVersions from "./pages/report_template_versions";
import ReportTemplateEditor from "./pages/report_template_editor";
import ReportLetterheads from "./pages/report_letterheads";
import ReportLetterheadVersions from "./pages/report_letterhead_versions";
import ReportLetterheadEditor from "./pages/report_letterhead_editor";
import Config from "./pages/config";
import ConfigAbout from "./pages/config_about";
import BranchesList from "./pages/branches_list";
import BranchForm from "./pages/branch_form";
import BranchDetail from "./pages/branch_detail";
import AccessDenied from "./pages/access_denied";
import RequirePermission from "./components/auth/require_permission";
import RequireAuth from "./components/auth/require_auth";
import InternalReportRender from "./components/report/internal_report_render";
import NotificationsPage from "./pages/notifications";
import { NotificationProvider } from "./providers/notification_provider";

createRoot(document.getElementById("root")!).render(
    <ConfigProvider theme={{
        token: {
            colorPrimary: "#49b6ad",
            colorLink: "#49b6ad",
            colorLinkHover: "#3da8a0",
            borderRadius: 8,
        },
        components: {
            Button: { borderRadius: 8 },
            Menu: { darkItemBg: "transparent", darkItemSelectedBg: "rgba(255,255,255,0.22)" },
        },
    }}>
    <AntApp>
        <CelumaNotificationProxy />
        <BrowserRouter>
        {/* Céluma 1.3 Phase 3, Block C. The single owner of Notification Center
            state — unread count, recent items and the one polling interval.
            Mounted here, above <Routes>, rather than inside SidebarCeluma:
            every page renders its own sidebar, so state living there would be
            torn down and re-polled on every navigation. Public routes are
            inside it too, harmlessly — it polls only while a session token is
            stored, so the login screen makes no notification request. */}
        <NotificationProvider>
        <Routes>
            {/* Public routes */}
            <Route path="/" element={<App />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/password-reset" element={<PasswordResetRequest />} />
            <Route path="/reset-password" element={<PasswordResetConfirm />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/patient-portal" element={<PatientPortal />} />
            <Route path="/access-denied" element={<AccessDenied />} />
            {/* Céluma 1.3 Phase 2, Block E: internal render route for the backend's
                headless-Chromium PDF generator. Chrome-free, no RequireAuth/
                RequirePermission — authorized by a short-lived render token in the
                URL fragment instead. Never linked to from the app UI. */}
            <Route path="/internal/report-render/:reportId/:versionNo" element={<InternalReportRender />} />

            {/* Lab read access */}
            <Route path="/home" element={<RequirePermission permission="lab:read"><Home /></RequirePermission>} />
            <Route path="/patients" element={<RequirePermission permission="lab:read"><PatientsList /></RequirePermission>} />
            <Route path="/patients/:patientId" element={<RequirePermission permission="lab:read"><PatientDetailPage /></RequirePermission>} />
            <Route path="/requesting-physicians" element={<RequirePermission permission="lab:read"><RequestingPhysiciansList /></RequirePermission>} />
            <Route path="/requesting-physicians/:physicianId" element={<RequirePermission permission="lab:read"><RequestingPhysicianDetailPage /></RequirePermission>} />
            <Route path="/orders" element={<RequirePermission permission="lab:read"><OrdersList /></RequirePermission>} />
            <Route path="/orders/:orderId" element={<RequirePermission permission="lab:read"><OrderDetail /></RequirePermission>} />
            <Route path="/samples" element={<RequirePermission permission="lab:read"><SamplesList /></RequirePermission>} />
            <Route path="/samples/:sampleId" element={<RequirePermission permission="lab:read"><SampleDetailPage /></RequirePermission>} />
            <Route path="/worklist" element={<RequirePermission permission="lab:read"><Worklist /></RequirePermission>} />

            {/* Lab create — lab:create_order */}
            <Route path="/patients/register" element={<RequirePermission permission="lab:create_patient"><PatientForm /></RequirePermission>} />
            <Route path="/patients/:patientId/edit" element={<RequirePermission permission="lab:create_patient"><PatientForm /></RequirePermission>} />
            <Route path="/requesting-physicians/register" element={<RequirePermission permission="lab:create_order"><RequestingPhysicianForm /></RequirePermission>} />
            <Route path="/requesting-physicians/:physicianId/edit" element={<RequirePermission permission="lab:create_order"><RequestingPhysicianForm /></RequirePermission>} />
            <Route path="/orders/register" element={<RequirePermission permission="lab:create_order"><OrderRegister /></RequirePermission>} />
            <Route path="/samples/register" element={<RequirePermission permission="lab:create_sample"><SampleRegister /></RequirePermission>} />

            {/* Reports */}
            <Route path="/reports" element={<RequirePermission permission="reports:read"><ReportsList /></RequirePermission>} />
            <Route path="/reports/editor" element={<RequirePermission permission="reports:create"><Reports /></RequirePermission>} />
            <Route path="/reports/:reportId" element={<RequirePermission permission="reports:read"><Reports /></RequirePermission>} />

            {/* Billing */}
            <Route path="/billing" element={<RequirePermission permission="billing:read"><BillingList /></RequirePermission>} />
            <Route path="/billing/:orderId" element={<RequirePermission permission="billing:read"><BillingDetail /></RequirePermission>} />

            {/* Physician portal */}
            <Route path="/physician-portal" element={<RequirePermission permission="portal:physician_access"><PhysicianPortal /></RequirePermission>} />

            {/* Profile — any authenticated user, no specific permission required */}
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />

            {/* Céluma 1.3 Phase 3, Block C: the Notification Center.
                RequireAuth, not RequirePermission — the notifications API
                enforces no permission (every query is self-scoped to the
                caller's own user and tenant), so gating the inbox on lab:read
                would let a user receive notifications they could not open.
                See phase-3-block-c-architecture-decision.md §2. */}
            <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />

            {/* Settings — redirect to config/tenant */}
            <Route path="/settings" element={<Navigate to="/config/tenant" replace />} />

            {/* Config panel — nested routes */}
            <Route path="/config" element={<RequirePermission permission="lab:read"><Config /></RequirePermission>}>
                <Route index element={<Navigate to="/config/profile" replace />} />
                <Route path="profile" element={<Profile embedded />} />
                <Route path="catalog" element={<RequirePermission permission="admin:manage_catalog"><PriceCatalog embedded /></RequirePermission>} />
                <Route path="report-templates" element={<RequirePermission permission="admin:manage_catalog"><ReportTemplates embedded /></RequirePermission>} />
                {/* Céluma 1.3 Phase 2, Block D: gated with reports:manage_templates
                    (not admin:manage_catalog like the row above) because that is
                    the permission the backend template-version endpoints actually
                    enforce — see phase-2-block-d-architecture-decision.md for the
                    pre-existing admin:manage_catalog/reports:manage_templates
                    mismatch on the legacy route, left undisturbed here. */}
                <Route path="report-templates/:templateId/versions" element={<RequirePermission permission="reports:manage_templates"><ReportTemplateVersions embedded /></RequirePermission>} />
                <Route path="report-templates/:templateId/versions/new" element={<RequirePermission permission="reports:manage_templates"><ReportTemplateEditor embedded /></RequirePermission>} />
                {/* Post-Phase-2 remediation: letterheads are a shared domain
                    independent of clinical templates — the same
                    reports:manage_templates permission that already manages
                    report configuration (see remediation-architecture-decision.md §5). */}
                <Route path="report-letterheads" element={<RequirePermission permission="reports:manage_templates"><ReportLetterheads embedded /></RequirePermission>} />
                <Route path="report-letterheads/:letterheadId/versions" element={<RequirePermission permission="reports:manage_templates"><ReportLetterheadVersions embedded /></RequirePermission>} />
                <Route path="report-letterheads/:letterheadId/versions/new" element={<RequirePermission permission="reports:manage_templates"><ReportLetterheadEditor embedded /></RequirePermission>} />
                <Route path="study-types" element={<RequirePermission permission="admin:manage_catalog"><StudyTypes embedded /></RequirePermission>} />
                <Route path="users" element={<RequirePermission permission="admin:manage_users"><UsersManagement embedded /></RequirePermission>} />
                <Route path="reviewers" element={<RequirePermission permission="admin:manage_users"><ReviewersManagement embedded /></RequirePermission>} />
                <Route path="branches" element={<RequirePermission permission="admin:manage_branches"><BranchesList embedded /></RequirePermission>} />
                <Route path="branches/register" element={<RequirePermission permission="admin:manage_branches"><BranchForm embedded /></RequirePermission>} />
                <Route path="branches/:branchId" element={<RequirePermission permission="admin:manage_branches"><BranchDetail embedded /></RequirePermission>} />
                <Route path="branches/:branchId/edit" element={<RequirePermission permission="admin:manage_branches"><BranchForm embedded /></RequirePermission>} />
                <Route path="tenant" element={<RequirePermission permission="admin:manage_tenant"><TenantSettings embedded /></RequirePermission>} />
                {/* Céluma 1.3 Phase 4, Block F: the tenant usage dashboard.
                    Gated on admin:manage_tenant — the exact permission both
                    usage endpoints enforce (usage-rbac-contract.md §1), so the
                    route and the API agree by construction rather than by a
                    role-name check that would drift from the RBAC catalog. */}
                <Route path="usage" element={<RequirePermission permission="admin:manage_tenant"><TenantUsage embedded /></RequirePermission>} />
                <Route path="about" element={<ConfigAbout />} />
            </Route>

            {/* Legacy standalone catalog routes */}
            <Route path="/catalog" element={<RequirePermission permission="lab:read"><PriceCatalog /></RequirePermission>} />
            <Route path="/study-types" element={<RequirePermission permission="lab:read"><StudyTypes /></RequirePermission>} />
            <Route path="/report-templates" element={<RequirePermission permission="lab:read"><ReportTemplates /></RequirePermission>} />
            <Route path="/users" element={<RequirePermission permission="admin:manage_users"><UsersManagement /></RequirePermission>} />
        </Routes>
        </NotificationProvider>
        </BrowserRouter>
    </AntApp>
    </ConfigProvider>
);
