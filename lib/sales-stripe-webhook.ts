/**
 * Phase B: signed Stripe webhook → atomic sales fulfillment RPC.
 * Does not mutate purchase_history / license_records / download_vault directly.
 */

import { verifyStripeSignature } from "./billing/providers/stripe-webhook-signature";
import { isStripeLiveConfigured } from "./billing/providers/stripe-rest";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error || JSON.stringify(record));
  }
  return "Unknown server error";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export const SALES_STRIPE_PAID_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
] as const;

export const SALES_STRIPE_NO_FULFILL_EVENTS = [
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

export type FulfillSalesStripePaymentAtomicArgs = {
  p_provider: string;
  p_provider_event_id: string;
  p_checkout_session_id: string;
  p_payment_intent_id: string;
  p_amount_total_cents: number;
  p_currency: string;
  p_payment_status: string;
  p_event_type: string;
  p_expected_user_id: string | null;
};

export type FulfillSalesStripePaymentAtomicResult = {
  ok?: boolean;
  outcome?: string;
  code?: string | null;
  sale_count?: number;
  fulfilled_count?: number;
};

export type SalesStripeWebhookDeps = {
  isConfigured: () => boolean;
  verifySignature: (rawBody: string, signatureHeader: string | null) => void;
  fulfillAtomic: (args: FulfillSalesStripePaymentAtomicArgs) => Promise<FulfillSalesStripePaymentAtomicResult>;
};

export type SalesStripeWebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

const IDEMPOTENT_OK = new Set(["processed", "already_processed", "session_already_fulfilled"]);

export function createDefaultSalesStripeWebhookDeps(): SalesStripeWebhookDeps {
  return {
    isConfigured: isStripeLiveConfigured,
    verifySignature: verifyStripeSignature,
    async fulfillAtomic(args) {
      const { getSupabaseServerClient } = await import("./server-supabase");
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase.rpc("fulfill_sales_stripe_payment_atomic", args);
      if (error) {
        throw error;
      }
      return (data || {}) as FulfillSalesStripePaymentAtomicResult;
    },
  };
}

function paymentIntentIdFromSession(session: Record<string, unknown>) {
  const raw = session.payment_intent;
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && "id" in raw) {
    return String((raw as { id?: unknown }).id || "").trim();
  }
  return "";
}

function optionalExpectedUserId(session: Record<string, unknown>) {
  const metadata = (session.metadata && typeof session.metadata === "object")
    ? (session.metadata as Record<string, unknown>)
    : {};
  const candidates = [
    String(session.client_reference_id || "").trim(),
    String(metadata.userId || metadata.user_id || "").trim(),
  ];
  for (const candidate of candidates) {
    if (isUuid(candidate)) return candidate;
  }
  return null;
}

function isTransientRpcFailure(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("unknown checkout session")
    || message.includes("retry after purchase bind")
    || message.includes("claim race")
  );
}

function safeLog(eventType: string, eventId: string, sessionId: string, outcome: string) {
  console.log("[api/sales/webhooks/stripe]", {
    eventType,
    eventId,
    checkoutSessionId: sessionId,
    outcome,
  });
}

export async function handleSalesStripeWebhook(
  input: { rawBody: string; signatureHeader: string | null },
  deps: SalesStripeWebhookDeps = createDefaultSalesStripeWebhookDeps(),
): Promise<SalesStripeWebhookResult> {
  if (!deps.isConfigured()) {
    return {
      status: 503,
      body: { error: "Stripe webhook is not configured." },
    };
  }

  try {
    deps.verifySignature(input.rawBody, input.signatureHeader);
  } catch (error) {
    const message = getErrorMessage(error);
    const unauthorized = /signature|timestamp|not configured/i.test(message);
    return {
      status: unauthorized ? 401 : 400,
      body: { error: message },
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody || "{}") as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Invalid Stripe event JSON." } };
  }

  const eventType = String(payload.type || "").trim();
  const eventId = String(payload.id || "").trim();
  const dataObject = (payload.data && typeof payload.data === "object")
    ? ((payload.data as { object?: Record<string, unknown> }).object || {})
    : {};

  if ((SALES_STRIPE_NO_FULFILL_EVENTS as readonly string[]).includes(eventType)) {
    const sessionId = String(dataObject.id || "").trim();
    safeLog(eventType, eventId, sessionId, "ignored_no_fulfill");
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "Event does not confirm paid checkout.", eventType },
    };
  }

  if (!(SALES_STRIPE_PAID_EVENTS as readonly string[]).includes(eventType)) {
    safeLog(eventType, eventId, "", "ignored_unsupported");
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "Unhandled event type.", eventType },
    };
  }

  if (!eventId || !String(dataObject.id || "").trim()) {
    return {
      status: 400,
      body: { error: "Signed event is missing checkout session identity.", eventType },
    };
  }

  const checkoutSessionId = String(dataObject.id || "").trim();
  const paymentStatus = String(dataObject.payment_status || "").trim().toLowerCase();
  if (paymentStatus !== "paid") {
    safeLog(eventType, eventId, checkoutSessionId, "not_paid");
    return {
      status: 200,
      body: {
        ok: true,
        ignored: true,
        reason: "Checkout session is not paid.",
        eventType,
        paymentStatus,
      },
    };
  }

  const amountTotal = Number(dataObject.amount_total);
  const currency = String(dataObject.currency || "").trim();
  if (!Number.isFinite(amountTotal) || amountTotal <= 0 || !currency) {
    return {
      status: 400,
      body: { error: "Signed checkout session is missing amount or currency.", eventType },
    };
  }

  const rpcArgs: FulfillSalesStripePaymentAtomicArgs = {
    p_provider: "stripe",
    p_provider_event_id: eventId,
    p_checkout_session_id: checkoutSessionId,
    p_payment_intent_id: paymentIntentIdFromSession(dataObject),
    p_amount_total_cents: Math.round(amountTotal),
    p_currency: currency,
    p_payment_status: paymentStatus,
    p_event_type: eventType,
    p_expected_user_id: optionalExpectedUserId(dataObject),
  };

  try {
    const result = await deps.fulfillAtomic(rpcArgs);
    const outcome = String(result.outcome || "");
    if (IDEMPOTENT_OK.has(outcome)) {
      safeLog(eventType, eventId, checkoutSessionId, outcome);
      return {
        status: 200,
        body: {
          ok: true,
          outcome,
          sale_count: result.sale_count || 0,
          fulfilled_count: result.fulfilled_count || 0,
        },
      };
    }
    if (outcome === "rejected") {
      safeLog(eventType, eventId, checkoutSessionId, "rejected");
      return {
        status: 200,
        body: {
          ok: true,
          outcome: "rejected",
          code: result.code || "rejected",
          sale_count: result.sale_count || 0,
          fulfilled_count: 0,
        },
      };
    }
    throw new Error(result.code || "Unexpected fulfillment outcome.");
  } catch (error) {
    const message = getErrorMessage(error);
    if (isTransientRpcFailure(error)) {
      safeLog(eventType, eventId, checkoutSessionId, "transient_unknown_session");
      return {
        status: 500,
        body: { error: "Checkout session is not bound yet. Retry.", eventType },
      };
    }
    safeLog(eventType, eventId, checkoutSessionId, "rpc_failure");
    return {
      status: 500,
      body: { error: message, eventType },
    };
  }
}
