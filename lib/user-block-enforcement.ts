import type { SupabaseClient } from "@supabase/supabase-js";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export function normalizeBlockedUserId(value: unknown): string {
    const id = String(value || "").trim();
    return isUuid(id) ? id : "";
}

export async function usersAreBlockedFromInteraction(
    supabase: SupabaseClient,
    userIdA: string,
    userIdB: string,
): Promise<boolean> {
    const a = normalizeBlockedUserId(userIdA);
    const b = normalizeBlockedUserId(userIdB);
    if (!a || !b || a === b) return false;

    const { data, error } = await supabase
        .from("blocked_users")
        .select("id")
        .or(`and(blocker_id.eq.${a},blocked_user_id.eq.${b}),and(blocker_id.eq.${b},blocked_user_id.eq.${a})`)
        .limit(1);
    if (error) {
        const message = getErrorMessage(error).toLowerCase();
        if (message.includes("does not exist") || message.includes("schema cache")) {
            return false;
        }
        throw error;
    }
    return Boolean(data?.length);
}

export async function assertUsersCanInteract(
    supabase: SupabaseClient,
    actorUserId: string,
    targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (await usersAreBlockedFromInteraction(supabase, actorUserId, targetUserId)) {
        return { ok: false, error: "This action is not available because of a block between these accounts." };
    }
    return { ok: true };
}
