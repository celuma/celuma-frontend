// Shared by SignatureBlock (Legacy) and the V2 compact per-page signature.
const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

export function formatSignedDate(iso?: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return DATE_FORMATTER.format(date).replace(/\./g, "");
}
