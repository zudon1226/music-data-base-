import { NextResponse } from "next/server";
import { resumeSignupAccountActivation } from "@/lib/signup-account-activation";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Valid userId is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(
            request,
            "/api/signup/resume-activation",
            userId,
            getSessionTokensFromRecord(body),
        );
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const supabase = getSupabaseServerClient();
        const userLookup = await supabase.auth.admin.getUserById(userId);
        const email = userLookup.data.user?.email || "";
        const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
        const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

        const result = await resumeSignupAccountActivation({
            supabase,
            userId,
            email,
            inviteCode: inviteCode || undefined,
            displayName: displayName || undefined,
        });

        return NextResponse.json({ ...result, ok: true });
    }
    catch (error) {
        console.error("[api/signup/resume-activation] error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
