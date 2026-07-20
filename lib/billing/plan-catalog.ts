import type { AccountSubscriptionAudience } from "@/lib/billing/constants";
import type { SubscriptionPlanRow } from "@/lib/billing/types";

export type ClientPlanSlug =
    | "free-listener"
    | "premium-listener"
    | "creator-free"
    | "artist-pro"
    | "producer-pro";

export type ClientPlanDefinition = {
    slug: ClientPlanSlug;
    names: string[];
    audience: AccountSubscriptionAudience | "creator";
    priceCents: number;
};

/** Canonical marketing plan slugs → approved DB plan names / audiences. */
export const CLIENT_SUBSCRIPTION_PLANS: Record<ClientPlanSlug, ClientPlanDefinition> = {
    "free-listener": {
        slug: "free-listener",
        names: ["Free Listener"],
        audience: "listener",
        priceCents: 0,
    },
    "premium-listener": {
        slug: "premium-listener",
        names: ["Premium Listener", "Listener Monthly"],
        audience: "listener",
        priceCents: 699,
    },
    "creator-free": {
        slug: "creator-free",
        names: ["Creator Free"],
        audience: "creator",
        priceCents: 0,
    },
    "artist-pro": {
        slug: "artist-pro",
        names: ["Artist Pro", "Artist Monthly"],
        audience: "artist",
        priceCents: 999,
    },
    "producer-pro": {
        slug: "producer-pro",
        names: ["Producer Pro", "Producer Monthly"],
        audience: "producer",
        priceCents: 1499,
    },
};

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
    const matches = plans.filter((plan) => nameSet.has(String(plan.name || "").toLowerCase()));
    if (!matches.length) return null;
    // Prefer exact price match to approved catalog amount when duplicates exist.
    const priced = matches.find((plan) => Number(plan.price_cents || 0) === def.priceCents);
    return priced || matches[0];
}

export function clientSlugForPlanName(planName: string, priceCents: number) {
    const name = String(planName || "").trim().toLowerCase();
    for (const def of Object.values(CLIENT_SUBSCRIPTION_PLANS)) {
        if (def.names.some((n) => n.toLowerCase() === name) && def.priceCents === Number(priceCents || 0)) {
            return def.slug;
        }
        if (def.names.some((n) => n.toLowerCase() === name) && def.priceCents === 0 && Number(priceCents || 0) === 0) {
            return def.slug;
        }
    }
    // Paid monthly aliases without exact cents still map by name.
    for (const def of Object.values(CLIENT_SUBSCRIPTION_PLANS)) {
        if (def.names.some((n) => n.toLowerCase() === name)) return def.slug;
    }
    return null;
}
