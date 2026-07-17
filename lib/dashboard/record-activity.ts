import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultHrefForActivity, isActivityKind, type ActivityKind } from "@/lib/dashboard/activity-kinds";

export type RecordActivityInput = {
    actorUserId: string;
    recipientUserId?: string | null;
    kind: ActivityKind | string;
    title: string;
    body?: string;
    href?: string;
    itemType?: string | null;
    itemId?: string | null;
    metadata?: Record<string, unknown>;
};

export async function recordUserActivity(supabase: SupabaseClient, input: RecordActivityInput) {
    const kind = isActivityKind(input.kind) ? input.kind : "release";
    const title = String(input.title || "").trim().slice(0, 160);
    if (!input.actorUserId || !title) return null;
    const row = {
        actor_user_id: input.actorUserId,
        recipient_user_id: input.recipientUserId || null,
        kind,
        title,
        body: String(input.body || "").trim().slice(0, 500),
        href: String(input.href || defaultHrefForActivity(kind, input.itemType)).slice(0, 80),
        item_type: input.itemType || null,
        item_id: input.itemId || null,
        metadata: input.metadata || {},
    };
    const { data, error } = await supabase
        .from("user_activity_events")
        .insert(row)
        .select("id,actor_user_id,recipient_user_id,kind,title,body,href,item_type,item_id,metadata,created_at")
        .maybeSingle();
    if (error) {
        console.warn("[recordUserActivity]", error.message);
        return null;
    }
    return data;
}
