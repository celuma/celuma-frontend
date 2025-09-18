import { useEffect, useRef } from "react";

// Options for the auto-save hook
export type AutoSaveOptions = {
    debounceMs?: number;
    storage?: Storage;
    onSaveError?: (err: unknown) => void;
};

// Load the saved data from localStorage
export function loadAutoSave<T = unknown>(
    key: string,
    storage: Storage = typeof window !== "undefined" ? window.localStorage : ({} as Storage)
): T | null {
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

// Clear the saved data from localStorage
export function clearAutoSave(
    key: string,
    storage: Storage = typeof window !== "undefined" ? window.localStorage : ({} as Storage)
): void {
    try {
        storage.removeItem(key);
    } catch {
        // noop
    }
}

// Hook to auto-save data to localStorage with debounce
export function useAutoSave<T>(
    key: string,
    data: T,
    opts: AutoSaveOptions = {}
): void {
    const { debounceMs = 600, storage = typeof window !== "undefined" ? window.localStorage : ({} as Storage), onSaveError } = opts;
    const lastJsonRef = useRef<string | null>(null);
    const timerRef = useRef<number | undefined>(undefined);

    // Function to save data immediately
    const saveNow = () => {
        try {
            const json = JSON.stringify(data);
            if (json === lastJsonRef.current) return;
            storage.setItem(key, json);
            lastJsonRef.current = json;
        } catch (err) {
            onSaveError?.(err);
        }
    };

    // Effect to save data with debounce when data changes
    useEffect(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current);

        timerRef.current = window.setTimeout(saveNow, debounceMs);

        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, debounceMs, storage, onSaveError, data]);

    // Effect to save data when the page is unloaded or hidden
    useEffect(() => {
        const handleBeforeUnload = () => {
            saveNow();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") saveNow();
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, storage]);
}