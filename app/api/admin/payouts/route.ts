import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import { adminUpdatePayoutStatus, listAdminPayouts } from "@/lib/creator-payout-admin";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const status = url.searchParams.get("status")?.trim() || "";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/admin/payouts", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) {
            return NextResponse.json({ error: admin.error }, { status: admin.status });
        }

        const payouts = await listAdminPayouts({ status: status || undefined });
        return NextResponse.json({ ok: true, payouts });
    } catch (error) {
        console.error("[api/admin/payouts] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const payoutId = String(body.payoutId || "").trim();
        const status = String(body.status || "").trim().toLowerCase();
        const notes = String(body.notes || "").trim();

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/admin/payouts", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) {
            return NextResponse.json({ error: admin.error }, { status: admin.status });
        }

        const payout = await adminUpdatePayoutStatus({
            payoutId,
            status,
            adminUserId: userId,
            notes: notes || undefined,
        });
        return NextResponse.json({ ok: true, payout });
    } catch (error) {
        console.error("[api/admin/payouts] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
