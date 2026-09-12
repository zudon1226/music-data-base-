/**

 * Sponsor payment fulfillment — platform revenue ONLY.

 * NEVER writes to earnings_events, payouts, or Connect transfers.

 */



import { applyPlatformRevenueRefund, recordPlatformRevenue } from "@/lib/platform-revenue";

import {

    resolveSponsorApplicationAfterCheckoutExpired,

    resolveSponsorApplicationAfterPaymentFailure,

    resolveSponsorApplicationAfterRefund,

} from "@/lib/sponsor-payment-state.mjs";

import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";



export async function recordSponsorPaymentIdempotency(input: {

    provider: string;

    providerEventId: string;

    sessionId?: string;

    applicationId?: string;

    payload: unknown;

}) {

    const supabase = getSupabaseServerClient();

    const { error } = await supabase.from("sponsor_payment_events").insert({

        provider: input.provider,

        provider_event_id: input.providerEventId,

        provider_checkout_session_id: input.sessionId || null,

        application_id: input.applicationId && isUuid(input.applicationId) ? input.applicationId : null,

        payload: input.payload as Record<string, unknown>,

    });

    if (error && !/duplicate|unique/i.test(error.message || "")) {

        throw new Error(getErrorMessage(error));

    }

    return !error;

}



export async function completeSponsorPaymentFromStripeSession(input: {

    userId: string;

    applicationId: string;

    providerPaymentId: string;

    providerCheckoutSessionId?: string;

    providerPaymentIntentId?: string;

}) {

    if (!isUuid(input.userId) || !isUuid(input.applicationId)) {

        return { ok: false as const, error: "Invalid sponsor payment metadata." };

    }



    const supabase = getSupabaseServerClient();

    const { data: existing, error: loadError } = await supabase

        .from("sponsor_applications")

        .select("*")

        .eq("id", input.applicationId)

        .eq("user_id", input.userId)

        .maybeSingle();

    if (loadError) throw new Error(getErrorMessage(loadError));

    if (!existing) return { ok: false as const, error: "Sponsor application not found." };



    if (existing.payment_status === "paid") {

        return { ok: true as const, alreadyPaid: true, application: existing };

    }



    const amountCents = Math.max(0, Number(existing.amount_cents) || 0);

    const paymentReference = String(input.providerPaymentId || input.providerCheckoutSessionId || "").trim();

    const now = new Date().toISOString();



    const scheduledStart = existing.scheduled_start_at || existing.campaign_start_preference

        ? String(existing.scheduled_start_at || existing.campaign_start_preference)

        : now;

    const scheduledEnd = existing.scheduled_end_at || existing.campaign_end_preference || null;



    const nextStatus = scheduledStart && new Date(scheduledStart) > new Date()

        ? "scheduled"

        : "active";



    const { data: updated, error: updateError } = await supabase

        .from("sponsor_applications")

        .update({

            payment_status: "paid",

            status: nextStatus,

            provider_payment_reference: paymentReference,

            provider_checkout_session_id: input.providerCheckoutSessionId || existing.provider_checkout_session_id,

            provider_payment_intent_id: input.providerPaymentIntentId || existing.provider_payment_intent_id,

            activated_at: nextStatus === "active" ? now : existing.activated_at,

            scheduled_start_at: scheduledStart,

            scheduled_end_at: scheduledEnd,

        })

        .eq("id", input.applicationId)

        .select("*")

        .single();

    if (updateError) throw new Error(getErrorMessage(updateError));



    await recordPlatformRevenue({

        sourceType: "sponsor",

        sourceId: input.applicationId,

        grossAmountCents: amountCents,

        netAmountCents: amountCents,

        currency: String(updated.currency || "USD"),

        paymentProvider: "stripe",

        paymentReference,

        metadata: {

            userId: input.userId,

            businessName: updated.business_name,

            packageId: updated.package_id,

            flow: "sponsor_checkout",

        },

    });



    return { ok: true as const, alreadyPaid: false, application: updated };

}



export async function markSponsorPaymentFailed(input: {

    applicationId: string;

    userId?: string;

    reason?: string;

}) {

    if (!isUuid(input.applicationId)) return { ok: false as const, ignored: true };



    const supabase = getSupabaseServerClient();

    const { data: app, error: loadError } = await supabase

        .from("sponsor_applications")

        .select("*")

        .eq("id", input.applicationId)

        .maybeSingle();

    if (loadError) throw new Error(getErrorMessage(loadError));

    if (!app) return { ok: true as const, ignored: true };



    const resolved = resolveSponsorApplicationAfterPaymentFailure({

        previousStatus: app.status,

        previousPaymentStatus: app.payment_status,

    });

    if (!resolved.allowRetry && String(app.payment_status) === "paid") {

        return { ok: true as const, ignored: true, alreadyPaid: true };

    }



    let query = supabase

        .from("sponsor_applications")

        .update({

            payment_status: resolved.payment_status,

            status: resolved.status,

        })

        .eq("id", input.applicationId)

        .neq("payment_status", "paid");

    if (input.userId && isUuid(input.userId)) query = query.eq("user_id", input.userId);

    const { error } = await query;

    if (error) throw new Error(getErrorMessage(error));



    return { ok: true as const, failed: true, publiclyActive: resolved.publiclyActive };

}



export async function handleSponsorCheckoutExpired(input: {

    applicationId: string;

    userId?: string;

    providerCheckoutSessionId?: string;

}) {

    if (!isUuid(input.applicationId)) return { ok: true as const, ignored: true };



    const supabase = getSupabaseServerClient();

    const { data: app, error: loadError } = await supabase

        .from("sponsor_applications")

        .select("*")

        .eq("id", input.applicationId)

        .maybeSingle();

    if (loadError) throw new Error(getErrorMessage(loadError));

    if (!app) return { ok: true as const, ignored: true };



    const resolved = resolveSponsorApplicationAfterCheckoutExpired({

        previousStatus: app.status,

        previousPaymentStatus: app.payment_status,

    });

    if (!resolved.changed) {

        return { ok: true as const, ignored: true, alreadyPaid: true };

    }



    const updates: Record<string, unknown> = {

        payment_status: resolved.payment_status,

        status: resolved.status,

    };

    if (input.providerCheckoutSessionId) {

        updates.provider_checkout_session_id = input.providerCheckoutSessionId;

    }



    let query = supabase

        .from("sponsor_applications")

        .update(updates)

        .eq("id", input.applicationId)

        .neq("payment_status", "paid");

    if (input.userId && isUuid(input.userId)) query = query.eq("user_id", input.userId);

    const { error } = await query;

    if (error) throw new Error(getErrorMessage(error));



    return { ok: true as const, expired: true, publiclyActive: resolved.publiclyActive };

}



export async function handleSponsorRefund(input: {

    applicationId: string;

    paymentReference?: string;

    providerEventId?: string;

    refundAmountCents?: number;

}) {

    if (!isUuid(input.applicationId)) return { ok: true as const, ignored: true };



    const supabase = getSupabaseServerClient();

    const { data: app, error: loadError } = await supabase

        .from("sponsor_applications")

        .select("*")

        .eq("id", input.applicationId)

        .maybeSingle();

    if (loadError) throw new Error(getErrorMessage(loadError));

    if (!app) return { ok: true as const, ignored: true };



    const paymentReference = input.paymentReference || String(app.provider_payment_reference || "");

    const revenueResult = await applyPlatformRevenueRefund({

        sourceType: "sponsor",

        sourceId: input.applicationId,

        paymentReference,

        refundAmountCents: input.refundAmountCents,

        reason: "charge.refunded",

        providerEventId: input.providerEventId,

    });



    if (revenueResult.duplicate) {

        return { ok: true as const, refunded: false, duplicate: true };

    }

    if (!revenueResult.applied) {

        return { ok: true as const, refunded: false, ignored: true };

    }



    const resolved = resolveSponsorApplicationAfterRefund({

        amountCents: Number(app.amount_cents) || 0,

        cumulativeRefundedCents: revenueResult.cumulativeRefundedCents,

        previousStatus: app.status,

        previousPaymentStatus: app.payment_status,

    });



    const updates: Record<string, unknown> = {

        payment_status: resolved.payment_status,

        status: resolved.status,

    };

    if (resolved.fullRefund) {

        updates.scheduled_end_at = new Date().toISOString();

    }



    await supabase

        .from("sponsor_applications")

        .update(updates)

        .eq("id", input.applicationId);



    return {

        ok: true as const,

        refunded: true,

        duplicate: false,

        fullRefund: resolved.fullRefund,

        publiclyActive: resolved.publiclyActive,

        remainingPaidCents: resolved.remainingPaidCents,

    };

}


