import { afterEach, describe, expect, it, vi } from "vitest";
import { getLabUsers, type LabUser } from "../../services/collaboration_service";

const user = (id: number): LabUser => ({
    id: String(id), name: `Usuario ${String(id).padStart(3, "0")}`,
    username: `usuario${id}`, email: `user${id}@example.invalid`,
});
const page = (users: LabUser[], next_after: string | null) => new Response(
    JSON.stringify({ users, next_after }), { status: 200 }
);

afterEach(() => vi.unstubAllGlobals());

describe("getLabUsers", () => {
    it("loads every page, including candidates after the first 100", async () => {
        const first = Array.from({ length: 100 }, (_, i) => user(i + 1));
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(page(first, "100"))
            .mockResolvedValueOnce(page([user(101)], null));
        vi.stubGlobal("fetch", fetchMock);
        const users = await getLabUsers();
        expect(users).toHaveLength(101);
        expect(users.some(u => u.username === "usuario101")).toBe(true);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/users/assignable?limit=100");
        expect(String(fetchMock.mock.calls[1][0])).toContain("after=100");
    });

    it("includes more than ten users without needing an extra page", async () => {
        const fetchMock = vi.fn().mockResolvedValue(page(
            Array.from({ length: 11 }, (_, i) => user(i + 1)), null
        ));
        vi.stubGlobal("fetch", fetchMock);
        expect(await getLabUsers()).toHaveLength(11);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not return a partial list if a later page fails", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(page([user(1)], "1"))
            .mockResolvedValueOnce(new Response("", { status: 503 })));
        await expect(getLabUsers()).rejects.toThrow("503");
    });

    it("deduplicates users across pages", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(page([user(1)], "1"))
            .mockResolvedValueOnce(page([user(1), user(2)], null)));
        expect(await getLabUsers()).toHaveLength(2);
    });

    it("rejects a page that does not advance the cursor", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(page([user(1)], "1"))
            .mockResolvedValueOnce(page([user(1)], "1")));
        await expect(getLabUsers()).rejects.toThrow("No se pudo completar");
    });

    it("handles an empty laboratory", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([], null)));
        expect(await getLabUsers()).toEqual([]);
    });
});
