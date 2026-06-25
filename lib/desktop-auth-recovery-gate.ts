import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { clearSupabaseAuthStorage } from "./auth-session";
import { isOversizedBearerToken, MAX_SAFE_BEARER_TOKEN_LENGTH } from "./session-token-limits";

/** DESKTOP ONLY — single shared recovery gate for all authenticated desktop loads. */
export const DESKTOP_AUTH_RECOVERY_EVENT = "mdb-desktop-auth-recovery";
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please log out and log back in, then retry.";

let recoveryActive = false;
let corruptedCleanupDoneThisPageLoad = false;

export function isDesktopAuthRecoveryActive() {
    return recoveryActive;
}

function readRawAccessToken(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token : "";
}

function hasExactlyThreeJwtSegments(token: string) {
    const parts = token.split(".");
    return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function isAcceptableDesktopAccessToken(token: string) {
    if (!token || token.length >= MAX_SAFE_BEARER_TOKEN_LENGTH) {
        return false;
    }
    if (!token.startsWith("eyJ")) {
        return false;
    }
    return hasExactlyThreeJwtSegments(token);
}

function isCorruptedStoredAccessToken(token: string) {
    if (!token) {
        return false;
    }
    return isOversizedBearerToken(token) || !isAcceptableDesktopAccessToken(token);
}

export function readAccessTokenFromSession(session: Session | null | undefined) {
    const raw = readRawAccessToken(session);
    return isAcceptableDesktopAccessToken(raw) ? raw : "";
}

export function hasValidDesktopAccessToken(session: Session | null | undefined) {
    if (recoveryActive || !session?.access_token) {
        return false;
    }
    return isAcceptableDesktopAccessToken(readRawAccessToken(session));
}

export function isDesktopSessionReady(session: Session | null | undefined) {
    return !recoveryActive && hasValidDesktopAccessToken(session);
}

export function engageDesktopAuthRecovery() {
    recoveryActive = true;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(DESKTOP_AUTH_RECOVERY_EVENT));
    }
}

export function clearDesktopAuthRecoveryGate(session?: Session | null) {
    if (session !== undefined && session !== null && !hasValidDesktopAccessToken(session)) {
        return;
    }
    recoveryActive = false;
}

export function noteValidatedDesktopSession(session: Session | null | undefined) {
    if (hasValidDesktopAccessToken(session)) {
        recoveryActive = false;
    }
}

export async function canRunDesktopProtectedLoads(supabase: SupabaseClient) {
    if (recoveryActive) {
        return false;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (recoveryActive || !session?.access_token) {
        return false;
    }
    return hasValidDesktopAccessToken(session);
}

export async function runCorruptedAuthCleanupOnce(supabase: SupabaseClient) {
    engageDesktopAuthRecovery();
    if (corruptedCleanupDoneThisPageLoad) {
        return;
    }
    corruptedCleanupDoneThisPageLoad = true;
    clearSupabaseAuthStorage();
    await supabase.auth.signOut();
}

export function isCorruptedDesktopAccessToken(token: string) {
    return isCorruptedStoredAccessToken(token);
}
