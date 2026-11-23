import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RegistrationNotice from "../../components/order/registration_notice";
import { registrationNotice } from "../../lib/registration_notice";

describe("registration notice on the record page (Céluma 1.5, #67)", () => {
    it("is null for an ordinary first registration", () => {
        expect(registrationNotice("La orden", "HIS011126", { replayed: false, recovered: null }, "Muestras registradas: BX011126.")).toBeNull();
    });

    it("says on the order that later corrections were not applied, until dismissed", () => {
        const notice = registrationNotice("La orden", "HIS011126", { replayed: true, recovered: "earlier" }, "Muestras registradas: BX011126.")!;
        render(
            <MemoryRouter initialEntries={[{ pathname: "/orders/o1", state: { registrationNotice: notice } }]}>
                <RegistrationNotice />
            </MemoryRouter>,
        );
        const shown = screen.getByTestId("registration-notice");
        expect(shown.textContent).toContain("La orden HIS011126 ya se había registrado en un intento anterior cuya respuesta no llegó; no se duplicó.");
        expect(shown.textContent).toContain("Las correcciones que hizo después de ese intento no se aplicaron");
        expect(shown.textContent).toContain("Muestras registradas: BX011126.");
        fireEvent.click(shown.querySelector(".ant-alert-close-icon")!);
        expect(screen.queryByTestId("registration-notice")).toBeNull();
    });

    it("renders nothing without a notice in the history state", () => {
        render(<MemoryRouter initialEntries={["/orders/o1"]}><RegistrationNotice /></MemoryRouter>);
        expect(screen.queryByTestId("registration-notice")).toBeNull();
    });
});
