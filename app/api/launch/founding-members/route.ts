import { NextResponse } from "next/server";
import { requireAdminUserId, isMissingFoundingSetup } from "@/lib/admin-auth";
import { setFoundingMemberApproval } from "@/lib/founding-invite-service";
import { foundingRoleLabel } from "@/lib/founding-onboarding";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin user id is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/launch/founding-members", userId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

        const supabase = getSupabaseServerClient();
        const result = await supabase
            .from("founding_members")
            .select("*")
            .order("joined_at", { ascending: false });
        if (result.error) {
            if (isMissingFoundingSetup(result.error)) {
                return NextResponse.json({ members: [], setupRequired: true });
            }
            return NextResponse.json({ error: getErrorMessage(result.error) }, { status: 500 });
        }

        const members = result.data || [];
        const userIds = members.map((member) => String(member.user_id || "")).filter(isUuid);
        const emails = new Map<string, string>();
        await Promise.all(userIds.map(async (memberId) => {
            const lookup = await supabase.auth.admin.getUserById(memberId);
            if (lookup.data.user?.email) emails.set(memberId, lookup.data.user.email);
        }));

        return NextResponse.json({
            members: members.map((member) => ({
                ...member,
                email: emails.get(String(member.user_id || "")) || "",
                roleLabel: foundingRoleLabel(member.founding_role),
            })),
            setupRequired: false,
        });
    }
    catch (error) {
        console.error("[api/launch/founding-members] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const memberUserId = typeof body.memberUserId === "string" ? body.memberUserId.trim() : "";
        const action = typeof body.action === "string" ? body.action.trim() : "";

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Admin user id is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/launch/founding-members", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
        if (!memberUserId || !isUuid(memberUserId)) {
            return NextResponse.json({ error: "Member user id is required." }, { status: 400 });
        }
        if (action !== "approve" && action !== "reject") {
            return NextResponse.json({ error: "Use approve or reject." }, { status: 400 });
        }

        const supabase = getSupabaseServerClient();
        const updated = await setFoundingMemberApproval({
            supabase,
            userId: memberUserId,
            approvalStatus: action === "approve" ? "approved" : "rejected",
            reviewerId: userId,
        });
        if (!updated.ok) {
            return NextResponse.json({ error: updated.error }, { status: 404 });
        }
        return NextResponse.json({ ok: true, member: updated.member });
    }
    catch (error) {
        console.error("[api/launch/founding-members] PATCH error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
