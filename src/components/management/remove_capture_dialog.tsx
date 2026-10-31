import { useEffect, useState } from "react";
import ConfirmDialog from "../ui/confirm_dialog";
import CelumaTextArea from "../ui/textarea_field";
import ErrorText from "../ui/error_text";
import { tokens } from "../design/tokens";

interface Props {
    open: boolean;
    title: string;
    /** What the removal does (from the API); shown as a short list. */
    consequences: string[];
    confirmText: string;
    loading: boolean;
    error: string | null;
    testId: string;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
}

/** Erroneous-capture removal (#11) as a Céluma alert: same ConfirmDialog as patients/requesters, plus the required reason. */
export default function RemoveCaptureDialog({ open, title, consequences, confirmText, loading, error, testId, onConfirm, onCancel }: Props) {
    const [reason, setReason] = useState("");
    useEffect(() => { if (open) setReason(""); }, [open]);

    return (
        <ConfirmDialog
            open={open}
            danger
            title={title}
            description="Esto es para una captura errónea, no para cancelar un caso. El código no se reutilizará."
            confirmText={confirmText}
            loading={loading}
            confirmDisabled={reason.trim().length < 3}
            onConfirm={() => onConfirm(reason.trim())}
            onCancel={onCancel}
        >
            <div style={{ display: "grid", gap: 12 }} data-testid={testId}>
                {consequences.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>
                        {consequences.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                )}
                <CelumaTextArea
                    value={reason}
                    onChange={setReason}
                    placeholder="Motivo del retiro (obligatorio)"
                    ariaLabel="Motivo del retiro"
                    rows={3}
                    maxLength={1000}
                />
                {error && <ErrorText>{error}</ErrorText>}
            </div>
        </ConfirmDialog>
    );
}
