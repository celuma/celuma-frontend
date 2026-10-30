/**
 * Configuración → Mantenimiento → Limpieza de contenido del laboratorio (Céluma 1.4, issue #39).
 *
 * A privileged maintenance flow, deliberately NOT part of the ordinary order/sample delete actions:
 * read-only preview -> typed confirmation (reason, exact laboratory name, own password) ->
 * progress / failure / retry. The backend is the authority on every step (the active person who CREATED this
 * laboratory at its initial registration, own-tenant binding, signed preview, password throttle); this screen only
 * collects the confirmation and tells the truth about what is removed and what is kept. There are no options:
 * the cleanup always includes the billing of the removed orders and the historical audit of that content.
 * Contract: celuma-engineering `specs/laboratory/laboratory-content-cleanup.md`, ADR 0021.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Card, Checkbox } from "antd";
import {
    CheckCircleFilled,
    ClockCircleOutlined,
    CloseCircleFilled,
    DatabaseOutlined,
    FileDoneOutlined,
    LockOutlined,
    LoadingOutlined,
} from "@ant-design/icons";
import { tokens, cardStyle } from "../components/design/tokens";
import PageHeader from "../components/ui/page_header";
import CelumaButton from "../components/ui/button";
import CelumaAlert from "../components/ui/celuma_alert";
import CelumaSteps, { type CelumaStep } from "../components/ui/celuma_steps";
import TextField from "../components/ui/text_field";
import PasswordField from "../components/ui/password_field";
import CelumaTextArea from "../components/ui/textarea_field";
import AccessDenied from "./access_denied";
import { useUserProfile } from "../hooks/use_user_profile";
import { useLaboratoryCleanupAccess } from "../hooks/use_laboratory_cleanup_access";
import { formatBytes } from "../lib/format_bytes";
import {
    CleanupApiError,
    cancelCleanup,
    getCleanupOperation,
    listCleanupOperations,
    previewCleanup,
    retryCleanup,
    startCleanup,
} from "../services/laboratory_cleanup_service";
import {
    ACTIVE_STATUSES,
    OPEN_STATUSES,
    type CleanupOperation,
    type CleanupPreview,
    type CleanupStatus,
} from "../models/laboratory_cleanup";

const POLL_MS = 2000;
const MIN_REASON = 10;
const MAX_REASON = 1000;

const DELETE_LABELS: Record<string, string> = {
    orders: "Órdenes",
    samples: "Muestras",
    sample_images: "Imágenes de muestras",
    sample_image_renditions: "Versiones de imágenes (miniaturas y originales)",
    sample_labels: "Etiquetas aplicadas a muestras",
    order_labels: "Etiquetas aplicadas a órdenes",
    order_comments: "Comentarios",
    order_comment_mentions: "Menciones",
    order_events: "Eventos de la línea de tiempo",
    order_requesting_physicians: "Vínculos con médicos solicitantes",
    reports: "Reportes (incluidos los firmados o publicados)",
    report_versions: "Versiones de reportes",
    report_amendments: "Enmiendas de reportes",
    report_reviews: "Revisiones asignadas",
    assignments: "Asignaciones",
    notifications: "Notificaciones ligadas a este contenido",
    notification_recipients: "Bandejas de notificación",
    notification_deliveries: "Correos de notificación",
    invoices: "Facturas",
    invoice_items: "Conceptos de factura",
    payments: "Pagos",
    audit_rows: "Registros de auditoría de este contenido (se eliminan por completo)",
};

/** Minimal technical records that stay: they carry no removed clinical or business content. */
const RETAIN_LABELS: Record<string, string> = {
    idempotency_receipts: "Recibos de idempotencia (evitan duplicar altas)",
    numbering_allocations: "Códigos emitidos (bitácora permanente, evita reutilizarlos)",
    sample_code_corrections: "Correcciones de código de muestra (sin motivo ni texto)",
};

const PRESERVE_LABELS: Record<string, string> = {
    patients: "Pacientes",
    users: "Usuarios y accesos",
    branches: "Sucursales",
    requesting_physicians: "Médicos solicitantes",
    study_types: "Tipos de estudio",
    sample_types: "Tipos de muestra",
    price_catalog_entries: "Precios del catálogo (precios maestros)",
    labels: "Etiquetas",
    report_templates: "Plantillas de reporte",
    report_template_versions: "Versiones de plantillas",
    report_letterheads: "Membretes",
    report_letterhead_versions: "Versiones de membretes",
    report_sections: "Secciones predefinidas",
    numbering_configs: "Configuración de numeración",
    numbering_counters: "Contadores de numeración",
    shared_assets_kept: "Archivos compartidos o de configuración conservados",
};

const STATUS_TEXT: Record<CleanupStatus, string> = {
    QUEUED: "En cola",
    RUNNING: "En ejecución",
    FAILED: "Interrumpida (puede reintentarse)",
    COMPLETED: "Completada",
    CANCELLED: "Cancelada",
};

const CATEGORY_TEXT: Record<string, string> = {
    sample_image: "Imágenes procesadas",
    sample_image_rendition: "Miniaturas y originales",
    official_pdf: "PDF oficiales",
    legacy_pdf: "PDF manuales",
    report_json: "Contenido de reportes",
    report_html: "HTML de reportes",
    report_artifact: "Otros archivos de reportes",
};

function formatWhen(value: string | null): string {
    if (!value) return "—";
    const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString("es-MX");
}

const sectionTitle: React.CSSProperties = {
    margin: "0 0 8px",
    fontFamily: tokens.titleFont,
    fontSize: tokens.cardTitleSize,
    fontWeight: 800,
    color: tokens.textPrimary,
};

function CountList({ title, labels, counts, testId, tone }: {
    title: string;
    labels: Record<string, string>;
    counts: Record<string, number>;
    testId: string;
    tone: "danger" | "neutral" | "safe";
}) {
    const color = tone === "danger" ? "#b91c1c" : tone === "safe" ? "#047857" : tokens.textPrimary;
    const rows = Object.keys(labels).filter((key) => key in counts);
    return (
        <section aria-label={title} data-testid={testId} style={{ minWidth: 0 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color }}>{title}</h3>
            <dl style={{ margin: 0 }}>
                {rows.map((key) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", borderBottom: "1px solid #eef2f3" }}>
                        <dt style={{ color: tokens.textSecondary }}>{labels[key]}</dt>
                        <dd data-testid={`${testId}-${key}`} style={{ margin: 0, fontWeight: 700, color: counts[key] ? color : tokens.textSecondary }}>
                            {counts[key]}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

function OperationProgress({ op, busy, onRetry, onCancel }: {
    op: CleanupOperation;
    busy: boolean;
    onRetry: () => void;
    onCancel: () => void;
}) {
    const steps: CelumaStep[] = [
        { key: "gate", title: "Pausa de escritura", icon: <LockOutlined />, color: "#49b6ad", bg: "#eaf7f5" },
        { key: "database", title: "Base de datos", icon: <DatabaseOutlined />, color: "#49b6ad", bg: "#eaf7f5" },
        { key: "objects", title: "Archivos", icon: <FileDoneOutlined />, color: "#49b6ad", bg: "#eaf7f5" },
        { key: "done", title: "Completada", icon: <CheckCircleFilled />, color: "#049669", bg: "#e6f6ef" },
    ];
    const current = op.status === "COMPLETED" ? 3 : op.phase === "OBJECTS" ? 2 : op.phase === "DATABASE" ? 1 : 0;
    const running = ACTIVE_STATUSES.includes(op.status);
    const tone = op.status === "COMPLETED" ? "success" : op.status === "FAILED" ? "error" : op.status === "CANCELLED" ? "info" : "info";
    return (
        <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }} data-testid="cleanup-operation">
            <h2 style={sectionTitle}>Limpieza de «{op.laboratory_name}»</h2>
            <div role="status" aria-live="polite" data-testid="cleanup-status" style={{ margin: "4px 0 12px", fontWeight: 700 }}>
                {running && <LoadingOutlined aria-hidden style={{ marginRight: 8 }} />}
                {op.status === "COMPLETED" && <CheckCircleFilled aria-hidden style={{ marginRight: 8, color: "#049669" }} />}
                {op.status === "FAILED" && <CloseCircleFilled aria-hidden style={{ marginRight: 8, color: "#b91c1c" }} />}
                {op.status === "QUEUED" && <ClockCircleOutlined aria-hidden style={{ marginRight: 8 }} />}
                {STATUS_TEXT[op.status]}
            </div>
            <CelumaSteps steps={steps} current={current} />

            {op.writers_blocked && (
                <CelumaAlert
                    type="warning"
                    message="El laboratorio está en pausa"
                    description="Mientras dura la limpieza no se pueden crear ni modificar órdenes, muestras, reportes ni pagos. La consulta sigue disponible."
                    style={{ marginTop: 12 }}
                />
            )}
            {op.status === "FAILED" && (
                <div data-testid="cleanup-error" style={{ marginTop: 12 }}>
                    <CelumaAlert
                        type="error"
                        message={op.phase === "OBJECTS" ? "Faltan archivos por eliminar" : "La limpieza se interrumpió"}
                        description={
                            <>
                                {op.error_message ?? "Ocurrió un error."}{" "}
                                {op.phase === "OBJECTS"
                                    ? "La base de datos ya está limpia y el laboratorio ya opera; el reintento solo procesa los archivos pendientes."
                                    : "No se eliminó ningún dato; puedes reintentar o cancelar."}
                            </>
                        }
                    />
                </div>
            )}
            {op.status === "CANCELLED" && (
                <CelumaAlert
                    type="info"
                    message="Limpieza cancelada"
                    description={`${op.error_message ?? ""} No se eliminó ningún dato. El laboratorio vuelve a operar con normalidad.`.trim()}
                    style={{ marginTop: 12 }}
                />
            )}
            {op.status === "COMPLETED" && (
                <CelumaAlert
                    type="success"
                    message="Limpieza completada"
                    description="El contenido operativo se eliminó y los datos maestros se conservaron. Los códigos emitidos no se reutilizarán."
                    style={{ marginTop: 12 }}
                />
            )}

            <dl style={{ margin: "14px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
                <div><dt style={{ color: tokens.textSecondary }}>Intentos</dt><dd style={{ margin: 0, fontWeight: 700 }}>{op.attempts}</dd></div>
                <div>
                    <dt style={{ color: tokens.textSecondary }}>Archivos</dt>
                    <dd data-testid="cleanup-objects" style={{ margin: 0, fontWeight: 700 }}>
                        {op.objects.deleted + op.objects.absent} de {op.objects.total} eliminados
                        {op.objects.kept > 0 && ` · ${op.objects.kept} conservados por estar en uso`}
                        {op.objects.failed > 0 && ` · ${op.objects.failed} con error`}
                        {op.objects.pending_bytes > 0 && ` · ${formatBytes(op.objects.pending_bytes)} pendientes`}
                    </dd>
                </div>
                <div><dt style={{ color: tokens.textSecondary }}>Iniciada</dt><dd style={{ margin: 0 }}>{formatWhen(op.started_at ?? op.created_at)}</dd></div>
                <div><dt style={{ color: tokens.textSecondary }}>Base de datos limpia</dt><dd style={{ margin: 0 }}>{formatWhen(op.database_cleaned_at)}</dd></div>
                <div><dt style={{ color: tokens.textSecondary }}>Terminada</dt><dd style={{ margin: 0 }}>{formatWhen(op.completed_at ?? op.cancelled_at)}</dd></div>
            </dl>
            {op.executed_counts && (
                <p data-testid="cleanup-executed" style={{ margin: "10px 0 0", color: tokens.textSecondary }}>
                    Eliminado: {op.executed_counts.deleted.orders ?? 0} órdenes, {op.executed_counts.deleted.samples ?? 0} muestras,{" "}
                    {op.executed_counts.deleted.reports ?? 0} reportes. Códigos retirados de forma permanente: {op.executed_counts.retired_codes}.
                </p>
            )}
            <span hidden data-testid="cleanup-tone">{tone}</span>

            {(op.can_retry || op.can_cancel) && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                    {op.can_retry && (
                        <CelumaButton type="primary" onClick={onRetry} disabled={busy} data-testid="cleanup-retry">
                            Reintentar
                        </CelumaButton>
                    )}
                    {op.can_cancel && (
                        <CelumaButton danger onClick={onCancel} disabled={busy} data-testid="cleanup-cancel">
                            Cancelar limpieza
                        </CelumaButton>
                    )}
                </div>
            )}
        </Card>
    );
}

export default function LaboratoryCleanup() {
    const { profile, loading } = useUserProfile();
    const tenantId = profile?.tenant_id;
    const { authorized, checked } = useLaboratoryCleanupAccess(tenantId);

    const [preview, setPreview] = useState<CleanupPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [confirmName, setConfirmName] = useState("");
    const [password, setPassword] = useState("");
    const [acknowledged, setAcknowledged] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [active, setActive] = useState<CleanupOperation | null>(null);
    const [history, setHistory] = useState<CleanupOperation[]>([]);
    const [busy, setBusy] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const formId = useId();
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const loadHistory = useCallback(async () => {
        if (!tenantId) return;
        try {
            const rows = await listCleanupOperations(tenantId);
            if (!alive.current) return;
            setHistory(rows);
            setActive((current) => current ?? rows.find((r) => OPEN_STATUSES.includes(r.status)) ?? null);
        } catch {
            /* the history is secondary; the flow does not depend on it */
        }
    }, [tenantId]);

    useEffect(() => {
        if (authorized) void loadHistory();
    }, [authorized, loadHistory]);

    // Progress: poll while the operation can still move; stop on a settled state.
    useEffect(() => {
        if (!tenantId || !active || !ACTIVE_STATUSES.includes(active.status)) return;
        const timer = setInterval(async () => {
            try {
                const next = await getCleanupOperation(tenantId, active.id);
                if (!alive.current) return;
                setActive(next);
                if (!ACTIVE_STATUSES.includes(next.status)) void loadHistory();
            } catch {
                /* transient: the next tick retries */
            }
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [tenantId, active, loadHistory]);

    // Preview expiry countdown tick.
    useEffect(() => {
        if (!preview?.expires_at) return;
        const timer = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(timer);
    }, [preview?.expires_at]);

    const expired = useMemo(() => {
        if (!preview?.expires_at) return false;
        const at = new Date(preview.expires_at.endsWith("Z") ? preview.expires_at : `${preview.expires_at}Z`).getTime();
        return Number.isFinite(at) && at < now;
    }, [preview, now]);

    const resetConfirmation = () => {
        setReason("");
        setConfirmName("");
        setPassword("");
        setAcknowledged(false);
        setSubmitError(null);
    };

    const handlePreview = async () => {
        if (!tenantId) return;
        setPreviewing(true);
        setPreviewError(null);
        setPreview(null);
        resetConfirmation();
        try {
            const result = await previewCleanup(tenantId);
            if (alive.current) {
                setPreview(result);
                setNow(Date.now());
            }
        } catch (err) {
            if (alive.current) setPreviewError(err instanceof Error ? err.message : "No se pudo generar la vista previa.");
        } finally {
            if (alive.current) setPreviewing(false);
        }
    };

    const nameMatches = preview ? confirmName.trim().normalize("NFC") === preview.laboratory.name.trim().normalize("NFC") : false;
    const reasonOk = reason.trim().length >= MIN_REASON && reason.trim().length <= MAX_REASON;
    const canConfirm = Boolean(
        preview?.preview_token && !expired && nameMatches && reasonOk && password.length > 0 && acknowledged && !submitting,
    );

    const handleConfirm = async () => {
        if (!tenantId || !preview?.preview_token || !canConfirm) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const op = await startCleanup(tenantId, {
                preview_token: preview.preview_token,
                reason: reason.trim(),
                confirm_name: confirmName,
                password,
            });
            if (!alive.current) return;
            setActive(op);
            setPreview(null);
            resetConfirmation();
            void loadHistory();
        } catch (err) {
            if (!alive.current) return;
            // The password never survives a failed attempt, and a stale/used preview is discarded.
            setPassword("");
            if (err instanceof CleanupApiError && err.code === "preview_stale") {
                setPreview(null);
                setSubmitError("La vista previa ya no es válida porque el contenido cambió o venció. Genera una nueva vista previa.");
            } else {
                setSubmitError(err instanceof Error ? err.message : "No se pudo iniciar la limpieza.");
            }
        } finally {
            if (alive.current) setSubmitting(false);
        }
    };

    const act = async (fn: () => Promise<CleanupOperation>) => {
        setBusy(true);
        try {
            const next = await fn();
            if (alive.current) setActive(next);
        } catch (err) {
            if (alive.current) {
                setActive((cur) =>
                    cur ? { ...cur, error_message: err instanceof Error ? err.message : cur.error_message } : cur,
                );
            }
        } finally {
            if (alive.current) {
                setBusy(false);
                void loadHistory();
            }
        }
    };

    if (loading || !checked) return null;
    if (!authorized || !tenantId) {
        return <AccessDenied />;
    }

    const open = active && OPEN_STATUSES.includes(active.status);

    return (
        <div style={{ display: "grid", gap: tokens.gap * 2 }} data-testid="laboratory-cleanup-page">
            <PageHeader
                title="Limpieza de contenido del laboratorio"
                subtitle="Mantenimiento privilegiado para quien creó el laboratorio: elimina por completo las órdenes, muestras, reportes, facturación y auditoría del contenido operativo y conserva la configuración del laboratorio."
            />

            <CelumaAlert
                type="warning"
                message="Esta acción es irreversible"
                description="No sustituye al retiro de capturas erróneas ni a ninguna acción clínica. Se eliminan también las facturas, conceptos y pagos de las órdenes y su historial de auditoría. Una vez completada, la aplicación no puede recuperar nada de lo eliminado; no se borran respaldos, exportaciones ya generadas ni versiones anteriores de archivos en el almacenamiento. Nunca se reutilizan los códigos ya emitidos."
            />

            {active && <OperationProgress op={active} busy={busy} onRetry={() => act(() => retryCleanup(tenantId, active.id))} onCancel={() => act(() => cancelCleanup(tenantId, active.id))} />}

            {!open && (
                <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                    <h2 style={sectionTitle}>1. Genera la vista previa</h2>
                    <p style={{ color: tokens.textSecondary, marginTop: 0 }}>
                        Se limpia únicamente el laboratorio de tu sesión. Se elimina todo el contenido operativo —órdenes, muestras, imágenes, reportes y sus versiones,
                        comentarios, asignaciones, notificaciones, facturas, conceptos, pagos y el historial de auditoría de ese contenido—. Se conservan pacientes, usuarios,
                        sucursales, médicos solicitantes, tipos de estudio y de muestra, precios maestros, plantillas y membretes, logotipos, firmas, revisor predeterminado,
                        configuración, el plan y la suscripción del laboratorio y los contadores y la bitácora de numeración.
                    </p>
                    <div>
                        <CelumaButton type="primary" onClick={handlePreview} disabled={previewing} data-testid="preview-button">
                            {previewing ? "Generando…" : "Generar vista previa"}
                        </CelumaButton>
                    </div>
                    {submitError && !preview && (
                        <div data-testid="confirm-error" style={{ marginTop: 12 }}>
                            <CelumaAlert type="error" message={submitError} />
                        </div>
                    )}
                    {previewError && (
                        <div style={{ marginTop: 12 }}>
                            <CelumaAlert type="error" message={previewError} />
                        </div>
                    )}
                </Card>
            )}

            {!open && preview && (
                <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }} data-testid="cleanup-preview">
                    <h2 style={sectionTitle}>2. Revisa la vista previa</h2>
                    <p style={{ margin: "0 0 12px" }}>
                        Laboratorio: <strong data-testid="preview-lab-name">{preview.laboratory.name}</strong>{" "}
                        <span style={{ color: tokens.textSecondary }}>({preview.laboratory.id})</span>
                    </p>

                    {preview.blockers.length > 0 && (
                        <div data-testid="preview-blockers" style={{ marginBottom: 12 }}>
                            <CelumaAlert
                                type="error"
                                message="La limpieza no puede iniciar todavía"
                                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{preview.blockers.map((b) => <li key={b.code}>{b.message}</li>)}</ul>}
                            />
                        </div>
                    )}
                    {preview.warnings.length > 0 && (
                        <div data-testid="preview-warnings" style={{ marginBottom: 12 }}>
                            <CelumaAlert
                                type="warning"
                                message="Ten en cuenta"
                                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{preview.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>}
                            />
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
                        <CountList title="Se eliminará" labels={DELETE_LABELS} counts={preview.delete} testId="preview-delete" tone="danger" />
                        <CountList title="Se conserva solo como registro técnico (sin contenido clínico)" labels={RETAIN_LABELS} counts={preview.retain_as_evidence} testId="preview-retain" tone="neutral" />
                        <CountList title="Se conserva intacto" labels={PRESERVE_LABELS} counts={preview.preserve} testId="preview-preserve" tone="safe" />
                    </div>

                    <p data-testid="preview-provenance" style={{ margin: "16px 0 0", color: tokens.textSecondary }}>
                        La propia limpieza deja un registro técnico mínimo —quién la confirmó, cuándo, el motivo y solo cifras, sin contenido eliminado— y la lista de
                        archivos pendientes de borrar. No se promete borrar respaldos, exportaciones ya generadas ni versiones anteriores de archivos del almacenamiento.
                    </p>

                    <section aria-label="Archivos" data-testid="preview-objects" style={{ marginTop: 16 }}>
                        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#b91c1c" }}>Archivos en almacenamiento que se eliminarán</h3>
                        <p style={{ margin: 0 }}>
                            <strong data-testid="preview-objects-count">{preview.objects.delete_count}</strong> archivos ·{" "}
                            <strong data-testid="preview-objects-bytes">{formatBytes(preview.objects.delete_bytes)}</strong>
                            {Object.entries(preview.objects.by_category).length > 0 && (
                                <span style={{ color: tokens.textSecondary }}>
                                    {" "}({Object.entries(preview.objects.by_category).map(([k, v]) => `${CATEGORY_TEXT[k] ?? k}: ${v.objects}`).join(", ")})
                                </span>
                            )}
                            . Se conservan {preview.objects.kept_shared_count} archivos compartidos (firmas, logotipos, plantillas u otros usos).
                        </p>
                    </section>

                    {preview.preview_token && (
                        <p data-testid="preview-expiry" style={{ margin: "12px 0 0", color: expired ? "#b91c1c" : tokens.textSecondary }}>
                            {expired ? "La vista previa venció. Genera una nueva." : `Vigente hasta ${formatWhen(preview.expires_at)}`}
                        </p>
                    )}
                </Card>
            )}

            {!open && preview?.preview_token && (
                <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }} data-testid="cleanup-confirmation">
                    <h2 style={sectionTitle}>3. Confirma</h2>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleConfirm();
                        }}
                        aria-label="Confirmación de la limpieza"
                        style={{ display: "grid", gap: 16, maxWidth: 640 }}
                        autoComplete="off"
                    >
                        <div>
                            <span style={{ fontWeight: 700, display: "block", marginBottom: 6 }}>Motivo</span>
                            <CelumaTextArea
                                value={reason}
                                onChange={setReason}
                                rows={3}
                                maxLength={MAX_REASON}
                                ariaLabel="Motivo de la limpieza"
                                placeholder="Por qué se limpia este laboratorio (mínimo 10 caracteres)"
                                error={reason.length > 0 && !reasonOk ? `Escribe al menos ${MIN_REASON} caracteres.` : undefined}
                            />
                        </div>
                        <div>
                            <label htmlFor={`${formId}-name`} style={{ fontWeight: 700, display: "block", marginBottom: 6 }}>
                                Escribe el nombre exacto del laboratorio: <span data-testid="confirm-name-hint" style={{ fontWeight: 400 }}>{preview.laboratory.name}</span>
                            </label>
                            <TextField
                                id={`${formId}-name`}
                                value={confirmName}
                                onChange={(e) => setConfirmName(e.target.value)}
                                aria-label="Nombre del laboratorio"
                                autoComplete="off"
                                error={confirmName.length > 0 && !nameMatches ? "El nombre no coincide." : undefined}
                            />
                        </div>
                        <div>
                            <label htmlFor={`${formId}-password`} style={{ fontWeight: 700, display: "block", marginBottom: 6 }}>Tu contraseña actual</label>
                            <PasswordField
                                id={`${formId}-password`}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                aria-label="Tu contraseña actual"
                                autoComplete="current-password"
                            />
                        </div>
                        <Checkbox checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} data-testid="acknowledge">
                            Entiendo que se eliminarán de forma permanente las órdenes, muestras, reportes, facturas, pagos y registros de auditoría mostrados, y que no se podrán recuperar desde la aplicación.
                        </Checkbox>
                        {submitError && (
                            <div data-testid="confirm-error">
                                <CelumaAlert type="error" message={submitError} />
                            </div>
                        )}
                        <div>
                            <CelumaButton type="primary" danger htmlType="submit" disabled={!canConfirm} data-testid="confirm-button">
                                {submitting ? "Iniciando…" : "Eliminar el contenido de este laboratorio"}
                            </CelumaButton>
                        </div>
                    </form>
                </Card>
            )}

            {history.length > 0 && (
                <Card style={cardStyle} styles={{ body: { padding: tokens.cardPadding } }}>
                    <h2 style={sectionTitle}>Historial</h2>
                    <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="cleanup-history">
                        <caption style={{ position: "absolute", left: -9999 }}>Limpiezas anteriores de este laboratorio</caption>
                        <thead>
                            <tr style={{ textAlign: "left", color: tokens.textSecondary }}>
                                <th scope="col">Fecha</th>
                                <th scope="col">Estado</th>
                                <th scope="col">Motivo</th>
                                <th scope="col"><span style={{ position: "absolute", left: -9999 }}>Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((row) => (
                                <tr key={row.id} style={{ borderTop: "1px solid #eef2f3" }}>
                                    <td>{formatWhen(row.created_at)}</td>
                                    <td>{STATUS_TEXT[row.status]}</td>
                                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>{row.reason}</td>
                                    <td>
                                        <CelumaButton size="xsmall" onClick={() => setActive(row)} aria-label={`Ver la limpieza del ${formatWhen(row.created_at)}`}>
                                            Ver
                                        </CelumaButton>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
        </div>
    );
}
