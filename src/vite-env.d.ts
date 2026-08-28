/// <reference types="vite/client" />

declare const __CELUMA_APP_INFO__: {
    /** Release identity (e.g. "1.3.0"), from package.json or VITE_APP_VERSION. */
    version: string;
    /** H-0c: source provenance (commit SHA), null when not stamped at build. */
    commit: string | null;
};

interface ImportMetaEnv {
    readonly VITE_APP_VERSION?: string;
    /** H-0c: build-time commit SHA, kept separate from the release version. */
    readonly VITE_APP_COMMIT?: string;
}
