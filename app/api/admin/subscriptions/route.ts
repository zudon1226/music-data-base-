import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import type { SubscriptionStatus } from "@/lib/billing/constants";
import {
    adminOverrideSubscriptionStatus,
    adminReactivateSubscription,
    adminRefundSubscriptionPayment,
    buildAdminBillingSnapshot,
    listAdminSubscriptions,
    listFailedSubscriptionPayments,
} from "@/lib/billing/admin-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const view = url.searchParams.get("view")?.trim() || "snapshot";
        const status = url.searchParams.get("status")?.trim() || "";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/admin/subscriptions", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) {
            return NextResponse.json({ error: admin.error }, { status: admin.status });
        }

        if (view === "failed") {
            const failedPayments = await listFailedSubscriptionPayments();
            return NextResponse.json({ ok: true, failedPayments });
        }
        if (view === "suspended") {
            const suspendedAccounts = await listAdminSubscriptions({ suspendedOnly: true });
            return NextResponse.json({ ok: true, suspendedAccounts });
        }
        if (view === "subscribers") {
            const subscribers = await listAdminSubscriptions({ status: status || undefined });
            return NextResponse.json({ ok: true, subscribers });
        }

        const snapshot = await buildAdminBillingSnapshot();
        return NextResponse.json({ ok: true, snapshot });
    } catch (error) {
        console.error("[api/admin/subscriptions] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const action = String(body.action || "").trim().toLowerCase();

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/admin/subscriptions", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) {
            return NextResponse.json({ error: admin.error }, { status: admin.status });
        }

        if (action === "reactivate") {
            const subscriptionId = String(body.subscriptionId || "").trim();
            const subscription = await adminReactivateSubscription({
                subscriptionId,
                actorUserId: userId,
                note: String(body.note || "").trim() || undefined,
            });
            return NextResponse.json({ ok: true, subscription });
        }

        if (action === "override_status") {
            const subscriptionId = String(body.subscriptionId || "").trim();
            const status = String(body.status || "").trim() as SubscriptionStatus;
            const subscription = await adminOverrideSubscriptionStatus({
                subscriptionId,
                status,
                note: String(body.note || "").trim() || undefined,
                actorUserId: userId,
            });
            return NextResponse.json({ ok: true, subscription });
        }

        if (action === "refund") {
            const paymentId = String(body.paymentId || "").trim();
            const payment = await adminRefundSubscriptionPayment({
                paymentId,
                actorUserId: userId,
                amountCents: body.amountCents != null ? Number(body.amountCents) : undefined,
                reason: String(body.reason || "").trim() || undefined,
            });
            return NextResponse.json({ ok: true, payment });
        }

        return NextResponse.json({ error: "Unknown action. Use reactivate, override_status, or refund." }, { status: 400 });
    } catch (error) {
        console.error("[api/admin/subscriptions] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
