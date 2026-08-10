/**
 * Céluma 1.3, pre-release remediation — the sample-status rail picker.
 *
 * This is the regression test for the bug found in real manual validation:
 * the "Estado" dropdown appeared interactive but did not let the user change
 * the sample's status. Root cause (see
 * docs/celuma-1.3/pre-release-functional-remediation/current-state-and-root-cause-report.md
 * §3): the page renders its whole sidebar twice for responsive layout
 * (desktop + mobile, both always mounted), and the old inline dropdown
 * shared one page-level `open` boolean across both mounted copies, so
 * opening one always tried to open both at once. `SampleStatusPicker` fixes
 * this by owning its `open` state locally, like `AssigneesSection`/
 * `LabelsSection` already do — the two tests at the bottom of this file
 * reproduce the exact duplicated-mount scenario and assert the two
 * instances no longer interfere with each other.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SampleStatusPicker from "../../components/collaboration/SampleStatusPicker";

describe("opening", () => {
    it("opens the popup on click and shows every allowed status", async () => {
        const user = userEvent.setup();
        render(<SampleStatusPicker state="RECEIVED" onChange={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Configurar" }));

        // Popup rows are `role="button"`; querying by role rather than text
        // avoids ambiguity with the current-state display, which repeats
        // "Recibida" as plain (non-button) text outside the popup.
        for (const label of ["Recibida", "En Proceso", "Lista", "Insuficiente", "Cancelada"]) {
            expect(await screen.findByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
        }
    });

    it("shows the current state's label outside the popup, unconditionally", () => {
        render(<SampleStatusPicker state="PROCESSING" onChange={vi.fn()} />);
        expect(screen.getByText("En Proceso")).toBeInTheDocument();
    });

    it("falls back to a neutral display for a state this build does not know", () => {
        render(<SampleStatusPicker state="SOME_FUTURE_STATE" onChange={vi.fn()} />);
        expect(screen.getByText("SOME_FUTURE_STATE")).toBeInTheDocument();
    });
});

describe("selecting a status", () => {
    it("calls onChange with the selected state", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<SampleStatusPicker state="RECEIVED" onChange={onChange} />);

        await user.click(screen.getByRole("button", { name: "Configurar" }));
        await user.click(await screen.findByText("En Proceso"));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("PROCESSING");
    });

    it("closes the popup after a selection", async () => {
        const user = userEvent.setup();
        render(<SampleStatusPicker state="RECEIVED" onChange={vi.fn()} />);

        const trigger = screen.getByRole("button", { name: "Configurar" });
        await user.click(trigger);
        expect(trigger).toHaveClass("ant-dropdown-open");

        await user.click(await screen.findByText("Lista"));

        // antd keeps the popup mounted for its exit animation rather than
        // unmounting it, so the assertion is on open state, not DOM
        // presence — the trigger's class is the source of truth `open`
        // controls.
        await waitFor(() => expect(trigger).not.toHaveClass("ant-dropdown-open"));
    });

    it("selecting the already-active status is a no-op: onChange is not called", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<SampleStatusPicker state="PROCESSING" onChange={onChange} />);

        await user.click(screen.getByRole("button", { name: "Configurar" }));
        // The popup row is `role="button"`, distinct from the current-state
        // display (a plain span) and from the trigger (name "Configurar"),
        // so this unambiguously targets the active row inside the popup.
        const activeRow = await screen.findByRole("button", { name: /En Proceso/ });
        await user.click(activeRow);

        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("the loading state", () => {
    it("disables the trigger while a mutation is in flight", () => {
        render(<SampleStatusPicker state="RECEIVED" onChange={vi.fn()} updating />);
        expect(screen.getByRole("button", { name: "Configurar" })).toBeDisabled();
    });

    it("does not disable the trigger when nothing is in flight", () => {
        render(<SampleStatusPicker state="RECEIVED" onChange={vi.fn()} updating={false} />);
        expect(screen.getByRole("button", { name: "Configurar" })).toBeEnabled();
    });
});

describe("inside a container with its own click handler", () => {
    it("still opens and commits a selection correctly", async () => {
        // Not a propagation-blocking guarantee: React portals bubble
        // through the *component* tree regardless of where the popup is
        // physically mounted in the DOM, so an ancestor's own onClick will
        // legitimately still observe these clicks — that is standard React
        // behavior, not a bug. What this asserts is the thing that actually
        // matters: the picker keeps working correctly when nested inside a
        // container that has its own click handler (e.g. a table row),
        // rather than the selection getting lost or misfiring.
        const user = userEvent.setup();
        const onChange = vi.fn();
        const ancestorClick = vi.fn();
        render(
            <div onClick={ancestorClick} data-testid="ancestor">
                <SampleStatusPicker state="RECEIVED" onChange={onChange} />
            </div>,
        );

        await user.click(screen.getByRole("button", { name: "Configurar" }));
        await user.click(await screen.findByText("Lista"));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("READY");
    });
});

describe("two responsive mounts of the same picker (the actual bug)", () => {
    it("opening one instance's popup does not open the other's", async () => {
        const user = userEvent.setup();
        render(
            <div>
                <div data-testid="mobile">
                    <SampleStatusPicker state="RECEIVED" onChange={vi.fn()} />
                </div>
                <div data-testid="desktop">
                    <SampleStatusPicker state="RECEIVED" onChange={vi.fn()} />
                </div>
            </div>,
        );

        const desktopTrigger = within(screen.getByTestId("desktop")).getByRole("button", { name: "Configurar" });
        await user.click(desktopTrigger);

        // "Insuficiente" (the DAMAGED row) appears only inside a popup — it
        // is never the current-state display for a RECEIVED sample. Exactly
        // one popup's worth of rows must exist: not zero (the popup failed
        // to render at all — the "nothing happens" symptom that was
        // reported) and not two (both mounts opened at once, the actual
        // root cause — a shared page-level `open` boolean toggling both
        // simultaneously-mounted `Dropdown` instances).
        expect(await screen.findAllByText("Insuficiente")).toHaveLength(1);
    });

    it("each mount has independent open state — selecting in one does not affect the other", async () => {
        const user = userEvent.setup();
        const onChangeMobile = vi.fn();
        const onChangeDesktop = vi.fn();
        render(
            <div>
                <div data-testid="mobile">
                    <SampleStatusPicker state="RECEIVED" onChange={onChangeMobile} />
                </div>
                <div data-testid="desktop">
                    <SampleStatusPicker state="RECEIVED" onChange={onChangeDesktop} />
                </div>
            </div>,
        );

        const desktopTrigger = within(screen.getByTestId("desktop")).getByRole("button", { name: "Configurar" });
        await user.click(desktopTrigger);
        // The popup renders through antd's default portal (document.body),
        // not inside the "desktop" container, so it is queried globally —
        // uniquely, because only one instance's popup is open.
        const option = await screen.findByRole("button", { name: /Lista/ });
        await user.click(option);

        expect(onChangeDesktop).toHaveBeenCalledWith("READY");
        expect(onChangeMobile).not.toHaveBeenCalled();

        // The mobile trigger's own open state (source of truth for antd's
        // `Dropdown`, independent of its animated popup's DOM lifecycle)
        // was never toggled — this is the actual regression: before the
        // fix, one shared `open` boolean meant this class would appear on
        // *both* triggers as soon as either was clicked.
        const mobileTrigger = within(screen.getByTestId("mobile")).getByRole("button", { name: "Configurar" });
        expect(mobileTrigger).not.toHaveClass("ant-dropdown-open");
    });
});
