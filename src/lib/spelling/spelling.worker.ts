/**
 * Céluma 1.4 (#29) — spelling worker entry point.
 *
 * Loads the vendored es-MX dictionary from the application's own build (Vite
 * emits both files as hashed same-origin assets) and answers lookups. It never
 * contacts any other host, logs, persists or reports what it receives.
 */
import affUrl from "./dictionaries/es-MX/es-MX.aff?url";
import dicUrl from "./dictionaries/es-MX/es-MX.dic?url";
import { createSpellingWorkerHandler, type SpellingRequest, type SpellingResponse } from "./worker_protocol";

// The app's TypeScript lib is DOM, not WebWorker; only these two members are used.
const scope = self as unknown as {
    postMessage(message: SpellingResponse): void;
    onmessage: ((event: MessageEvent<SpellingRequest>) => void) | null;
};

async function fetchAsset(url: string): Promise<string> {
    const response = await fetch(url, { credentials: "omit", cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

const handle = createSpellingWorkerHandler({
    loadDictionary: async () => {
        const [aff, dic] = await Promise.all([fetchAsset(affUrl), fetchAsset(dicUrl)]);
        return { aff, dic };
    },
    post: (message) => scope.postMessage(message),
});

scope.onmessage = (event) => handle(event.data);
