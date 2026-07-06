/** DESKTOP ONLY — block protected UI and network until API READY. */

import { DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE } from "./desktop-protected-action-pipeline";
import {
    DESKTOP_API_READY_EVENT,
    isDesktopApiReady,
} from "./desktop-authenticated-session";

export { DESKTOP_API_READY_EVENT as DESKTOP_AUTHENTICATED_SESSION_READY_EVENT };

export function isDesktopProtectedActionsEnabled() {
    return isDesktopApiReady();
}

export function guardDesktopProtectedAction(label: string) {
    if (isDesktopProtectedActionsEnabled()) {
        return true;
    }
    console.warn("[desktop-protected-gate]", "blocked", { label, reason: "api-not-ready" });
    return false;
}

export function createBlockedProtectedResponse(
    message = DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE,
) {
    return new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
    });
}

export function subscribeDesktopProtectedActionsReady(listener: () => void) {
    if (typeof window === "undefined") {
        return () => undefined;
    }
    const handler = () => listener();
    window.addEventListener(DESKTOP_API_READY_EVENT, handler);
    return () => window.removeEventListener(DESKTOP_API_READY_EVENT, handler);
}
