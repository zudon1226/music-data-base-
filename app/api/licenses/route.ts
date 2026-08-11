import { NextResponse } from "next/server";
import { requireAuthenticatedSalesUser } from "@/lib/sales-auth";
import { normalizeSalesLicenseType, resolveSalesCatalogItem } from "@/lib/sales-catalog";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { safeRandomUUID } from "@/lib/safe-random-uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LICENSE_TABLE = "license_records";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function isMissingLicenseTable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("license_records") || message.includes("schema cache") || message.includes("does not exist");
}

function mapLicenseRow(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    beatId: String(row.beat_id || ""),
    beatTitle: String(row.beat_title || ""),
    producerId: String(row.producer_id || ""),
    producerName: String(row.producer_name || ""),
    buyerName: String(row.buyer_name || ""),
    licenseType: String(row.license_type || "Basic"),
    priceCents: Number(row.price_cents || 0),
    currency: String(row.currency || "USD"),
    issuedAt: String(row.issued_at || row.created_at || new Date().toISOString()),
    terms: Array.isArray(row.terms) ? row.terms.map((term) => String(term)) : [],
    pdfFileName: String(row.pdf_file_name || "music-data-base-license.pdf"),
    transactionId: String(row.transaction_id || ""),
  };
}

export async function GET(request: Request) {
  try {
    const claimedUserId = new URL(request.url).searchParams.get("userId")?.trim() || "";
    const auth = await requireAuthenticatedSalesUser(request, "/api/licenses", claimedUserId, {
      allowAdminTarget: true,
    });
    if (!auth.ok) return jsonResponse({ error: auth.error, licenses: [] }, auth.status);

    const userId = auth.userId;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from(LICENSE_TABLE)
      .select("id,user_id,beat_id,beat_title,producer_id,producer_name,buyer_name,license_type,price_cents,currency,pdf_file_name,terms,transaction_id,issued_at,created_at")
      .eq("user_id", userId)
      .order("issued_at", { ascending: false });
    if (error) {
      if (isMissingLicenseTable(error)) {
        return jsonResponse({ licenses: [], setupRequired: true, error: error.message });
      }
      console.error("[api/licenses] load failed:", error);
      return jsonResponse({ licenses: [], error: error.message || getErrorMessage(error) }, 500);
    }
    return jsonResponse({
      licenses: (data || []).map((row) => mapLicenseRow(row as Record<string, unknown>)),
    });
  } catch (error) {
    console.error("[api/licenses] load failed:", error);
    return jsonResponse({ licenses: [], error: getErrorMessage(error) }, 500);
  }
}

/**
 * Free-form license creation is restricted.
 * Paid beat licenses require verified payment confirmation (not available in this task).
 * Only authoritative free catalog beats may create an active license entitlement here.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const claimedUserId = String(body.userId || body.user_id || body.buyerId || body.purchaserId || "").trim();
    const auth = await requireAuthenticatedSalesUser(request, "/api/licenses", claimedUserId);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const userId = auth.userId;
    const beatId = String(body.beatId || body.beat_id || "").trim();
    const licenseType = normalizeSalesLicenseType(body.licenseType || body.license_type);
    if (!beatId) return jsonResponse({ error: "License requires a beat id." }, 400);
    if (!licenseType) {
      return jsonResponse({ error: "License type must be Basic, Premium, Unlimited, or Exclusive." }, 400);
    }

    const resolved = await resolveSalesCatalogItem({
      itemId: beatId,
      itemType: "beat",
      licenseType,
    });
    if (!resolved.ok) return jsonResponse({ error: resolved.error }, resolved.status);
    if (!resolved.item.isFree) {
      return jsonResponse({
        error: "Paid license entitlement requires verified payment confirmation.",
        code: "PAYMENT_CONFIRMATION_REQUIRED",
        serverPriceCents: resolved.item.priceCents,
      }, 403);
    }

    const payload = {
      id: isUuid(String(body.id || "")) ? String(body.id) : safeRandomUUID(),
      user_id: userId,
      beat_id: resolved.item.itemId,
      beat_title: resolved.item.title,
      producer_id: resolved.item.creatorId || "",
      producer_name: resolved.item.creatorName,
      buyer_name: String(body.buyerName || body.buyer_name || ""),
      license_type: resolved.item.licenseType,
      price_cents: resolved.item.priceCents,
      currency: resolved.item.currency,
      pdf_file_name: `${resolved.item.title || "beat"}-${resolved.item.licenseType}.pdf`,
      terms: resolved.item.licenseTerms,
      transaction_id: `free-${safeRandomUUID()}`,
      issued_at: new Date().toISOString(),
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from(LICENSE_TABLE)
      .upsert(payload, { onConflict: "user_id,beat_id,license_type" })
      .select("id,user_id,beat_id,beat_title,producer_id,producer_name,buyer_name,license_type,price_cents,currency,pdf_file_name,terms,transaction_id,issued_at,created_at")
      .single();
    if (error) {
      if (isMissingLicenseTable(error)) {
        return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
      }
      console.error("[api/licenses] save failed:", error);
      return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
    }
    return jsonResponse({
      ok: true,
      license: data ? mapLicenseRow(data as Record<string, unknown>) : null,
      freeEntitlement: true,
    });
  } catch (error) {
    console.error("[api/licenses] save failed:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
