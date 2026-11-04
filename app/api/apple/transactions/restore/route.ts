import { NextResponse } from "next/server";
import { restoreAppleTransactionsForUser } from "@/lib/apple/apple-transaction-restore";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** StoreKit restore reconciliation (verification-only during public beta). */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return json({ error: "userId is required.", code: "AUTH_REQUIRED" }, 401);
        }

        const auth = await requireMatchingUserId(request, "/api/apple/transactions/restore", userId);
        if (!auth.ok) {
            return json({ error: auth.error, code: "AUTH_REQUIRED" }, auth.status);
        }

        const signedTransactionInfos = Array.isArray(body.signedTransactionInfos) ? body.signedTransactionInfos : [];
        const environment = String(body.environment || "").trim();

        const supabase = getSupabaseServerClient();
        const result = await restoreAppleTransactionsForUser(supabase, {
            userId,
            environment,
            signedTransactionInfos,
        });

        if (!result.ok) {
            return json({ ok: false, entitlementsGranted: false, code: result.code, error: result.error }, result.status);
        }

        return json({
            ...result,
            entitlementsGranted: false,
        });
    } catch (error) {
        console.error("[api/apple/transactions/restore] POST failed:", error);
        return json(
            { ok: false, entitlementsGranted: false, code: "INTERNAL_ERROR", error: getErrorMessage(error) },
            500,
        );
    }
}
