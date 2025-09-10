import { useEffect } from "react";

export function useAutoSave<T>(key: string, data: T) {
    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(data));
    }, [key, data]);
}

export function loadAutoSave<T>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}
