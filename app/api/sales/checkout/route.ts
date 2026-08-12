import { NextResponse } from "next/server";
import { requireAuthenticatedSalesUser } from "@/lib/sales-auth";
import {
  startPaidSalesStripeCheckout,
  toSafeSalesCheckoutResponse,
  type SalesCheckoutCartLine,
} from "@/lib/sales-stripe-checkout";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase A: authenticated paid sales → pending purchase_history → Stripe Checkout Session.
 * Does not confirm payment or grant entitlements.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const claimedUserId = String(body.userId || body.user_id || body.buyerId || body.purchaserId || "").trim();
    const auth = await requireAuthenticatedSalesUser(request, "/api/sales/checkout", claimedUserId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Ignore client price/amount/currency/status/identity — catalog + session user are authoritative.
    const cartItems = Array.isArray(body.cartItems)
      ? (body.cartItems as SalesCheckoutCartLine[])
      : Array.isArray(body.items)
        ? (body.items as SalesCheckoutCartLine[])
        : [];

    const result = await startPaidSalesStripeCheckout({
      userId: auth.userId,
      cartItems,
      successUrl: String(body.successUrl || "").trim() || undefined,
      cancelUrl: String(body.cancelUrl || "").trim() || undefined,
      customerEmail: String(body.customerEmail || "").trim() || undefined,
    });

    if (!result.ok) {
      return NextResponse.json({
        error: result.error,
        code: result.code,
        serverPriceCents: result.serverPriceCents,
        itemId: result.itemId,
        entitlementsGranted: false,
        completedCount: 0,
      }, { status: result.status });
    }

    return NextResponse.json(toSafeSalesCheckoutResponse(result), { status: 201 });
  } catch (error) {
    console.error("[api/sales/checkout] POST failed:", error);
    return NextResponse.json({
      error: getErrorMessage(error),
      entitlementsGranted: false,
      completedCount: 0,
    }, { status: 500 });
  }
}
