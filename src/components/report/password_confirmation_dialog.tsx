import { useEffect, useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Alert, Input, Select } from "antd";
import { LockOutlined } from "@ant-design/icons";
import CelumaModal from "../ui/celuma_modal";
import CelumaButton from "../ui/button";
import { tokens } from "../design/tokens";

/**
 * Céluma 1.4 (#13): signing and reopening a report are confirmed with the
 * user's own current password, verified by the backend.
 *
 * The password lives only in this component's state while the dialog is open.
 * It is handed to `onConfirm` once and the field is cleared at that moment, on
 * cancel and whenever the dialog closes; it is never stored, logged or put in
 * a URL. A rejected confirmation keeps the dialog open with `error` shown, so
 * the user retypes it — the parent never treats that as a success.
 *
 * The dialog grants nothing: the backend still checks role, assignment, tenant
 * and report state, and an administrator who may reopen cannot sign with it.
 *
 * Céluma 1.4 (#46): password managers fill the username of a saved credential
 * into the field they take for the username — typically the nearest text field
 * before the password in the same form. That was the reason (or the category
 * picker), so filling the password could replace the reason the user had
 * written. The reason and the category therefore live in their own form, and
 * the credential form names its username explicitly: a read-only, visually
 * hidden `autocomplete="username"` field (the usual pattern for a
 * password-only re-authentication form). It stays empty on purpose: a value
 * matching the saved login lets Chrome fill the password by itself as soon as
 * the dialog opens, and the confirmation must keep needing the user's own
 * action. The reason stays an ordinary editable field; nothing reads the
 * hidden one.
 */
type Props = {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    confirmText: string;
    danger?: boolean;
    loading?: boolean;
    /** Inline message of the last refused attempt (wrong password, throttled…). */
    error?: string | null;
    /** When set, shows a reason field with this label (optional unless `reasonRequired`). */
    reasonLabel?: string;
    /** Céluma 1.4 (#13): amendments and their cancellation require a reason
     *  of at least 3 non-blank characters. */
    reasonRequired?: boolean;
    /** Céluma 1.4 (#13): an extra required choice (the amendment category). */
    choice?: {
        label: string;
        options: { value: string; label: string }[];
    };
    onConfirm: (password: string, reason?: string, choice?: string) => void;
    onCancel: () => void;
};

const MIN_REQUIRED_REASON = 3;

// Kept in the layout (not `display: none`) so password managers still treat it
// as the form's username field; invisible and out of the tab order for people.
const credentialUsernameStyle: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    border: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
};

export default function PasswordConfirmationDialog({
    open,
    title,
    description,
    confirmText,
    danger = false,
    loading = false,
    error,
    reasonLabel,
    reasonRequired = false,
    choice,
    onConfirm,
    onCancel,
}: Props) {
    const [password, setPassword] = useState("");
    const [reason, setReason] = useState("");
    const [choiceValue, setChoiceValue] = useState<string | undefined>(undefined);
    const fieldId = useId();
    const passwordId = `${fieldId}-password`;
    const reasonId = `${fieldId}-reason`;
    const errorId = `${fieldId}-error`;
    const choiceId = `${fieldId}-choice`;

    useEffect(() => {
        if (!open) {
            setPassword("");
            setReason("");
            setChoiceValue(undefined);
        }
    }, [open]);

    const reasonMissing = Boolean(reasonLabel && reasonRequired && reason.trim().length < MIN_REQUIRED_REASON);
    const choiceMissing = Boolean(choice && !choiceValue);
    const canSubmit = Boolean(password) && !reasonMissing && !choiceMissing && !loading;

    const submit = () => {
        if (!canSubmit) return;
        const value = password;
        setPassword("");
        onConfirm(value, reasonLabel ? reason.trim() || undefined : undefined, choice ? choiceValue : undefined);
    };

    const cancel = () => {
        if (loading) return;
        setPassword("");
        setReason("");
        setChoiceValue(undefined);
        onCancel();
    };

    // Unmounted (not just hidden) while closed, like `ConfirmDialog`: the
    // password field leaves the DOM the moment the dialog closes.
    if (!open) return null;

    return (
        <CelumaModal
            title={title}
            open
            onCancel={cancel}
            maskClosable={!loading}
            closable={!loading}
            width={480}
            footer={[
                <CelumaButton key="cancel" size="small" onClick={cancel} disabled={loading}>
                    Cancelar
                </CelumaButton>,
                <CelumaButton
                    key="confirm"
                    size="small"
                    type="primary"
                    danger={danger}
                    loading={loading}
                    disabled={!canSubmit}
                    onClick={submit}
                    data-testid="password-confirmation-submit"
                >
                    {confirmText}
                </CelumaButton>,
            ]}
        >
            {description && (
                <p style={{ margin: "0 0 16px", color: tokens.textSecondary, lineHeight: 1.5 }}>
                    {description}
                </p>
            )}
            {/* Céluma 1.4 (#46): outside the credential form, so a password
                manager never takes the category or the reason for the username. */}
            {(choice || reasonLabel) && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                    autoComplete="off"
                    data-testid="password-confirmation-details"
                >
                    {choice && (
                        <div style={{ marginBottom: 16 }}>
                            <label htmlFor={choiceId} style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                                {choice.label}
                            </label>
                            <Select
                                id={choiceId}
                                value={choiceValue}
                                onChange={(value: string) => setChoiceValue(value)}
                                options={choice.options}
                                disabled={loading}
                                style={{ width: "100%" }}
                                placeholder="Selecciona una opción"
                                data-testid="password-confirmation-choice"
                            />
                        </div>
                    )}
                    {reasonLabel && (
                        <div style={{ marginBottom: 16 }}>
                            <label htmlFor={reasonId} style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                                {reasonLabel}
                            </label>
                            <Input.TextArea
                                id={reasonId}
                                name="reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={2}
                                maxLength={reasonRequired ? 1000 : 500}
                                disabled={loading}
                                autoComplete="off"
                                aria-required={reasonRequired || undefined}
                                data-testid="password-confirmation-reason"
                            />
                        </div>
                    )}
                </form>
            )}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                data-testid="password-confirmation-credentials"
            >
                <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value=""
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    style={credentialUsernameStyle}
                    data-testid="password-confirmation-username"
                />
                <div>
                    <label htmlFor={passwordId} style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                        Contraseña actual
                    </label>
                    <Input.Password
                        id={passwordId}
                        name="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        prefix={<LockOutlined />}
                        autoComplete="current-password"
                        autoFocus
                        disabled={loading}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : undefined}
                        data-testid="password-confirmation-input"
                    />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: tokens.textSecondary }}>
                    Confirma que eres tú. Tu contraseña no se guarda en el reporte ni en el historial.
                </p>
                {error && (
                    <Alert
                        id={errorId}
                        role="alert"
                        type="error"
                        showIcon
                        message={error}
                        style={{ marginTop: 16 }}
                        data-testid="password-confirmation-error"
                    />
                )}
                {/* Lets Enter submit; the visible button is in the footer. */}
                <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
            </form>
        </CelumaModal>
    );
}
