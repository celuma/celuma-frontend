import React from "react";
import { CheckCircleOutlined, InboxOutlined, SettingOutlined, ExperimentOutlined } from "@ant-design/icons";

// Order status configuration - matches backend OrderStatus enum
export const ORDER_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida" },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso" },
    DIAGNOSIS: { color: "#8b5cf6", bg: "#f5f3ff", label: "Diagnóstico" },
    REVIEW: { color: "#ec4899", bg: "#fdf2f8", label: "Revisión" },
    RELEASED: { color: "#10b981", bg: "#ecfdf5", label: "Liberada" },
    CLOSED: { color: "#6b7280", bg: "#f3f4f6", label: "Cerrada" },
    CANCELLED: { color: "#ef4444", bg: "#fef2f2", label: "Cancelada" },
};

// Sample state configuration - matches backend SampleState enum
export const SAMPLE_STATE_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
    RECEIVED: { color: "#3b82f6", bg: "#eff6ff", label: "Recibida", icon: <InboxOutlined /> },
    PROCESSING: { color: "#f59e0b", bg: "#fffbeb", label: "En Proceso", icon: <SettingOutlined /> },
    READY: { color: "#10b981", bg: "#ecfdf5", label: "Lista", icon: <CheckCircleOutlined /> },
    DAMAGED: { color: "#ef4444", bg: "#fef2f2", label: "Insuficiente", icon: <ExperimentOutlined /> },
    CANCELLED: { color: "#6b7280", bg: "#f3f4f6", label: "Cancelada", icon: <ExperimentOutlined /> },
};

// Report status configuration
export const REPORT_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    DRAFT: { color: "#f59e0b", bg: "#fffbeb", label: "Borrador" },
    IN_REVIEW: { color: "#3b82f6", bg: "#eff6ff", label: "En Revisión" },
    APPROVED: { color: "#10b981", bg: "#ecfdf5", label: "Aprobado" },
    PUBLISHED: { color: "#22c55e", bg: "#f0fdf4", label: "Publicado" },
    RETRACTED: { color: "#ef4444", bg: "#fef2f2", label: "Retractado" },
    // Review statuses (for report reviews in worklist)
    PENDING: { color: "#f59e0b", bg: "#fffbeb", label: "Pendiente" },
    REJECTED: { color: "#ef4444", bg: "#fef2f2", label: "Rechazado" },
};

// Predefined label colors (same as in LabelsSection)
export const LABEL_COLORS = [
    { color: "#3b82f6", bg: "#eff6ff" },
    { color: "#f59e0b", bg: "#fffbeb" },
    { color: "#8b5cf6", bg: "#f5f3ff" },
    { color: "#ec4899", bg: "#fdf2f8" },
    { color: "#10b981", bg: "#ecfdf5" },
    { color: "#ef4444", bg: "#fef2f2" },
    { color: "#06b6d4", bg: "#ecfeff" },
    { color: "#84cc16", bg: "#f7fee7" },
    { color: "#6366f1", bg: "#eef2ff" },
    { color: "#a855f7", bg: "#faf5ff" },
    { color: "#f97316", bg: "#fff7ed" },
    { color: "#14b8a6", bg: "#f0fdfa" },
];

// Sex configuration for consistent badges
export const SEX_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    "MALE": { color: "#3b82f6", bg: "#eff6ff", label: "Masculino" },
    "M": { color: "#3b82f6", bg: "#eff6ff", label: "Masculino" },
    "FEMALE": { color: "#ec4899", bg: "#fdf2f8", label: "Femenino" },
    "F": { color: "#ec4899", bg: "#fdf2f8", label: "Femenino" },
    "OTHER": { color: "#8b5cf6", bg: "#f5f3ff", label: "Otro" },
    "O": { color: "#8b5cf6", bg: "#f5f3ff", label: "Otro" },
    "DEFAULT": { color: "#6b7280", bg: "#f3f4f6", label: "N/A" },
};
