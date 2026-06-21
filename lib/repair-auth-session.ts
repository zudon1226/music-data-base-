import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { logoutAndClearAuth } from "@/lib/auth-session";
import { UPLOAD_LOCK_OWNER_EMAIL } from "@/lib/upload-lock";

export type RepairAuthSessionResult = {
    repaired: boolean;
    metadataChanged: boolean;
    reauthenticated: boolean;
    session?: Session | null;
    error?: string;
};

export async function repairOversizedAuthSession(
    supabase: SupabaseClient,
    options: { email?: string; password?: string; userId?: string } = {},
): Promise<RepairAuthSessionResult> {
    const email = String(options.email || "").trim().toLowerCase();
    if (!email || email !== UPLOAD_LOCK_OWNER_EMAIL.toLowerCase()) {
        return { repaired: false, metadataChanged: false, reauthenticated: false };
    }

    const response = await fetch("/api/auth/repair-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "omit",
        cache: "no-store",
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
            error: data.error || response.statusText || `Repair failed (${response.status}).`,
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
