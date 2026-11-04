import { NextResponse } from "next/server";
import {
    isAppleIapInternalQaMasterEnabled,
    isAppleStoreKitInternalQaAllowedForUser,
} from "@/lib/apple/apple-iap-internal-qa";
import { isPublicBetaCommerceLocked } from "@/lib/public-beta-commerce-lock";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/**
 * Server-only internal QA gate for native StoreKit purchase sheets.
 * Ordinary users always receive storeKitPurchaseUiUnlocked: false.
 */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return json({ error: "userId is required.", code: "AUTH_REQUIRED" }, 401);
        }

        const auth = await requireMatchingUserId(request, "/api/apple/internal-qa/storekit", userId);
        if (!auth.ok) {
            return json({ error: auth.error, code: "AUTH_REQUIRED" }, auth.status);
        }

        const globalCommerceLocked = isPublicBetaCommerceLocked();
        const storeKitPurchaseUiUnlocked = isAppleStoreKitInternalQaAllowedForUser(userId);

        return json({
            ok: true,
            globalCommerceLocked,
            storeKitPurchaseUiUnlocked,
            internalQaEnabled: isAppleIapInternalQaMasterEnabled(),
            entitlementsGranted: false,
            stagingProductsOnly: true,
        });
    } catch (error) {
        console.error("[api/apple/internal-qa/storekit] GET failed:", error);
        return json({ error: getErrorMessage(error), code: "INTERNAL_ERROR" }, 500);
    }
}
