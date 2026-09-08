/**
 * Stripe Connect Express onboarding for Artist/Producer payouts.
 * Only Stripe account IDs and sync flags are stored — never bank/identity data.
 */

import { stripeFormGet, stripeFormPost, isStripeLiveConfigured } from "@/lib/billing/providers/stripe-rest";
import { assertStripeTestModeOnly } from "@/lib/billing/stripe-safety";
import { getErrorMessage, getPublicSiteUrl, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type CreatorPaymentProfile = {
    id: string;
    user_id: string;
    creator_type: string;
    stripe_connect_account_id: string | null;
    onboarding_status: string;
    payouts_enabled: boolean;
    charges_enabled: boolean;
    details_submitted: boolean;
    requirements_due: unknown;
    last_synced_at: string | null;
};

export type ConnectOnboardingStatus = {
    profile: CreatorPaymentProfile | null;
    connectConfigured: boolean;
    onboardingComplete: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
};

function mapStripeAccountStatus(account: Record<string, unknown>) {
    const payoutsEnabled = account.payouts_enabled === true;
    const detailsSubmitted = account.details_submitted === true;
    const chargesEnabled = account.charges_enabled === true;
    const disabledReason = String((account.requirements as { disabled_reason?: string })?.disabled_reason || "");
    let onboardingStatus = "pending";
    if (disabledReason) onboardingStatus = "disabled";
    else if (payoutsEnabled && detailsSubmitted) onboardingStatus = "complete";
    else if (detailsSubmitted) onboardingStatus = "restricted";
    else if (account.id) onboardingStatus = "pending";
    const currentlyDue = (account.requirements as { currently_due?: string[] })?.currently_due || [];
    return {
        onboarding_status: onboardingStatus,
        payouts_enabled: payoutsEnabled,
        charges_enabled: chargesEnabled,
        details_submitted: detailsSubmitted,
        requirements_due: currentlyDue,
    };
}

export async function getCreatorPaymentProfile(userId: string, creatorType: string) {
    if (!isUuid(userId)) return null;
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
        .from("creator_payment_profiles")
        .select("*")
        .eq("user_id", userId)
        .eq("creator_type", creatorType)
        .maybeSingle();
    return (data || null) as CreatorPaymentProfile | null;
}

export async function syncConnectAccountFromStripe(input: {
    userId: string;
    creatorType: string;
    stripeAccountId: string;
}) {
    assertStripeTestModeOnly("Stripe Connect account sync");
    if (!isStripeLiveConfigured()) {
        throw new Error("Stripe is not configured.");
    }
    const account = await stripeFormGet(`accounts/${input.stripeAccountId}`);
    const mapped = mapStripeAccountStatus(account);
    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("creator_payment_profiles")
        .upsert({
            user_id: input.userId,
            creator_type: input.creatorType,
            stripe_connect_account_id: input.stripeAccountId,
            ...mapped,
            requirements_due: mapped.requirements_due,
            last_synced_at: now,
            updated_at: now,
        }, { onConflict: "user_id,creator_type" })
        .select("*")
        .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as CreatorPaymentProfile;
}

export async function ensureStripeConnectAccount(input: {
    userId: string;
    creatorType: "artist" | "producer";
    email?: string;
}) {
    assertStripeTestModeOnly("Stripe Connect account creation");
    if (!isStripeLiveConfigured()) {
        return { ok: false as const, status: 503, error: "Stripe Connect is not configured.", code: "STRIPE_NOT_CONFIGURED" };
    }

    const existing = await getCreatorPaymentProfile(input.userId, input.creatorType);
    if (existing?.stripe_connect_account_id) {
        const synced = await syncConnectAccountFromStripe({
            userId: input.userId,
            creatorType: input.creatorType,
            stripeAccountId: existing.stripe_connect_account_id,
        });
        return { ok: true as const, profile: synced, created: false };
    }

    const params: Record<string, string> = {
        "controller[fees][payer]": "application",
        "controller[losses][payments]": "application",
        "controller[stripe_dashboard][type]": "express",
        "metadata[userId]": input.userId,
        "metadata[creatorType]": input.creatorType,
        "capabilities[transfers][requested]": "true",
    };
    if (input.email) params.email = input.email;

    const account = await stripeFormPost("accounts", params);
    const accountId = String(account.id || "");
    if (!accountId.startsWith("acct_")) {
        throw new Error("Stripe Connect account creation failed.");
    }

    const profile = await syncConnectAccountFromStripe({
        userId: input.userId,
        creatorType: input.creatorType,
        stripeAccountId: accountId,
    });
    return { ok: true as const, profile, created: true };
}

export async function createConnectOnboardingLink(input: {
    userId: string;
    creatorType: "artist" | "producer";
    email?: string;
    returnUrl?: string;
    refreshUrl?: string;
}) {
    const ensured = await ensureStripeConnectAccount(input);
    if (!ensured.ok) return ensured;

    const base = getPublicSiteUrl().replace(/\/+$/, "");
    const returnUrl = input.returnUrl || `${base}/?connect=return&creatorType=${encodeURIComponent(input.creatorType)}`;
    const refreshUrl = input.refreshUrl || `${base}/?connect=refresh&creatorType=${encodeURIComponent(input.creatorType)}`;
    const accountId = String(ensured.profile.stripe_connect_account_id || "");

    const link = await stripeFormPost("account_links", {
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
    });

    return {
        ok: true as const,
        onboardingUrl: String(link.url || ""),
        profile: ensured.profile,
        stripeAccountId: accountId,
    };
}

export async function getConnectOnboardingStatus(userId: string, creatorType: string): Promise<ConnectOnboardingStatus> {
    const profile = await getCreatorPaymentProfile(userId, creatorType);
    if (profile?.stripe_connect_account_id && isStripeLiveConfigured()) {
        try {
            const synced = await syncConnectAccountFromStripe({
                userId,
                creatorType,
                stripeAccountId: profile.stripe_connect_account_id,
            });
            return {
                profile: synced,
                connectConfigured: isStripeLiveConfigured(),
                onboardingComplete: synced.onboarding_status === "complete",
                payoutsEnabled: synced.payouts_enabled === true,
                detailsSubmitted: synced.details_submitted === true,
                requirementsDue: Array.isArray(synced.requirements_due) ? synced.requirements_due.map(String) : [],
            };
        } catch {
            // Fall through to cached profile.
        }
    }
    return {
        profile,
        connectConfigured: isStripeLiveConfigured(),
        onboardingComplete: profile?.onboarding_status === "complete",
        payoutsEnabled: profile?.payouts_enabled === true,
        detailsSubmitted: profile?.details_submitted === true,
        requirementsDue: Array.isArray(profile?.requirements_due) ? profile!.requirements_due!.map(String) : [],
    };
}

export async function applyConnectAccountWebhook(account: Record<string, unknown>) {
    const metadata = (account.metadata || {}) as Record<string, string>;
    const userId = String(metadata.userId || "").trim();
    const creatorType = String(metadata.creatorType || "artist").trim();
    const accountId = String(account.id || "").trim();
    if (!isUuid(userId) || !accountId.startsWith("acct_")) {
        return { ok: true as const, ignored: true };
    }
    const profile = await syncConnectAccountFromStripe({ userId, creatorType, stripeAccountId: accountId });
    return { ok: true as const, profile };
}
