/**

 * Resolves Stripe Price IDs for subscription plans.

 * Priority: subscription_plans.stripe_price_id → env fallback by plan slug.

 */



import type { SubscriptionPlanRow } from "@/lib/billing/types";

import { clientSlugForPlanName } from "@/lib/billing/plan-catalog";



const ENV_BY_SLUG: Record<string, string> = {

    "premium-listener": "STRIPE_PRICE_ID_LISTENER_MONTHLY",

    "artist-pro": "STRIPE_PRICE_ID_ARTIST_MONTHLY",

    "artist-pro-annual": "STRIPE_PRICE_ID_ARTIST_ANNUAL",

    "producer-pro": "STRIPE_PRICE_ID_PRODUCER_MONTHLY",

    "producer-pro-annual": "STRIPE_PRICE_ID_PRODUCER_ANNUAL",

};



/** Approved Stripe Product/Price mapping for subscription plans. */

export const STRIPE_SUBSCRIPTION_PRODUCT_CATALOG = {

    listenerMonthly: {

        planNames: ["Premium Listener", "Listener Monthly"],

        priceCents: 699,

        billingInterval: "month" as const,

        envPriceId: "STRIPE_PRICE_ID_LISTENER_MONTHLY",

    },

    artistMonthly: {

        planNames: ["Artist Pro", "Artist Monthly"],

        priceCents: 999,

        billingInterval: "month" as const,

        envPriceId: "STRIPE_PRICE_ID_ARTIST_MONTHLY",

    },

    artistAnnual: {

        planNames: ["Artist Annual"],

        priceCents: 9999,

        billingInterval: "year" as const,

        envPriceId: "STRIPE_PRICE_ID_ARTIST_ANNUAL",

    },

    producerMonthly: {

        planNames: ["Producer Pro", "Producer Monthly"],

        priceCents: 1499,

        billingInterval: "month" as const,

        envPriceId: "STRIPE_PRICE_ID_PRODUCER_MONTHLY",

    },

    producerAnnual: {

        planNames: ["Producer Annual"],

        priceCents: 14999,

        billingInterval: "year" as const,

        envPriceId: "STRIPE_PRICE_ID_PRODUCER_ANNUAL",

    },

} as const;



export function resolveStripePriceIdForPlan(plan: SubscriptionPlanRow): string | null {

    const fromDb = String(plan.stripe_price_id || "").trim();

    if (fromDb.startsWith("price_")) return fromDb;



    const slug = clientSlugForPlanName(plan.name, plan.price_cents, plan.billing_interval);

    if (!slug) return null;



    const envKey = ENV_BY_SLUG[slug];

    if (!envKey) return null;



    const fromEnv = String(process.env[envKey] || "").trim();

    return fromEnv.startsWith("price_") ? fromEnv : null;

}

