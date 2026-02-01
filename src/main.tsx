import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import PriceCatalog from "./pages/price_catalog";
import UsersManagement from "./pages/users_management";
import PasswordResetRequest from "./pages/password_reset_request";
import PasswordResetConfirm from "./pages/password_reset_confirm";
import TenantSettings from "./pages/tenant_settings";
import PhysicianPortal from "./pages/physician_portal";
import PatientPortal from "./pages/patient_portal";
import AcceptInvitation from "./pages/accept_invitation";

createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<App />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/patients/register" element={<PatientRegister />} />
            <Route path="/patients" element={<PatientsList />} />
            <Route path="/patients/:patientId" element={<PatientDetailPage />} />
            <Route path="/orders/register" element={<OrderRegister />} />
            <Route path="/orders" element={<OrdersList />} />
            <Route path="/samples" element={<SamplesList />} />
            <Route path="/orders/:orderId" element={<OrderDetail />} />
            <Route path="/samples/:sampleId" element={<SampleDetailPage />} />
            <Route path="/samples/register" element={<SampleRegister />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/reports" element={<ReportsList />} />
            <Route path="/reports/editor" element={<Reports />} />
            <Route path="/reports/:reportId" element={<Reports />} />
            <Route path="/worklist" element={<Worklist />} />
            <Route path="/billing/:orderId" element={<BillingDetail />} />
            <Route path="/catalog" element={<PriceCatalog />} />
            <Route path="/users" element={<UsersManagement />} />
            <Route path="/password-reset" element={<PasswordResetRequest />} />
            <Route path="/reset-password" element={<PasswordResetConfirm />} />
            <Route path="/settings" element={<TenantSettings />} />
            <Route path="/physician-portal" element={<PhysicianPortal />} />
            <Route path="/patient-portal" element={<PatientPortal />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
        </Routes>
    </BrowserRouter>
);

/*
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import HealthPage from './endpoint-health.tsx'

const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        children: [
            { index: true, element: <div className = "health-container"><h2> Home </h2><p> Use the nav to open <code> /health </code>.</p></div> },
            { path: '/health', element: <HealthPage /> },
        ],
    },
])

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <RouterProvider router = {router} />
    </StrictMode>,
)
 */