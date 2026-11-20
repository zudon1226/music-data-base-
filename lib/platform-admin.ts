import { getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

/**
 * Server-side platform admin gate aligned with RLS `public.is_platform_admin(uuid)`.
 * Never trust client-supplied admin flags.
 */
export async function isPlatformAdminUserId(userId: string) {
    if (!isUuid(userId)) return false;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("is_platform_admin", { check_user_id: userId });
    if (error) {
        console.warn("[platform-admin] is_platform_admin RPC failed:", error);
        return false;
    }
    return Boolean(data);
}