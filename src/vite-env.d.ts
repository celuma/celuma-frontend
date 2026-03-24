/// <reference types="vite/client" />

declare const __CELUMA_APP_INFO__: {
    version: string;
};

interface ImportMetaEnv {
    readonly VITE_APP_VERSION?: string;
}
