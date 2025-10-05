import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Login from "./pages/login";
import Register from "./pages/register";
import Home from "./pages/home";
import PatientRegister from "./pages/patient_register";
import Profile from "./pages/profile";
import OrderRegister from "./pages/order_register";
import SampleRegister from "./pages/sample_register";
import CaseRegister from "./pages/case_register";
import PatientsList from "./pages/patients_list";
import PatientProfile from "./pages/patient_profile";
import OrderDetail from "./pages/order_detail";
import SampleDetailPage from "./pages/sample_detail";
import CasesList from "./pages/cases_list";
import SamplesList from "./pages/samples_list";
import Reports from "./pages/reports";
import ReportsList from "./pages/reports_list";

createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<App />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/patients/register" element={<PatientRegister />} />
            <Route path="/patients" element={<PatientsList />} />
            <Route path="/patients/:patientId" element={<PatientProfile />} />
            <Route path="/orders/register" element={<OrderRegister />} />
            <Route path="/cases" element={<CasesList />} />
            <Route path="/samples" element={<SamplesList />} />
            <Route path="/orders/:orderId" element={<OrderDetail />} />
            <Route path="/samples/:sampleId" element={<SampleDetailPage />} />
            <Route path="/samples/register" element={<SampleRegister />} />
            <Route path="/cases/register" element={<CaseRegister />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/reports" element={<ReportsList />} />
            <Route path="/reports/editor" element={<Reports />} />
            <Route path="/reports/:reportId" element={<Reports />} />
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