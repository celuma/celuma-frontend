import { describe, expect, it } from "vitest";
import { columnQueryToList, listQueryParams } from "../../services/list_service";

// Céluma 1.4 (#6): how a table interaction becomes an API request.

describe("listQueryParams", () => {
    it("sends page, size, trimmed search, sort and repeated filters", () => {
        const params = listQueryParams({
            page: 2,
            pageSize: 10,
            q: "  CU276262 ",
            sort: { field: "patient", order: "desc" },
            filters: { state: ["RECEIVED", "READY"], label_id: ["l1"] },
        });
        expect(params.toString()).toBe(
            "page=2&page_size=10&q=CU276262&sort=patient&order=desc&state=RECEIVED&state=READY&label_id=l1",
        );
    });

    it("omits an empty search and a missing sort", () => {
        expect(listQueryParams({ page: 1, pageSize: 20, q: "  ", sort: null, filters: {} }).toString())
            .toBe("page=1&page_size=20");
    });
});

describe("columnQueryToList", () => {
    const map = {
        sort: { order: "order_code", patient: "patient" },
        filters: { patient: "patient_id", has_report: "has_report" },
        booleanFilters: ["has_report"],
    };

    it("maps column keys to API names and drops unknown columns", () => {
        expect(columnQueryToList(
            { sort: { field: "order", order: "desc" }, filters: { patient: ["p1"], labels: ["x"] } },
            map,
        )).toEqual({ sort: { field: "order_code", order: "desc" }, filters: { patient_id: ["p1"] } });
    });

    it("sends a yes/no filter only when exactly one side is selected", () => {
        expect(columnQueryToList({ sort: null, filters: { has_report: ["true"] } }, map).filters)
            .toEqual({ has_report: ["true"] });
        expect(columnQueryToList({ sort: null, filters: { has_report: ["true", "false"] } }, map).filters)
            .toEqual({});
    });

    it("clears the sort when the column cannot be sorted by the API", () => {
        expect(columnQueryToList({ sort: { field: "labels", order: "asc" }, filters: {} }, map).sort).toBeNull();
    });
});
