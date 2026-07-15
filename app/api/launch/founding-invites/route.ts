import { NextResponse } from "next/server";
import { requireAdminUserId, isMissingFoundingSetup } from "@/lib/admin-auth";
import { createFoundingInvite, revokeFoundingInvite } from "@/lib/founding-invite-service";
import {
    buildFoundingInviteLink,
    normalizeFoundingRole,
    type FoundingRole,
} from "@/lib/founding-onboarding";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import {
    getErrorMessage,
    getPublicSiteUrl,
    getSupabaseServerClient,
    isUuid,
} from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin user id is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/launch/founding-invites", userId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

        const supabase = getSupabaseServerClient();
        const result = await supabase
            .from("founding_invites")
            .select("*")
            .order("created_at", { ascending: false });
        if (result.error) {
            if (isMissingFoundingSetup(result.error)) {
                return NextResponse.json({ invites: [], setupRequired: true });
            }
            return NextResponse.json({ error: getErrorMessage(result.error) }, { status: 500 });
        }
        const siteUrl = getPublicSiteUrl();
        return NextResponse.json({
            invites: (result.data || []).map((invite) => ({
                ...invite,
                inviteLink: buildFoundingInviteLink(siteUrl, String(invite.invite_code || "")),
            })),
            setupRequired: false,
        });
    }
    catch (error) {
        console.error("[api/launch/founding-invites] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const intendedRole = normalizeFoundingRole(body.intendedRole);
        const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt.trim() : "";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin user id is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/launch/founding-invites", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
        if (!intendedRole) {
            return NextResponse.json({ error: "Choose founding_artist or founding_producer." }, { status: 400 });
        }

        const supabase = getSupabaseServerClient();
        const invite = await createFoundingInvite({
            supabase,
            createdBy: userId,
            intendedRole: intendedRole as FoundingRole,
            expiresAt: expiresAt || null,
        });
        return NextResponse.json({
            ok: true,
            invite: {
                ...invite,
                inviteLink: buildFoundingInviteLink(getPublicSiteUrl(), invite.invite_code),
            },
        });
    }
    catch (error) {
        console.error("[api/launch/founding-invites] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const inviteId = typeof body.inviteId === "string" ? body.inviteId.trim() : "";
        const action = typeof body.action === "string" ? body.action.trim() : "revoke";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin user id is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/launch/founding-invites", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
        if (!inviteId || !isUuid(inviteId)) {
            return NextResponse.json({ error: "Invite id is required." }, { status: 400 });
        }
        if (action !== "revoke") {
            return NextResponse.json({ error: "Unsupported invite action." }, { status: 400 });
        }

        const supabase = getSupabaseServerClient();
        const revoked = await revokeFoundingInvite(supabase, inviteId);
        if (!revoked.ok) {
            return NextResponse.json({ error: revoked.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true, invite: revoked.invite });
    }
    catch (error) {
        console.error("[api/launch/founding-invites] PATCH error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
