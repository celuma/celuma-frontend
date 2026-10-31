import { useCallback, useEffect, useState } from "react";
import {
    getOrderManagement, getSampleManagement, type OrderManagementState, type SampleManagementState,
} from "../services/order_management_service";

/** Lifecycle state of the edit/remove actions of an order or sample (#9/#10/#11); the API re-checks every write. */
export function useOrderManagement(orderId: string | undefined, refreshKey: unknown = null) {
    const [state, setState] = useState<OrderManagementState | null>(null);
    const reload = useCallback(() => {
        if (!orderId) return;
        getOrderManagement(orderId).then(setState).catch(() => setState(null));
    }, [orderId]);
    useEffect(reload, [reload, refreshKey]);
    return { state, reload };
}

export function useSampleManagement(sampleId: string | undefined, refreshKey: unknown = null) {
    const [state, setState] = useState<SampleManagementState | null>(null);
    const reload = useCallback(() => {
        if (!sampleId) return;
        getSampleManagement(sampleId).then(setState).catch(() => setState(null));
    }, [sampleId]);
    useEffect(reload, [reload, refreshKey]);
    return { state, reload };
}
