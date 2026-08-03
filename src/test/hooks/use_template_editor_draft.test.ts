import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTemplateEditorDraft } from "../../hooks/use_template_editor_draft";

// Cell 1.3 Phase 2, Block D, History D11/D14.

const TENANT_ID = "tenant-1";
const TEMPLATE_ID = "template-1";
const KEY = `celuma:report_template_draft:${TENANT_ID}:${TEMPLATE_ID}:new`;

beforeEach(() => {
    sessionStorage.clear();
});

afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
});

describe("useTemplateEditorDraft — persistence", () => {
    it("loadDraft returns null when nothing is stored", () => {
        const { result } = renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 1 }, dirty: false })
        );
        expect(result.current.loadDraft()).toBeNull();
    });

    it("persists the value to sessionStorage under the scoped key while dirty", () => {
        renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 42 }, dirty: true })
        );
        expect(JSON.parse(sessionStorage.getItem(KEY) ?? "null")).toEqual({ a: 42 });
    });

    it("does not persist anything while not dirty", () => {
        renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 42 }, dirty: false })
        );
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it("loadDraft reads back a previously persisted value", () => {
        sessionStorage.setItem(KEY, JSON.stringify({ a: 7 }));
        const { result } = renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 1 }, dirty: false })
        );
        expect(result.current.loadDraft()).toEqual({ a: 7 });
    });

    it("scopes the key by baseline — a different baseline does not see the same draft", () => {
        sessionStorage.setItem(KEY, JSON.stringify({ a: 7 }));
        const { result } = renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "some-version-id", value: { a: 1 }, dirty: false })
        );
        expect(result.current.loadDraft()).toBeNull();
    });

    it("clearDraft removes the stored entry", () => {
        sessionStorage.setItem(KEY, JSON.stringify({ a: 7 }));
        const { result } = renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 1 }, dirty: false })
        );
        result.current.clearDraft();
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });
});

describe("useTemplateEditorDraft — navigation guard", () => {
    it("confirmNavigateAway returns true without prompting when not dirty", () => {
        const confirmSpy = vi.spyOn(window, "confirm");
        const { result } = renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 1 }, dirty: false })
        );
        expect(result.current.confirmNavigateAway()).toBe(true);
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("confirmNavigateAway prompts and returns the user's choice when dirty", () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
        const { result } = renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 1 }, dirty: true })
        );
        expect(result.current.confirmNavigateAway()).toBe(false);
        expect(confirmSpy).toHaveBeenCalledTimes(1);
    });

    it("registers a beforeunload handler while dirty", () => {
        const addSpy = vi.spyOn(window, "addEventListener");
        renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 1 }, dirty: true })
        );
        expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    });

    it("does not register a beforeunload handler while not dirty", () => {
        const addSpy = vi.spyOn(window, "addEventListener");
        renderHook(() =>
            useTemplateEditorDraft({ tenantId: TENANT_ID, templateId: TEMPLATE_ID, baseline: "new", value: { a: 1 }, dirty: false })
        );
        expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));
    });
});
