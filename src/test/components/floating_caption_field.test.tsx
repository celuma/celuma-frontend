// Céluma 1.5 (#85 follow-up): the shared field treatment of the floating-caption dropdowns.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FloatingCaptionSelect from "../../components/ui/floating_caption_select";
import FloatingCaptionMultiSelect from "../../components/ui/floating_caption_multiselect";
import { catalogTypeSelectProps } from "../../components/ui/catalog_type_select";
import { FIELD_FOCUS_BORDER, captionStyle, popupClassNames } from "../../components/ui/floating_caption_field";

const OPTIONS = [{ value: "a", label: "Alfa" }, { value: "b", label: "Beta" }];

/** The outlined box: the caption's parent. */
const boxOf = (caption: string) => screen.getByText(caption).closest("label")!.parentElement as HTMLElement;
const input = (name: string) => screen.getByRole("combobox", { name });

// jsdom serialises colours as rgb(); compare against the hex constants.
const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe.each([
    ["FloatingCaptionSelect", (p: { error?: string }) => <FloatingCaptionSelect label="Campo" ariaLabel="Campo" options={OPTIONS} {...p} />],
    ["FloatingCaptionMultiSelect", (p: { error?: string }) => <FloatingCaptionMultiSelect label="Campo" ariaLabel="Campo" options={OPTIONS} {...p} />],
])("%s focus treatment", (_name, renderField) => {
    it("keyboard focus darkens the field's own border; no outline is drawn on the select", () => {
        render(renderField({}));
        fireEvent.keyDown(document.body, { key: "Tab" });
        fireEvent.focus(input("Campo"));
        expect(boxOf("Campo").style.borderColor).toBe(rgb(FIELD_FOCUS_BORDER.default));
        const select = boxOf("Campo").querySelector(".ant-select") as HTMLElement;
        expect(select.className).toMatch(/\bfc-(multi)?select\b/);
        expect(select.style.outline).toBe("");
    });

    it("pointer focus keeps the lighter hover border", () => {
        render(renderField({}));
        fireEvent.mouseDown(document.body);
        fireEvent.focus(input("Campo"));
        expect(boxOf("Campo").style.borderColor).not.toBe(rgb(FIELD_FOCUS_BORDER.default));
    });

    it("a key pressed after a pointer focus shows the keyboard indicator; blur clears it", () => {
        render(renderField({}));
        fireEvent.mouseDown(document.body);
        fireEvent.focus(input("Campo"));
        fireEvent.keyDown(input("Campo"), { key: "ArrowDown" });
        expect(boxOf("Campo").style.borderColor).toBe(rgb(FIELD_FOCUS_BORDER.default));
        fireEvent.blur(input("Campo"));
        expect(boxOf("Campo").style.borderColor).not.toBe(rgb(FIELD_FOCUS_BORDER.default));
    });

    it("an error keeps its red treatment, in a darker red on keyboard focus", () => {
        render(renderField({ error: "Requerido" }));
        expect(boxOf("Campo").style.borderColor).toBe(rgb("#e5484d"));
        fireEvent.keyDown(document.body, { key: "Tab" });
        fireEvent.focus(input("Campo"));
        expect(boxOf("Campo").style.borderColor).toBe(rgb(FIELD_FOCUS_BORDER.error));
    });
});

describe("caption and popup", () => {
    it("a floated caption is centred on the border's midline in both wrappers; resting, on the field's centre", () => {
        expect(captionStyle("default", true)).toMatchObject({ top: -1, transform: "translateY(-50%) scale(0.85)" });
        expect(captionStyle("default", false)).toMatchObject({ top: 26, transform: "translateY(-50%)" });
    });

    it("the shared popup class joins a catalog's own popup class instead of replacing it", () => {
        const catalog = catalogTypeSelectProps([]);
        expect(popupClassNames(catalog.classNames).popup.root).toBe("fc-select-popup ct-popup");
        expect(popupClassNames(undefined).popup.root).toBe("fc-select-popup");
    });
});
