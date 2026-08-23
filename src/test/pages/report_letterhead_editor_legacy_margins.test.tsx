/**
 * Pre-Phase-5 remediation: Legacy letterhead margin bug (final semantics).
 *
 * First-level bug (fixed by the first remediation pass): `LegacyLetterheadAdapter`
 * pins `header.offset_mm`/`footer.offset_mm` to an explicit `0.0` (not
 * `null`), which shadowed `margins_cm.top`/`.bottom` forever for a
 * Legacy-imported letterhead — editing the margin had NO effect at all.
 * `updateMargin()` in `report_letterhead_editor.tsx` now clears that
 * shadowing field on edit, restoring the fallback.
 *
 * Second-level bug: the renderer reported the margin's effect only through
 * `bodyTop`, which conflated two different things — where the page margin
 * is, and where body content may start. A pass that set
 * `bodyTop = marginTop` unconditionally made `0.5cm` place report content
 * at `5mm`, on top of the `28mm` header band.
 *
 * FINAL model (see page_layout.ts and legacy-margin-contract.md), which
 * these tests assert: the page margin is the literal page-edge inset — for
 * the vertical axis, proven by where the header/footer BAND sits, since the
 * band is the topmost/bottommost occupied element — and the body safe area
 * is `max(page margin, band's far edge + content gap)`. So a `0.5cm` top
 * margin means `headerTop = 5mm` (literal) AND `bodyTop = 33mm` (clear of
 * the 28mm Legacy band). Asserting `bodyTop === 5mm` with a header present
 * is what this remediation corrects.
 *
 * `LEGACY_PARITY_PRESENTATION` (src/test/fixtures/reports/legacy_v2_parity.ts)
 * is a byte-for-byte TypeScript copy of what
 * `celuma-backend/app/services/legacy_letterhead_adapter.py` emits and what
 * `POST /report-letterheads/import` persists verbatim — i.e. exactly the
 * `ReportLetterheadVersion.configuration` an imported Legacy letterhead
 * carries. Using it here (instead of a hand-rolled fixture) is what makes
 * these tests reproduce the real bug rather than a lookalike.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportLetterheadEditor from "../../pages/report_letterhead_editor";
import * as letterheadService from "../../services/report_letterhead_service";
import { useUserProfile } from "../../hooks/use_user_profile";
import { LEGACY_PARITY_PRESENTATION } from "../fixtures/reports/legacy_v2_parity";
import type { ReportPresentationSnapshotV2 } from "../../components/report/versioned/versioned_report_types";

vi.mock("../../hooks/use_user_profile");
const mockedUseUserProfile = vi.mocked(useUserProfile);

function withPermission(canManage: boolean) {
    mockedUseUserProfile.mockReturnValue({
        profile: null,
        loading: false,
        authStatus: "authenticated",
        sessionExpired: false,
        error: null,
        canManageUsers: false,
        canManageBranches: false,
        canManageCatalog: false,
        canManageTenant: false,
        hasPermission: () => canManage,
        hasRole: () => false,
    } as unknown as ReturnType<typeof useUserProfile>);
}

function mockLetterhead() {
    vi.spyOn(letterheadService, "getReportLetterhead").mockResolvedValue({
        id: "lh1",
        tenant_id: "tenant-1",
        name: "Membrete legado (embajador)",
        is_default: false,
        is_active: true,
        created_at: "2026-01-01",
    });
}

function mockActiveVersion(configuration: ReportPresentationSnapshotV2) {
    vi.spyOn(letterheadService, "getActiveReportLetterheadVersion").mockResolvedValue({
        id: "v1",
        tenant_id: "tenant-1",
        report_letterhead_id: "lh1",
        version_number: 1,
        schema_version: 2,
        status: "ACTIVE",
        created_by: null,
        published_at: "2026-01-01",
        activated_at: "2026-01-01",
        archived_at: null,
        configuration,
        resolved_resources: null,
    });
}

function renderPage(letterheadId = "11111111-1111-1111-1111-111111111111") {
    return render(
        <MemoryRouter initialEntries={[`/config/report-letterheads/${letterheadId}/versions/new`]}>
            <Routes>
                <Route
                    path="/config/report-letterheads/:letterheadId/versions/new"
                    element={<ReportLetterheadEditor embedded />}
                />
            </Routes>
        </MemoryRouter>
    );
}

/** The single rendered preview page — same DOM `VersionedReportRendererV2`
 * produces for a real report preview, PDF render, and this editor's
 * preview alike (all three share the component). */
function previewPage(): HTMLElement | null {
    return document.querySelector('div[style*="8.5in"]');
}
function headerEl(): HTMLElement | undefined {
    return previewPage()?.children[0] as HTMLElement | undefined;
}
function bodyEl(): HTMLElement | undefined {
    return previewPage()?.children[1] as HTMLElement | undefined;
}
function footerEl(): HTMLElement | undefined {
    return previewPage()?.children[2] as HTMLElement | undefined;
}
/** [Superior, Derecho, Inferior, Izquierdo] — the grid order rendered by
 * MARGIN_LABELS in report_letterhead_editor.tsx. */
function marginInputs(): HTMLInputElement[] {
    return screen.getAllByRole("spinbutton") as HTMLInputElement[];
}

async function setMargin(index: number, value: string) {
    const input = marginInputs()[index];
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    await Promise.resolve();
}

async function saveNormalMode() {
    await userEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
    await userEvent.click(screen.getByRole("button", { name: /^Guardar$/i }));
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

describe("ReportLetterheadEditor — imported Legacy letterhead, margin bug reproduction", () => {
    it("as imported: body sits exactly where LegacyReportRendererV1 places it (28mm/20mm), unedited", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());

        await waitFor(() => {
            expect(headerEl()?.style.top).toBe("0mm");
            expect(bodyEl()?.style.top).toBe("28mm");
            expect(bodyEl()?.style.bottom).toBe("20mm");
        });
    });

    it("reproduction: editing the TOP margin visibly moves the body in the live preview", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());
        await waitFor(() => expect(bodyEl()?.style.top).toBe("28mm"));

        await setMargin(0, "4.0"); // Superior (top)

        await waitFor(() => expect(bodyEl()?.style.top).not.toBe("28mm"));
    });

    it("reproduction: editing the BOTTOM margin visibly moves the body in the live preview", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());
        await waitFor(() => expect(bodyEl()?.style.bottom).toBe("20mm"));

        await setMargin(2, "4.0"); // Inferior (bottom)

        await waitFor(() => expect(bodyEl()?.style.bottom).not.toBe("20mm"));
    });

    it("extreme-difference: 0.5cm and 4cm top margins produce clearly different page geometry", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());

        await setMargin(0, "0.5");
        await waitFor(() => {
            // PAGE MARGIN (literal): the header band — the topmost occupied
            // element — sits exactly 5mm from the physical page edge.
            expect(headerEl()?.style.top).toBe("5mm");
            // BODY SAFE AREA: below the 28mm Legacy header band (gap 0).
            expect(bodyEl()?.style.top).toBe("33mm");
        });

        await setMargin(0, "4.0");
        await waitFor(() => {
            expect(headerEl()?.style.top).toBe("40mm");
            expect(bodyEl()?.style.top).toBe("68mm");
        });

        // 3.5cm = 35mm between the two configured values, and BOTH
        // boundaries move by exactly that — the page margin (5 -> 40) and
        // the body's safe top (33 -> 68). Neither is absorbed; neither
        // drifts by a Legacy band constant.
        expect(40 - 5).toBe(35);
        expect(68 - 33).toBe(35);
    });

    it("asymmetric margins: top/right/bottom/left are each independently respected in the preview", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());

        await setMargin(0, "0.5"); // top
        await setMargin(1, "1.0"); // right
        await setMargin(2, "4.0"); // bottom
        await setMargin(3, "2.0"); // left

        await waitFor(() => {
            // PAGE MARGINS stay literal on all four sides: vertically proven
            // by each band's own page-edge inset, horizontally by the body
            // itself (this model has no side bands).
            expect(headerEl()?.style.top).toBe("5mm");
            expect(footerEl()?.style.bottom).toBe("40mm");
            expect(bodyEl()?.style.right).toBe("10mm");
            expect(bodyEl()?.style.left).toBe("20mm");
            // BODY SAFE AREA clears both Legacy bands (28mm/20mm, gaps 0).
            expect(bodyEl()?.style.top).toBe("33mm");
            expect(bodyEl()?.style.bottom).toBe("60mm");
        });
    });

    it("persists the edited top margin and clears the imported header offset pin on save", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);
        const saveSpy = vi
            .spyOn(letterheadService, "saveCurrentReportLetterheadVersion")
            .mockResolvedValue({
                id: "v2",
                tenant_id: "tenant-1",
                report_letterhead_id: "lh1",
                version_number: 2,
                schema_version: 2,
                status: "ACTIVE",
                created_by: null,
                published_at: "2026-01-01",
                activated_at: "2026-01-01",
                archived_at: null,
                configuration: LEGACY_PARITY_PRESENTATION,
            });

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());

        await setMargin(0, "4.0"); // top
        await saveNormalMode();

        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        const saved = saveSpy.mock.calls[0][1].configuration;
        expect(saved.paper.margins_cm.top).toBe(4.0);
        expect(saved.header.offset_mm).toBeNull();
        // Untouched sibling fields survive exactly as imported.
        expect(saved.footer.offset_mm).toBe(0);
        expect(saved.paper.margins_cm.bottom).toBe(2.0);
    });

    it("persists the edited bottom margin and clears the imported footer offset pin on save", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);
        const saveSpy = vi
            .spyOn(letterheadService, "saveCurrentReportLetterheadVersion")
            .mockResolvedValue({
                id: "v2",
                tenant_id: "tenant-1",
                report_letterhead_id: "lh1",
                version_number: 2,
                schema_version: 2,
                status: "ACTIVE",
                created_by: null,
                published_at: "2026-01-01",
                activated_at: "2026-01-01",
                archived_at: null,
                configuration: LEGACY_PARITY_PRESENTATION,
            });

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());

        await setMargin(2, "4.0"); // bottom
        await saveNormalMode();

        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        const saved = saveSpy.mock.calls[0][1].configuration;
        expect(saved.paper.margins_cm.bottom).toBe(4.0);
        expect(saved.footer.offset_mm).toBeNull();
        expect(saved.header.offset_mm).toBe(0);
    });

    it("re-saving WITHOUT touching margins leaves the imported offset pins untouched (no over-correction)", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);
        const saveSpy = vi
            .spyOn(letterheadService, "saveCurrentReportLetterheadVersion")
            .mockResolvedValue({
                id: "v2",
                tenant_id: "tenant-1",
                report_letterhead_id: "lh1",
                version_number: 2,
                schema_version: 2,
                status: "ACTIVE",
                created_by: null,
                published_at: "2026-01-01",
                activated_at: "2026-01-01",
                archived_at: null,
                configuration: LEGACY_PARITY_PRESENTATION,
            });

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());
        await saveNormalMode();

        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        const saved = saveSpy.mock.calls[0][1].configuration;
        expect(saved.header.offset_mm).toBe(0);
        expect(saved.footer.offset_mm).toBe(0);
        expect(saved.paper.margins_cm).toEqual(LEGACY_PARITY_PRESENTATION.paper.margins_cm);
    });

    it("left/right margins already worked before this fix and keep working (no regression)", async () => {
        withPermission(true);
        mockLetterhead();
        mockActiveVersion(LEGACY_PARITY_PRESENTATION);

        renderPage();
        await waitFor(() => expect(screen.getByText(/Editar membrete/i)).toBeTruthy());
        await waitFor(() => expect(bodyEl()?.style.left).toBe("18mm"));

        await setMargin(1, "4.0"); // right

        await waitFor(() => expect(bodyEl()?.style.right).toBe("40mm"));
    });
});
