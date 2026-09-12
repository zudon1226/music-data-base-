import { NextResponse } from "next/server";
import {
    createSponsorApplication,
    listUserSponsorApplications,
} from "@/lib/sponsor-service";
import {
    getPublicBetaSponsorCheckoutMessage,
    isPublicBetaSponsorCheckoutLocked,
} from "@/lib/public-beta-sponsor-checkout";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/sponsors/applications", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const applications = await listUserSponsorApplications(userId);
        return json({
            applications,
            publicBetaSponsorCheckoutLocked: isPublicBetaSponsorCheckoutLocked(),
            publicBetaSponsorCheckoutMessage: getPublicBetaSponsorCheckoutMessage(),
        });
    } catch (error) {
        console.error("[api/sponsors/applications] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/sponsors/applications", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const application = await createSponsorApplication({
            userId,
            businessName: String(body.businessName || ""),
            contactName: String(body.contactName || ""),
            email: String(body.email || ""),
            phone: String(body.phone || ""),
            website: String(body.website || ""),
            companyDescription: String(body.companyDescription || ""),
            packageId: String(body.packageId || ""),
            requestedPlacement: String(body.requestedPlacement || ""),
            campaignStartPreference: String(body.campaignStartPreference || "") || undefined,
            campaignEndPreference: String(body.campaignEndPreference || "") || undefined,
            notes: String(body.notes || ""),
            submit: body.submit === true,
        });
        return json({ application }, 201);
    } catch (error) {
        console.error("[api/sponsors/applications] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 400);
    }
}
