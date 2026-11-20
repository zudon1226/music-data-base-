import { isAdminUserId } from "@/lib/admin-auth";
import { getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function canUserCreateMixtapes(userId: string) {
    if (!isUuid(userId)) return false;
    if (await isAdminUserId(userId)) return true;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("can_create_mixtapes", { check_user_id: userId });
    if (error) {
        console.warn("[mixtape-access] can_create_mixtapes RPC failed:", error);
        return false;
    }
    return Boolean(data);
}

export async function requireMixtapeCreator(userId: string) {
    if (!(await canUserCreateMixtapes(userId))) {
        return {
            ok: false as const,
            status: 403,
            error: "Mixtape Studio is available for approved DJs, Artists, and Producers only.",
        };
    }
    return { ok: true as const, userId };
}

export async function canManageMixtapeOwner(userId: string, ownerId: unknown) {
    if (!isUuid(userId)) return false;
    if (String(ownerId || "") === userId) return true;
    return isAdminUserId(userId);
}

export async function requireMixtapeOwner(userId: string, ownerId: unknown) {
    if (!(await canManageMixtapeOwner(userId, ownerId))) {
        return {
            ok: false as const,
            status: 403,
            error: "Only the mixtape owner or a platform admin can manage this content.",
        };
    }
    return { ok: true as const, userId };
}