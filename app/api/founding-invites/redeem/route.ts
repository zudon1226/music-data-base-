import { NextResponse } from "next/server";
import { redeemFoundingInvite } from "@/lib/founding-invite-service";
import { FOUNDING_INVITE_REQUIRED_MESSAGE } from "@/lib/founding-onboarding";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isPlatformOwnerEmail, isUuid } from "@/lib/server-supabase";
import { isFoundingBetaLocked } from "@/lib/founding-onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";
        const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Log in before redeeming an invite." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/founding-invites/redeem", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        if (!isFoundingBetaLocked()) {
            return NextResponse.json({ ok: true, betaLocked: false, skipped: true });
        }

        const supabase = getSupabaseServerClient();
        const userLookup = await supabase.auth.admin.getUserById(userId);
        const email = userLookup.data.user?.email || "";
        if (isPlatformOwnerEmail(email)) {
            return NextResponse.json({ ok: true, ownerBypass: true });
        }
        if (!inviteCode.trim()) {
            return NextResponse.json({ error: FOUNDING_INVITE_REQUIRED_MESSAGE }, { status: 400 });
        }

        const redeemed = await redeemFoundingInvite({
            supabase,
            userId,
            email,
            displayName: displayName || email.split("@")[0] || "Founding Member",
            rawCode: inviteCode,
        });
        if (!redeemed.ok) {
            return NextResponse.json({ error: redeemed.error }, { status: 400 });
        }
        return NextResponse.json({
            ok: true,
            intendedRole: redeemed.intendedRole,
            approvalStatus: redeemed.member.approval_status,
        });
    }
    catch (error) {
        console.error("[api/founding-invites/redeem] error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
