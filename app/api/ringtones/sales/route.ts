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

        return json({
            sales,
            summary: {
                saleCount: paid.length,
                earningsCents,
                revenueCents,
                currency: paid[0]?.currency || "USD",
            },
        });
    } catch (error) {
        console.error("[api/ringtones/sales] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
