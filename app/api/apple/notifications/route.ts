import { NextResponse } from "next/server";
import { processAppleServerNotification } from "@/lib/apple/apple-asn-processor";
import { getAppleIapWebhookEnvironment } from "@/lib/apple/app-store-config";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** App Store Server Notifications V2 (audit only during public beta — no entitlement grants). */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const signedPayload = String(body.signedPayload || "").trim();
        if (!signedPayload) {
            return json({ ok: false, code: "MISSING_SIGNED_PAYLOAD", error: "signedPayload is required." }, 400);
        }

        const url = new URL(request.url);
        const environment = String(url.searchParams.get("environment") || body.environment || getAppleIapWebhookEnvironment()).trim();

        const supabase = getSupabaseServerClient();
        const result = await processAppleServerNotification(supabase, signedPayload, environment);
        if (!result.ok) {
            return json({ ok: false, entitlementsGranted: false, code: result.code, error: result.error }, result.status);
        }

        return json({
            ok: true,
            entitlementsGranted: false,
            duplicate: result.duplicate ?? false,
            notificationUUID: result.notificationUUID,
            outcome: result.outcome,
        });
    } catch (error) {
        console.error("[api/apple/notifications] POST failed:", error);
        return json(
            { ok: false, entitlementsGranted: false, code: "INTERNAL_ERROR", error: getErrorMessage(error) },
            500,
        );
    }
}
