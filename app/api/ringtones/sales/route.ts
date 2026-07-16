import { NextResponse } from "next/server";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Creator-owned ringtone sales and earnings summary. */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/sales", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const creator = await requireRingtoneCreator(userId);
        if (!creator.ok) return json({ error: creator.error }, creator.status);

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("ringtone_purchases")
            .select("id,ringtone_id,buyer_id,amount_cents,platform_fee_cents,creator_earnings_cents,currency,payment_status,purchased_at")
            .eq("creator_id", userId)
            .order("purchased_at", { ascending: false })
            .limit(200);
        if (error) return json({ error: getErrorMessage(error) }, 500);

        const sales = data || [];
        const paid = sales.filter((row) => String(row.payment_status) === "paid");
        const earningsCents = paid.reduce((sum, row) => sum + Number(row.creator_earnings_cents || 0), 0);
        const revenueCents = paid.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
        const feeCents = paid.reduce((sum, row) => sum + Number(row.platform_fee_cents || 0), 0);
        const ringtoneIds = [...new Set(paid.map((row) => row.ringtone_id).filter(Boolean))];

        const [products, downloads] = await Promise.all([
            ringtoneIds.length
                ? supabase.from("ringtone_products").select("id,title").in("id", ringtoneIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
            ringtoneIds.length
                ? supabase.from("ringtone_downloads").select("ringtone_id,purchase_id").in("ringtone_id", ringtoneIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        ]);
        const titleById = new Map((products.data || []).map((row) => [String(row.id), String((row as { title?: string }).title || "")]));
        const downloadCountByPurchase = new Map<string, number>();
        for (const row of downloads.data || []) {
            const key = String((row as { purchase_id?: string }).purchase_id || "");
            if (!key) continue;
            downloadCountByPurchase.set(key, (downloadCountByPurchase.get(key) || 0) + 1);
        }

        const enrichedSales = paid.map((row) => ({
            ...row,
            ringtoneTitle: titleById.get(String(row.ringtone_id)) || "Ringtone",
            downloadCount: downloadCountByPurchase.get(String(row.id)) || 0,
            // Mask buyer identity for creator dashboards.
            buyerLabel: `Buyer ${String(row.buyer_id || "").slice(0, 8)}`,
        }));

        return json({
            sales: enrichedSales,
            summary: {
                saleCount: paid.length,
                earningsCents,
                revenueCents,
                platformFeeCents: feeCents,
                currency: paid[0]?.currency || "USD",
            },
        });
    } catch (error) {
        console.error("[api/ringtones/sales] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
