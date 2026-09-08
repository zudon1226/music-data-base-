/**
 * Traceable earnings reversals for refunds/chargebacks.
 * Inserts offsetting earnings_events — never mutates historical rows.
 */

import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function reverseCreatorEarningsForSource(input: {
    sourceId: string;
    reason: string;
    providerEventId?: string;
}) {
    const sourceId = String(input.sourceId || "").trim();
    if (!sourceId) return { ok: true as const, reversed: 0 };

    const supabase = getSupabaseServerClient();
    const { data: originals, error } = await supabase
        .from("earnings_events")
        .select("*")
        .eq("source_id", sourceId)
        .eq("is_reversal", false);
    if (error) throw new Error(getErrorMessage(error));
    if (!originals?.length) return { ok: true as const, reversed: 0 };

    let reversed = 0;
    for (const original of originals) {
        const { data: existingReversal } = await supabase
            .from("earnings_events")
            .select("id")
            .eq("reversal_of_source_id", sourceId)
            .eq("creator_user_id", original.creator_user_id)
            .eq("is_reversal", true)
            .maybeSingle();
        if (existingReversal?.id) continue;

        const { error: insertError } = await supabase.from("earnings_events").insert({
            creator_user_id: original.creator_user_id,
            creator_type: original.creator_type,
            creator_name: original.creator_name,
            item_id: original.item_id,
            item_type: original.item_type,
            event_type: "purchase",
            source_id: `${sourceId}:reversal:${original.id}`,
            reversal_of_source_id: sourceId,
            is_reversal: true,
            gross_amount_cents: Math.max(0, Number(original.gross_amount_cents || 0)),
            artist_amount_cents: Math.max(0, Number(original.artist_amount_cents || 0)),
            producer_amount_cents: Math.max(0, Number(original.producer_amount_cents || 0)),
            platform_amount_cents: Math.max(0, Number(original.platform_amount_cents || 0)),
            currency: original.currency || "USD",
            metadata: {
                reason: input.reason,
                providerEventId: input.providerEventId || null,
                reversedEventId: original.id,
            },
        });
        if (insertError) throw new Error(getErrorMessage(insertError));
        reversed += 1;
    }

    return { ok: true as const, reversed };
}

export async function reverseRingtonePurchaseEarnings(purchaseId: string, reason: string, providerEventId?: string) {
    if (!isUuid(purchaseId)) return { ok: true as const, reversed: 0 };
    return reverseCreatorEarningsForSource({ sourceId: purchaseId, reason, providerEventId });
}
