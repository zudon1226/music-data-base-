/**
 * Server-side ringtone notifications with idempotent event keys.
 * Uses the existing notifications table when available; never exposes secrets.
 */

import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type RingtoneNotificationItemType = "ringtone" | "ringtone_review";

export async function notifyRingtoneEvent(input: {
    userId: string;
    title: string;
    body: string;
    ringtoneId: string;
    eventKey: string;
    itemType?: RingtoneNotificationItemType;
}) {
    if (!isUuid(input.userId) || !isUuid(input.ringtoneId) || !input.eventKey) {
        return { ok: false as const, error: "Invalid notification input." };
    }
    const supabase = getSupabaseServerClient();
    const payload = {
        user_id: input.userId,
        title: String(input.title || "").slice(0, 160),
        body: String(input.body || "").slice(0, 1000),
        item_id: input.ringtoneId,
        item_type: input.itemType || "ringtone",
        read: false,
        event_key: input.eventKey.slice(0, 240),
    };

    const inserted = await supabase.from("notifications").insert(payload).select("id").maybeSingle();
    if (inserted.error) {
        // Unique event_key → treat as idempotent success.
        if (/duplicate|unique/i.test(inserted.error.message || "")) {
            return { ok: true as const, duplicate: true };
        }
        // Table may not have event_key yet in older envs — retry without it.
        if (/event_key|item_type/i.test(inserted.error.message || "")) {
            const fallback = await supabase.from("notifications").insert({
                user_id: payload.user_id,
                title: payload.title,
                body: payload.body,
                item_id: payload.item_id,
                item_type: "song",
                read: false,
            }).select("id").maybeSingle();
            if (fallback.error) {
                console.warn("[ringtone-notifications]", getErrorMessage(fallback.error));
                return { ok: false as const, error: getErrorMessage(fallback.error) };
            }
            return { ok: true as const, id: fallback.data?.id || null, duplicate: false };
        }
        console.warn("[ringtone-notifications]", getErrorMessage(inserted.error));
        return { ok: false as const, error: getErrorMessage(inserted.error) };
    }
    return { ok: true as const, id: inserted.data?.id || null, duplicate: false };
}
