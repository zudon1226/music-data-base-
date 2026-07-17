import { isActivityKind } from "@/lib/dashboard/activity-kinds";
import { recordUserActivity } from "@/lib/dashboard/record-activity";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function mapRow(row: Record<string, unknown>) {
    return {
        id: String(row.id || ""),
        actorUserId: String(row.actor_user_id || ""),
        recipientUserId: row.recipient_user_id ? String(row.recipient_user_id) : null,
        kind: String(row.kind || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
        href: String(row.href || "Home"),
        itemType: row.item_type ? String(row.item_type) : null,
        itemId: row.item_id ? String(row.item_id) : null,
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
        createdAt: String(row.created_at || ""),
    };
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const scope = url.searchParams.get("scope")?.trim() || "network";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/activity-feed", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const limit = Math.min(80, Math.max(1, Number(url.searchParams.get("limit") || 40)));
        const supabase = getSupabaseServerClient();

        if (scope === "me") {
            const { data, error } = await supabase
                .from("user_activity_events")
                .select("id,actor_user_id,recipient_user_id,kind,title,body,href,item_type,item_id,metadata,created_at")
                .or(`actor_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
                .order("created_at", { ascending: false })
                .limit(limit);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ items: (data || []).map((row) => mapRow(row as Record<string, unknown>)) });
        }

        const { data: followingRows } = await supabase
            .from("user_follows")
            .select("following_user_id")
            .eq("follower_user_id", userId)
            .limit(200);
        const followingIds = (followingRows || []).map((row) => String(row.following_user_id)).filter(Boolean);
        const actorIds = [...new Set([userId, ...followingIds])];

        const { data, error } = await supabase
            .from("user_activity_events")
            .select("id,actor_user_id,recipient_user_id,kind,title,body,href,item_type,item_id,metadata,created_at")
            .in("actor_user_id", actorIds)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);

        // Also include recipient-targeted events for this user (new followers, approvals).
        const { data: inbox } = await supabase
            .from("user_activity_events")
            .select("id,actor_user_id,recipient_user_id,kind,title,body,href,item_type,item_id,metadata,created_at")
            .eq("recipient_user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);

        const merged = new Map<string, ReturnType<typeof mapRow>>();
        for (const row of [...(data || []), ...(inbox || [])]) {
            const mapped = mapRow(row as Record<string, unknown>);
            if (mapped.id) merged.set(mapped.id, mapped);
        }
        const items = [...merged.values()]
            .sort((a, b) => Date.parse(b.createdAt || "0") - Date.parse(a.createdAt || "0"))
            .slice(0, limit);

        return jsonResponse({ items });
    }
    catch (error) {
        console.error("[api/activity-feed] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/activity-feed", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        const kind = String(body.kind || "");
        if (!isActivityKind(kind)) {
            return jsonResponse({ error: "Unsupported activity kind." }, 400);
        }
        const supabase = getSupabaseServerClient();
        const created = await recordUserActivity(supabase, {
            actorUserId: userId,
            recipientUserId: body.recipientUserId ? String(body.recipientUserId) : null,
            kind,
            title: String(body.title || ""),
            body: String(body.body || ""),
            href: body.href ? String(body.href) : undefined,
            itemType: body.itemType ? String(body.itemType) : null,
            itemId: body.itemId ? String(body.itemId) : null,
            metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {},
        });
        if (!created) return jsonResponse({ error: "Could not record activity." }, 500);
        return jsonResponse({ ok: true, item: mapRow(created as Record<string, unknown>) });
    }
    catch (error) {
        console.error("[api/activity-feed] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
