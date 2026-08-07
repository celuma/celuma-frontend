/**
 * Céluma 1.3, Phase 3, Block C — the one place a notification's
 * `resource_type` + `resource_id` become a route.
 *
 * Every notification surface (popover, history page, any future one) calls
 * this. The switch is deliberately not duplicated per surface: a second copy is
 * how one of them ends up generating a route the router does not have.
 *
 * **A deep link is not a credential.** These are plain application routes; all
 * protection is the destination's own `RequirePermission` guard plus the
 * backend's tenant/RBAC check on load. A notification never grants access, and
 * this module never pre-flights permissions — a recipient who has since lost
 * access gets exactly the 403/404 a stale bookmark would give them (recipient
 * matrix rule 5).
 *
 * The routes below are the ones registered in main.tsx:
 *   /reports/:reportId   /orders/:orderId   /samples/:sampleId
 *
 * Note on home.tsx's handleActivityClick: it switches on the same shape but
 * over a different domain (dashboard activity, which also includes `patient`,
 * a resource type notifications do not have). It is left untouched — merging
 * the two would widen this block into unrelated dashboard behaviour for no
 * safety gain, since neither is a security boundary.
 */
import {
    isKnownNotificationResourceType,
    type NotificationResourceType,
} from "../models/notification";

const RESOURCE_ROUTES: Record<NotificationResourceType, (id: string) => string> = {
    report: (id) => `/reports/${id}`,
    order: (id) => `/orders/${id}`,
    sample: (id) => `/samples/${id}`,
};

/**
 * The route a notification points at, or `null` when it cannot be resolved.
 *
 * `null` means "render the item, but do not make it navigable" — never a
 * fabricated route. Two cases produce it:
 *   - a `resource_type` this build does not know (a future backend value), and
 *   - a missing/blank `resource_id`.
 */
export function resolveNotificationRoute(
    resourceType: string | null | undefined,
    resourceId: string | null | undefined,
): string | null {
    if (!resourceType || !resourceId) return null;

    const id = resourceId.trim();
    if (!id) return null;

    if (!isKnownNotificationResourceType(resourceType)) return null;

    return RESOURCE_ROUTES[resourceType](encodeURIComponent(id));
}

/** True when this notification can be opened in this build. */
export function isNotificationNavigable(
    resourceType: string | null | undefined,
    resourceId: string | null | undefined,
): boolean {
    return resolveNotificationRoute(resourceType, resourceId) !== null;
}

/**
 * Accessible explanation shown (as a tooltip/`aria-label` suffix) on an item
 * whose destination this build cannot resolve, so the row is never a silently
 * dead click target.
 */
export const UNSUPPORTED_RESOURCE_MESSAGE =
    "Esta notificación no se puede abrir desde esta versión de Céluma.";
