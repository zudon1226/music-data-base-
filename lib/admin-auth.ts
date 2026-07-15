import { getErrorMessage, getSupabaseServerClient, isPlatformOwnerUserId, isUuid } from "@/lib/server-supabase";

export async function isAdminUserId(userId: string) {
    if (!userId || !isUuid(userId)) return false;
    if (await isPlatformOwnerUserId(userId)) return true;

    const supabase = getSupabaseServerClient();
    const roleResult = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .eq("status", "active")
        .limit(1);

    if (!roleResult.error && (roleResult.data || []).length > 0) return true;

    const profileResult = await supabase
        .from("profiles")
        .select("id")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .or("is_admin.eq.true,account_type.eq.admin")
        .limit(1);

    return !profileResult.error && (profileResult.data || []).length > 0;
}

export async function requireAdminUserId(userId: string) {
    if (!(await isAdminUserId(userId))) {
        return { ok: false as const, status: 403, error: "Admin permission is required." };
    }
    return { ok: true as const, userId };
}

export function isMissingFoundingSetup(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("founding_invites")
        || message.includes("founding_members")
        || message.includes("does not exist")
        || message.includes("schema cache");
}
