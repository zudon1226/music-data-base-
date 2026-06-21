import { findAdminUserByEmail } from "@/lib/admin-auth-users";
import { authMetadataNeedsRepair } from "@/lib/auth-user-metadata";
import {
    getErrorMessage,
    getSupabaseServerClient,
    PLATFORM_OWNER_EMAIL,
} from "@/lib/server-supabase";
import { repairAuthUserMetadata } from "@/lib/sync-auth-user-metadata";

export async function handleRepairMetadataPost(body: Record<string, unknown> = {}) {
    const email = String(body.email || PLATFORM_OWNER_EMAIL).trim().toLowerCase();

    if (email !== PLATFORM_OWNER_EMAIL) {
        return {
            status: 403,
            body: { error: "Auth metadata repair is limited to the platform owner account." },
        };
    }

    const supabase = getSupabaseServerClient();
    const authUser = await findAdminUserByEmail(supabase, email);
    if (!authUser?.id) {
        return {
            status: 404,
            body: { error: "Owner account not found." },
        };
    }

    const userId = authUser.id;
    const currentMetadata = (authUser.user_metadata || {}) as Record<string, unknown>;
    if (!authMetadataNeedsRepair(currentMetadata)) {
        return {
            status: 200,
            body: {
                ok: true,
                repaired: false,
                metadataChanged: false,
                userId,
                userMetadata: currentMetadata,
            },
        };
    }

    const repairResult = await repairAuthUserMetadata(supabase, userId);
    return {
        status: 200,
        body: {
            ok: true,
            repaired: repairResult.repaired,
            metadataChanged: repairResult.metadataChanged,
            userId,
            userMetadata: repairResult.userMetadata,
        },
    };
}

export function handleRepairMetadataGet() {
    return {
        status: 200,
        body: {
            ok: true,
            route: "/api/auth/repair-metadata",
            methods: ["POST"],
            ownerEmail: PLATFORM_OWNER_EMAIL,
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
