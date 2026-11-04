import { NextResponse } from "next/server";
import { listActiveAppleProductIds } from "@/lib/apple/apple-sku-registry";
import { isPublicBetaCommerceLocked } from "@/lib/public-beta-commerce-lock";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Active App Store product identifiers from the MDB Apple SKU registry (no prices). */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return json({ error: "userId is required.", code: "AUTH_REQUIRED" }, 401);
        }

        const auth = await requireMatchingUserId(request, "/api/apple/products", userId);
        if (!auth.ok) {
            return json({ error: auth.error, code: "AUTH_REQUIRED" }, auth.status);
        }

        const entityType = url.searchParams.get("entityType")?.trim() || "";
        const planSlug = url.searchParams.get("planSlug")?.trim() || "";

        const supabase = getSupabaseServerClient();
        const listed = await listActiveAppleProductIds(supabase, { entityType, planSlug });
        if (!listed.ok) {
            return json({ error: listed.error, productIds: [], code: "APPLE_CATALOG_ERROR" }, 500);
        }

        return json({
            ok: true,
            setupRequired: listed.setupRequired,
            commerceLocked: isPublicBetaCommerceLocked(),
            productIds: listed.productIds,
        });
    } catch (error) {
        console.error("[api/apple/products] GET failed:", error);
        return json({ error: getErrorMessage(error), productIds: [], code: "INTERNAL_ERROR" }, 500);
    }
}
