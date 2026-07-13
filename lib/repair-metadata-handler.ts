import { findAdminUserByEmail } from "@/lib/admin-auth-users";
import { authMetadataNeedsRepair } from "@/lib/auth-user-metadata";
import {
    getErrorMessage,
    getSupabaseServerClient,
    PLATFORM_OWNER_EMAIL,
} from "@/lib/server-supabase";
import { repairAuthUserMetadata } from "@/lib/sync-auth-user-metadata";

/**
 * Public unauthenticated repair endpoints are permanently disabled.
 * Oversized Auth metadata must be repaired with the local Admin script:
 *   node scripts/repair-owner-auth-metadata.mjs
 *
 * Authenticated profile updates still go through /api/user-profile and always
 * write minimal sanitized user_metadata only.
 */
export async function handleRepairMetadataPost(_body: Record<string, unknown> = {}) {
    return {
        status: 410,
        body: {
            ok: false,
            error: "Public Auth metadata repair endpoints are disabled. Use the local server-only repair script.",
            script: "scripts/repair-owner-auth-metadata.mjs",
        },
    };
}

export function handleRepairMetadataGet() {
    return {
        status: 410,
        body: {
            ok: false,
            route: "/api/auth/repair-metadata",
            methods: [],
            disabled: true,
            ownerEmail: PLATFORM_OWNER_EMAIL,
            script: "scripts/repair-owner-auth-metadata.mjs",
        },
    };
}

export function handleRepairMetadataError(error: unknown) {
    console.error("[repair-metadata] failed:", error);
    return {
        status: 500,
        body: { error: getErrorMessage(error) },
    };
}

/** Kept for authenticated/internal callers that already hold a service client. */
export async function repairOwnerAuthMetadataIfNeeded(email = PLATFORM_OWNER_EMAIL) {
    const normalized = String(email || "").trim().toLowerCase();
    if (normalized !== PLATFORM_OWNER_EMAIL) {
        throw new Error("Auth metadata repair is limited to the platform owner account.");
    }
    const supabase = getSupabaseServerClient();
    const authUser = await findAdminUserByEmail(supabase, normalized);
    if (!authUser?.id) {
        throw new Error("Owner account not found.");
    }
    const currentMetadata = (authUser.user_metadata || {}) as Record<string, unknown>;
    if (!authMetadataNeedsRepair(currentMetadata)) {
        return {
            repaired: false,
            metadataChanged: false,
            userId: authUser.id,
            userMetadata: currentMetadata,
        };
    }
    const repairResult = await repairAuthUserMetadata(supabase, authUser.id);
    return {
        repaired: repairResult.repaired,
        metadataChanged: repairResult.metadataChanged,
        userId: authUser.id,
        userMetadata: repairResult.userMetadata,
    };
}
