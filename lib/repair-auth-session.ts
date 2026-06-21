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

const REPAIR_METADATA_PATHS = [
    "/api/auth/repair-metadata",
    "/api/platform/repair-auth-metadata",
] as const;

async function postRepairMetadata(email: string) {
    let lastError = "Auth metadata repair failed.";
    for (const path of REPAIR_METADATA_PATHS) {
        const response = await fetch(path, {
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
        if (response.ok) {
            return { ok: true as const, data };
        }
        lastError = data.error || response.statusText || `Repair failed (${response.status}).`;
        if (response.status !== 401 && response.status !== 404) {
            break;
        }
    }
    return { ok: false as const, error: lastError };
}

export async function repairOversizedAuthSession(
    supabase: SupabaseClient,
    options: { email?: string; password?: string; userId?: string } = {},
): Promise<RepairAuthSessionResult> {
    const email = String(options.email || "").trim().toLowerCase();
    if (!email || email !== UPLOAD_LOCK_OWNER_EMAIL.toLowerCase()) {
        return { repaired: false, metadataChanged: false, reauthenticated: false };
    }

    const repairResponse = await postRepairMetadata(email);
    if (!repairResponse.ok) {
        return {
            repaired: false,
            metadataChanged: false,
            reauthenticated: false,
            error: repairResponse.error,
        };
    }

    const data = repairResponse.data;
    if (!data.metadataChanged) {
        return {
            repaired: Boolean(data.repaired),
            metadataChanged: false,
            reauthenticated: false,
        };
    }

    if (!options.password) {
        return {
            repaired: true,
            metadataChanged: true,
            reauthenticated: false,
            error: "Auth metadata was repaired. Sign in again with your password.",
        };
    }

    await logoutAndClearAuth(supabase);

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
