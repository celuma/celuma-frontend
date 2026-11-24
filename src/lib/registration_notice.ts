/**
 * History state a registration form hands to the record page it opens when the registration was
 * resolved from an earlier attempt (Céluma 1.5, #67; see `registration_submission.ts`).
 */
export interface RegistrationNoticeState {
    registrationNotice?: RegistrationNotice;
}

export interface RegistrationNotice {
    /** `replayed`: a retry was answered by the record saved earlier. `recovered`: and later corrections were NOT applied. */
    kind: "replayed" | "recovered";
    title: string;
    text: string;
}

export function registrationNoticeFromState(state: unknown): RegistrationNotice | null {
    const notice = (state as RegistrationNoticeState | null)?.registrationNotice;
    if (!notice || typeof notice.text !== "string" || typeof notice.title !== "string") return null;
    return notice.kind === "recovered" || notice.kind === "replayed" ? notice : null;
}

/** The notice for a registration outcome, or null for an ordinary first-time success. */
export function registrationNotice(
    noun: "La orden" | "La muestra",
    code: string,
    outcome: { replayed: boolean; recovered: unknown | null },
    savedCodes: string,
): RegistrationNotice | null {
    const subject = `${noun} ${code}`.trim();
    if (outcome.recovered !== null) {
        return {
            kind: "recovered",
            title: `${subject} ya se había registrado en un intento anterior cuya respuesta no llegó; no se duplicó.`,
            text: `Las correcciones que hizo después de ese intento no se aplicaron: revise los datos aquí y corríjalos con las acciones de edición. ${savedCodes}`,
        };
    }
    if (outcome.replayed) {
        return {
            kind: "replayed",
            title: `${subject} ya estaba registrada (la respuesta anterior no llegó); no se duplicó.`,
            text: savedCodes,
        };
    }
    return null;
}
