import { NextResponse } from "next/server";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Authenticated buyer's ringtone purchase history and owned library. */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const status = (url.searchParams.get("status") || "paid").trim().toLowerCase();
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const sort = (url.searchParams.get("sort") || "newest").trim().toLowerCase();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/purchases", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        let query = supabase
            .from("ringtone_purchases")
            .select("id,ringtone_id,buyer_id,creator_id,amount_cents,platform_fee_cents,creator_earnings_cents,currency,payment_status,payment_provider,payment_reference,purchased_at,created_at,idempotency_key")
            .eq("buyer_id", userId)
            .order("purchased_at", { ascending: sort === "oldest" });

        if (status !== "all") query = query.eq("payment_status", status);

        const { data, error } = await query.limit(200);
        if (error) return json({ error: getErrorMessage(error) }, 500);

        const purchases = data || [];
        const ringtoneIds = [...new Set(purchases.map((row) => row.ringtone_id).filter(Boolean))];
        const products = ringtoneIds.length
            ? await supabase
                .from("ringtone_products")
                .select("id,title,artwork_url,preview_url,duration_seconds,creator_id,price_cents,currency,status,iphone_storage_path,android_storage_path,download_storage_path")
                .in("id", ringtoneIds)
            : { data: [] as Record<string, unknown>[] };

        const downloads = ringtoneIds.length
            ? await supabase
                .from("ringtone_downloads")
                .select("ringtone_id,purchase_id,device_type,downloaded_at")
                .eq("buyer_id", userId)
                .in("ringtone_id", ringtoneIds)
            : { data: [] as Record<string, unknown>[] };

        const productById = new Map((products.data || []).map((row) => [String(row.id), row]));
        const downloadCountByPurchase = new Map<string, number>();
        for (const row of downloads.data || []) {
            const key = String((row as { purchase_id?: string }).purchase_id || "");
            if (!key) continue;
            downloadCountByPurchase.set(key, (downloadCountByPurchase.get(key) || 0) + 1);
        }

        let items = purchases.map((purchase) => {
            const product = productById.get(String(purchase.ringtone_id)) || null;
            return {
                ...purchase,
                ringtone: product,
                downloadCount: downloadCountByPurchase.get(String(purchase.id)) || 0,
                filesReady: Boolean(
                    product
                    && (
                        (product as { iphone_storage_path?: string }).iphone_storage_path
                        || (product as { android_storage_path?: string }).android_storage_path
                        || (product as { download_storage_path?: string }).download_storage_path
                    ),
                ),
            };
        });

        if (q) {
            items = items.filter((item) => {
                const title = String((item.ringtone as { title?: string } | null)?.title || "");
                return title.toLowerCase().includes(q)
                    || String(item.payment_reference || "").toLowerCase().includes(q);
            });
        }

        if (sort === "title") {
            items.sort((a, b) => String((a.ringtone as { title?: string } | null)?.title || "")
                .localeCompare(String((b.ringtone as { title?: string } | null)?.title || "")));
        } else if (sort === "amount") {
            items.sort((a, b) => Number(a.amount_cents) - Number(b.amount_cents));
        }

        return json({ purchases: items });
    } catch (error) {
        console.error("[api/ringtones/purchases] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
