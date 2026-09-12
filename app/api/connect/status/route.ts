import { NextResponse } from "next/server";
import { getConnectOnboardingStatus } from "@/lib/stripe-connect";
import { evaluateWithdrawalEligibility } from "@/lib/creator-withdrawal-eligibility";
import { getCreatorAvailableBalanceCents } from "@/lib/creator-balance";
import { requireCreatorAudienceAccess } from "@/lib/resolved-account-role";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const creatorType = url.searchParams.get("creatorType")?.trim().toLowerCase() || "artist";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        if (!["artist", "producer"].includes(creatorType)) {
            return NextResponse.json({ error: "creatorType must be artist or producer." }, { status: 400 });
        }

        const auth = await requireMatchingUserId(request, "/api/connect/status", userId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const creatorAccess = await requireCreatorAudienceAccess(userId, creatorType as "artist" | "producer");
        if (!creatorAccess.ok) {
            return NextResponse.json({ error: creatorAccess.error }, { status: creatorAccess.status });
        }

        const connect = await getConnectOnboardingStatus(userId, creatorType);
        const balance = await getCreatorAvailableBalanceCents(userId, creatorType);
        const eligibility = await evaluateWithdrawalEligibility({
            userId,
            creatorType: creatorType as "artist" | "producer",
            amountCents: 1,
        });

        return NextResponse.json({
            ok: true,
            connect,
            balance,
            withdrawalPreview: {
                subscriptionCurrent: eligibility.billingStatus === "current",
                connectComplete: connect.onboardingComplete,
                payoutsEnabled: connect.payoutsEnabled,
                availableBalanceCents: balance.availableCents,
            },
        });
    } catch (error) {
        console.error("[api/connect/status] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
