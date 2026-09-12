/**
 * Stripe Checkout for sponsor campaigns — 100% platform revenue.
 * No Connect destination, no transfer_data, no creator earnings.
 */

import { createStripeOneTimeCheckoutSession } from "@/lib/billing/providers/stripe-provider";
import { isStripeLiveConfigured } from "@/lib/billing/providers/stripe-rest";
import {
    assertSponsorCheckoutAllowed,
    getPublicBetaSponsorCheckoutMessage,
} from "@/lib/public-beta-sponsor-checkout";
import { SPONSOR_CHECKOUT_FLOW } from "@/lib/sponsor-constants";
import { getSponsorApplication, prepareSponsorCheckoutApplication } from "@/lib/sponsor-service";
import { getErrorMessage, getPublicSiteUrl, isUuid } from "@/lib/server-supabase";

export type StartSponsorStripeCheckoutInput = {
    userId: string;
    applicationId: string;
    successUrl?: string;
    cancelUrl?: string;
    customerEmail?: string;
};

export async function startSponsorStripeCheckout(input: StartSponsorStripeCheckoutInput) {
    if (!isUuid(input.userId) || !isUuid(input.applicationId)) {
        return { ok: false as const, status: 400, error: "Invalid user or application id." };
    }

    const lock = await assertSponsorCheckoutAllowed(input.userId);
    if (!lock.ok) {
        return {
            ok: false as const,
            status: lock.status,
            error: lock.error,
            code: lock.code,
        };
    }

    if (!isStripeLiveConfigured()) {
        return { ok: false as const, status: 503, error: "Stripe checkout is not configured.", code: "STRIPE_NOT_CONFIGURED" };
    }

    const application = await prepareSponsorCheckoutApplication(input.applicationId, input.userId);
    const amountCents = Math.max(0, Number(application.amount_cents) || 0);
    if (amountCents <= 0) {
        return { ok: false as const, status: 400, error: "Invalid sponsor amount.", code: "INVALID_AMOUNT" };
    }

    const base = getPublicSiteUrl().replace(/\/+$/, "");
    const successUrl = String(input.successUrl || "").trim() || `${base}/?sponsorCheckout=success`;
    const cancelUrl = String(input.cancelUrl || "").trim() || `${base}/?sponsorCheckout=cancel`;

    let session;
    try {
        session = await createStripeOneTimeCheckoutSession({
            userId: input.userId,
            successUrl,
            cancelUrl,
            customerEmail: input.customerEmail,
            clientReferenceId: String(application.id),
            lines: [{
                name: `Sponsorship — ${String(application.business_name || "Campaign").slice(0, 80)}`,
                amountCents,
                currency: String(application.currency || "USD"),
            }],
            metadata: {
                flow: SPONSOR_CHECKOUT_FLOW,
                userId: input.userId,
                applicationId: String(application.id),
                packageId: String(application.package_id || ""),
                purpose: "sponsor",
            },
        });
    } catch (error) {
        return { ok: false as const, status: 500, error: getErrorMessage(error) };
    }

    const { getSupabaseServerClient } = await import("@/lib/server-supabase");
    const supabase = getSupabaseServerClient();
    await supabase
        .from("sponsor_applications")
        .update({ provider_checkout_session_id: session.sessionId })
        .eq("id", application.id);

    return {
        ok: true as const,
        checkoutUrl: session.checkoutUrl,
        sessionId: session.sessionId,
        application,
        amountCents,
        betaLocked: false,
    };
}

export async function getSponsorCheckoutPreview(applicationId: string, userId: string) {
    const lock = await assertSponsorCheckoutAllowed(userId);
    const app = await getSponsorApplication(applicationId, userId);
    if (!app) return { ok: false as const, error: "Application not found." };
    return {
        ok: true as const,
        application: app,
        checkoutLocked: !lock.ok,
        checkoutMessage: lock.ok ? null : getPublicBetaSponsorCheckoutMessage(),
    };
}
