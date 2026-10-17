import { useCallback, useEffect, useState } from "react";
import { Alert, Input, message } from "antd";
import { useNavigate } from "react-router-dom";
import Panel from "../ui/panel";
import CelumaButton from "../ui/button";
import CelumaModal from "../ui/celuma_modal";
import FloatingCaptionMultiSelect from "../ui/floating_caption_multiselect";
import FloatingCaptionInput from "../ui/floating_caption_input";
import { tokens } from "../design/tokens";
import { apiFetch } from "../../lib/api_fetch";
import { getErrorMessage } from "../../lib/api_error";
import BlockersNotice from "./blockers_notice";
import {
    getOrderManagement, removeOrder, updateOrder, type OrderManagementState,
} from "../../services/order_management_service";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";
export const MAX_REQUESTING_PHYSICIANS = 10;

interface Props {
    orderId: string;
    physicianIds: string[];
    expediente: string | null;
    notes: string | null;
    /** The user's own capabilities (hints; the API enforces them). */
    canEdit: boolean;
    canRemove: boolean;
    onChanged: () => void | Promise<void>;
}

/**
 * Controlled basic edit (requesting physicians, expediente, notes) and erroneous-capture removal of an
 * order (Céluma 1.4, #9/#11/#16). Offered only from Reception through Diagnosis; otherwise it says why not.
 */
export default function OrderManagementPanel({ orderId, physicianIds, expediente, notes, canEdit, canRemove, onChanged }: Props) {
    const navigate = useNavigate();
    const [state, setState] = useState<OrderManagementState | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [physicians, setPhysicians] = useState<Array<{ value: string; label: string }>>([]);
    const [ids, setIds] = useState<string[]>(physicianIds);
    const [exp, setExp] = useState(expediente ?? "");
    const [desc, setDesc] = useState(notes ?? "");
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        getOrderManagement(orderId).then(setState).catch(() => setState(null));
    }, [orderId]);
    useEffect(load, [load, physicianIds.join(","), expediente, notes]);

    const openEdit = async () => {
        setIds(physicianIds); setExp(expediente ?? ""); setDesc(notes ?? "");
        setError(null);
        setEditOpen(true);
        try {
            const res = await apiFetch(`${base}/v1/requesting-physicians/`);
            const rows = (await res.json()) as Array<{ id: string; physician_code: string; full_name: string }>;
            setPhysicians(rows.map((p) => ({ value: p.id, label: `${p.physician_code} - ${p.full_name}` })));
        } catch { /* the select stays empty; the API validates anyway */ }
    };

    const save = async () => {
        setSaving(true);
        try {
            await updateOrder(orderId, { requesting_physician_ids: ids, expediente: exp.trim() || null, notes: desc.trim() || null });
            message.success("Orden actualizada");
            setEditOpen(false);
            await onChanged();
            load();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setSaving(true);
        try {
            const res = await removeOrder(orderId, reason);
            message.success(`Orden ${res.code} retirada. El código no se reutilizará.`);
            navigate("/orders", { replace: true });
        } catch (err) {
            setError(getErrorMessage(err));
            setSaving(false);
        }
    };

    if (!state || (!canEdit && !canRemove)) return null;
    return (
        <Panel style={{ marginTop: 20, display: "grid", gap: 12 }} data-testid="order-management">
            <div style={{ fontSize: 12, fontWeight: 600, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Corrección de la captura
            </div>
            <BlockersNotice
                testId="order-edit-blockers"
                blockers={state.edit.blockers}
                lead="Esta orden ya no admite cambios directos (solo de Recepción a Diagnóstico y sin historial de revisión). Use el flujo de corrección o enmienda."
            />
            {state.edit.allowed && state.removal.blockers.length > 0 && (
                <BlockersNotice testId="order-removal-blockers" blockers={state.removal.blockers} lead="No se puede retirar esta orden por ahora:" />
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canEdit && (
                    <CelumaButton size="small" onClick={openEdit} disabled={!state.edit.allowed} data-testid="order-edit-button">
                        Editar médicos, expediente y descripción
                    </CelumaButton>
                )}
                {canRemove && (
                    <CelumaButton size="small" danger onClick={() => { setReason(""); setError(null); setRemoveOpen(true); }}
                        disabled={!state.removal.allowed} data-testid="order-remove-button">
                        Retirar orden por captura errónea
                    </CelumaButton>
                )}
            </div>

            <CelumaModal title="Editar orden" open={editOpen} onCancel={() => setEditOpen(false)} footer={null} destroyOnClose>
                <div style={{ display: "grid", gap: 16 }}>
                    <span style={{ fontSize: 13, color: tokens.textSecondary }}>
                        Solo se pueden cambiar estos campos. El paciente, el tipo de estudio, la sucursal y el código no se editan aquí.
                        Los médicos solicitantes no tienen orden de importancia; agregar uno no le da acceso ni le envía resultados.
                    </span>
                    {error && <Alert type="error" showIcon message={error} data-testid="order-edit-error" />}
                    <FloatingCaptionMultiSelect
                        label="Médicos solicitantes" value={ids} onChange={setIds} options={physicians}
                        placeholder="Seleccione uno o más médicos solicitantes"
                        error={ids.length > MAX_REQUESTING_PHYSICIANS ? `Máximo ${MAX_REQUESTING_PHYSICIANS}` : undefined}
                    />
                    <FloatingCaptionInput label="Expediente (opcional)" value={exp} onChange={(e) => setExp(e.target.value)} />
                    <Input.TextArea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={500} placeholder="Descripción" aria-label="Descripción" />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <CelumaButton danger onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</CelumaButton>
                        <CelumaButton type="primary" onClick={save} loading={saving} disabled={ids.length > MAX_REQUESTING_PHYSICIANS}>Guardar</CelumaButton>
                    </div>
                </div>
            </CelumaModal>

            <CelumaModal title="Retirar orden" open={removeOpen} onCancel={() => setRemoveOpen(false)} footer={null} destroyOnClose>
                <div style={{ display: "grid", gap: 12 }} data-testid="order-remove-dialog">
                    <strong>Esto es para una captura errónea, no para cancelar un caso.</strong>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {state.removal_consequences.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    {error && <Alert type="error" showIcon message={error} data-testid="order-remove-error" />}
                    <Input.TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000}
                        placeholder="Motivo del retiro (obligatorio)" aria-label="Motivo del retiro" />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <CelumaButton onClick={() => setRemoveOpen(false)} disabled={saving}>Cancelar</CelumaButton>
                        <CelumaButton danger type="primary" onClick={remove} loading={saving}
                            disabled={reason.trim().length < 3} data-testid="order-remove-confirm">Retirar orden</CelumaButton>
                    </div>
                </div>
            </CelumaModal>
        </Panel>
    );
}
