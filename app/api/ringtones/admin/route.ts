import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import {
    canAdminTransitionStatus,
    isRingtoneStatus,
    sanitizeRingtoneText,
} from "@/lib/ringtone-validation";
import type { RingtoneStatus } from "@/lib/ringtone-constants";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Owner/admin review queue and transaction visibility. */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/admin", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const supabase = getSupabaseServerClient();
        const [products, purchases] = await Promise.all([
            supabase.from("ringtone_products").select("*").order("updated_at", { ascending: false }).limit(200),
            supabase.from("ringtone_purchases").select("*").order("purchased_at", { ascending: false }).limit(200),
        ]);
        if (products.error) return json({ error: getErrorMessage(products.error) }, 500);
        if (purchases.error) return json({ error: getErrorMessage(purchases.error) }, 500);
        return json({
            ringtones: products.data || [],
            purchases: purchases.data || [],
        });
    } catch (error) {
        console.error("[api/ringtones/admin] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

/** Approve, reject, suspend, feature, or archive ringtones. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const ringtoneId = String(body.ringtoneId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!ringtoneId || !isUuid(ringtoneId)) return json({ error: "ringtoneId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/admin", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const supabase = getSupabaseServerClient();
        const existing = await supabase.from("ringtone_products").select("*").eq("id", ringtoneId).maybeSingle();
        if (existing.error) return json({ error: getErrorMessage(existing.error) }, 500);
        if (!existing.data) return json({ error: "Ringtone not found." }, 404);

        const updates: Record<string, unknown> = {};
        if (body.status != null) {
            if (!isRingtoneStatus(body.status)) return json({ error: "Invalid status." }, 400);
            const from = String(existing.data.status || "draft") as RingtoneStatus;
            const to = body.status as RingtoneStatus;
            if (!canAdminTransitionStatus(from, to)) {
                return json({ error: `Invalid admin status transition ${from} -> ${to}.` }, 400);
            }
            updates.status = to;
            if (to === "published") updates.published_at = new Date().toISOString();
        }
        if (body.isFeatured != null) updates.is_featured = body.isFeatured === true;
        if (body.reviewNotes != null) updates.review_notes = sanitizeRingtoneText(body.reviewNotes, 2000);

        if (Object.keys(updates).length === 0) {
            return json({ error: "No admin updates provided." }, 400);
        }

        const { data, error } = await supabase
            .from("ringtone_products")
            .update(updates)
            .eq("id", ringtoneId)
            .select("*")
            .single();
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ ringtone: data });
    } catch (error) {
        console.error("[api/ringtones/admin] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
