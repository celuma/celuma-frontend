import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import App from "./App";
import Login from "./pages/login";
import Register from "./pages/register";
import Home from "./pages/home";
import PatientRegister from "./pages/patient_register";
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
import PasswordResetRequest from "./pages/password_reset_request";
import PasswordResetConfirm from "./pages/password_reset_confirm";
import TenantSettings from "./pages/tenant_settings";
import PhysicianPortal from "./pages/physician_portal";
import PatientPortal from "./pages/patient_portal";
import AcceptInvitation from "./pages/accept_invitation";
import StudyTypes from "./pages/study_types";
import ReportTemplates from "./pages/report_templates";
import Config from "./pages/config";
import ConfigAbout from "./pages/config_about";
import RequirePermission from "./components/auth/require_permission";

createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
        <Routes>
            {/* Public routes */}
            <Route path="/" element={<App />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/password-reset" element={<PasswordResetRequest />} />
            <Route path="/reset-password" element={<PasswordResetConfirm />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/patient-portal" element={<PatientPortal />} />

            {/* Lab read access */}
            <Route path="/home" element={<RequirePermission permission="lab:read"><Home /></RequirePermission>} />
            <Route path="/patients" element={<RequirePermission permission="lab:read"><PatientsList /></RequirePermission>} />
            <Route path="/patients/:patientId" element={<RequirePermission permission="lab:read"><PatientDetailPage /></RequirePermission>} />
            <Route path="/orders" element={<RequirePermission permission="lab:read"><OrdersList /></RequirePermission>} />
            <Route path="/orders/:orderId" element={<RequirePermission permission="lab:read"><OrderDetail /></RequirePermission>} />
            <Route path="/samples" element={<RequirePermission permission="lab:read"><SamplesList /></RequirePermission>} />
            <Route path="/samples/:sampleId" element={<RequirePermission permission="lab:read"><SampleDetailPage /></RequirePermission>} />
            <Route path="/worklist" element={<RequirePermission permission="lab:read"><Worklist /></RequirePermission>} />

            {/* Lab create — lab:create_order */}
            <Route path="/patients/register" element={<RequirePermission permission="lab:create_patient"><PatientRegister /></RequirePermission>} />
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

            {/* Profile (any authenticated user with any permission; using lab:read as baseline) */}
            <Route path="/profile" element={<Profile />} />

            {/* Settings */}
            <Route path="/settings" element={<RequirePermission permission="lab:read"><TenantSettings /></RequirePermission>} />

            {/* Config panel — nested routes */}
            <Route path="/config" element={<RequirePermission permission="lab:read"><Config /></RequirePermission>}>
                <Route index element={<Navigate to="/config/profile" replace />} />
                <Route path="profile" element={<Profile embedded />} />
                <Route path="catalog" element={<RequirePermission permission="admin:manage_catalog"><PriceCatalog embedded /></RequirePermission>} />
                <Route path="report-templates" element={<RequirePermission permission="admin:manage_catalog"><ReportTemplates embedded /></RequirePermission>} />
                <Route path="study-types" element={<RequirePermission permission="admin:manage_catalog"><StudyTypes embedded /></RequirePermission>} />
                <Route path="users" element={<RequirePermission permission="admin:manage_users"><UsersManagement embedded /></RequirePermission>} />
                <Route path="about" element={<ConfigAbout />} />
            </Route>

            {/* Legacy standalone catalog routes */}
            <Route path="/catalog" element={<RequirePermission permission="lab:read"><PriceCatalog /></RequirePermission>} />
            <Route path="/study-types" element={<RequirePermission permission="lab:read"><StudyTypes /></RequirePermission>} />
            <Route path="/report-templates" element={<RequirePermission permission="lab:read"><ReportTemplates /></RequirePermission>} />
            <Route path="/users" element={<RequirePermission permission="admin:manage_users"><UsersManagement /></RequirePermission>} />
        </Routes>
    </BrowserRouter>
);
