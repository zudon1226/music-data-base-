import { NextResponse } from "next/server";
import { requireCreatorAudienceAccess } from "@/lib/resolved-account-role";
import { createConnectOnboardingLink } from "@/lib/stripe-connect";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start Stripe Connect Express onboarding (TEST or LIVE — server-side only). */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const creatorType = String(body.creatorType || "").trim().toLowerCase() as "artist" | "producer";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        if (!["artist", "producer"].includes(creatorType)) {
            return NextResponse.json({ error: "creatorType must be artist or producer." }, { status: 400 });
        }

        const auth = await requireMatchingUserId(request, "/api/connect/onboard", userId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const creatorAccess = await requireCreatorAudienceAccess(userId, creatorType);
        if (!creatorAccess.ok) {
            return NextResponse.json({ error: creatorAccess.error }, { status: creatorAccess.status });
        }

        const result = await createConnectOnboardingLink({
            userId,
            creatorType,
            email: String(body.email || "").trim() || undefined,
            returnUrl: String(body.returnUrl || "").trim() || undefined,
            refreshUrl: String(body.refreshUrl || "").trim() || undefined,
        });
        if (!result.ok) {
            return NextResponse.json({ error: result.error, code: result.code }, { status: result.status || 503 });
        }

        return NextResponse.json({
            ok: true,
            onboardingUrl: result.onboardingUrl,
            stripeAccountId: result.stripeAccountId,
            profile: result.profile,
        }, { status: 201 });
    } catch (error) {
        console.error("[api/connect/onboard] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
