import { NextResponse } from "next/server";
import { dismissSubscriptionPeriodNotice } from "@/lib/billing/subscription-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }

        const auth = await requireMatchingUserId(request, "/api/subscriptions/reminder-dismiss", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const result = await dismissSubscriptionPeriodNotice(userId);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error("[api/subscriptions/reminder-dismiss] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
