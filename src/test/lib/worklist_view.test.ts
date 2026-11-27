/**
 * Céluma 1.5 (#85) — the worklist view: membership, legacy links, order and paging from one
 * collection. Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import { parseListView, serializeListView } from "../../lib/list_view_state";
import {
    WORKLIST_VIEW, compareWorklist, deriveWorklist, nextStepKey, normalizeWorklistView, taskLabel, withVista,
} from "../../lib/worklist_view";
import type { WorklistItem } from "../../services/worklist_service";

const row = (id: string, over: Partial<WorklistItem> = {}): WorklistItem => ({
    id, kind: "assignment", item_type: "lab_order", item_id: `o-${id}`, display_id: `CU-${id}`, item_status: "RECEIVED",
    entity_status: "RECEIVED", next_step: "work", waiting_on: null, actionable: true,
    assigned_at: "2026-11-20T10:00:00Z", patient_id: "p1", patient_name: "Paciente Sintético", patient_code: "PAC-1",
    order_code: `CU-${id}`, tags: [], link: `/orders/o-${id}`, ...over,
});
const view = (search: string) => normalizeWorklistView(parseListView(search, WORKLIST_VIEW));

describe("membership", () => {
    const items = [row("1"), row("2", { next_step: null, actionable: false, waiting_on: "review", entity_status: "REVIEW" }), row("3")];
    it("Pendientes is the default (bare URL) and holds only actionable rows", () => {
        const { view: v, legacy } = view("");
        expect(legacy).toBe(false);
        const d = deriveWorklist(items, v);
        expect(d.rows.map((r) => r.id)).toEqual(["3", "1"]);
        expect(d.counts).toEqual({ pendientes: 2, todas: 3 });
        expect(serializeListView(v, WORKLIST_VIEW)).toBe("");
    });
    it("Todas holds every row still in the worklist", () => {
        const d = deriveWorklist(items, view("?vista=todas").view);
        expect(d.rows.map((r) => r.id)).toEqual(["3", "2", "1"]);
    });
    it("rows from an older API (no actionable field) are never shown as pending", () => {
        const old = [row("9", { actionable: undefined, next_step: undefined })];
        expect(deriveWorklist(old, view("").view).rows).toEqual([]);
    });
    it("switching view keeps search and filters and restarts at page 1", () => {
        const v = withVista({ ...view("?q=cu&kind=review&page=3").view }, "todas");
        expect(v).toMatchObject({ q: "cu", page: 1, filters: { kind: ["review"], vista: ["todas"] } });
        expect(withVista(v, "pendientes").filters.vista).toBeUndefined();
    });
});

describe("pre-1.5 links", () => {
    it("an item_status filter (default or chosen — same syntax) opens Todas with that filter kept", () => {
        const { view: v, legacy } = view("?item_status=PROCESSING&item_status=RECEIVED&page=2");
        expect(legacy).toBe(true);
        expect(v.filters).toEqual({ item_status: ["PROCESSING", "RECEIVED"], vista: ["todas"] });
        expect(v.page).toBe(2);
        expect(serializeListView(v, WORKLIST_VIEW)).toBe("item_status=PROCESSING&item_status=RECEIVED&vista=todas&page=2");
        // the rows are exactly those the old filter matched, actionable or not
        const items = [row("1", { item_status: "PROCESSING" }), row("2", { item_status: "READY" }),
            row("3", { item_status: "RECEIVED", actionable: false, next_step: null })];
        expect(deriveWorklist(items, v).rows.map((r) => r.id).sort()).toEqual(["1", "3"]);
    });
    it("a cleared filter (item_status=) opens Todas unfiltered", () => {
        const { view: v, legacy } = view("?item_status=");
        expect(legacy).toBe(true);
        expect(v.filters).toEqual({ vista: ["todas"] });
    });
    it("comma lists (dashboard style) and column filters are kept", () => {
        const { view: v } = view("?item_status=PENDING,DRAFT&kind=review&patient=p1");
        expect(v.filters).toEqual({ item_status: ["PENDING", "DRAFT"], kind: ["review"], patient: ["p1"], vista: ["todas"] });
    });
    it("a link already in the 1.5 shape is not announced as legacy", () => {
        expect(view("?vista=todas&item_status=PENDING").legacy).toBe(false);
        expect(view("?kind=review").legacy).toBe(false);
    });
    it("sort=none (a cleared sort) shows the default order; unknown views fall back to Pendientes", () => {
        expect(view("?sort=none").view.sort).toEqual({ field: "assigned_at", order: "desc" });
        expect(view("?vista=otra").view.filters.vista).toBeUndefined();
    });
});

describe("order, count, range and page come from one collection", () => {
    it("identical timestamps are ordered by id, the same way every time", () => {
        const items = ["b", "d", "a", "c"].map((id) => row(id));
        const ids = [...items].sort(compareWorklist(null)).map((r) => r.id);
        expect(ids).toEqual(["d", "c", "b", "a"]);
        expect([...items].reverse().sort(compareWorklist(null)).map((r) => r.id)).toEqual(ids);
        expect([...items].sort(compareWorklist({ field: "assigned_at", order: "asc" })).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    });
    it("patient order is accent-insensitive with newest-then-id inside a name", () => {
        const items = [row("1", { patient_name: "Óscar Ejemplo" }), row("2", { patient_name: "Ana Ejemplo" }), row("3", { patient_name: "oscar ejemplo" })];
        expect([...items].sort(compareWorklist({ field: "patient", order: "asc" })).map((r) => r.id)).toEqual(["2", "3", "1"]);
    });
    it.each([
        [20, 1, { from: 1, to: 20, page: 1, lastPage: 1 }],
        [21, 1, { from: 1, to: 20, page: 1, lastPage: 2 }],
        [21, 2, { from: 21, to: 21, page: 2, lastPage: 2 }],
        [20, 2, { from: 1, to: 20, page: 1, lastPage: 1 }], // the last row of page 2 left: clamp
        [0, 3, { from: 0, to: 0, page: 1, lastPage: 1 }],
    ])("%i rows, page %i", (n, page, expected) => {
        const items = Array.from({ length: n }, (_, i) => row(String(i).padStart(3, "0")));
        const d = deriveWorklist(items, { ...view("").view, page });
        expect({ from: d.from, to: d.to, page: d.page, lastPage: d.lastPage }).toEqual(expected);
        expect(d.pageRows.length).toBe(d.to - d.from + (n ? 1 : 0));
        expect(d.rows.length).toBe(n);
    });
    it("filters and search narrow the same collection the count and pages use", () => {
        const items = [
            row("1", { kind: "review", item_type: "report", entity_status: "IN_REVIEW", next_step: "review" }),
            row("2", { patient_name: "Lorena Muñóz" }),
            row("3", { item_type: "sample", entity_status: "PROCESSING" }),
        ];
        const d = deriveWorklist(items, view("?kind=review").view);
        expect(d.rows.map((r) => r.id)).toEqual(["1"]);
        expect(d.filtered).toBe(true);
        expect(deriveWorklist(items, view("?q=munoz").view).rows.map((r) => r.id)).toEqual(["2"]);
        expect(deriveWorklist(items, view("?estado=PROCESSING").view).rows.map((r) => r.id)).toEqual(["3"]);
        expect(deriveWorklist(items, view("").view).filtered).toBe(false);
    });
});

describe("labels keep task, state and next step apart", () => {
    it("names the task and the step", () => {
        expect(taskLabel(row("1", { kind: "review", item_type: "report" }))).toBe("Revisión de reporte");
        expect(taskLabel(row("1"))).toBe("Asignación de orden");
        expect(nextStepKey(row("1", { next_step: "sign" }))).toBe("sign");
        expect(nextStepKey(row("1", { item_type: "report", next_step: "work" }))).toBe("write");
        expect(nextStepKey(row("1", { next_step: null, waiting_on: "signature" }))).toBe("waiting_signature");
        expect(nextStepKey(row("1", { next_step: null, waiting_on: null }))).toBe("none");
    });
});
