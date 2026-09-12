/**
 * Creator available balance from earnings_events ledger.
 * Reversals subtract; payouts reduce available balance when marked paid.
 */

import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function getCreatorAvailableBalanceCents(userId: string, creatorType: string) {
    if (!isUuid(userId)) return { availableCents: 0, currency: "USD" };

    const supabase = getSupabaseServerClient();
    const { data: events, error } = await supabase
        .from("earnings_events")
        .select("artist_amount_cents,producer_amount_cents,currency,is_reversal")
        .eq("creator_user_id", userId)
        .eq("creator_type", creatorType);
    if (error) throw new Error(getErrorMessage(error));

    let available = 0;
    let currency = "USD";
    for (const row of events || []) {
        currency = String(row.currency || "USD");
        const share = creatorType === "producer"
            ? Number(row.producer_amount_cents || 0)
            : Number(row.artist_amount_cents || 0);
        available += row.is_reversal ? -Math.abs(share) : share;
    }

    const { data: payouts } = await supabase
        .from("payouts")
        .select("amount_cents,status")
        .eq("user_id", userId)
        .eq("creator_type", creatorType)
        .in("status", ["pending", "processing", "paid"]);

    for (const payout of payouts || []) {
        available -= Math.max(0, Number(payout.amount_cents || 0));
    }

    return { availableCents: Math.max(0, available), currency };
}
