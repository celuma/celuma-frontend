import { useEffect, useRef, useState } from "react";
import { Alert, Radio, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import CelumaModal from "../ui/celuma_modal";
import CelumaButton from "../ui/button";
import { tokens } from "../design/tokens";
import {
    CatalogApiError,
    confirmCopy,
    confirmImport,
    previewCopy,
    previewImport,
    readExportFile,
} from "../../services/sample_type_service";
import type { ConflictPolicy, TransferItem, TransferPreview, TransferResult, TransferStatus } from "../../models/sample_type";

/**
 * Preview → confirm flow shared by "Importar JSON" and "Copiar a tipos de
 * muestra" (Céluma 1.4, issue #17). Both are validated and executed by the same
 * API transfer service; this component only shows its plan and sends the
 * user's decision back with the plan digest, so a plan that changed in between
 * is refused (409) and re-shown instead of being applied blindly.
 */
export type TransferSource =
    | { mode: "import" }
    | { mode: "copy"; studyTypeIds: string[] };

interface Props {
    open: boolean;
    source: TransferSource;
    onClose: () => void;
    /** Called after a confirmation that created records (the catalog should reload). */
    onDone: (result: TransferResult) => void;
}

const STATUS_LABEL: Record<TransferStatus, { text: string; color: string }> = {
    ready: { text: "Lista", color: "green" },
    code_exists: { text: "El código ya existe", color: "orange" },
    duplicate_in_source: { text: "Código repetido en el origen", color: "orange" },
    invalid: { text: "Inválida", color: "red" },
};

const TEMPLATE_LABEL = { none: "—", mapped: "Se conserva", dropped: "Se omite" } as const;

export default function CatalogTransferModal({ open, source, onClose, onDone }: Props) {
    const [document, setDocument] = useState<Record<string, unknown> | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [preview, setPreview] = useState<TransferPreview | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const [policy, setPolicy] = useState<ConflictPolicy>("abort");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [result, setResult] = useState<TransferResult | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const studyIdsKey = source.mode === "copy" ? source.studyTypeIds.join(",") : "";

    const showPreview = (next: TransferPreview) => {
        setPreview(next);
        setSelected(next.items.filter((i) => i.status === "ready").map((i) => i.index));
    };

    useEffect(() => {
        if (!open) return;
        setDocument(null);
        setFileName(null);
        setPreview(null);
        setSelected([]);
        setPolicy("abort");
        setError(null);
        setNotice(null);
        setResult(null);
        if (source.mode === "copy") {
            setBusy(true);
            previewCopy(source.studyTypeIds)
                .then(showPreview)
                .catch((err) => setError(err instanceof Error ? err.message : "No se pudo generar la vista previa."))
                .finally(() => setBusy(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, source.mode, studyIdsKey]);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setBusy(true);
        try {
            const parsed = await readExportFile(file);
            setDocument(parsed);
            setFileName(file.name);
            showPreview(await previewImport(parsed));
        } catch (err) {
            setPreview(null);
            setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
        } finally {
            setBusy(false);
            if (fileInput.current) fileInput.current.value = "";
        }
    };

    const handleConfirm = async () => {
        if (!preview) return;
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const outcome =
                source.mode === "copy"
                    ? await confirmCopy({ studyTypeIds: source.studyTypeIds, onConflict: policy, planDigest: preview.plan_digest })
                    : await confirmImport({
                          document: document as Record<string, unknown>,
                          selectedIndexes: selected,
                          onConflict: policy,
                          planDigest: preview.plan_digest,
                      });
            setResult(outcome);
            onDone(outcome);
        } catch (err) {
            if (err instanceof CatalogApiError && err.preview) {
                showPreview(err.preview);
                setNotice(
                    err.code === "preview_stale"
                        ? "El catálogo cambió desde la vista previa (o esta operación ya se aplicó). Revisa el nuevo plan antes de confirmar; no se creó nada."
                        : "Hay registros en conflicto con el catálogo de destino. No se creó nada: elige omitirlos o quita los conflictos.",
                );
            } else {
                setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
            }
        } finally {
            setBusy(false);
        }
    };

    const selectable = (item: TransferItem) => item.status !== "invalid";
    const copy = source.mode === "copy";
    const chosen = preview ? (copy ? preview.items.filter(selectable) : preview.items.filter((i) => selected.includes(i.index))) : [];
    const conflictsChosen = chosen.filter((i) => i.status !== "ready").length;
    const willCreate = chosen.filter((i) => i.status === "ready").length;
    const blocked = copy ? (preview?.invalid ?? 0) > 0 : false;
    const canConfirm =
        !!preview && !busy && !result && !blocked && chosen.length > 0 &&
        (policy === "skip" ? willCreate > 0 : conflictsChosen === 0);

    const columns: ColumnsType<TransferItem> = [
        { title: "Código", dataIndex: "code", key: "code", width: 120, render: (v: string | null) => <strong>{v ?? "—"}</strong> },
        { title: "Nombre", dataIndex: "name", key: "name", render: (v: string | null) => v ?? "—" },
        { title: "Estado de origen", dataIndex: "is_active", key: "active", width: 120, render: (v: boolean) => (v ? "Activo" : "Inactivo") },
        {
            title: "Plantilla",
            dataIndex: "template_reference",
            key: "template",
            width: 110,
            render: (v: TransferItem["template_reference"]) => TEMPLATE_LABEL[v],
        },
        {
            title: "Resultado",
            key: "status",
            render: (_: unknown, item) => (
                <div style={{ display: "grid", gap: 4 }}>
                    <Tag color={STATUS_LABEL[item.status].color} style={{ width: "fit-content" }}>{STATUS_LABEL[item.status].text}</Tag>
                    {[...item.issues, ...item.warnings].map((m, i) => (
                        <span key={i} style={{ fontSize: 12, color: tokens.textSecondary }}>{m.message}</span>
                    ))}
                </div>
            ),
        },
    ];

    const title = copy ? "Copiar a tipos de muestra" : "Importar tipos de muestra desde JSON";

    return (
        <CelumaModal title={title} open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden>
            <div style={{ display: "grid", gap: 16 }}>
                {result ? (
                    <>
                        <Alert
                            type="success"
                            showIcon
                            message={`${result.created.length} tipo(s) de muestra creado(s)`}
                            description={
                                result.skipped.length
                                    ? `${result.skipped.length} registro(s) omitido(s): ${result.skipped.map((s) => s.code ?? `#${s.index + 1}`).join(", ")}.`
                                    : "Los tipos de estudio de origen no se modificaron."
                            }
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <CelumaButton type="primary" onClick={onClose}>Cerrar</CelumaButton>
                        </div>
                    </>
                ) : (
                    <>
                        {!copy && (
                            <div style={{ display: "grid", gap: 8 }}>
                                <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>
                                    Selecciona un archivo exportado desde Céluma (tipos de estudio o de muestra). Verás una vista previa antes de crear nada;
                                    los registros se crean como tipos de muestra nuevos e independientes de este laboratorio.
                                </p>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <input
                                        ref={fileInput}
                                        type="file"
                                        accept="application/json,.json"
                                        aria-label="Archivo JSON a importar"
                                        data-testid="import-file"
                                        onChange={(e) => handleFile(e.target.files?.[0])}
                                        style={{ display: "none" }}
                                    />
                                    <CelumaButton onClick={() => fileInput.current?.click()} disabled={busy}>
                                        {document ? "Elegir otro archivo" : "Elegir archivo JSON"}
                                    </CelumaButton>
                                    {fileName && <span style={{ fontSize: 13 }}>{fileName}</span>}
                                </div>
                            </div>
                        )}
                        {copy && (
                            <p style={{ margin: 0, color: tokens.textSecondary, fontSize: 14 }}>
                                Se crearán tipos de muestra independientes a partir de los tipos de estudio seleccionados. Los tipos de estudio de origen,
                                sus órdenes y sus plantillas no se modifican.
                            </p>
                        )}
                        {error && <Alert type="error" showIcon message={error} />}
                        {notice && <Alert type="warning" showIcon message={notice} />}
                        {preview && (
                            <>
                                <div style={{ fontSize: 14 }} data-testid="transfer-summary">
                                    <strong>{preview.total}</strong> registro(s) · <strong>{preview.ready}</strong> listo(s) ·{" "}
                                    <strong>{preview.conflicts}</strong> en conflicto · <strong>{preview.invalid}</strong> inválido(s)
                                </div>
                                <Table<TransferItem>
                                    size="small"
                                    rowKey="index"
                                    columns={columns}
                                    dataSource={preview.items}
                                    pagination={preview.items.length > 10 ? { pageSize: 10 } : false}
                                    rowSelection={
                                        copy
                                            ? undefined
                                            : {
                                                  selectedRowKeys: selected,
                                                  onChange: (keys) => setSelected(keys as number[]),
                                                  getCheckboxProps: (item) => ({ disabled: !selectable(item) }),
                                              }
                                    }
                                />
                                <div style={{ display: "grid", gap: 6 }}>
                                    <strong style={{ fontSize: 14 }}>Si hay conflictos</strong>
                                    <Radio.Group value={policy} onChange={(e) => setPolicy(e.target.value)}>
                                        <Radio value="abort">No crear nada (recomendado)</Radio>
                                        <Radio value="skip">Omitir los registros en conflicto y crear el resto</Radio>
                                    </Radio.Group>
                                    <span style={{ fontSize: 12, color: tokens.textSecondary }}>
                                        Nunca se sobrescribe un tipo de muestra existente.
                                    </span>
                                </div>
                                {blocked && (
                                    <Alert type="error" showIcon message="Hay tipos de estudio inválidos para el catálogo de muestras; corrígelos antes de copiar." />
                                )}
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                                    <CelumaButton danger onClick={onClose} disabled={busy}>Cancelar</CelumaButton>
                                    <CelumaButton type="primary" onClick={handleConfirm} loading={busy} disabled={!canConfirm}>
                                        {`Crear ${willCreate} tipo(s) de muestra`}
                                    </CelumaButton>
                                </div>
                            </>
                        )}
                        {busy && !preview && <span style={{ color: tokens.textSecondary }}>Procesando…</span>}
                    </>
                )}
            </div>
        </CelumaModal>
    );
}
