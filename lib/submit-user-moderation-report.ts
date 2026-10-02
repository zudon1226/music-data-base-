import type { SupabaseClient } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/server-supabase";

const ALLOWED_ITEM_TYPES = new Set([
    "song",
    "video",
    "album",
    "comment",
    "artist",
    "producer",
    "beat",
    "playlist",
]);

export type SubmitModerationReportInput = {
    reporterId: string;
    reporterName: string;
    itemType: string;
    itemId: string;
    itemTitle: string;
    reason?: string;
    targetUserId?: string;
    targetUserName?: string;
};

export async function submitUserModerationReport(
    supabase: SupabaseClient,
    input: SubmitModerationReportInput,
) {
    const itemType = String(input.itemType || "").trim();
    const itemId = String(input.itemId || "").trim();
    if (!ALLOWED_ITEM_TYPES.has(itemType)) {
        return { ok: false as const, status: 400, error: "Invalid report item type." };
    }
    if (!itemId) {
        return { ok: false as const, status: 400, error: "Report item id is required." };
    }

    const inserted = await supabase
        .from("moderation_reports")
        .insert({
            reporter_id: input.reporterId,
            reporter_name: String(input.reporterName || "").trim().slice(0, 120),
            item_type: itemType,
            item_id: itemId,
            item_title: String(input.itemTitle || "").trim().slice(0, 240),
            reason: String(input.reason || "Community report").trim().slice(0, 500),
            status: "open",
            target_user_id: String(input.targetUserId || "").trim().slice(0, 120) || null,
            target_user_name: String(input.targetUserName || "").trim().slice(0, 120) || null,
        })
        .select("id,item_type,item_id,item_title,status,created_at")
        .single();

    if (inserted.error) {
        const message = getErrorMessage(inserted.error).toLowerCase();
        if (message.includes("duplicate") || message.includes("unique constraint")) {
            return { ok: false as const, status: 409, error: "You already reported this item." };
        }
        return { ok: false as const, status: 500, error: getErrorMessage(inserted.error) };
    }

    return { ok: true as const, status: 201, report: inserted.data };
}
