/**
 * Creator earnings ledger writes for marketplace sales and ringtone purchases.
 * Balances accumulate even when withdrawals are locked (subscription past due).
 */

import { calculateRingtonePurchaseSplit } from "@/lib/ringtone-purchase";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function recordCreatorSaleEarnings(input: {
    purchaseId: string;
    itemId: string;
    itemType: string;
    creatorName: string;
    creatorUserId?: string;
    grossAmountCents: number;
    currency?: string;
    buyerUserId: string;
}) {
    const supabase = getSupabaseServerClient();
    const gross = Math.max(0, Math.round(Number(input.grossAmountCents) || 0));
    if (gross <= 0) return { ok: true as const, skipped: true };

    let creatorUserId = String(input.creatorUserId || "").trim();
    if (!creatorUserId && input.itemType === "beat" && isUuid(input.itemId)) {
        const { data } = await supabase
            .from("producer_beats")
            .select("producer_user_id")
            .eq("id", input.itemId)
            .maybeSingle();
        creatorUserId = String(data?.producer_user_id || "");
    }
    if (!creatorUserId && (input.itemType === "song" || input.itemType === "album") && isUuid(input.itemId)) {
        const table = input.itemType === "album" ? "albums" : "songs";
        const { data } = await supabase.from(table).select("user_id").eq("id", input.itemId).maybeSingle();
        creatorUserId = String(data?.user_id || "");
    }
    if (!isUuid(creatorUserId)) {
        return { ok: true as const, skipped: true, reason: "creator_not_resolved" };
    }

    const { data: existing } = await supabase
        .from("earnings_events")
        .select("id")
        .eq("source_id", input.purchaseId)
        .eq("creator_user_id", creatorUserId)
        .eq("is_reversal", false)
        .maybeSingle();
    if (existing?.id) return { ok: true as const, skipped: true, duplicate: true };

    const platformShare = Math.round(gross * 0.1);
    const creatorShare = gross - platformShare;
    const creatorType = input.itemType === "beat" ? "producer" : "artist";

    const { error } = await supabase.from("earnings_events").insert({
        creator_user_id: creatorUserId,
        creator_type: creatorType,
        creator_name: input.creatorName || null,
        item_id: input.itemId,
        item_type: input.itemType === "beat" ? "beat" : input.itemType,
        event_type: "purchase",
        source_id: input.purchaseId,
        gross_amount_cents: gross,
        artist_amount_cents: creatorType === "artist" ? creatorShare : 0,
        producer_amount_cents: creatorType === "producer" ? creatorShare : 0,
        platform_amount_cents: platformShare,
        currency: String(input.currency || "USD").toUpperCase(),
        metadata: {
            buyerUserId: input.buyerUserId,
            flow: "marketplace_sale",
        },
    });
    if (error) throw new Error(getErrorMessage(error));
    return { ok: true as const, skipped: false };
}

export async function recordRingtonePurchaseEarnings(input: {
    purchaseId: string;
    ringtoneId: string;
    creatorId: string;
    creatorName?: string;
    amountCents: number;
    currency?: string;
    buyerUserId: string;
}) {
    if (!isUuid(input.creatorId)) return { ok: true as const, skipped: true };

    const supabase = getSupabaseServerClient();
    const { data: existing } = await supabase
        .from("earnings_events")
        .select("id")
        .eq("source_id", input.purchaseId)
        .eq("creator_user_id", input.creatorId)
        .eq("is_reversal", false)
        .maybeSingle();
    if (existing?.id) return { ok: true as const, skipped: true, duplicate: true };

    const split = calculateRingtonePurchaseSplit(input.amountCents, input.currency || "USD");
    const { error } = await supabase.from("earnings_events").insert({
        creator_user_id: input.creatorId,
        creator_type: "artist",
        creator_name: input.creatorName || null,
        item_id: input.ringtoneId,
        item_type: "ringtone",
        event_type: "purchase",
        source_id: input.purchaseId,
        gross_amount_cents: split.amountCents,
        artist_amount_cents: split.creatorEarningsCents,
        producer_amount_cents: 0,
        platform_amount_cents: split.platformFeeCents,
        currency: split.currency,
        metadata: {
            buyerUserId: input.buyerUserId,
            flow: "ringtone_purchase",
        },
    });
    if (error) throw new Error(getErrorMessage(error));
    return { ok: true as const, skipped: false };
}
