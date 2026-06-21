import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export type AuthSessionStage = "signInWithPassword" | "getSession" | "onAuthStateChange";

function tokenSuffix(token: string | undefined) {
    return typeof token === "string" ? token.slice(-20) : null;
}

function tokenPrefix(token: string | undefined) {
    return typeof token === "string" ? token.slice(0, 20) : null;
}

export function logAuthSessionStage(
    stage: AuthSessionStage,
    session: Session | null | undefined,
    event?: AuthChangeEvent,
) {
    const accessToken = session?.access_token;
    const refreshToken = session?.refresh_token;
    const accessTokenLength = typeof accessToken === "string" ? accessToken.length : null;
    const refreshTokenLength = typeof refreshToken === "string" ? refreshToken.length : null;

    const eventName = stage === "onAuthStateChange"
        ? (event ?? null)
        : stage;

    console.log("AUTH_SESSION_STAGE", {
        event: eventName,
        accessTokenLength,
        refreshTokenLength,
        tokenPrefix: tokenPrefix(accessToken),
        tokenSuffix: tokenSuffix(accessToken),
    });
}
