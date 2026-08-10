import { NextResponse } from "next/server";
import { requireAuthenticatedSalesUser } from "@/lib/sales-auth";
import {
  catalogItemToSalesRow,
  normalizeSalesItemType,
  normalizeSalesLicenseType,
  resolveSalesCatalogItem,
} from "@/lib/sales-catalog";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { safeRandomUUID } from "@/lib/safe-random-uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CART_TABLE = "sales_cart_items";
const PURCHASE_TABLE = "purchase_history";
const VAULT_TABLE = "download_vault";
const LICENSE_TABLE = "license_records";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function isMissingSalesTable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("sales_cart_items")
    || message.includes("purchase_history")
    || message.includes("download_vault")
    || message.includes("schema cache")
    || message.includes("does not exist")
  );
}

function isMissingLicenseTable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("license_records") || message.includes("schema cache") || message.includes("does not exist");
}

function mapSalesRow(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    itemId: String(row.item_id || ""),
    itemType: String(row.item_type || "song"),
    title: String(row.title || "Untitled"),
    creatorName: String(row.creator_name || ""),
    cover: String(row.cover_url || ""),
    downloadUrl: String(row.download_url || ""),
    priceCents: Number(row.price_cents || 0),
    currency: String(row.currency || "USD"),
    licenseType: normalizeSalesLicenseType(row.license_type) || String(row.license_type || ""),
    licenseTerms: Array.isArray(row.license_terms) ? row.license_terms.map((term) => String(term)) : [],
    licenseId: String(row.license_id || ""),
    licensePdfFileName: String(row.license_pdf_file_name || ""),
    addedAt: String(row.created_at || row.added_at || new Date().toISOString()),
    purchasedAt: String(row.purchased_at || row.created_at || new Date().toISOString()),
    status: String(row.status || "pending"),
    purchaseId: String(row.purchase_id || ""),
  };
}

function claimedUserIdFromBody(body: Record<string, unknown>) {
  return String(body.userId || body.user_id || body.buyerId || body.purchaserId || "").trim();
}

export async function GET(request: Request) {
  try {
    const claimedUserId = new URL(request.url).searchParams.get("userId")?.trim() || "";
    const auth = await requireAuthenticatedSalesUser(request, "/api/sales", claimedUserId, {
      allowAdminTarget: true,
    });
    if (!auth.ok) return jsonResponse({ error: auth.error, cartItems: [], purchases: [], vaultItems: [] }, auth.status);

    const userId = auth.userId;
    const supabase = getSupabaseServerClient();
    const [cartResult, purchaseResult, vaultResult] = await Promise.all([
      supabase.from(CART_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from(PURCHASE_TABLE).select("*").eq("user_id", userId).order("purchased_at", { ascending: false }),
      supabase.from(VAULT_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    const firstError = cartResult.error || purchaseResult.error || vaultResult.error;
    if (firstError) {
      if (isMissingSalesTable(firstError)) {
        return jsonResponse({ cartItems: [], purchases: [], vaultItems: [], setupRequired: true });
      }
      console.error("[api/sales] load failed:", firstError);
      return jsonResponse({ error: getErrorMessage(firstError), cartItems: [], purchases: [], vaultItems: [] }, 500);
    }
    return jsonResponse({
      cartItems: (cartResult.data || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
      purchases: (purchaseResult.data || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
      vaultItems: (vaultResult.data || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
    });
  } catch (error) {
    console.error("[api/sales] load failed:", error);
    return jsonResponse({ error: getErrorMessage(error), cartItems: [], purchases: [], vaultItems: [] }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim();
    const claimedUserId = claimedUserIdFromBody(body);
    const auth = await requireAuthenticatedSalesUser(request, "/api/sales", claimedUserId);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const userId = auth.userId;
    const supabase = getSupabaseServerClient();

    if (action === "addCartItem") {
      const item = body.item && typeof body.item === "object" ? (body.item as Record<string, unknown>) : body;
      const resolved = await resolveSalesCatalogItem({
        itemId: String(item.itemId || item.item_id || ""),
        itemType: item.itemType || item.item_type,
        licenseType: item.licenseType || item.license_type,
      });
      if (!resolved.ok) return jsonResponse({ error: resolved.error }, resolved.status);
      const payload = catalogItemToSalesRow(userId, resolved.item);
      const { data, error } = await supabase
        .from(CART_TABLE)
        .upsert(payload, { onConflict: "user_id,item_id,item_type,license_type" })
        .select("*");
      if (error) {
        if (isMissingSalesTable(error)) return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
        console.error("[api/sales] add cart failed:", error);
        return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
      }
      return jsonResponse({
        ok: true,
        cartItems: (data || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
        resolvedPriceCents: resolved.item.priceCents,
        isFree: resolved.item.isFree,
      });
    }

    if (action === "removeCartItem") {
      const itemType = normalizeSalesItemType(body.itemType || body.item_type);
      const itemId = String(body.itemId || body.item_id || "").trim();
      if (!itemType || !itemId) return jsonResponse({ error: "Remove cart requires item id and type." }, 400);
      let deleteQuery = supabase.from(CART_TABLE).delete().eq("user_id", userId).eq("item_id", itemId).eq("item_type", itemType);
      if (itemType === "beat") {
        deleteQuery = deleteQuery.eq("license_type", normalizeSalesLicenseType(body.licenseType || body.license_type) || "");
      }
      const { error } = await deleteQuery;
      if (error) {
        if (isMissingSalesTable(error)) return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
        console.error("[api/sales] remove cart failed:", error);
        return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
      }
      return jsonResponse({ ok: true });
    }

    if (action === "clearCart") {
      const { error } = await supabase.from(CART_TABLE).delete().eq("user_id", userId);
      if (error) {
        if (isMissingSalesTable(error)) return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
        console.error("[api/sales] clear cart failed:", error);
        return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
      }
      return jsonResponse({ ok: true });
    }

    if (action === "checkout") {
      const rawItems = Array.isArray(body.cartItems) ? (body.cartItems as Record<string, unknown>[]) : [];
      if (rawItems.length === 0) return jsonResponse({ error: "Checkout requires cart items." }, 400);

      const resolvedItems = [];
      for (const raw of rawItems) {
        const resolved = await resolveSalesCatalogItem({
          itemId: String(raw.itemId || raw.item_id || ""),
          itemType: raw.itemType || raw.item_type,
          licenseType: raw.licenseType || raw.license_type,
        });
        if (!resolved.ok) return jsonResponse({ error: resolved.error }, resolved.status);
        // Reject client attempts to reclassify paid catalog items as free.
        const clientPrice = Number(raw.priceCents ?? raw.price_cents);
        if (Number.isFinite(clientPrice) && clientPrice === 0 && !resolved.item.isFree) {
          return jsonResponse({
            error: "Client price cannot convert a paid catalog item into a free purchase.",
            code: "PRICE_TAMPER_REJECTED",
            itemId: resolved.item.itemId,
            serverPriceCents: resolved.item.priceCents,
          }, 400);
        }
        resolvedItems.push(resolved.item);
      }

      const purchasedAt = new Date().toISOString();
      const purchaseRows = resolvedItems.map((item) => {
        const row = catalogItemToSalesRow(userId, item);
        return {
          ...row,
          // Paid items stay pending until a verified payment-provider confirmation path exists.
          // Free catalog items may complete and grant entitlements immediately.
          status: item.isFree ? "completed" : "pending",
          purchased_at: purchasedAt,
        };
      });

      const { data: purchases, error: purchaseError } = await supabase.from(PURCHASE_TABLE).insert(purchaseRows).select("*");
      if (purchaseError) {
        if (isMissingSalesTable(purchaseError)) {
          return jsonResponse({ ok: false, setupRequired: true, error: purchaseError.message }, 200);
        }
        console.error("[api/sales] checkout failed:", purchaseError);
        return jsonResponse({ error: purchaseError.message || getErrorMessage(purchaseError) }, 500);
      }

      const completedPurchases = (purchases || []).filter((purchase) => String(purchase.status) === "completed");
      const pendingPurchases = (purchases || []).filter((purchase) => String(purchase.status) !== "completed");

      // Entitlements only for free/completed rows — never for pending paid sales.
      const licenseRows = completedPurchases
        .filter((purchase) => purchase.item_type === "beat" && normalizeSalesLicenseType(purchase.license_type))
        .map((purchase) => ({
          id: isUuid(String(purchase.license_id || "")) ? purchase.license_id : safeRandomUUID(),
          user_id: userId,
          beat_id: purchase.item_id,
          beat_title: purchase.title,
          producer_id: "",
          producer_name: purchase.creator_name || "",
          buyer_name: String(body.buyerName || body.buyer_name || ""),
          license_type: normalizeSalesLicenseType(purchase.license_type),
          price_cents: Math.max(0, Number(purchase.price_cents || 0)),
          currency: purchase.currency || "USD",
          pdf_file_name: purchase.license_pdf_file_name || `${purchase.title || "beat"}-${purchase.license_type || "license"}.pdf`,
          terms: Array.isArray(purchase.license_terms) ? purchase.license_terms : [],
          transaction_id: purchase.id,
          issued_at: purchasedAt,
        }));
      if (licenseRows.length > 0) {
        const { error: licenseError } = await supabase
          .from(LICENSE_TABLE)
          .upsert(licenseRows, { onConflict: "user_id,beat_id,license_type" });
        if (licenseError && !isMissingLicenseTable(licenseError)) {
          console.error("[api/sales] license sync failed:", licenseError);
        }
      }

      const vaultRows = completedPurchases.map((purchase) => ({
        user_id: userId,
        purchase_id: purchase.id,
        item_id: purchase.item_id,
        item_type: purchase.item_type,
        title: purchase.title,
        creator_name: purchase.creator_name,
        cover_url: purchase.cover_url,
        download_url: purchase.download_url,
        price_cents: purchase.price_cents,
        currency: purchase.currency,
        license_type: purchase.license_type || "",
        license_terms: Array.isArray(purchase.license_terms) ? purchase.license_terms : [],
        license_id: purchase.license_id || "",
        license_pdf_file_name: purchase.license_pdf_file_name || "",
      }));
      if (vaultRows.length > 0) {
        const { error: vaultError } = await supabase
          .from(VAULT_TABLE)
          .upsert(vaultRows, { onConflict: "user_id,item_id,item_type,license_type" });
        if (vaultError) console.error("[api/sales] vault sync failed:", vaultError);
      }

      const { error: clearError } = await supabase.from(CART_TABLE).delete().eq("user_id", userId);
      if (clearError) console.error("[api/sales] cart cleanup failed:", clearError);

      return jsonResponse({
        ok: true,
        purchases: (purchases || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
        completedCount: completedPurchases.length,
        pendingCount: pendingPurchases.length,
        entitlementsGranted: completedPurchases.length > 0,
        paymentConfirmationRequired: pendingPurchases.length > 0,
        message: pendingPurchases.length > 0
          ? "Paid items were saved as pending. Licenses and downloads unlock only after verified payment confirmation."
          : "Free items completed and entitlements granted.",
      });
    }

    return jsonResponse({ error: "Unknown sales action." }, 400);
  } catch (error) {
    console.error("[api/sales] action failed:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
