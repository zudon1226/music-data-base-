/**
 * Phase A: server-created Stripe Checkout for pending paid sales.
 * Does NOT confirm payment, complete sales, or grant entitlements.
 */

import {
  createStripeOneTimeCheckoutSession,
  type StripeOneTimeCheckoutResult,
} from "@/lib/billing/providers/stripe-provider";
import { isStripeLiveConfigured } from "@/lib/billing/providers/stripe-rest";
import {
  catalogItemToSalesRow,
  resolveSalesCatalogItem,
  type ResolvedSalesCatalogItem,
} from "@/lib/sales-catalog";
import { getErrorMessage, getPublicSiteUrl, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

const PURCHASE_TABLE = "purchase_history";

export type SalesCheckoutCartLine = {
  itemId?: unknown;
  item_id?: unknown;
  itemType?: unknown;
  item_type?: unknown;
  licenseType?: unknown;
  license_type?: unknown;
  priceCents?: unknown;
  price_cents?: unknown;
};

export type PendingSaleRow = {
  id: string;
  user_id: string;
  item_id: string;
  item_type: string;
  title: string;
  price_cents: number;
  currency: string;
  status: string;
  license_type?: string;
};

export type StartPaidSalesStripeCheckoutInput = {
  userId: string;
  cartItems: SalesCheckoutCartLine[];
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
};

export type StartPaidSalesStripeCheckoutResult =
  | {
    ok: true;
    checkoutUrl: string;
    sessionId: string;
    purchaseIds: string[];
    amountCents: number;
    currency: string;
    pendingCount: number;
    completedCount: 0;
    entitlementsGranted: false;
    paymentConfirmationRequired: true;
    providerBound: boolean;
    message: string;
  }
  | {
    ok: false;
    status: number;
    error: string;
    code?: string;
    serverPriceCents?: number;
    itemId?: string;
  };

function isMissingProviderColumnError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("payment_provider")
    || message.includes("provider_checkout_session_id")
    || message.includes("provider_payment_intent_id")
    || message.includes("payment_confirmed_at")
    || message.includes("schema cache")
    || message.includes("does not exist")
  );
}

/** Reject client attempts to reclassify paid catalog items as free. */
export function rejectClientPriceTamper(
  clientPrice: unknown,
  item: ResolvedSalesCatalogItem,
): { ok: true } | { ok: false; status: 400; error: string; code: string; serverPriceCents: number; itemId: string } {
  const numeric = Number(clientPrice);
  if (Number.isFinite(numeric) && numeric === 0 && !item.isFree) {
    return {
      ok: false,
      status: 400,
      error: "Client price cannot convert a paid catalog item into a free purchase.",
      code: "PRICE_TAMPER_REJECTED",
      serverPriceCents: item.priceCents,
      itemId: item.itemId,
    };
  }
  return { ok: true };
}

export function buildSalesCheckoutMetadata(input: {
  userId: string;
  purchaseIds: string[];
  amountCents: number;
  currency: string;
}) {
  return {
    userId: input.userId,
    purchaseIds: input.purchaseIds.join(",").slice(0, 500),
    amountCents: String(input.amountCents),
    currency: String(input.currency || "USD").toUpperCase(),
    flow: "sales_pending_checkout",
  };
}

/** Safe client-facing payload — never includes secrets or full provider objects. */
export function toSafeSalesCheckoutResponse(result: Extract<StartPaidSalesStripeCheckoutResult, { ok: true }>) {
  return {
    ok: true as const,
    checkoutUrl: result.checkoutUrl,
    sessionId: result.sessionId,
    purchaseIds: result.purchaseIds,
    amountCents: result.amountCents,
    currency: result.currency,
    pendingCount: result.pendingCount,
    completedCount: result.completedCount,
    entitlementsGranted: result.entitlementsGranted,
    paymentConfirmationRequired: result.paymentConfirmationRequired,
    providerBound: result.providerBound,
    message: result.message,
  };
}

function defaultCheckoutUrls() {
  const base = getPublicSiteUrl().replace(/\/+$/, "");
  return {
    successUrl: `${base}/?salesCheckout=success`,
    cancelUrl: `${base}/?salesCheckout=cancel`,
  };
}

export type SalesStripeCheckoutDeps = {
  isStripeConfigured: () => boolean;
  resolveCatalogItem: typeof resolveSalesCatalogItem;
  insertPendingPurchases: (
    userId: string,
    items: ResolvedSalesCatalogItem[],
  ) => Promise<{ ok: true; purchases: PendingSaleRow[] } | { ok: false; status: number; error: string }>;
  bindCheckoutSession: (input: {
    userId: string;
    purchaseIds: string[];
    sessionId: string;
    paymentIntentId?: string;
  }) => Promise<{ ok: true; providerBound: boolean } | { ok: false; status: number; error: string }>;
  createStripeSession: (input: {
    userId: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    lines: Array<{ name: string; amountCents: number; currency: string }>;
    metadata: Record<string, string>;
  }) => Promise<StripeOneTimeCheckoutResult>;
};

export function createDefaultSalesStripeCheckoutDeps(): SalesStripeCheckoutDeps {
  return {
    isStripeConfigured: isStripeLiveConfigured,
    resolveCatalogItem: resolveSalesCatalogItem,
    async insertPendingPurchases(userId, items) {
      const supabase = getSupabaseServerClient();
      const purchasedAt = new Date().toISOString();
      const purchaseRows = items.map((item) => ({
        ...catalogItemToSalesRow(userId, item),
        status: "pending",
        purchased_at: purchasedAt,
      }));
      const { data, error } = await supabase.from(PURCHASE_TABLE).insert(purchaseRows).select("*");
      if (error) {
        return { ok: false as const, status: 500, error: error.message || getErrorMessage(error) };
      }
      const purchases = (data || []).map((row) => ({
        id: String((row as Record<string, unknown>).id || ""),
        user_id: String((row as Record<string, unknown>).user_id || userId),
        item_id: String((row as Record<string, unknown>).item_id || ""),
        item_type: String((row as Record<string, unknown>).item_type || ""),
        title: String((row as Record<string, unknown>).title || "Untitled"),
        price_cents: Math.max(0, Number((row as Record<string, unknown>).price_cents || 0)),
        currency: String((row as Record<string, unknown>).currency || "USD"),
        status: String((row as Record<string, unknown>).status || "pending"),
        license_type: String((row as Record<string, unknown>).license_type || ""),
      }));
      if (purchases.some((purchase) => !isUuid(purchase.id) || purchase.status !== "pending")) {
        return { ok: false as const, status: 500, error: "Pending sale insert did not return pending rows." };
      }
      return { ok: true as const, purchases };
    },
    async bindCheckoutSession({ userId, purchaseIds, sessionId, paymentIntentId }) {
      const supabase = getSupabaseServerClient();
      const patch: Record<string, unknown> = {
        payment_provider: "stripe",
        provider_checkout_session_id: sessionId,
      };
      if (paymentIntentId) patch.provider_payment_intent_id = paymentIntentId;
      const { error } = await supabase
        .from(PURCHASE_TABLE)
        .update(patch)
        .eq("user_id", userId)
        .eq("status", "pending")
        .in("id", purchaseIds);
      if (error) {
        if (isMissingProviderColumnError(error)) {
          // Migration not applied yet — Stripe metadata still correlates purchase ids.
          return { ok: true as const, providerBound: false };
        }
        return { ok: false as const, status: 500, error: error.message || getErrorMessage(error) };
      }
      return { ok: true as const, providerBound: true };
    },
    async createStripeSession(input) {
      return createStripeOneTimeCheckoutSession({
        userId: input.userId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        customerEmail: input.customerEmail,
        clientReferenceId: input.userId,
        lines: input.lines,
        metadata: input.metadata,
      });
    },
  };
}

/**
 * Create pending paid sales, then a Stripe Checkout Session.
 * Never marks sales completed and never grants licenses/vault access.
 */
export async function startPaidSalesStripeCheckout(
  input: StartPaidSalesStripeCheckoutInput,
  deps: SalesStripeCheckoutDeps = createDefaultSalesStripeCheckoutDeps(),
): Promise<StartPaidSalesStripeCheckoutResult> {
  if (!isUuid(input.userId)) {
    return { ok: false, status: 400, error: "Invalid user id." };
  }
  if (!Array.isArray(input.cartItems) || input.cartItems.length === 0) {
    return { ok: false, status: 400, error: "Checkout requires cart items.", code: "CART_REQUIRED" };
  }
  if (!deps.isStripeConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Stripe checkout is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const resolvedPaid: ResolvedSalesCatalogItem[] = [];
  for (const raw of input.cartItems) {
    const resolved = await deps.resolveCatalogItem({
      itemId: String(raw.itemId || raw.item_id || ""),
      itemType: raw.itemType || raw.item_type,
      licenseType: raw.licenseType || raw.license_type,
    });
    if (!resolved.ok) {
      return { ok: false, status: resolved.status, error: resolved.error };
    }
    const tamper = rejectClientPriceTamper(raw.priceCents ?? raw.price_cents, resolved.item);
    if (!tamper.ok) return tamper;

    if (resolved.item.isFree || resolved.item.priceCents <= 0) {
      return {
        ok: false,
        status: 400,
        error: "Free catalog items must use the free sales checkout path, not Stripe.",
        code: "FREE_PRODUCT_NO_STRIPE",
        itemId: resolved.item.itemId,
        serverPriceCents: 0,
      };
    }
    resolvedPaid.push(resolved.item);
  }

  const inserted = await deps.insertPendingPurchases(input.userId, resolvedPaid);
  if (!inserted.ok) return inserted;

  const purchases = inserted.purchases;
  if (purchases.some((purchase) => purchase.status !== "pending")) {
    return { ok: false, status: 500, error: "Paid sales must remain pending before Stripe confirmation." };
  }

  const amountCents = purchases.reduce((sum, purchase) => sum + Math.max(0, Number(purchase.price_cents || 0)), 0);
  const currency = String(purchases[0]?.currency || "USD").toUpperCase();
  const purchaseIds = purchases.map((purchase) => purchase.id);
  const defaults = defaultCheckoutUrls();
  const successUrl = String(input.successUrl || "").trim() || defaults.successUrl;
  const cancelUrl = String(input.cancelUrl || "").trim() || defaults.cancelUrl;
  const metadata = buildSalesCheckoutMetadata({
    userId: input.userId,
    purchaseIds,
    amountCents,
    currency,
  });

  let stripeSession: StripeOneTimeCheckoutResult;
  try {
    stripeSession = await deps.createStripeSession({
      userId: input.userId,
      successUrl,
      cancelUrl,
      customerEmail: input.customerEmail,
      metadata,
      lines: purchases.map((purchase) => ({
        name: purchase.title || "Purchase",
        amountCents: Math.max(0, Number(purchase.price_cents || 0)),
        currency: purchase.currency || currency,
      })),
    });
  } catch (error) {
    // Leave rows pending — no completion, no entitlement, no fabricated payment reference.
    return {
      ok: false,
      status: 502,
      error: getErrorMessage(error) || "Stripe checkout creation failed.",
      code: "STRIPE_CHECKOUT_FAILED",
    };
  }

  if (!stripeSession.checkoutUrl || !stripeSession.sessionId) {
    return {
      ok: false,
      status: 502,
      error: "Stripe checkout session did not return a checkout URL.",
      code: "STRIPE_CHECKOUT_FAILED",
    };
  }

  const bound = await deps.bindCheckoutSession({
    userId: input.userId,
    purchaseIds,
    sessionId: stripeSession.sessionId,
    paymentIntentId: stripeSession.paymentIntentId,
  });
  if (!bound.ok) {
    return {
      ok: false,
      status: bound.status,
      error: bound.error,
      code: "PROVIDER_BIND_FAILED",
    };
  }

  return {
    ok: true,
    checkoutUrl: stripeSession.checkoutUrl,
    sessionId: stripeSession.sessionId,
    purchaseIds,
    amountCents,
    currency,
    pendingCount: purchases.length,
    completedCount: 0,
    entitlementsGranted: false,
    paymentConfirmationRequired: true,
    providerBound: bound.providerBound,
    message: "Pending sale created. Complete Stripe Checkout to pay. Entitlements unlock only after verified payment confirmation.",
  };
}
