/**
 * Stripe Connect transfer/payout webhook reconciliation (status sync only).
 */

import { syncConnectAccountFromStripe } from "@/lib/stripe-connect";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

async function findProfileByStripeAccountId(stripeAccountId: string) {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
        .from("creator_payment_profiles")
        .select("user_id,creator_type,stripe_connect_account_id")
        .eq("stripe_connect_account_id", stripeAccountId)
        .maybeSingle();
    return data;
}

export async function applyConnectCapabilityWebhook(object: Record<string, unknown>) {
    const accountId = String(object.account || "").trim();
    if (!accountId.startsWith("acct_")) {
        return { ok: true as const, ignored: true, reason: "No account on capability event." };
    }
    const profile = await findProfileByStripeAccountId(accountId);
    if (!profile?.user_id) {
        return { ok: true as const, ignored: true, reason: "Unknown Connect account." };
    }
    const synced = await syncConnectAccountFromStripe({
        userId: String(profile.user_id),
        creatorType: String(profile.creator_type || "artist"),
        stripeAccountId: accountId,
    });
    return { ok: true as const, profile: synced };
}

async function updatePayoutFromWebhook(input: {
    payoutId: string;
    status?: string;
    stripeObjectId: string;
    eventType: string;
    extraMetadata?: Record<string, unknown>;
}) {
    if (!isUuid(input.payoutId)) {
        return { ok: true as const, ignored: true, reason: "Missing payoutId metadata." };
    }
    const supabase = getSupabaseServerClient();
    const { data: existing } = await supabase
        .from("payouts")
        .select("*")
        .eq("id", input.payoutId)
        .maybeSingle();
    if (!existing) {
        return { ok: true as const, ignored: true, reason: "Payout row not found." };
    }

    const metadata = {
        ...((existing.metadata && typeof existing.metadata === "object") ? existing.metadata : {}),
        lastStripeEventType: input.eventType,
        lastStripeObjectId: input.stripeObjectId,
        ...(input.extraMetadata || {}),
    };
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { metadata, updated_at: now };
    if (input.status) {
        patch.status = input.status;
        if (input.status === "paid") patch.paid_at = existing.paid_at || now;
        if (input.status === "processing") {
            patch.reviewed_at = existing.reviewed_at || now;
        }
    }

    const { error } = await supabase.from("payouts").update(patch).eq("id", input.payoutId);
    if (error) throw new Error(getErrorMessage(error));
    return { ok: true as const, payoutId: input.payoutId, status: input.status || existing.status };
}

export async function applyConnectTransferWebhook(eventType: string, object: Record<string, unknown>) {
    const metadata = (object.metadata || {}) as Record<string, string>;
    const payoutId = String(metadata.payoutId || "").trim();
    const stripeId = String(object.id || "").trim();
    let status: string | undefined;
    if (eventType === "transfer.created") status = "processing";
    if (eventType === "transfer.reversed") status = "failed";
    return updatePayoutFromWebhook({
        payoutId,
        status,
        stripeObjectId: stripeId,
        eventType,
        extraMetadata: { stripeTransferId: stripeId },
    });
}

export async function applyConnectPayoutWebhook(eventType: string, object: Record<string, unknown>) {
    const metadata = (object.metadata || {}) as Record<string, string>;
    const payoutId = String(metadata.payoutId || "").trim();
    const stripeId = String(object.id || "").trim();
    let status: string | undefined;
    if (eventType === "payout.paid") status = "paid";
    if (eventType === "payout.failed") status = "failed";
    if (eventType === "payout.canceled") status = "canceled";
    return updatePayoutFromWebhook({
        payoutId,
        status,
        stripeObjectId: stripeId,
        eventType,
        extraMetadata: { stripePayoutId: stripeId },
    });
}
