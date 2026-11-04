import { NextResponse } from "next/server";
import { verifyAppleTransactionForUser } from "@/lib/apple/apple-transaction-verify";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** StoreKit 2 signed transaction verification (Stage 1: audit only, no entitlement grants). */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return json({ error: "userId is required.", code: "AUTH_REQUIRED" }, 401);
        }

        const auth = await requireMatchingUserId(request, "/api/apple/transactions/verify", userId);
        if (!auth.ok) {
            return json({ error: auth.error, code: "AUTH_REQUIRED" }, auth.status);
        }

        const signedTransactionInfo = String(body.signedTransactionInfo || "").trim();
        const environment = String(body.environment || "").trim();

        const supabase = getSupabaseServerClient();
        const result = await verifyAppleTransactionForUser(supabase, {
            userId,
            signedTransactionInfo,
            environment,
        });

        if (!result.ok) {
            return json(
                {
                    ok: false,
                    verified: result.verified ?? false,
                    code: result.code,
                    error: result.error,
                    entitlementsGranted: false,
                },
                result.status,
            );
        }

        return json({
            ...result,
            entitlementsGranted: false,
        });
    } catch (error) {
        console.error("[api/apple/transactions/verify] POST failed:", error);
        return json(
            {
                ok: false,
                verified: false,
                entitlementsGranted: false,
                code: "INTERNAL_ERROR",
                error: getErrorMessage(error),
            },
            500,
        );
    }
}
