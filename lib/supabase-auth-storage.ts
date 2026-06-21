export { SUPABASE_AUTH_STORAGE_KEY } from "./auth-session";

export function createSupabaseAuthStorage() {
    return window.localStorage;
}
