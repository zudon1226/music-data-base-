// Reverse proxies (Vercel/nginx) reject requests when Authorization is huge.
// Bloated Supabase user_metadata can embed a multi‑KB JWT and trigger HTTP 494.
export const MAX_SAFE_BEARER_TOKEN_LENGTH = 8192;

export const SUPABASE_REFRESH_TOKEN_HEADER = "x-supabase-refresh-token";

export function isOversizedBearerToken(token: string | null | undefined) {
    return typeof token === "string" && token.length > MAX_SAFE_BEARER_TOKEN_LENGTH;
}
