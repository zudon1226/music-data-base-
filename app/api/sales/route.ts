import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CART_TABLE = "sales_cart_items";
const PURCHASE_TABLE = "purchase_history";
const VAULT_TABLE = "download_vault";
const LICENSE_TABLE = "license_records";
const LICENSE_TYPES = new Set(["Basic", "Premium", "Unlimited", "Exclusive"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function emptySalesResponse() {
    return jsonResponse({ cartItems: [], purchases: [], vaultItems: [] });
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        return String(record.message || record.error || JSON.stringify(record));
    }
    return "Unknown server error";
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function getSupabaseServerClient(request?: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const authorization = request?.headers.get("authorization") || "";
    if (!supabaseUrl)
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    if (serviceRoleKey && serviceRoleKey !== "your_service_role_key_here") {
        return createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    if (!anonKey)
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    if (!authorization)
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing and no user authorization token was sent.");
    return createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
    });
}

function isMissingSalesTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("sales_cart_items") ||
        message.includes("purchase_history") ||
        message.includes("download_vault") ||
        message.includes("schema cache") ||
        message.includes("does not exist");
}

function isMissingLicenseTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("license_records") || message.includes("schema cache") || message.includes("does not exist");
}

function normalizeItemType(value: unknown) {
    return value === "album" || value === "beat" ? value : value === "song" ? value : "";
}

function normalizeLicenseType(value: unknown) {
    const licenseType = String(value || "");
    return LICENSE_TYPES.has(licenseType) ? licenseType : "";
}

function normalizeLicenseTerms(value: unknown) {
    if (Array.isArray(value))
        return value.map((term) => String(term)).filter(Boolean);
    return [];
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
        licenseType: normalizeLicenseType(row.license_type),
        licenseTerms: normalizeLicenseTerms(row.license_terms),
        licenseId: String(row.license_id || ""),
        licensePdfFileName: String(row.license_pdf_file_name || ""),
        addedAt: String(row.created_at || row.added_at || new Date().toISOString()),
        purchasedAt: String(row.purchased_at || row.created_at || new Date().toISOString()),
        status: String(row.status || "completed"),
        purchaseId: String(row.purchase_id || ""),
    };
}

function cartPayloadFromItem(userId: string, item: Record<string, unknown>) {
    const itemType = normalizeItemType(item.itemType || item.item_type);
    if (!itemType)
        throw new Error("Sales item_type must be song, album, or beat.");
    const itemId = String(item.itemId || item.item_id || "").trim();
    if (!itemId)
        throw new Error("Sales item requires an item id.");
    return {
        user_id: userId,
        item_id: itemId,
        item_type: itemType,
        title: String(item.title || "Untitled"),
        creator_name: String(item.creatorName || item.creator_name || ""),
        cover_url: String(item.cover || item.cover_url || ""),
        download_url: String(item.downloadUrl || item.download_url || ""),
        price_cents: Math.max(0, Number(item.priceCents || item.price_cents || 0)),
        currency: String(item.currency || "USD"),
        license_type: itemType === "beat" ? normalizeLicenseType(item.licenseType || item.license_type) : "",
        license_terms: itemType === "beat" ? normalizeLicenseTerms(item.licenseTerms || item.license_terms) : [],
        license_id: itemType === "beat" ? String(item.licenseId || item.license_id || "") : "",
        license_pdf_file_name: itemType === "beat" ? String(item.licensePdfFileName || item.license_pdf_file_name || "") : "",
    };
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId))
            return emptySalesResponse();
        const supabase = getSupabaseServerClient(request);
        const [cartResult, purchaseResult, vaultResult] = await Promise.all([
            supabase.from(CART_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
            supabase.from(PURCHASE_TABLE).select("*").eq("user_id", userId).order("purchased_at", { ascending: false }),
            supabase.from(VAULT_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        ]);
        const firstError = cartResult.error || purchaseResult.error || vaultResult.error;
        if (firstError) {
            if (isMissingSalesTable(firstError))
                return emptySalesResponse();
            console.error("[api/sales] load failed:", firstError);
            return emptySalesResponse();
        }
        return jsonResponse({
            cartItems: (cartResult.data || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
            purchases: (purchaseResult.data || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
            vaultItems: (vaultResult.data || []).map((row) => mapSalesRow(row as Record<string, unknown>)),
        });
    }
    catch (error) {
        console.error("[api/sales] load failed:", error);
        return emptySalesResponse();
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = String(body.action || "");
        const userId = String(body.userId || body.user_id || "").trim();
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Sales action requires a valid user id." }, 401);
        const supabase = getSupabaseServerClient(request);
        if (action === "addCartItem") {
            const item = body.item && typeof body.item === "object" ? body.item as Record<string, unknown> : body;
            const payload = cartPayloadFromItem(userId, item);
            const { data, error } = await supabase
                .from(CART_TABLE)
                .upsert(payload, { onConflict: "user_id,item_id,item_type,license_type" })
                .select("*");
            if (error) {
                if (isMissingSalesTable(error))
                    return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
                console.error("[api/sales] add cart failed:", error);
                return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
            }
            return jsonResponse({ ok: true, cartItems: data || [] });
        }
        if (action === "removeCartItem") {
            const itemType = normalizeItemType(body.itemType || body.item_type);
            const itemId = String(body.itemId || body.item_id || "").trim();
            if (!itemType || !itemId)
                return jsonResponse({ error: "Remove cart requires item id and type." }, 400);
            let deleteQuery = supabase.from(CART_TABLE).delete().eq("user_id", userId).eq("item_id", itemId).eq("item_type", itemType);
            if (itemType === "beat")
                deleteQuery = deleteQuery.eq("license_type", normalizeLicenseType(body.licenseType || body.license_type));
            const { error } = await deleteQuery;
            if (error) {
                if (isMissingSalesTable(error))
                    return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
                console.error("[api/sales] remove cart failed:", error);
                return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
            }
            return jsonResponse({ ok: true });
        }
        if (action === "clearCart") {
            const { error } = await supabase.from(CART_TABLE).delete().eq("user_id", userId);
            if (error) {
                if (isMissingSalesTable(error))
                    return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
                console.error("[api/sales] clear cart failed:", error);
                return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
            }
            return jsonResponse({ ok: true });
        }
        if (action === "checkout") {
            const items = Array.isArray(body.cartItems) ? body.cartItems as Record<string, unknown>[] : [];
            const purchasedAt = new Date().toISOString();
            const purchaseRows = items.map((item) => {
                const payload = cartPayloadFromItem(userId, item);
                return {
                    ...payload,
                    status: "completed",
                    purchased_at: purchasedAt,
                };
            });
            if (purchaseRows.length === 0)
                return jsonResponse({ error: "Checkout requires cart items." }, 400);
            const { data: purchases, error: purchaseError } = await supabase.from(PURCHASE_TABLE).insert(purchaseRows).select("*");
            if (purchaseError) {
                if (isMissingSalesTable(purchaseError))
                    return jsonResponse({ ok: false, setupRequired: true, error: purchaseError.message }, 200);
                console.error("[api/sales] checkout failed:", purchaseError);
                return jsonResponse({ error: purchaseError.message || getErrorMessage(purchaseError) }, 500);
            }
            const licenseRows = (purchases || [])
                .filter((purchase) => purchase.item_type === "beat" && normalizeLicenseType(purchase.license_type))
                .map((purchase) => ({
                id: isUuid(String(purchase.license_id || "")) ? purchase.license_id : crypto.randomUUID(),
                user_id: userId,
                beat_id: purchase.item_id,
                beat_title: purchase.title,
                producer_id: "",
                producer_name: purchase.creator_name || "",
                buyer_name: String(body.buyerName || body.buyer_name || ""),
                license_type: normalizeLicenseType(purchase.license_type),
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
                if (licenseError && !isMissingLicenseTable(licenseError))
                    console.error("[api/sales] license sync failed:", licenseError);
            }
            const vaultRows = (purchases || []).map((purchase) => ({
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
                const { error: vaultError } = await supabase.from(VAULT_TABLE).upsert(vaultRows, { onConflict: "user_id,item_id,item_type,license_type" });
                if (vaultError)
                    console.error("[api/sales] vault sync failed:", vaultError);
            }
            const { error: clearError } = await supabase.from(CART_TABLE).delete().eq("user_id", userId);
            if (clearError)
                console.error("[api/sales] cart cleanup failed:", clearError);
            return jsonResponse({ ok: true, purchases: purchases || [] });
        }
        return jsonResponse({ error: "Unknown sales action." }, 400);
    }
    catch (error) {
        console.error("[api/sales] action failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
