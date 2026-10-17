import { useCallback, useEffect, useState } from "react";
import { Alert, Input, message } from "antd";
import { useNavigate } from "react-router-dom";
import Panel from "../ui/panel";
import CelumaButton from "../ui/button";
import CelumaModal from "../ui/celuma_modal";
import FloatingCaptionInput from "../ui/floating_caption_input";
import { tokens } from "../design/tokens";
import { getErrorMessage } from "../../lib/api_error";
import BlockersNotice from "./blockers_notice";
import {
    correctSampleCode, getSampleManagement, removeSample, type SampleManagementState,
} from "../../services/order_management_service";

/** Alphabet of a corrected code (the generated-code alphabet); the API validates it too. */
export const SAMPLE_CODE_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

interface Props {
    sampleId: string;
    sampleCode: string;
    orderId: string;
    canCorrect: boolean;
    canRemove: boolean;
    onChanged: () => void | Promise<void>;
}

/** Narrow sample-code correction (#10) and erroneous-capture removal (#11), separate from registration. */
export default function SampleManagementPanel({ sampleId, sampleCode, orderId, canCorrect, canRemove, onChanged }: Props) {
    const navigate = useNavigate();
    const [state, setState] = useState<SampleManagementState | null>(null);
    const [mode, setMode] = useState<"correct" | "remove" | null>(null);
    const [code, setCode] = useState("");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        getSampleManagement(sampleId).then(setState).catch(() => setState(null));
    }, [sampleId]);
    useEffect(load, [load, sampleCode]);

    const close = () => { setMode(null); setBusy(false); setError(null); };
    const codeValid = SAMPLE_CODE_PATTERN.test(code.trim()) && code.trim() !== sampleCode;

    const submitCorrection = async () => {
        setBusy(true);
        try {
            const res = await correctSampleCode(sampleId, code.trim(), reason.trim());
            message.success(`Código corregido: ${res.old_code} → ${res.sample_code}. El código anterior no se reutilizará.`);
            close();
            await onChanged();
            load();
        } catch (err) {
            setError(getErrorMessage(err));
            setBusy(false);
        }
    };

    const submitRemoval = async () => {
        setBusy(true);
        try {
            await removeSample(sampleId, reason.trim());
            message.success("Muestra retirada. Su código no se reutilizará.");
            navigate(`/orders/${orderId}`, { replace: true });
        } catch (err) {
            setError(getErrorMessage(err));
            setBusy(false);
        }
    };

    if (!state || (!canCorrect && !canRemove)) return null;
    return (
        <Panel style={{ marginTop: 16, display: "grid", gap: 12 }} data-testid="sample-management">
            <div style={{ fontSize: 12, fontWeight: 600, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Corrección de la captura
            </div>
            <BlockersNotice
                testId="sample-blockers"
                blockers={state.correction.allowed ? state.removal.blockers : state.correction.blockers}
                lead={state.correction.allowed ? "No se puede retirar esta muestra por ahora:" : "Esta muestra ya no admite cambios directos de su código (solo de Recepción a Diagnóstico y sin historial de revisión)."}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canCorrect && (
                    <CelumaButton size="small" disabled={!state.correction.allowed}
                        onClick={() => { setCode(sampleCode); setReason(""); setMode("correct"); }} data-testid="sample-correct-button">
                        Corregir código
                    </CelumaButton>
                )}
                {canRemove && (
                    <CelumaButton size="small" danger disabled={!state.removal.allowed}
                        onClick={() => { setReason(""); setMode("remove"); }} data-testid="sample-remove-button">
                        Retirar muestra por captura errónea
                    </CelumaButton>
                )}
            </div>

            <CelumaModal title="Corregir código de la muestra" open={mode === "correct"} onCancel={close} footer={null} destroyOnClose>
                <div style={{ display: "grid", gap: 14 }} data-testid="sample-correct-dialog">
                    <span style={{ fontSize: 13, color: tokens.textSecondary }}>
                        Cambia solo el código; la muestra conserva su identidad y relaciones. El código anterior queda retirado y la
                        numeración automática no se modifica. Letras, números, «.», «_» y «-».
                    </span>
                    <FloatingCaptionInput label="Nuevo código" value={code} onChange={(e) => setCode(e.target.value)}
                        error={code && !SAMPLE_CODE_PATTERN.test(code.trim()) ? "Solo letras, números, '.', '_' y '-' (máx. 100)" : undefined} />
                    {error && <Alert type="error" showIcon message={error} data-testid="sample-error" />}
                    <Input.TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000}
                        placeholder="Motivo de la corrección (obligatorio)" aria-label="Motivo de la corrección" />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <CelumaButton danger onClick={close} disabled={busy}>Cancelar</CelumaButton>
                        <CelumaButton type="primary" onClick={submitCorrection} loading={busy}
                            disabled={!codeValid || reason.trim().length < 3} data-testid="sample-correct-confirm">Corregir</CelumaButton>
                    </div>
                </div>
            </CelumaModal>

            <CelumaModal title="Retirar muestra" open={mode === "remove"} onCancel={close} footer={null} destroyOnClose>
                <div style={{ display: "grid", gap: 12 }} data-testid="sample-remove-dialog">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>{state.removal_consequences.map((c) => <li key={c}>{c}</li>)}</ul>
                    {error && <Alert type="error" showIcon message={error} data-testid="sample-error" />}
                    <Input.TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000}
                        placeholder="Motivo del retiro (obligatorio)" aria-label="Motivo del retiro" />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <CelumaButton onClick={close} disabled={busy}>Cancelar</CelumaButton>
                        <CelumaButton danger type="primary" onClick={submitRemoval} loading={busy}
                            disabled={reason.trim().length < 3} data-testid="sample-remove-confirm">Retirar muestra</CelumaButton>
                    </div>
                </div>
            </CelumaModal>
        </Panel>
    );
}
