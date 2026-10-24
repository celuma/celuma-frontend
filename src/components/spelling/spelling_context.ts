import { createContext, useContext, useSyncExternalStore } from "react";
import type { SpellingEngineStatus } from "../../lib/spelling/client";
import type { SpellingMark, SpellingSession } from "../../lib/spelling/session";

/**
 * Céluma 1.4 (#29) — shared contract between the report editor's spelling
 * provider and the controls that opt into assistance.
 *
 * A control only takes part when it is given `spelling` options AND sits
 * under an enabled `SpellingProvider`; shared controls elsewhere in the app are
 * untouched. Marks, suggestions and ignore decisions are editor-only state:
 * nothing here is written into a control's value, Quill's DOM or report JSON.
 */
export interface SpellingFieldOptions {
    /** Unique within the editor, e.g. `title`, `section:diagnostico`, `caption:fig-3`. */
    fieldId: string;
    /** Spanish name shown in the suggestion dialog, e.g. "Nombre del reporte". */
    label: string;
    /** Fields reviewed together from one summary (e.g. every cell of a table). Defaults to `fieldId`. */
    groupId?: string;
    /** Order within the group (e.g. row-major cell index). */
    order?: number;
}

/**
 * - `applied`: the field holds the replacement and the browser/editor can undo it.
 * - `stale`: the field changed since the check; nothing was done.
 * - `refused`: the field is not editable or the replacement breaks its limits; nothing was done.
 * - `unsupported`: the browser could not apply it as an undoable edit; value and selection were
 *   left exactly as they were (a non-undoable change is never made).
 * - `mismatch`: the browser's own edit produced different text and could not be taken back;
 *   the field shows that native, undoable edit (never reported as applied).
 */
export type ApplyOutcome = "applied" | "stale" | "refused" | "unsupported" | "mismatch";

/** What the provider needs from a field to show and apply a suggestion. */
export interface SpellingFieldController {
    readonly fieldId: string;
    readonly groupId: string;
    readonly order: number;
    readonly label: string;
    isEditable(): boolean;
    getAnchorRect(mark: SpellingMark): DOMRect | null;
    /** Scrolls the field (and the page) so the word is visible. */
    reveal(mark: SpellingMark): void;
    /** Why `replacement` cannot be applied here (field limits), or null. */
    refusal(mark: SpellingMark, replacement: string): string | null;
    /** Replaces exactly this occurrence through the control's normal edit path. */
    apply(mark: SpellingMark, replacement: string): ApplyOutcome;
    /** Returns focus to the field, keeping its own caret/selection. */
    focus(): void;
    /** Whether a DOM node belongs to the field. */
    contains(node: Node): boolean;
}

export type PopoverMode = "active" | "passive";
export type PopoverOrigin = "field" | "summary";

interface RegistryEntry {
    controller: SpellingFieldController;
    marks: SpellingMark[];
    partial: boolean;
}

export interface GroupEntry {
    controller: SpellingFieldController;
    mark: SpellingMark;
}

/** Fields currently mounted under the provider and the marks each one shows. */
export class SpellingRegistry {
    private readonly entries = new Map<string, RegistryEntry>();
    private readonly listeners = new Set<() => void>();
    private version = 0;

    private bump(): void {
        this.version += 1;
        this.listeners.forEach((l) => l());
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getVersion = (): number => this.version;

    register(controller: SpellingFieldController): () => void {
        this.entries.set(controller.fieldId, { controller, marks: [], partial: false });
        this.bump();
        return () => {
            if (this.entries.get(controller.fieldId)?.controller !== controller) return;
            this.entries.delete(controller.fieldId);
            this.bump();
        };
    }

    update(fieldId: string, marks: SpellingMark[], partial: boolean): void {
        const entry = this.entries.get(fieldId);
        if (!entry || (entry.marks === marks && entry.partial === partial)) return;
        entry.marks = marks;
        entry.partial = partial;
        this.bump();
    }

    controller(fieldId: string): SpellingFieldController | null {
        return this.entries.get(fieldId)?.controller ?? null;
    }

    marks(fieldId: string): SpellingMark[] {
        return this.entries.get(fieldId)?.marks ?? [];
    }

    group(groupId: string): GroupEntry[] {
        return [...this.entries.values()]
            .filter((e) => e.controller.groupId === groupId)
            .sort((a, b) => a.controller.order - b.controller.order)
            .flatMap((e) => e.marks.map((mark) => ({ controller: e.controller, mark })));
    }

    groupPartial(groupId: string): boolean {
        return [...this.entries.values()].some((e) => e.controller.groupId === groupId && e.partial);
    }
}

export interface SpellingApi {
    /** Report-level gate: content is editable by this user (lifecycle AND `reports:edit`). */
    enabled: boolean;
    session: SpellingSession | null;
    status: SpellingEngineStatus;
    registry: SpellingRegistry;
    retry(): void;
    open(fieldId: string, mark: SpellingMark, mode: PopoverMode, origin?: PopoverOrigin): void;
    openGroup(groupId: string): void;
    close(restoreFocus?: boolean): void;
    isOpenFor(fieldId: string): boolean;
    openMode(fieldId: string): PopoverMode | null;
}

export const SpellingContext = createContext<SpellingApi | null>(null);

export function useSpellingApi(): SpellingApi | null {
    return useContext(SpellingContext);
}

/** Re-renders when any field's marks change; returns the group's marks in review order. */
export function useSpellingGroup(groupId: string): { entries: GroupEntry[]; partial: boolean } {
    const api = useSpellingApi();
    const registry = api?.registry;
    useSyncExternalStore(registry?.subscribe ?? noopSubscribe, registry?.getVersion ?? zero);
    if (!registry) return { entries: [], partial: false };
    return { entries: registry.group(groupId), partial: registry.groupPartial(groupId) };
}

const noopSubscribe = () => () => {};
const zero = () => 0;

/** Wavy underline colour for spelling marks: distinct from validation borders and links. */
export const SPELLING_MARK_COLOR = "#d9483b";

/** Spanish count phrase used by summaries and screen-reader descriptions. */
export function indicationCountText(count: number): string {
    return count === 1 ? "1 posible error ortográfico" : `${count} posibles errores ortográficos`;
}
