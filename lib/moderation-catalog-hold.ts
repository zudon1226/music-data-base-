import type { SupabaseClient } from "@supabase/supabase-js";
import {
    catalogHoldFromReportStatuses,
    catalogTableForItemType,
    isModerationHoldColumnError,
} from "@/lib/moderation-status.mjs";
import { getErrorMessage } from "@/lib/server-supabase";

export async function syncCatalogHoldForReportedItem(
    supabase: SupabaseClient,
    itemType: string,
    itemId: string,
) {
    const table = catalogTableForItemType(itemType);
    const id = String(itemId || "").trim();
    if (!table || !id) {
        return { ok: true as const, skipped: true as const, hold: "clear" as const };
    }

    const reports = await supabase
        .from("moderation_reports")
        .select("status")
        .eq("item_type", String(itemType).trim())
        .eq("item_id", id);
    if (reports.error) {
        return { ok: false as const, error: getErrorMessage(reports.error) };
    }

    const hold = catalogHoldFromReportStatuses((reports.data || []).map((row) => String(row.status || "")));
    const updated = await supabase
        .from(table)
        .update({ moderation_state: hold })
        .eq("id", id);
    if (updated.error) {
        if (isModerationHoldColumnError(updated.error)) {
            return {
                ok: false as const,
                error: "Catalog moderation_state is not available until migration 202610172000 is applied.",
            };
        }
        return { ok: false as const, error: getErrorMessage(updated.error) };
    }
    return { ok: true as const, skipped: false as const, hold };
}
