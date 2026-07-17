/**
 * Immutable ringtone moderation audit log writer (Phase 4).
 */

import { sanitizeRingtoneText } from "@/lib/ringtone-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function writeRingtoneModerationLog(input: {
    ringtoneId: string;
    revisionId?: string | null;
    revisionNumber?: number | null;
    action: string;
    previousStatus: string;
    newStatus: string;
    actorId: string;
    actorRole: string;
    reason?: string;
    metadata?: Record<string, unknown>;
}) {
    if (!isUuid(input.ringtoneId) || !isUuid(input.actorId)) {
        return { ok: false as const, error: "Invalid moderation log ids." };
    }
    const supabase = getSupabaseServerClient();
    const insert = await supabase.from("ringtone_moderation_logs").insert({
        ringtone_id: input.ringtoneId,
        revision_id: input.revisionId && isUuid(input.revisionId) ? input.revisionId : null,
        revision_number: input.revisionNumber ?? null,
        action: sanitizeRingtoneText(input.action, 80) || "action",
        previous_status: String(input.previousStatus || ""),
        new_status: String(input.newStatus || ""),
        actor_id: input.actorId,
        actor_role: sanitizeRingtoneText(input.actorRole, 40) || "admin",
        reason: sanitizeRingtoneText(input.reason || "", 2000),
        metadata: input.metadata || {},
    }).select("id").maybeSingle();

    if (insert.error) {
        console.warn("[ringtone-moderation] log write failed:", getErrorMessage(insert.error));
        return { ok: false as const, error: getErrorMessage(insert.error) };
    }
    return { ok: true as const, id: insert.data?.id || null };
}
