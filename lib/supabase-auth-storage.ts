export { SUPABASE_AUTH_STORAGE_KEY } from "./auth-session";

/** DESKTOP ONLY — Supabase auth session storage adapter. */
export function createSupabaseAuthStorage() {
    return window.localStorage;
}
