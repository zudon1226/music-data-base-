import { NextResponse } from "next/server";
import { validateInviteCode } from "@/lib/founding-invite-service";
import { buildFoundingInviteLink, isFoundingBetaLocked, podcasterInviteRoleError } from "@/lib/founding-onboarding";
import { getPublicSiteUrl, getSupabaseServerClient } from "@/lib/server-supabase";
import { parseSignupAccountTypeInput } from "@/lib/signup-account-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";
        const hasAccountType = typeof body.accountType === "string" && body.accountType.trim() !== "";
        const parsedAccountType = hasAccountType ? parseSignupAccountTypeInput(body.accountType) : null;
        if (parsedAccountType && !parsedAccountType.ok) {
            return NextResponse.json({ ok: false, valid: false, error: parsedAccountType.error }, { status: 400 });
        }
        if (!isFoundingBetaLocked()) {
            return NextResponse.json({ ok: true, betaLocked: false, valid: true });
        }
        const supabase = getSupabaseServerClient();
        const validation = await validateInviteCode(supabase, inviteCode);
        if (!validation.ok) {
            return NextResponse.json({ ok: false, betaLocked: true, valid: false, error: validation.error }, { status: 400 });
        }
        if (parsedAccountType?.ok) {
            const roleError = podcasterInviteRoleError(parsedAccountType.accountType, validation.intendedRole);
            if (roleError) {
                return NextResponse.json({ ok: false, betaLocked: true, valid: false, error: roleError }, { status: 400 });
            }
        }
        return NextResponse.json({
            ok: true,
            betaLocked: true,
            valid: true,
            intendedRole: validation.intendedRole,
            inviteLink: buildFoundingInviteLink(getPublicSiteUrl(), validation.inviteCode),
            expiresAt: validation.invite.expires_at,
        });
    }
    catch (error) {
        console.error("[api/founding-invites/validate] error:", error);
        return NextResponse.json({ ok: false, error: "Invite validation failed." }, { status: 500 });
    }
}
