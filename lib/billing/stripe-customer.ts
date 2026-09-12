/**
 * Server-side Stripe Customer create/reuse (no card data stored in Supabase).
 */

import { isStripeLiveConfigured, stripeFormGet, stripeFormPost } from "@/lib/billing/providers/stripe-rest";

export type EnsureStripeCustomerInput = {
    userId: string;
    email?: string;
    existingCustomerId?: string | null;
};

/** Reuse an existing Stripe Customer or create one with user metadata. */
export async function ensureStripeCustomer(input: EnsureStripeCustomerInput): Promise<string> {
    if (!isStripeLiveConfigured()) {
        throw new Error("Stripe is not configured.");
    }

    const existing = String(input.existingCustomerId || "").trim();
    if (existing.startsWith("cus_")) {
        try {
            const customer = await stripeFormGet(`customers/${existing}`);
            if (customer && !customer.deleted) {
                return existing;
            }
        } catch {
            // Fall through to create a fresh customer.
        }
    }

    const params: Record<string, string> = {
        "metadata[userId]": input.userId,
    };
    const email = String(input.email || "").trim();
    if (email) params.email = email;

    const created = await stripeFormPost("customers", params);
    const customerId = String(created.id || "").trim();
    if (!customerId.startsWith("cus_")) {
        throw new Error("Stripe customer creation did not return a customer id.");
    }
    return customerId;
}
