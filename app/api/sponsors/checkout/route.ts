import { NextResponse } from "next/server";
import {
    assertSponsorCheckoutAllowed,
    getPublicBetaSponsorCheckoutMessage,
    isPublicBetaSponsorCheckoutLocked,
} from "@/lib/public-beta-sponsor-checkout";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Exposes sponsor beta lock state for production verification. */
export async function GET() {
    return json({
        publicBetaSponsorCheckoutLocked: isPublicBetaSponsorCheckoutLocked(),
        publicBetaSponsorCheckoutMessage: getPublicBetaSponsorCheckoutMessage(),
    });
}

/** Server-side sponsor checkout lock enforcement (full checkout ships in a later commit group). */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/sponsors/checkout", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const lock = await assertSponsorCheckoutAllowed(userId);
        if (!lock.ok) {
            return json({
                error: lock.error,
                code: lock.code,
                publicBetaSponsorCheckoutLocked: isPublicBetaSponsorCheckoutLocked(),
                publicBetaSponsorCheckoutMessage: getPublicBetaSponsorCheckoutMessage(),
            }, lock.status);
        }

        return json({
            error: "Sponsor checkout is not available yet.",
            code: "SPONSOR_CHECKOUT_UNAVAILABLE",
            publicBetaSponsorCheckoutLocked: false,
        }, 503);
    } catch (error) {
        console.error("[api/sponsors/checkout] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
