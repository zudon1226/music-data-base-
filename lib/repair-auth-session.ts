import type { SupabaseClient } from "@supabase/supabase-js";
import { authFetch, readAccessTokenFromSession } from "@/lib/client-api-auth";
import { getAuthSession } from "@/lib/auth-session";
import { isOversizedBearerToken } from "@/lib/session-token-limits";

export async function repairOversizedAuthSession(supabase: SupabaseClient) {
    const { session } = await getAuthSession(supabase);
    const userId = session?.user?.id || "";
    if (!userId) {
        return { repaired: false, metadataChanged: false };
    }

    const accessToken = readAccessTokenFromSession(session);
    if (!isOversizedBearerToken(accessToken)) {
        return { repaired: false, metadataChanged: false };
    }

    const response = await authFetch(supabase, "/api/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "repair-auth-metadata",
            userId,
        }),
    });
    const data = (await response.json().catch(() => ({}))) as {
        metadataChanged?: boolean;
        error?: string;
    };
    if (!response.ok) {
        return { repaired: false, metadataChanged: false, error: data.error || response.statusText };
    }

    if (data.metadataChanged) {
        await supabase.auth.refreshSession().catch(() => undefined);
    }

    return {
        repaired: Boolean(data.metadataChanged),
        metadataChanged: Boolean(data.metadataChanged),
    };
}
