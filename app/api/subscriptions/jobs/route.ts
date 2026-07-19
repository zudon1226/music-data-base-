import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import {
    expireCancelledSubscriptions,
    processFailedPaymentRetries,
    processRenewalReminders,
} from "@/lib/billing/subscription-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin/cron: renewal reminders, payment retries, period expiry. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/subscriptions/jobs", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) {
            return NextResponse.json({ error: admin.error }, { status: admin.status });
        }

        const [reminders, retries, expired] = await Promise.all([
            processRenewalReminders(),
            processFailedPaymentRetries(),
            expireCancelledSubscriptions(),
        ]);

        return NextResponse.json({
            ok: true,
            reminders,
            retries,
            expired,
        });
    } catch (error) {
        console.error("[api/subscriptions/jobs] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
