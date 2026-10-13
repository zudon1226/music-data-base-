import { NextResponse } from "next/server";
import { getFoundingAccessForUser } from "@/lib/founding-access";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { buildFoundingMemberProfilePatchPayload } from "@/lib/founding-member-profile-update";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Log in to load founding member status." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/founding-members/me", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const supabase = getSupabaseServerClient();
        const userLookup = await supabase.auth.admin.getUserById(userId);
        const email = userLookup.data.user?.email || "";
        const access = await getFoundingAccessForUser(supabase, userId, email);
        // dashboardView is intentionally null — founding role must not drive SPA navigation.
        return NextResponse.json({
            ok: true,
            access: {
                ...access,
                dashboardView: null,
            },
            member: access.member,
            navigationNote: "Founding membership does not grant creator destinations; use profiles.account_type.",
        });
    }
    catch (error) {
        console.error("[api/founding-members/me] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Log in before updating your founding profile." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/founding-members/me", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const supabase = getSupabaseServerClient();
        const access = await getFoundingAccessForUser(supabase, userId, "");
        if (!access.member || access.approvalStatus !== "approved") {
            return NextResponse.json({ error: "Only approved founding members can update their profile." }, { status: 403 });
        }
        if (!access.isFoundingCohortMember) {
            return NextResponse.json({ error: "Founding profile updates are only available for invited founding members." }, { status: 403 });
        }

        const patch = buildFoundingMemberProfilePatchPayload({
            existingSocialLink: access.member.social_link,
            displayName: body.displayName,
            socialLink: body.socialLink,
            profileImageUrl: body.profileImageUrl,
        });
        if (!patch.ok) {
            return NextResponse.json({ error: patch.error }, { status: patch.status });
        }

        const result = await supabase
            .from("founding_members")
            .update(patch.updatePayload)
            .eq("user_id", userId)
            .select("*")
            .single();

        if (result.error) {
            return NextResponse.json({ error: getErrorMessage(result.error) }, { status: 500 });
        }
        return NextResponse.json({ ok: true, member: result.data });
    }
    catch (error) {
        console.error("[api/founding-members/me] PATCH error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
