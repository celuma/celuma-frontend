/**
 * Typed client for the monthly numbering configuration and its non-consuming
 * preview (Céluma 1.4, issue #8).
 *
 *   GET  /v1/numbering/config               (lab:read)
 *   PUT  /v1/numbering/config/{order|sample} (admin:manage_catalog; activation and every setting)
 *   POST /v1/numbering/preview              (lab:read; reads only, reserves nothing)
 *   POST /v1/numbering/sample-code-suggestions (lab:read; hotfix 1.4.3; reads only, reserves nothing)
 */
import { apiFetch } from "../lib/api_fetch";
import { formatHttpError } from "../lib/api_error";
import type {
    NumberingConfig,
    NumberingConfigInput,
    NumberingConfigs,
    NumberingKind,
    NumberingPreview,
    NumberingPreviewRequest,
    SampleCodeSuggestionRequest,
    SampleCodeSuggestionResponse,
} from "../models/numbering";

const base = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL as string) || "/api";
const NUMBERING = `${base}/v1/numbering`;

async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(formatHttpError(res.status, await res.text()));
    return (await res.json()) as T;
}

export async function getNumberingConfigs(): Promise<NumberingConfigs> {
    return json<NumberingConfigs>(await apiFetch(`${NUMBERING}/config`));
}

export async function saveNumberingConfig(kind: NumberingKind, input: NumberingConfigInput): Promise<NumberingConfig> {
    return json<NumberingConfig>(
        await apiFetch(`${NUMBERING}/config/${kind}`, { method: "PUT", body: JSON.stringify(input) }),
    );
}

/** Validates a candidate configuration and returns examples and an estimate. Never reserves a number. */
export async function previewNumbering(request: NumberingPreviewRequest): Promise<NumberingPreview> {
    return json<NumberingPreview>(await apiFetch(`${NUMBERING}/preview`, { method: "POST", body: JSON.stringify(request) }));
}

/**
 * The code each sample row of a registration form would get from the CURRENT numbering, in row order
 * (rows of one type and month follow the sequence). Reads only: nothing is reserved or consumed, and the
 * code finally issued is the one the registration returns.
 */
export async function suggestSampleCodes(request: SampleCodeSuggestionRequest): Promise<SampleCodeSuggestionResponse> {
    return json<SampleCodeSuggestionResponse>(
        await apiFetch(`${NUMBERING}/sample-code-suggestions`, { method: "POST", body: JSON.stringify(request) }),
    );
}
