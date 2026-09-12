import { NextResponse } from "next/server";
import { requireCreatorAudienceAccess } from "@/lib/resolved-account-role";
import { createConnectOnboardingLink } from "@/lib/stripe-connect";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe Connect onboarding refresh handler.
 * Creates a fresh Account Link for an existing connected account and redirects to Stripe-hosted onboarding.
 */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = String(url.searchParams.get("userId") || "").trim();
        const creatorType = String(url.searchParams.get("creatorType") || "").trim().toLowerCase() as "artist" | "producer";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        if (!["artist", "producer"].includes(creatorType)) {
            return NextResponse.json({ error: "creatorType must be artist or producer." }, { status: 400 });
        }

        const auth = await requireMatchingUserId(request, "/api/connect/refresh", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const creatorAccess = await requireCreatorAudienceAccess(userId, creatorType);
        if (!creatorAccess.ok) {
            return NextResponse.json({ error: creatorAccess.error }, { status: creatorAccess.status });
        }

        const result = await createConnectOnboardingLink({ userId, creatorType });
        if (!result.ok) {
            return NextResponse.json({ error: result.error, code: result.code }, { status: result.status || 503 });
        }

        const onboardingUrl = String(result.onboardingUrl || "").trim();
        if (!onboardingUrl.startsWith("https://")) {
            return NextResponse.json({ error: "Stripe onboarding link was not returned." }, { status: 503 });
        }

        return NextResponse.redirect(onboardingUrl, { status: 302 });
    } catch (error) {
        console.error("[api/connect/refresh] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
