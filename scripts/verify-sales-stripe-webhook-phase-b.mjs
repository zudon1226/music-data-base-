/**
 * Phase B sales Stripe webhook verifier.
 * Static production-source locks + in-process behavioral A–P.
 * No custom Node loaders, --import hooks, or TS transpilation.
 * No real Stripe calls, no DB/RPC, no migration apply.
 *
 * Usage: node scripts/verify-sales-stripe-webhook-phase-b.mjs
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  const full = path.join(root, rel);
  if (!existsSync(full)) return "";
  return readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

function indexOfOr(source, snippet) {
  return source.indexOf(snippet);
}

function appearsInOrder(source, snippets) {
  let cursor = -1;
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1);
    if (next < 0) return false;
    cursor = next;
  }
  return true;
}

/** Faithful JS port of lib/billing/providers/stripe-webhook-signature.ts (locked by static snippets). */
function verifyStripeSignatureHarness(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret) throw new Error("Stripe webhook secret is not configured.");
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header.");
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Invalid Stripe-Signature header.");
  const ageSeconds = Math.abs(nowSeconds - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) {
    throw new Error("Stripe webhook timestamp outside tolerance.");
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error("Stripe webhook signature verification failed.");
  }
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    return String(error.message || error.error || JSON.stringify(error));
  }
  return "Unknown server error";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

const SALES_STRIPE_PAID_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
];
const SALES_STRIPE_NO_FULFILL_EVENTS = [
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];
const IDEMPOTENT_OK = new Set(["processed", "already_processed", "session_already_fulfilled"]);

function paymentIntentIdFromSession(session) {
  const raw = session.payment_intent;
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && "id" in raw) return String(raw.id || "").trim();
  return "";
}

function optionalExpectedUserId(session) {
  const metadata = (session.metadata && typeof session.metadata === "object") ? session.metadata : {};
  const candidates = [
    String(session.client_reference_id || "").trim(),
    String(metadata.userId || metadata.user_id || "").trim(),
  ];
  for (const candidate of candidates) {
    if (isUuid(candidate)) return candidate;
  }
  return null;
}

function isTransientRpcFailure(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("unknown checkout session")
    || message.includes("retry after purchase bind")
    || message.includes("claim race")
  );
}

/** Faithful JS port of handleSalesStripeWebhook (locked by ordered production-source snippets). */
async function handleSalesStripeWebhookHarness(input, deps) {
  if (!deps.isConfigured()) {
    return { status: 503, body: { error: "Stripe webhook is not configured." } };
  }
  try {
    deps.verifySignature(input.rawBody, input.signatureHeader);
  } catch (error) {
    const message = getErrorMessage(error);
    const unauthorized = /signature|timestamp|not configured/i.test(message);
    return { status: unauthorized ? 401 : 400, body: { error: message } };
  }
  let payload;
  try {
    payload = JSON.parse(input.rawBody || "{}");
  } catch {
    return { status: 400, body: { error: "Invalid Stripe event JSON." } };
  }
  const eventType = String(payload.type || "").trim();
  const eventId = String(payload.id || "").trim();
  const dataObject = (payload.data && typeof payload.data === "object")
    ? (payload.data.object || {})
    : {};

  if (SALES_STRIPE_NO_FULFILL_EVENTS.includes(eventType)) {
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "Event does not confirm paid checkout.", eventType },
    };
  }
  if (!SALES_STRIPE_PAID_EVENTS.includes(eventType)) {
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "Unhandled event type.", eventType },
    };
  }
  if (!eventId || !String(dataObject.id || "").trim()) {
    return { status: 400, body: { error: "Signed event is missing checkout session identity.", eventType } };
  }
  const checkoutSessionId = String(dataObject.id || "").trim();
  const paymentStatus = String(dataObject.payment_status || "").trim().toLowerCase();
  if (paymentStatus !== "paid") {
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "Checkout session is not paid.", eventType, paymentStatus },
    };
  }
  const amountTotal = Number(dataObject.amount_total);
  const currency = String(dataObject.currency || "").trim();
  if (!Number.isFinite(amountTotal) || amountTotal <= 0 || !currency) {
    return { status: 400, body: { error: "Signed checkout session is missing amount or currency.", eventType } };
  }
  const rpcArgs = {
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
      return { status: 500, body: { error: "Checkout session is not bound yet. Retry.", eventType } };
    }
    return { status: 500, body: { error: message, eventType } };
  }
}

function sessionEvent(type, extra = {}) {
  return JSON.stringify({
    id: extra.eventId || "evt_test_1",
    type,
    data: {
      object: {
        id: extra.sessionId || "cs_test_1",
        object: "checkout.session",
        payment_status: extra.payment_status ?? "paid",
        amount_total: extra.amount_total ?? 1290,
        currency: extra.currency ?? "usd",
        payment_intent: extra.payment_intent ?? "pi_test_1",
        client_reference_id: extra.client_reference_id ?? "11111111-1111-4111-8111-111111111111",
        metadata: {
          userId: extra.client_reference_id ?? "11111111-1111-4111-8111-111111111111",
          flow: "sales_pending_checkout",
        },
      },
    },
  });
}

function mainStatic() {
  const route = read("app/api/sales/webhooks/stripe/route.ts");
  const handler = read("lib/sales-stripe-webhook.ts");
  const stripeProvider = read("lib/billing/providers/stripe-provider.ts");
  const stripeSignature = read("lib/billing/providers/stripe-webhook-signature.ts");
  const migration = read("supabase/migrations/202608120001_fulfill_sales_stripe_payment_atomic.sql");
  const self = read("scripts/verify-sales-stripe-webhook-phase-b.mjs");

  const loaderName = ["sales-webhook-ts-", "loader"].join("");
  const hooksName = ["sales-webhook-ts-", "hooks"].join("");
  record(
    "no custom TS loader/hook infrastructure in verifier",
    !self.includes(loaderName) && !self.includes(hooksName),
  );

  record(
    "route is POST-only raw body + stripe-signature",
    route.includes("export async function POST")
      && !route.includes("export async function GET")
      && route.includes("request.text()")
      && route.includes("stripe-signature")
      && route.includes("handleSalesStripeWebhook"),
  );

  record(
    "HMAC helper algorithm locked to production signature file",
    stripeSignature.includes('createHmac("sha256", secret)')
      && stripeSignature.includes(".update(`${timestamp}.${rawBody}`, \"utf8\")")
      && stripeSignature.includes("timingSafeEqual")
      && stripeSignature.includes("ageSeconds > 60 * 5")
      && stripeSignature.includes("Missing Stripe-Signature header.")
      && stripeProvider.includes('from "./stripe-webhook-signature"')
      && stripeProvider.includes("export { verifyStripeSignature }"),
  );

  record(
    "production verifies signature on raw body before JSON.parse",
    appearsInOrder(handler, [
      "deps.verifySignature(input.rawBody, input.signatureHeader)",
      "JSON.parse(input.rawBody || \"{}\")",
    ])
      && !handler.includes("else if (!signatureHeader)"),
  );

  record(
    "production event matrix order: no-fulfill, then paid, then payment_status, then RPC",
    appearsInOrder(handler, [
      "SALES_STRIPE_NO_FULFILL_EVENTS",
      "SALES_STRIPE_PAID_EVENTS",
      'paymentStatus !== "paid"',
      "fulfillAtomic(rpcArgs)",
    ])
      && handler.includes("checkout.session.completed")
      && handler.includes("checkout.session.async_payment_succeeded")
      && handler.includes("checkout.session.async_payment_failed")
      && handler.includes("checkout.session.expired"),
  );

  record(
    "RPC contract matches committed migration",
    migration.includes("fulfill_sales_stripe_payment_atomic")
      && migration.includes("p_provider text")
      && handler.includes('supabase.rpc("fulfill_sales_stripe_payment_atomic"')
      && appearsInOrder(handler, [
        'p_provider: "stripe"',
        "p_provider_event_id: eventId",
        "p_checkout_session_id: checkoutSessionId",
        "p_payment_intent_id: paymentIntentIdFromSession(dataObject)",
        "p_amount_total_cents: Math.round(amountTotal)",
        "p_currency: currency",
        "p_payment_status: paymentStatus",
        "p_event_type: eventType",
        "p_expected_user_id: optionalExpectedUserId(dataObject)",
      ]),
  );

  record(
    "N production route/handler never mutate sale/license/vault",
    !/from\([\"']purchase_history[\"']\)/.test(handler)
      && !/from\([\"']license_records[\"']\)/.test(handler)
      && !/from\([\"']download_vault[\"']\)/.test(handler)
      && !route.includes("purchase_history")
      && !route.includes("license_records")
      && !route.includes("download_vault"),
  );

  record(
    "O production log/response surface has no secrets or payment-method fields",
    !handler.includes("STRIPE_WEBHOOK_SECRET")
      && !handler.includes("STRIPE_SECRET_KEY")
      && /function safeLog\([\s\S]*console\.log\("\[api\/sales\/webhooks\/stripe\]", \{\s*eventType,\s*eventId,\s*checkoutSessionId: sessionId,\s*outcome,/.test(handler)
      && !handler.includes("payment_method")
      && !handler.includes("customer_email"),
  );

  record(
    "P production expected_user_id is UUID cross-check from trusted Checkout fields",
    handler.includes("p_expected_user_id: optionalExpectedUserId")
      && handler.includes("client_reference_id")
      && handler.includes("metadata.userId")
      && handler.includes("isUuid(candidate)")
      && !handler.includes("user_id: p_expected_user_id"),
  );

  record(
    "no UI coupling in webhook sources",
    !route.includes("page.tsx") && !handler.includes("app/page"),
  );

  record(
    "handler replica event lists match production source",
    indexOfOr(handler, 'checkout.session.completed') >= 0
      && handler.includes("checkout.session.async_payment_succeeded")
      && handler.includes("checkout.session.async_payment_failed")
      && handler.includes("checkout.session.expired")
      && handler.includes('already_processed')
      && handler.includes("session_already_fulfilled")
      && handler.includes('outcome === "rejected"')
      && handler.includes("unknown checkout session")
      && handler.includes("rpc_failure"),
  );
}

async function mainRuntime() {
  const secret = "whsec_test_phase_b";
  const now = Math.floor(Date.now() / 1000);
  function sign(rawBody, timestamp = String(now)) {
    const hex = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
    return `t=${timestamp},v1=${hex}`;
  }

  const missing = sessionEvent("checkout.session.completed");
  let threwMissing = false;
  try {
    verifyStripeSignatureHarness(missing, null, secret, now);
  } catch (error) {
    threwMissing = getErrorMessage(error) === "Missing Stripe-Signature header.";
  }
  record("A HMAC missing Stripe-Signature rejected", threwMissing);

  let threwInvalid = false;
  try {
    verifyStripeSignatureHarness(missing, `t=${now},v1=deadbeef`, secret, now);
  } catch (error) {
    threwInvalid = getErrorMessage(error) === "Stripe webhook signature verification failed.";
  }
  record("B HMAC invalid v1 rejected", threwInvalid);

  const calls = [];
  const deps = {
    isConfigured: () => true,
    verifySignature: (rawBody, header) => verifyStripeSignatureHarness(rawBody, header, secret, now),
    fulfillAtomic: async (args) => {
      calls.push(args);
      return { ok: true, outcome: "processed", sale_count: 1, fulfilled_count: 1 };
    },
  };

  const outA = await handleSalesStripeWebhookHarness({ rawBody: missing, signatureHeader: null }, deps);
  record("A handler missing signature => 401", outA.status === 401);

  const outB = await handleSalesStripeWebhookHarness(
    { rawBody: missing, signatureHeader: `t=${now},v1=deadbeef` },
    deps,
  );
  record("B handler invalid signature => 401", outB.status === 401);

  const rawUnsupported = sessionEvent("invoice.paid");
  const outC = await handleSalesStripeWebhookHarness(
    { rawBody: rawUnsupported, signatureHeader: sign(rawUnsupported) },
    deps,
  );
  record("C valid signature + unsupported event => 2xx ignored", outC.status === 200 && outC.body.ignored === true && calls.length === 0);

  calls.length = 0;
  const rawUnpaid = sessionEvent("checkout.session.completed", { payment_status: "unpaid" });
  const outD = await handleSalesStripeWebhookHarness(
    { rawBody: rawUnpaid, signatureHeader: sign(rawUnpaid) },
    deps,
  );
  record("D completed unpaid => 200 no fulfillment", outD.status === 200 && outD.body.ignored === true && calls.length === 0);

  calls.length = 0;
  const rawPaid = sessionEvent("checkout.session.completed");
  const outE = await handleSalesStripeWebhookHarness(
    { rawBody: rawPaid, signatureHeader: sign(rawPaid) },
    deps,
  );
  record(
    "E paid checkout.session.completed => RPC once",
    outE.status === 200
      && calls.length === 1
      && calls[0].p_provider === "stripe"
      && calls[0].p_checkout_session_id === "cs_test_1"
      && calls[0].p_provider_event_id === "evt_test_1"
      && calls[0].p_amount_total_cents === 1290
      && calls[0].p_payment_status === "paid"
      && calls[0].p_event_type === "checkout.session.completed",
  );
  record(
    "P expected_user_id is UUID cross-check only",
    calls[0]?.p_expected_user_id === "11111111-1111-4111-8111-111111111111",
  );

  calls.length = 0;
  const rawAsyncPaid = sessionEvent("checkout.session.async_payment_succeeded");
  const outF = await handleSalesStripeWebhookHarness(
    { rawBody: rawAsyncPaid, signatureHeader: sign(rawAsyncPaid) },
    deps,
  );
  record("F async_payment_succeeded + paid => RPC", outF.status === 200 && calls.length === 1);

  calls.length = 0;
  const rawFailed = sessionEvent("checkout.session.async_payment_failed");
  const outG = await handleSalesStripeWebhookHarness(
    { rawBody: rawFailed, signatureHeader: sign(rawFailed) },
    deps,
  );
  record("G async_payment_failed => no RPC", outG.status === 200 && calls.length === 0);

  calls.length = 0;
  const rawExpired = sessionEvent("checkout.session.expired");
  const outH = await handleSalesStripeWebhookHarness(
    { rawBody: rawExpired, signatureHeader: sign(rawExpired) },
    deps,
  );
  record("H expired => no RPC", outH.status === 200 && calls.length === 0);

  deps.fulfillAtomic = async () => ({ ok: true, outcome: "already_processed", sale_count: 1, fulfilled_count: 1 });
  const outI = await handleSalesStripeWebhookHarness(
    { rawBody: rawPaid, signatureHeader: sign(rawPaid) },
    deps,
  );
  record("I already_processed => 2xx", outI.status === 200 && outI.body.outcome === "already_processed");

  deps.fulfillAtomic = async () => ({ ok: true, outcome: "session_already_fulfilled", sale_count: 1, fulfilled_count: 0 });
  const outJ = await handleSalesStripeWebhookHarness(
    { rawBody: rawPaid, signatureHeader: sign(rawPaid) },
    deps,
  );
  record("J session_already_fulfilled => 2xx", outJ.status === 200 && outJ.body.outcome === "session_already_fulfilled");

  deps.fulfillAtomic = async () => ({ ok: false, outcome: "rejected", code: "amount_mismatch", sale_count: 1, fulfilled_count: 0 });
  const outK = await handleSalesStripeWebhookHarness(
    { rawBody: rawPaid, signatureHeader: sign(rawPaid) },
    deps,
  );
  record(
    "K rejected permanent => 2xx no route entitlements",
    outK.status === 200 && outK.body.outcome === "rejected" && outK.body.code === "amount_mismatch",
  );

  deps.fulfillAtomic = async () => {
    throw new Error("unknown checkout session; retry after purchase bind");
  };
  const outL = await handleSalesStripeWebhookHarness(
    { rawBody: rawPaid, signatureHeader: sign(rawPaid) },
    deps,
  );
  record(
    "L unknown-session transient => 5xx sanitized",
    outL.status === 500 && outL.body.error === "Checkout session is not bound yet. Retry.",
  );

  deps.fulfillAtomic = async () => {
    throw new Error("connection refused");
  };
  const outM = await handleSalesStripeWebhookHarness(
    { rawBody: rawPaid, signatureHeader: sign(rawPaid) },
    deps,
  );
  record("M unexpected RPC failure => 5xx", outM.status === 500 && outM.body.error === "connection refused");
}

mainStatic();
await mainRuntime();
const failed = results.filter((row) => !row.ok).length;
console.log(`\nPHASE_B_WEBHOOK_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
