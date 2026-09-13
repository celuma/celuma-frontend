/**
 * Céluma 1.3.1 manual-validation remediation — R6, reviewer username display.
 *
 * The reviewer-assignment picker renders a `@handle` under each person's
 * display name and was showing something derived from the NAME:
 *
 *     Dr. María López
 *     @María López          instead of      @mlopez
 *
 * **Root cause, in two halves.** `GET /api/v1/users/reviewers` exposed no
 * `username` (fixed in `app/schemas/user.py`, covered by
 * `tests/http/test_r6_reviewer_username.py`), so `getReviewerUsers()`
 * hardcoded `username: null` and `UserPickerDropdown` fell through to the
 * app's existing fallback — the local part of the email. For a reviewer whose
 * address is built from their own name, which is the shape the live data has,
 * that fallback renders as the name.
 *
 * **Why the existing suite allowed it through.** Nothing asserted the handle
 * at all, and the mapper's `username: null` looked deliberate rather than like
 * a missing field.
 *
 * **Scope.** The email fallback is KEPT: `app_user.username` is nullable and
 * this is the convention the same component already applies to
 * `getLabUsers()`. What changed is that a real username is no longer thrown
 * away on the way through.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UserPickerDropdown from "../../components/collaboration/UserPickerDropdown";
import { getReviewerUsers } from "../../services/collaboration_service";
import type { LabUser } from "../../services/collaboration_service";

function stubReviewersEndpoint(reviewers: unknown[]) {
    const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ reviewers }),
        text: async () => JSON.stringify({ reviewers }),
    } as unknown as Response));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderPicker(users: LabUser[]) {
    return render(
        <UserPickerDropdown
            users={users}
            selectedIds={new Set()}
            searchTerm=""
            onSearchChange={() => {}}
            onToggle={() => {}}
            onClear={() => {}}
            onApply={async () => {}}
            onCancel={() => {}}
            loading={false}
            clearLabel="Limpiar revisores"
        />
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("R6 — getReviewerUsers carries the username through", () => {
    it("maps the API's username instead of discarding it", async () => {
        stubReviewersEndpoint([
            {
                id: "u1",
                full_name: "Dra. María López",
                email: "marialopez@lab.test",
                username: "mlopez",
                avatar_url: null,
            },
        ]);

        const [user] = await getReviewerUsers();

        expect(user.name).toBe("Dra. María López");
        expect(user.username).toBe("mlopez");
        // Specifically NOT the previous `username: null`, which is what sent
        // the picker to its email fallback.
        expect(user.username).not.toBeNull();
    });

    it("keeps null for a reviewer who genuinely has no username", async () => {
        // `app_user.username` is nullable; the API must be able to say so and
        // the mapper must not invent one.
        stubReviewersEndpoint([
            {
                id: "u2",
                full_name: "Dr. Sin Usuario",
                email: "sinusuario@lab.test",
                avatar_url: null,
            },
        ]);

        const [user] = await getReviewerUsers();
        expect(user.username).toBeNull();
    });
});

describe("R6 — the picker renders @username, never @name", () => {
    it("shows the display name and the username as the handle", () => {
        renderPicker([
            {
                id: "u1",
                name: "Dra. María López",
                email: "marialopez@lab.test",
                username: "mlopez",
                avatar_url: null,
            },
        ]);

        expect(screen.getByText("Dra. María López")).toBeTruthy();
        expect(screen.getByText("@mlopez")).toBeTruthy();
        expect(screen.queryByText("@Dra. María López")).toBeNull();
        // The email-derived fallback must not be what is shown when a real
        // username exists — that fallback is exactly what read as the name.
        expect(screen.queryByText("@marialopez")).toBeNull();
    });

    it("never leaks spaces or accents from the display name into the handle", () => {
        renderPicker([
            {
                id: "u1",
                name: "Dra. Arisbeth Villanueva Pérez",
                email: "a.villanueva@lab.test",
                username: "avillanueva",
                avatar_url: null,
            },
        ]);

        const handle = screen.getByText(/^@/).textContent ?? "";
        expect(handle).toBe("@avillanueva");
        expect(handle).not.toContain(" ");
        expect(handle).not.toContain("é");
    });

    it("keeps two identically named reviewers distinguishable", () => {
        renderPicker([
            {
                id: "u1", name: "Dr. Juan García",
                email: "jgarcia1@lab.test", username: "jgarcia", avatar_url: null,
            },
            {
                id: "u2", name: "Dr. Juan García",
                email: "jgarcia2@lab.test", username: "jgarcia2", avatar_url: null,
            },
        ]);

        expect(screen.getAllByText("Dr. Juan García")).toHaveLength(2);
        expect(screen.getByText("@jgarcia")).toBeTruthy();
        expect(screen.getByText("@jgarcia2")).toBeTruthy();
    });

    it("falls back to the email's local part only when there is no username", () => {
        // The app's existing convention, unchanged — documented here so the
        // fallback is a decision rather than an accident.
        renderPicker([
            {
                id: "u3", name: "Dr. Sin Usuario",
                email: "sinusuario@lab.test", username: null, avatar_url: null,
            },
        ]);

        expect(screen.getByText("@sinusuario")).toBeTruthy();
    });
});
