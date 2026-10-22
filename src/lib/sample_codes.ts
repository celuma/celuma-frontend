/**
 * The `sample_codes` base field value (Céluma 1.4, #12), computed exactly like the server does
 * (`report_metadata.resolve_sample_codes`) so the editor preview shows what the next save will store.
 * The server stays the authority: it overwrites whatever the client submits.
 *
 * Order: digit-aware natural order of the codes themselves (`M-2` before `M-10`), ties broken by id.
 * `Sample` has no registration timestamp, so this is the deterministic order for any set of codes.
 */
export const SAMPLE_CODES_SEPARATOR = ", ";

type Part = { digits: true; n: number } | { digits: false; s: string };

function parts(code: string): Part[] {
    return (code.match(/\d+|\D+/g) ?? []).map((p) =>
        /^\d+$/.test(p) ? { digits: true as const, n: Number(p) } : { digits: false as const, s: p },
    );
}

function compareCodes(a: string, b: string): number {
    const pa = parts(a);
    const pb = parts(b);
    for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
        const x = pa[i];
        const y = pb[i];
        if (x.digits !== y.digits) return x.digits ? -1 : 1;
        if (x.digits && y.digits) {
            if (x.n !== y.n) return x.n < y.n ? -1 : 1;
        } else if (!x.digits && !y.digits && x.s !== y.s) {
            return x.s < y.s ? -1 : 1;
        }
    }
    return pa.length - pb.length;
}

export function formatSampleCodes(samples: ReadonlyArray<{ id: string; sample_code?: string | null }> | null | undefined): string {
    return (samples ?? [])
        .map((s) => ({ id: s.id, code: (s.sample_code ?? "").trim() }))
        .filter((s) => s.code !== "")
        .sort((a, b) => compareCodes(a.code, b.code) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((s) => s.code)
        .join(SAMPLE_CODES_SEPARATOR);
}
