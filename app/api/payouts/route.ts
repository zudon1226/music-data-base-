import { NextResponse } from "next/server";
import { CREATOR_WITHDRAWAL_LOCKED_MESSAGE } from "@/lib/billing/constants";
import { getCreatorBillingAccessForUser } from "@/lib/billing/subscription-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creator withdrawal requests — server-side subscription enforcement.
 * Balances are never reduced when withdrawals are blocked.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const amountCents = Math.round(Number(body.amountCents || 0));
        const creatorType = String(body.creatorType || "").trim().toLowerCase();
        const creatorName = String(body.creatorName || "").trim();
        const currency = String(body.currency || "USD").trim().toUpperCase() || "USD";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        if (!["artist", "producer"].includes(creatorType)) {
            return NextResponse.json({ error: "creatorType must be artist or producer." }, { status: 400 });
        }
        if (amountCents <= 0) {
            return NextResponse.json({ error: "amountCents must be greater than zero." }, { status: 400 });
        }

        const auth = await requireMatchingUserId(request, "/api/payouts", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const access = await getCreatorBillingAccessForUser(userId, creatorType);
        if (access.withdrawalsLocked) {
            return NextResponse.json({
                error: access.withdrawalLockMessage || CREATOR_WITHDRAWAL_LOCKED_MESSAGE,
                code: access.withdrawalLockCode || "WITHDRAWALS_LOCKED",
                billingStatus: access.billingStatus,
                overdueBalanceCents: access.overdueBalanceCents,
                renewalDate: access.renewalDate,
                withdrawalsLocked: true,
                earningsAccumulate: access.earningsAccumulate,
                access,
            }, { status: 403 });
        }

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("payouts")
            .insert({
                user_id: userId,
                amount_cents: amountCents,
                currency,
                status: "pending",
                creator_type: creatorType,
                creator_name: creatorName || creatorType,
                notes: "Creator withdrawal request",
                metadata: {
                    earningsAccumulate: access.earningsAccumulate,
                    walletUpdates: access.walletUpdates,
                    billingStatus: access.billingStatus,
                    renewalDate: access.renewalDate,
                },
            })
            .select("*")
            .single();

        if (error) {
            return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            payout: data,
            billingStatus: access.billingStatus,
            withdrawalsLocked: false,
        }, { status: 201 });
    } catch (error) {
        console.error("[api/payouts] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/payouts", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const creatorType = new URL(request.url).searchParams.get("creatorType")?.trim().toLowerCase() || null;
        const access = await getCreatorBillingAccessForUser(userId, creatorType);
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("payouts")
            .select("*")
            .eq("user_id", userId)
            .order("requested_at", { ascending: false })
            .limit(50);
        if (error) {
            return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            payouts: data || [],
            access,
            billingStatus: access.billingStatus,
            withdrawalsLocked: access.withdrawalsLocked,
            withdrawalLockCode: access.withdrawalLockCode,
            withdrawalLockMessage: access.withdrawalLockMessage,
            overdueBalanceCents: access.overdueBalanceCents,
            renewalDate: access.renewalDate,
        });
    } catch (error) {
        console.error("[api/payouts] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
