import { describe, expect, it } from "vitest";
import { parseListView, serializeListView, type ListViewSpec } from "../../lib/list_view_state";

const SPEC: ListViewSpec = {
    sortFields: ["order_code", "patient", "status"],
    defaultSort: { field: "order_code", order: "asc" },
    filterNames: ["status", "patient_id", "has_report"],
};

describe("list view in the URL (Céluma 1.5, #66)", () => {
    it("round-trips search, filters, sort and page", () => {
        const view = { q: "pérez 276262", page: 3, sort: { field: "patient", order: "desc" as const }, filters: { status: ["RECEIVED", "PROCESSING"], patient_id: ["p1"] } };
        const qs = serializeListView(view, SPEC);
        expect(parseListView(`?${qs}`, SPEC)).toEqual(view);
    });

    it("keeps an untouched list on a bare URL", () => {
        expect(serializeListView({ q: "", page: 1, sort: SPEC.defaultSort, filters: {} }, SPEC)).toBe("");
        expect(parseListView("", SPEC)).toEqual({ q: "", page: 1, sort: SPEC.defaultSort, filters: {} });
    });

    it("reads the dashboard's comma-separated filters", () => {
        expect(parseListView("?status=RECEIVED,PROCESSING", SPEC).filters).toEqual({ status: ["RECEIVED", "PROCESSING"] });
    });

    it("ignores unknown parameters, sort fields and bad pages instead of sending them", () => {
        const view = parseListView("?sort=drop_table&order=desc&page=-4&evil=1&patient_id=p1", SPEC);
        expect(view).toEqual({ q: "", page: 1, sort: SPEC.defaultSort, filters: { patient_id: ["p1"] } });
    });

    it("distinguishes a cleared sort and an explicitly empty filter from the defaults", () => {
        const cleared = { q: "", page: 1, sort: null, filters: { status: [] } };
        const qs = serializeListView(cleared, SPEC);
        expect(qs).toBe("sort=none&status=");
        expect(parseListView(`?${qs}`, SPEC)).toEqual(cleared);
    });
});
