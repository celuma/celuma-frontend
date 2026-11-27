import React, { useEffect, useRef, useState } from "react";
import { Select } from "antd";
import type { SelectProps } from "antd";
import FieldMessage from "./field_message";
import { type FieldStatus, FIELD_COLORS, FIELD_HEIGHT, captionStyle, fieldChrome, popupClassNames, useKeyboardFocus } from "./floating_caption_field";

/** How long a validation message stays on screen before auto-hiding. */
const MESSAGE_AUTO_HIDE_MS = 5000;

type Status = FieldStatus;

type Option = { value: string; label: React.ReactNode };

type Props = {
    label: React.ReactNode;
    value?: string[];
    onChange?: (v: string[]) => void;
    options: Option[];
    placeholder?: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    requiredMark?: boolean;
    disabled?: boolean;
    allowClear?: boolean;
    style?: React.CSSProperties;
    /** Céluma 1.5 (#69 review): option and popup presentation (see `personSelectProps`). */
    /**
     * Céluma 1.5 (#85), opt-in: accessible name of the field's input (the floating caption is
     * not a <label> of it). Omitted, nothing changes.
     */
    ariaLabel?: string;
    selectProps?: Pick<SelectProps, "optionRender" | "popupMatchSelectWidth" | "classNames" | "menuItemSelectedIcon">;
};

/**
 * FloatingCaptionMultiSelect — the multiple-selection sibling of
 * FloatingCaptionSelect. Same outlined teal box, floating caption label and
 * required asterisk, but auto-growing so selected tags wrap. Use it wherever a
 * form needs to pick several values (roles, branches, …) so multi-selects share
 * the same look as the rest of the Céluma fields.
 */
export default function FloatingCaptionMultiSelect({
    label,
    value,
    onChange,
    options,
    placeholder,
    error,
    status,
    requiredMark = false,
    disabled,
    allowClear = true,
    style,
    ariaLabel,
    selectProps,
}: Props) {
    const kb = useKeyboardFocus();
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [open, setOpen] = useState(false);
    const [msgVisible, setMsgVisible] = useState(true);

    const finalStatus: Status = error ? "error" : status ?? "default";
    const active = hovered || focused || open;
    const { keyboardFocus } = kb;
    const shownRef = useRef(false);

    useEffect(() => {
        if (!error) {
            shownRef.current = false;
            setMsgVisible(false);
            return;
        }
        if (active) {
            setMsgVisible(false);
            return;
        }
        if (!shownRef.current) {
            shownRef.current = true;
            setMsgVisible(true);
            const t = setTimeout(() => setMsgVisible(false), MESSAGE_AUTO_HIDE_MS);
            return () => clearTimeout(t);
        }
    }, [error, active]);

    const hasValue = Array.isArray(value) && value.length > 0;
    const isFloating = focused || open || hasValue;

    const { borderColor, boxShadow } = fieldChrome(finalStatus, active, keyboardFocus);
    const elevated = active || finalStatus !== "default";

    // Céluma 1.5 (#85 follow-up): the same 6px on every side whether the caption floats or not, so
    // one row of chips sits on the field's centre line and extra rows grow the box symmetrically.
    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        zIndex: 2,
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        background: FIELD_COLORS.bg,
        transition: "border-color .2s, box-shadow .2s",
        boxShadow,
        opacity: disabled ? 0.6 : 1,
        minHeight: FIELD_HEIGHT,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        padding: 6,
        ["--fc-ink" as string]: borderColor,
    };

    return (
        <div
            // Céluma 1.5 (#69 review): `minWidth: 0` lets the field shrink inside the forms' `1fr` grids, as in
            // FloatingCaptionSelect; long chips no longer widen their column.
            style={{ position: "relative", minWidth: 0, zIndex: active ? 30 : elevated ? 20 : 1, ...style }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={wrapperStyle} onKeyDown={kb.onKeyDown} onPointerDown={kb.onPointerDown}>
                <label style={captionStyle(finalStatus, isFloating)}>
                    {label}
                    {requiredMark && <span style={{ color: FIELD_COLORS.error }}> *</span>}
                </label>
                <Select
                    {...selectProps}
                    mode="multiple"
                    className="fc-multiselect"
                    aria-label={ariaLabel}
                    value={value ?? []}
                    onChange={(v) => onChange?.(v as string[])}
                    options={options}
                    placeholder={placeholder}
                    disabled={disabled}
                    optionFilterProp="label"
                    onFocus={() => { setFocused(true); kb.onFocus(); }}
                    onBlur={() => { setFocused(false); kb.onBlur(); }}
                    onOpenChange={setOpen}
                    style={{ width: "100%" }}
                    variant="borderless"
                    classNames={popupClassNames(selectProps?.classNames)}
                    allowClear={allowClear}
                />
            </div>

            {error && (
                <FieldMessage variant="error" open={msgVisible}>{error}</FieldMessage>
            )}
        </div>
    );
}
