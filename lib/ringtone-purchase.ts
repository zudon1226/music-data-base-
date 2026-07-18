/**
 * Ringtone Platform Phase 3 purchase foundation.
 * Amounts, fees, and product status are always resolved server-side.
 */

import { randomUUID } from "node:crypto";
import { PUBLIC_RINGTONE_STATUSES } from "@/lib/ringtone-constants";
import {
    getErrorMessage,
    getSupabaseServerClient,
    isPlatformOwnerUserId,
    isUuid,
} from "@/lib/server-supabase";

async function resolvePurchaseRevisionFields(ringtoneId: string) {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
        .from("ringtone_products")
        .select("id,current_revision_id,revision_number")
        .eq("id", ringtoneId)
        .maybeSingle();
    return {
        revision_id: data?.current_revision_id || null,
        revision_number: data?.revision_number != null ? Number(data.revision_number) : null,
    };
}

/** Match beat sale split: 90% creator / 10% platform. */
export const RINGTONE_CREATOR_SHARE_PERCENT = 90;
export const RINGTONE_PLATFORM_SHARE_PERCENT = 10;

export type RingtonePurchaseSplit = {
    amountCents: number;
    platformFeeCents: number;
    creatorEarningsCents: number;
    currency: string;
};

export function calculateRingtonePurchaseSplit(amountCents: number, currency = "USD"): RingtonePurchaseSplit {
    const safeAmount = Math.max(0, Math.round(Number(amountCents) || 0));
    const platformFeeCents = Math.round(safeAmount * (RINGTONE_PLATFORM_SHARE_PERCENT / 100));
    const creatorEarningsCents = safeAmount - platformFeeCents;
    return {
        amountCents: safeAmount,
        platformFeeCents,
        creatorEarningsCents,
        currency: String(currency || "USD").trim().toUpperCase() || "USD",
    };
}

export function isRingtonePaymentsTestModeEnabled() {
    return process.env.RINGTONE_PAYMENTS_TEST_MODE === "1";
}

/** Live Stripe checkout requires both secret and webhook secret in production. */
export function isRingtoneLivePaymentsConfigured() {
    const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
    const webhook = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    return Boolean(secret && webhook && !secret.includes("your-") && !webhook.includes("your-"));
}

/**
 * Paid ringtone purchasing mode for production safety reporting.
 * - live: Stripe credentials configured
 * - test-only: RINGTONE_PAYMENTS_TEST_MODE=1 without live Stripe
 * - safely-disabled: neither live nor test; paid intents must not complete
 */
export function getRingtonePaymentMode(): "live" | "test-only" | "safely-disabled" {
    if (isRingtoneLivePaymentsConfigured()) return "live";
    if (isRingtonePaymentsTestModeEnabled()) return "test-only";
    return "safely-disabled";
}

export function canStartPaidRingtonePurchase() {
    return getRingtonePaymentMode() !== "safely-disabled";
}

/** Paid intents for normal buyers require live Stripe or global test mode. */
export async function canBuyerStartPaidRingtonePurchase(buyerId: string) {
    if (canStartPaidRingtonePurchase()) return true;
    // Owner-only development checkout when Stripe is not configured.
    return isPlatformOwnerUserId(buyerId);
}

/** Test-provider completion: global test mode, or platform owner only. */
export async function canBuyerUseRingtoneTestCheckout(buyerId: string) {
    if (isRingtonePaymentsTestModeEnabled()) return true;
    return isPlatformOwnerUserId(buyerId);
}

export function isPurchasableRingtoneStatus(status: unknown) {
    return (PUBLIC_RINGTONE_STATUSES as readonly string[]).includes(String(status || ""));
}

export async function loadPurchasableRingtone(ringtoneId: string) {
    if (!isUuid(ringtoneId)) return { ok: false as const, error: "Invalid ringtone id.", status: 400 };
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("ringtone_products")
        .select("id,creator_id,title,artwork_url,preview_url,price_cents,currency,status,is_featured,is_explicit,duration_seconds,clip_start_seconds,clip_end_seconds,source_song_id,description,published_at,created_at")
        .eq("id", ringtoneId)
        .maybeSingle();
    if (error) return { ok: false as const, error: getErrorMessage(error), status: 500 };
    if (!data) return { ok: false as const, error: "Ringtone not found.", status: 404 };
    if (!isPurchasableRingtoneStatus(data.status)) {
        return { ok: false as const, error: "This ringtone is not available for purchase.", status: 403, code: "NOT_PURCHASABLE" };
    }
    return { ok: true as const, ringtone: data };
}

export async function findPaidRingtonePurchase(buyerId: string, ringtoneId: string) {
    if (!isUuid(buyerId) || !isUuid(ringtoneId)) return null;
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
        .from("ringtone_purchases")
        .select("*")
        .eq("buyer_id", buyerId)
        .eq("ringtone_id", ringtoneId)
        .eq("payment_status", "paid")
        .maybeSingle();
    return data || null;
}

export async function findPurchaseByIdempotency(buyerId: string, ringtoneId: string, idempotencyKey: string) {
    if (!idempotencyKey || !isUuid(buyerId) || !isUuid(ringtoneId)) return null;
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
        .from("ringtone_purchases")
        .select("*")
        .eq("buyer_id", buyerId)
        .eq("ringtone_id", ringtoneId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
    return data || null;
}

export async function createRingtonePurchaseIntent(input: {
    buyerId: string;
    ringtoneId: string;
    idempotencyKey?: string;
}) {
    const product = await loadPurchasableRingtone(input.ringtoneId);
    if (!product.ok) return product;

    const existingPaid = await findPaidRingtonePurchase(input.buyerId, input.ringtoneId);
    if (existingPaid) {
        return {
            ok: true as const,
            alreadyOwned: true as const,
            purchase: existingPaid,
            ringtone: product.ringtone,
        };
    }

    const idempotencyKey = String(input.idempotencyKey || "").trim() || `intent-${randomUUID()}`;
    const existingIntent = await findPurchaseByIdempotency(input.buyerId, input.ringtoneId, idempotencyKey);
    if (existingIntent) {
        return {
            ok: true as const,
            alreadyOwned: existingIntent.payment_status === "paid",
            purchase: existingIntent,
            ringtone: product.ringtone,
            idempotentReplay: true as const,
        };
    }

    const split = calculateRingtonePurchaseSplit(
        Number(product.ringtone.price_cents) || 0,
        String(product.ringtone.currency || "USD"),
    );
    const isFree = split.amountCents === 0;
    if (!isFree && !(await canBuyerStartPaidRingtonePurchase(input.buyerId))) {
        return {
            ok: false as const,
            error: "Paid ringtone purchasing is coming soon. Purchasing is currently unavailable.",
            status: 503,
            code: "PURCHASING_UNAVAILABLE",
            paymentMode: getRingtonePaymentMode(),
        };
    }
    const supabase = getSupabaseServerClient();
    const revisionFields = isFree
        ? await resolvePurchaseRevisionFields(product.ringtone.id)
        : { revision_id: null as string | null, revision_number: null as number | null };
    const row = {
        ringtone_id: product.ringtone.id,
        buyer_id: input.buyerId,
        creator_id: product.ringtone.creator_id,
        amount_cents: split.amountCents,
        platform_fee_cents: split.platformFeeCents,
        creator_earnings_cents: split.creatorEarningsCents,
        currency: split.currency,
        payment_status: isFree ? "paid" : "pending",
        payment_provider: isFree ? "platform_free" : "pending_provider",
        payment_reference: isFree ? `free-${randomUUID()}` : "",
        idempotency_key: idempotencyKey,
        purchased_at: new Date().toISOString(),
        revision_id: revisionFields.revision_id,
        revision_number: revisionFields.revision_number,
    };

    const { data, error } = await supabase
        .from("ringtone_purchases")
        .insert(row)
        .select("*")
        .single();

    if (error) {
        // Race: another paid row may have landed.
        const paid = await findPaidRingtonePurchase(input.buyerId, input.ringtoneId);
        if (paid) {
            return { ok: true as const, alreadyOwned: true as const, purchase: paid, ringtone: product.ringtone };
        }
        const replay = await findPurchaseByIdempotency(input.buyerId, input.ringtoneId, idempotencyKey);
        if (replay) {
            return {
                ok: true as const,
                alreadyOwned: replay.payment_status === "paid",
                purchase: replay,
                ringtone: product.ringtone,
                idempotentReplay: true as const,
            };
        }
        return { ok: false as const, error: getErrorMessage(error), status: 500 };
    }

    return {
        ok: true as const,
        alreadyOwned: isFree,
        freeAcquisition: isFree,
        purchase: data,
        ringtone: product.ringtone,
        requiresPayment: !isFree,
    };
}

/**
 * Confirm a pending paid purchase.
 * Production paid completion requires verified provider reference.
 * Test-mode completion requires RINGTONE_PAYMENTS_TEST_MODE=1 (never implicit in prod).
 */
export async function confirmRingtonePurchasePayment(input: {
    buyerId: string;
    purchaseId: string;
    provider: "test" | "stripe" | string;
    paymentReference?: string;
    outcome?: "paid" | "failed" | "cancelled";
}) {
    if (!isUuid(input.buyerId) || !isUuid(input.purchaseId)) {
        return { ok: false as const, error: "Invalid purchase or buyer id.", status: 400 };
    }

    const supabase = getSupabaseServerClient();
    const existing = await supabase
        .from("ringtone_purchases")
        .select("*")
        .eq("id", input.purchaseId)
        .eq("buyer_id", input.buyerId)
        .maybeSingle();
    if (existing.error) return { ok: false as const, error: getErrorMessage(existing.error), status: 500 };
    if (!existing.data) return { ok: false as const, error: "Purchase not found.", status: 404 };

    if (existing.data.payment_status === "paid") {
        return { ok: true as const, purchase: existing.data, alreadyOwned: true as const };
    }
    if (!["pending", "failed"].includes(String(existing.data.payment_status))) {
        return { ok: false as const, error: `Purchase cannot be confirmed from status ${existing.data.payment_status}.`, status: 409 };
    }

    const outcome = input.outcome || "paid";
    if (outcome !== "paid") {
        const { data, error } = await supabase
            .from("ringtone_purchases")
            .update({
                payment_status: outcome === "cancelled" ? "cancelled" : "failed",
                failure_reason: outcome === "cancelled" ? "Payment canceled by buyer." : "Payment failed.",
                payment_provider: String(input.provider || existing.data.payment_provider || ""),
                payment_reference: String(input.paymentReference || existing.data.payment_reference || ""),
            })
            .eq("id", input.purchaseId)
            .eq("buyer_id", input.buyerId)
            .select("*")
            .single();
        if (error) return { ok: false as const, error: getErrorMessage(error), status: 500 };
        return { ok: true as const, purchase: data, alreadyOwned: false as const };
    }

    const provider = String(input.provider || "").trim().toLowerCase();
    const paymentReference = String(input.paymentReference || "").trim();

    if (provider === "test") {
        if (!(await canBuyerUseRingtoneTestCheckout(input.buyerId))) {
            return {
                ok: false as const,
                error: "Test-mode ringtone payments are disabled. Set RINGTONE_PAYMENTS_TEST_MODE=1 for isolated verification only.",
                status: 403,
                code: "TEST_MODE_DISABLED",
            };
        }
    } else if (!paymentReference) {
        return {
            ok: false as const,
            error: "Verified payment reference is required to complete a paid ringtone purchase.",
            status: 400,
            code: "PAYMENT_REFERENCE_REQUIRED",
        };
    }

    // Re-check product still purchasable before granting ownership.
    const product = await loadPurchasableRingtone(String(existing.data.ringtone_id));
    if (!product.ok) return product;

    const split = calculateRingtonePurchaseSplit(
        Number(product.ringtone.price_cents) || 0,
        String(product.ringtone.currency || existing.data.currency || "USD"),
    );
    const revisionFields = await resolvePurchaseRevisionFields(String(existing.data.ringtone_id));

    const { data, error } = await supabase
        .from("ringtone_purchases")
        .update({
            payment_status: "paid",
            payment_provider: provider || "verified_provider",
            payment_reference: paymentReference || `test-${randomUUID()}`,
            amount_cents: split.amountCents,
            platform_fee_cents: split.platformFeeCents,
            creator_earnings_cents: split.creatorEarningsCents,
            currency: split.currency,
            failure_reason: "",
            purchased_at: new Date().toISOString(),
            revision_id: revisionFields.revision_id,
            revision_number: revisionFields.revision_number,
        })
        .eq("id", input.purchaseId)
        .eq("buyer_id", input.buyerId)
        .select("*")
        .single();

    if (error) {
        const paid = await findPaidRingtonePurchase(input.buyerId, String(existing.data.ringtone_id));
        if (paid) return { ok: true as const, purchase: paid, alreadyOwned: true as const };
        return { ok: false as const, error: getErrorMessage(error), status: 500 };
    }

    return { ok: true as const, purchase: data, alreadyOwned: false as const };
}
