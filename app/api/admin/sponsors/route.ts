import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import { getPlatformRevenueSummary } from "@/lib/platform-revenue";
import {
    adminReviewSponsorAsset,
    adminUpdateSponsorApplication,
    listAdminSponsorApplications,
} from "@/lib/sponsor-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const status = url.searchParams.get("status")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "Admin userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/admin/sponsors", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const [applications, revenue] = await Promise.all([
            listAdminSponsorApplications(status || undefined),
            getPlatformRevenueSummary("sponsor"),
        ]);
        return json({ ok: true, applications, revenue });
    } catch (error) {
        console.error("[api/admin/sponsors] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const action = String(body.action || "").trim().toLowerCase();
        if (!userId || !isUuid(userId)) return json({ error: "Admin userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/admin/sponsors", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        if (action === "review_asset") {
            const assetId = String(body.assetId || "").trim();
            const approvalStatus = String(body.approvalStatus || "").trim().toLowerCase();
            if (!isUuid(assetId)) return json({ error: "assetId is required." }, 400);
            if (approvalStatus !== "approved" && approvalStatus !== "rejected") {
                return json({ error: "approvalStatus must be approved or rejected." }, 400);
            }
            const asset = await adminReviewSponsorAsset({
                assetId,
                adminUserId: userId,
                approvalStatus,
                rejectionReason: String(body.rejectionReason || ""),
            });
            return json({ ok: true, asset });
        }

        const applicationId = String(body.applicationId || "").trim();
        if (!isUuid(applicationId)) return json({ error: "applicationId is required." }, 400);

        const application = await adminUpdateSponsorApplication({
            applicationId,
            adminUserId: userId,
            status: body.status ? String(body.status) as never : undefined,
            paymentStatus: body.paymentStatus ? String(body.paymentStatus) as never : undefined,
            rejectionReason: body.rejectionReason != null ? String(body.rejectionReason) : undefined,
            amountCents: body.amountCents != null ? Number(body.amountCents) : undefined,
            packageId: body.packageId ? String(body.packageId) : undefined,
            requestedPlacement: body.requestedPlacement != null ? String(body.requestedPlacement) : undefined,
            scheduledStartAt: body.scheduledStartAt != null ? String(body.scheduledStartAt) : undefined,
            scheduledEndAt: body.scheduledEndAt != null ? String(body.scheduledEndAt) : undefined,
            headline: body.headline != null ? String(body.headline) : undefined,
            destinationUrl: body.destinationUrl != null ? String(body.destinationUrl) : undefined,
            activate: action === "activate" || body.activate === true,
            deactivate: action === "deactivate" || body.deactivate === true,
            expire: action === "expire" || body.expire === true,
        });
        return json({ ok: true, application });
    } catch (error) {
        console.error("[api/admin/sponsors] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
