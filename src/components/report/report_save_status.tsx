/**
 * Céluma 1.5 (#68): visible state of the report editor's manual save and the
 * guard against leaving with unsaved edits.
 *
 * The editor counts authored edits (a revision number incremented only by user
 * actions, never by loading or initialization) and records which revision the
 * last successful save carried. The draft is dirty while those differ, so an
 * edit made while a save is in flight stays unsaved after that save succeeds.
 */
import { useContext, useEffect, type CSSProperties } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { CheckCircleFilled, ExclamationCircleFilled, LoadingOutlined, EditOutlined } from "@ant-design/icons";
import CelumaButton from "../ui/button";
import CelumaModal from "../ui/celuma_modal";
import { tokens } from "../design/tokens";
import type { ReportSaveFailure, ReportSaveStatus } from "./report_save_state";

const wrapStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    flexWrap: "wrap",
};

export function ReportSaveStatusIndicator({
    status,
    failure,
    onRetry,
}: {
    status: ReportSaveStatus;
    failure: ReportSaveFailure | null;
    onRetry: () => void;
}) {
    if (status === "clean") return null;
    if (status === "saving") {
        return (
            <span style={{ ...wrapStyle, color: tokens.textSecondary }} role="status" data-testid="report-save-status" data-status="saving">
                <LoadingOutlined /> Guardando…
            </span>
        );
    }
    if (status === "saved") {
        return (
            <span style={{ ...wrapStyle, color: "#15803d" }} role="status" data-testid="report-save-status" data-status="saved">
                <CheckCircleFilled /> Guardado
            </span>
        );
    }
    if (status === "unsaved") {
        return (
            <span style={{ ...wrapStyle, color: "#b45309" }} role="status" data-testid="report-save-status" data-status="unsaved">
                <EditOutlined /> Cambios sin guardar
            </span>
        );
    }
    return (
        <span style={{ ...wrapStyle, color: "#b91c1c" }} role="alert" data-testid="report-save-status" data-status="failed">
            <ExclamationCircleFilled />
            <span>
                {failure?.kind === "network"
                    ? "No se pudo guardar: sin conexión con el servidor. Tus cambios siguen aquí."
                    : `No se pudo guardar${failure?.message ? `: ${failure.message}` : ""}. Tus cambios siguen aquí.`}
            </span>
            {failure?.retryable !== false && (
                <CelumaButton size="small" onClick={onRetry} data-testid="report-save-retry">
                    Reintentar
                </CelumaButton>
            )}
        </span>
    );
}

/**
 * Warns before leaving with unsaved edits: the browser's own prompt on reload
 * or closing the tab, and a confirmation for in-app navigation (links and the
 * browser Back button). `shouldBlock` is read at navigation time, so a save
 * that just succeeded can let its own redirect through before re-rendering.
 */
export function UnsavedChangesGuard({ when, shouldBlock }: { when: boolean; shouldBlock: () => boolean }) {
    useEffect(() => {
        if (!when) return;
        const handler = (e: BeforeUnloadEvent) => {
            if (!shouldBlock()) return;
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [when, shouldBlock]);
    // `useBlocker` exists only under a data router (the app's RouterProvider);
    // component tests that mount the editor in a MemoryRouter skip it.
    const dataRouter = useContext(UNSAFE_DataRouterContext);
    return dataRouter ? <InAppNavigationGuard when={when} shouldBlock={shouldBlock} /> : null;
}

function InAppNavigationGuard({ when, shouldBlock }: { when: boolean; shouldBlock: () => boolean }) {
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            when && shouldBlock() && currentLocation.pathname !== nextLocation.pathname,
    );
    return (
        <CelumaModal
            open={blocker.state === "blocked"}
            title="Tienes cambios sin guardar"
            onCancel={() => blocker.reset?.()}
            // Same footer as the editor's other dialogs: small buttons, the
            // secondary (danger) action first and the primary one last.
            footer={[
                <CelumaButton key="leave" size="small" danger onClick={() => blocker.proceed?.()} data-testid="unsaved-leave">
                    Salir sin guardar
                </CelumaButton>,
                <CelumaButton key="stay" size="small" type="primary" onClick={() => blocker.reset?.()} data-testid="unsaved-stay">
                    Quedarme en el reporte
                </CelumaButton>,
            ]}
        >
            <div style={{ color: tokens.textSecondary }}>
                Si sales ahora, se perderán los cambios que no has guardado en este reporte.
            </div>
        </CelumaModal>
    );
}
