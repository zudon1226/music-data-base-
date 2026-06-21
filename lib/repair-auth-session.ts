import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { authMetadataNeedsRepair } from "@/lib/auth-user-metadata";
import { readAccessTokenFromSession } from "@/lib/client-api-auth";
import { getAuthSession, logoutAndClearAuth } from "@/lib/auth-session";
import { isOversizedBearerToken } from "@/lib/session-token-limits";
import { UPLOAD_LOCK_OWNER_EMAIL } from "@/lib/upload-lock";

export type RepairAuthSessionResult = {
    repaired: boolean;
    metadataChanged: boolean;
    reauthenticated: boolean;
    session?: Session | null;
    error?: string;
};

function sessionNeedsMetadataRepair(session: Session | null | undefined) {
    const accessToken = readAccessTokenFromSession(session);
    const metadata = (session?.user?.user_metadata || {}) as Record<string, unknown>;
    return isOversizedBearerToken(accessToken) || authMetadataNeedsRepair(metadata);
}

export async function repairOversizedAuthSession(
    supabase: SupabaseClient,
    options: { email?: string; password?: string; userId?: string } = {},
): Promise<RepairAuthSessionResult> {
    const { session } = await getAuthSession(supabase);
    const userId = options.userId || session?.user?.id || "";
    const email = String(options.email || session?.user?.email || "").trim().toLowerCase();

    if (!userId || !email) {
        return { repaired: false, metadataChanged: false, reauthenticated: false };
    }
    if (email !== UPLOAD_LOCK_OWNER_EMAIL.toLowerCase()) {
        return { repaired: false, metadataChanged: false, reauthenticated: false };
    }
    if (!sessionNeedsMetadataRepair(session)) {
        return { repaired: false, metadataChanged: false, reauthenticated: false };
    }

    const response = await fetch("/api/auth/repair-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, userId }),
        credentials: "omit",
    });
    const data = (await response.json().catch(() => ({}))) as {
        metadataChanged?: boolean;
        repaired?: boolean;
        error?: string;
    };
    if (!response.ok) {
        return {
            repaired: false,
            metadataChanged: false,
            reauthenticated: false,
            error: data.error || response.statusText,
        };
    }
    if (!data.metadataChanged) {
        return {
            repaired: Boolean(data.repaired),
            metadataChanged: false,
            reauthenticated: false,
        };
    }

    await logoutAndClearAuth(supabase);

    if (!options.password) {
        return {
            repaired: true,
            metadataChanged: true,
            reauthenticated: false,
        };
    }

    const signInResult = await supabase.auth.signInWithPassword({
        email,
        password: options.password,
    });
    if (signInResult.error || !signInResult.data.session?.user) {
        return {
            repaired: true,
            metadataChanged: true,
            reauthenticated: false,
            error: signInResult.error?.message || "Sign in again after metadata repair.",
        };
    }

    return {
        repaired: true,
        metadataChanged: true,
        reauthenticated: true,
        session: signInResult.data.session,
    };
}
