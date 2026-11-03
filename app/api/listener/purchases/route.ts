import { NextResponse } from "next/server";
import { loadListenerPurchasesBundle } from "@/lib/listener-purchases-service";
import { isPublicBetaCommerceLocked } from "@/lib/public-beta-commerce-lock";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Read-only listener purchase vault (marketplace, ringtones, licenses, downloads). */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return json({ error: "userId is required.", code: "AUTH_REQUIRED" }, 401);
        }

        const auth = await requireMatchingUserId(request, "/api/listener/purchases", userId);
        if (!auth.ok) {
            return json({ error: auth.error, code: "AUTH_REQUIRED" }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        const loaded = await loadListenerPurchasesBundle(supabase, userId);
        if (!loaded.ok) {
            return json({ error: loaded.error, purchases: [], receipts: [], downloads: [], licenses: [], digitalAccess: [] }, 500);
        }

        return json({
            ok: true,
            setupRequired: loaded.setupRequired,
            commerceLocked: isPublicBetaCommerceLocked(),
            emptyMessage: "Your purchase history will appear here when purchases become available.",
            ...loaded.bundle,
        });
    } catch (error) {
        console.error("[api/listener/purchases] GET failed:", error);
        return json({
            error: getErrorMessage(error),
            purchases: [],
            receipts: [],
            downloads: [],
            licenses: [],
            digitalAccess: [],
        }, 500);
    }
}
