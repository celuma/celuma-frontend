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
    value?: string;
    onChange?: (v?: string) => void;
    options: Option[];
    placeholder?: string;
    error?: string;
    status?: Exclude<Status, "default" | "error">;
    requiredMark?: boolean;
    disabled?: boolean;
    showSearch?: boolean;
    allowClear?: boolean;
    style?: React.CSSProperties;
    /** Fifth post-Phase 2 remediation: the letterhead selector resolves the
     *  selected letterhead's configuration with a network request, and without
     *  this the field remained silent in the meantime. */
    loading?: boolean;
    "data-testid"?: string;
    /** Céluma 1.5 (#69): search, option and popup behaviour of a specific
     *  catalog (see `catalogTypeSelectProps`). `filterOption` replaces the
     *  default match on the label. */
    /**
     * Céluma 1.5 (#85), opt-in: accessible name of the field's input (the floating caption is
     * not a <label> of it). Omitted, nothing changes.
     */
    ariaLabel?: string;
    selectProps?: Pick<SelectProps, "filterOption" | "optionRender" | "labelRender" | "popupMatchSelectWidth" | "classNames" | "menuItemSelectedIcon">;
};

/**
 * FloatingCaptionSelect — a Select that matches FloatingCaptionInput exactly
 * (same outlined teal box, 56px height, floating caption label and required
 * asterisk). Use it next to FloatingCaptionInput so dropdowns and text boxes
 * share one consistent look across forms.
 */
export default function FloatingCaptionSelect({
    label,
    value,
    onChange,
    options,
    placeholder,
    error,
    status,
    requiredMark = false,
    disabled,
    showSearch = false,
    allowClear = true,
    style,
    loading = false,
    "data-testid": dataTestId,
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

    // The chin appears once when the error is (re)triggered, then auto-hides. Hovering,
    // focusing or opening "focuses" the glow into the crisp ring and dismisses the chin
    // for good — it won't pop back when the pointer leaves; it only returns if the error
    // is provoked anew.
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
    const isFloating = focused || open || (value !== undefined && value !== "" && value !== null);
    const { borderColor, boxShadow } = fieldChrome(finalStatus, active, keyboardFocus);
    const elevated = active || finalStatus !== "default";

    const wrapperStyle: React.CSSProperties = {
        position: "relative",
        zIndex: 2,
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
        background: FIELD_COLORS.bg,
        transition: "border-color .2s, box-shadow .2s",
        boxShadow,
        opacity: disabled ? 0.6 : 1,
        height: FIELD_HEIGHT,
        boxSizing: "border-box",
        ["--fc-ink" as string]: borderColor,
    };

    return (
        <div
            // Céluma 1.5 (#69): the selected item's end padding keeps long text clear of the arrow/clear icon.
            // `minWidth: 0` lets the field shrink inside the forms' `1fr` grids; without it a
            // long selected label widened its column and pushed the form past a narrow viewport.
            style={{ position: "relative", minWidth: 0, zIndex: active ? 30 : elevated ? 20 : 1, ...style }}
            data-testid={dataTestId}
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
                    className="fc-select"
                    aria-label={ariaLabel}
                    value={value === "" ? undefined : value}
                    onChange={(v) => onChange?.(v)}
                    options={options}
                    placeholder={placeholder}
                    disabled={disabled}
                    loading={loading}
                    showSearch={showSearch}
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
