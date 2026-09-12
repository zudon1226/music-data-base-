import type { AccountSubscriptionAudience } from "@/lib/billing/constants";
import type { SubscriptionPlanRow } from "@/lib/billing/types";

export type ClientPlanSlug =
    | "free-listener"
    | "premium-listener"
    | "creator-free"
    | "artist-pro"
    | "artist-pro-annual"
    | "producer-pro"
    | "producer-pro-annual";

export type ClientPlanDefinition = {
    slug: ClientPlanSlug;
    names: string[];
    /** User-facing label — never an internal DB alias name. */
    displayLabel: string;
    audience: AccountSubscriptionAudience | "creator";
    priceCents: number;
    billingInterval: "month" | "year" | "one_time";
};

/** Canonical marketing plan slugs → approved DB plan names / audiences. */
export const CLIENT_SUBSCRIPTION_PLANS: Record<ClientPlanSlug, ClientPlanDefinition> = {
    "free-listener": {
        slug: "free-listener",
        names: ["Free Listener"],
        displayLabel: "Free Listener",
        audience: "listener",
        priceCents: 0,
        billingInterval: "month",
    },
    "premium-listener": {
        slug: "premium-listener",
        names: ["Premium Listener", "Listener Monthly"],
        displayLabel: "Listener",
        audience: "listener",
        priceCents: 699,
        billingInterval: "month",
    },
    "creator-free": {
        slug: "creator-free",
        names: ["Creator Free"],
        displayLabel: "Creator Free",
        audience: "creator",
        priceCents: 0,
        billingInterval: "month",
    },
    "artist-pro": {
        slug: "artist-pro",
        names: ["Artist Pro", "Artist Monthly"],
        displayLabel: "Artist",
        audience: "artist",
        priceCents: 999,
        billingInterval: "month",
    },
    "artist-pro-annual": {
        slug: "artist-pro-annual",
        names: ["Artist Annual"],
        displayLabel: "Artist Annual",
        audience: "artist",
        priceCents: 9999,
        billingInterval: "year",
    },
    "producer-pro": {
        slug: "producer-pro",
        names: ["Producer Pro", "Producer Monthly"],
        displayLabel: "Producer",
        audience: "producer",
        priceCents: 1499,
        billingInterval: "month",
    },
    "producer-pro-annual": {
        slug: "producer-pro-annual",
        names: ["Producer Annual"],
        displayLabel: "Producer Annual",
        audience: "producer",
        priceCents: 14999,
        billingInterval: "year",
    },
};

/** Paid tiers shown per account audience (aliases collapse to one slug each). */
export const PAID_CLIENT_PLAN_SLUGS_BY_AUDIENCE: Record<AccountSubscriptionAudience, ClientPlanSlug[]> = {
    listener: ["premium-listener"],
    artist: ["artist-pro", "artist-pro-annual"],
    producer: ["producer-pro", "producer-pro-annual"],
};

export type PresentableSubscriptionPlan = SubscriptionPlanRow & {
    clientSlug: ClientPlanSlug;
    displayName: string;
};

export function clientPlanDisplayLabel(slug: ClientPlanSlug) {
    return CLIENT_SUBSCRIPTION_PLANS[slug].displayLabel;
}

/** One user-facing paid plan per logical slug; DB alias rows merge via matchPlanBySlug. */
export function resolvePresentablePaidPlans(
    plans: SubscriptionPlanRow[],
    audience: AccountSubscriptionAudience,
): PresentableSubscriptionPlan[] {
    const slugs = PAID_CLIENT_PLAN_SLUGS_BY_AUDIENCE[audience] || [];
    const presentable: PresentableSubscriptionPlan[] = [];
    for (const slug of slugs) {
        const matched = matchPlanBySlug(plans, slug);
        if (!matched || Number(matched.price_cents || 0) <= 0) continue;
        presentable.push({
            ...matched,
            clientSlug: slug,
            displayName: CLIENT_SUBSCRIPTION_PLANS[slug].displayLabel,
        });
    }
    return presentable;
}

export function isClientPlanSlug(value: string): value is ClientPlanSlug {
    return Object.prototype.hasOwnProperty.call(CLIENT_SUBSCRIPTION_PLANS, value);
}

export function assertAudienceMaySelectPlan(
    audience: AccountSubscriptionAudience,
    planAudience: string,
) {
    const plan = String(planAudience || "").toLowerCase();
    if (audience === "listener" && plan === "listener") return;
    if (audience === "artist" && (plan === "artist" || plan === "creator")) return;
    if (audience === "producer" && (plan === "producer" || plan === "creator")) return;
    throw new Error("Plan audience does not match account type.");
}

export function matchPlanBySlug(plans: SubscriptionPlanRow[], slug: string) {
    if (!isClientPlanSlug(slug)) return null;
    const def = CLIENT_SUBSCRIPTION_PLANS[slug];
    const nameSet = new Set(def.names.map((name) => name.toLowerCase()));
    const matches = plans.filter((plan) =>
        nameSet.has(String(plan.name || "").toLowerCase())
        && String(plan.billing_interval || "month").toLowerCase() === def.billingInterval,
    );
    if (!matches.length) return null;
    // Prefer exact price match to approved catalog amount when duplicates exist.
    const priced = matches.find((plan) => Number(plan.price_cents || 0) === def.priceCents);
    return priced || matches[0];
}

export function clientSlugForPlanName(planName: string, priceCents: number, billingInterval?: string) {
    const name = String(planName || "").trim().toLowerCase();
    const interval = String(billingInterval || "month").trim().toLowerCase();
    for (const def of Object.values(CLIENT_SUBSCRIPTION_PLANS)) {
        if (def.billingInterval !== interval) continue;
        if (def.names.some((n) => n.toLowerCase() === name) && def.priceCents === Number(priceCents || 0)) {
            return def.slug;
        }
        if (def.names.some((n) => n.toLowerCase() === name) && def.priceCents === 0 && Number(priceCents || 0) === 0) {
            return def.slug;
        }
    }
    for (const def of Object.values(CLIENT_SUBSCRIPTION_PLANS)) {
        if (def.billingInterval !== interval) continue;
        if (def.names.some((n) => n.toLowerCase() === name)) return def.slug;
    }
    return null;
}
