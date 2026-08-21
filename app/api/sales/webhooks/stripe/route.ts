import { NextResponse } from "next/server";
import { handleSalesStripeWebhook } from "@/lib/sales-stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase B: Stripe one-time Checkout webhook for pending sales fulfillment.
 * Signature-verified events only. Fulfillment is the atomic RPC.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");
  const result = await handleSalesStripeWebhook({ rawBody, signatureHeader });
  return NextResponse.json(result.body, { status: result.status });
}
