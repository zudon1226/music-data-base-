import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAuthenticatedSession(supabase: SupabaseClient) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (session?.access_token && session.user?.id) {
        return {
            accessToken: session.access_token,
            userId: session.user.id,
            error: null as Error | null,
        };
    }
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshed = refreshData.session;
    if (refreshed?.access_token && refreshed.user?.id) {
        return {
            accessToken: refreshed.access_token,
            userId: refreshed.user.id,
            error: null as Error | null,
        };
    }
    return {
        accessToken: "",
        userId: "",
        error: (refreshError || sessionError || new Error("No active session.")) as Error | null,
    };
}

export async function authFetch(supabase: SupabaseClient, input: RequestInfo | URL, init: RequestInit = {}) {
    const { accessToken, userId, error } = await getAuthenticatedSession(supabase);
    const headers = new Headers(init.headers);
    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }
    const url = typeof input === "string" ? input : input.toString();
    console.log("API AUTH FETCH", {
        url,
        hasAuthorization: Boolean(accessToken),
        userId,
        sessionError: error?.message || null,
    });
    return fetch(input, {
        ...init,
        headers,
        credentials: init.credentials ?? "omit",
    });
}
