import { NextResponse } from "next/server";
import { getCreatorBillingAccessForUser } from "@/lib/billing/subscription-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creator withdrawal / upload locks derived from subscription status. */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/subscriptions/access", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const access = await getCreatorBillingAccessForUser(userId);
        return NextResponse.json({ ok: true, access });
    } catch (error) {
        console.error("[api/subscriptions/access] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
