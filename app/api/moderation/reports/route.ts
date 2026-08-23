import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function requireAdmin(request: Request, body: Record<string, unknown>) {
    const auth = await requirePodcastRequestUser(request, body, "/api/moderation/reports");
    if (!auth.ok) return auth;
    if (!(await isAdminUserId(auth.userId))) {
        return { ok: false as const, status: 403 as const, error: "Admin permission is required." };
    }
    return auth;
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const auth = await requireAdmin(request, { userId });
        if (!auth.ok) return jsonResponse({ error: auth.error, reports: [] }, auth.status);

        const supabase = getSupabaseServerClient();
        const result = await supabase
            .from("moderation_reports")
            .select("id,reporter_id,reporter_name,item_type,item_id,item_title,reason,status,target_user_id,target_user_name,created_at,updated_at")
            .order("created_at", { ascending: false })
            .limit(100);
        if (result.error) return jsonResponse({ error: getErrorMessage(result.error), reports: [] }, 500);
        return jsonResponse({ reports: result.data || [] });
    }
    catch (error) {
        console.error("[api/moderation/reports] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), reports: [] }, 500);
    }
}

export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireAdmin(request, body);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const reportId = String(body.id || body.reportId || "").trim();
        const status = String(body.status || "").trim();
        const allowed = new Set(["open", "reviewing", "takedown_pending", "removed", "dismissed", "resolved"]);
        if (!reportId) return jsonResponse({ error: "Report id is required." }, 400);
        if (!allowed.has(status)) return jsonResponse({ error: "Invalid moderation status." }, 400);

        const supabase = getSupabaseServerClient();
        const updated = await supabase
            .from("moderation_reports")
            .update({
                status,
                reviewed_by: auth.userId,
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", reportId)
            .select("id,item_type,item_id,item_title,reason,status,updated_at")
            .maybeSingle();
        if (updated.error) return jsonResponse({ error: getErrorMessage(updated.error) }, 500);
        if (!updated.data) return jsonResponse({ error: "Moderation report not found." }, 404);

        if (status === "removed" && updated.data.item_type === "comment") {
            await supabase.from("podcast_episode_comments").delete().eq("id", String(updated.data.item_id || ""));
        }
        return jsonResponse({ ok: true, report: updated.data });
    }
    catch (error) {
        console.error("[api/moderation/reports] PATCH failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
