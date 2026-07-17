import { defaultHrefForNotification, isNotificationKind } from "@/lib/dashboard/notification-kinds";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function mapRow(row: Record<string, unknown>) {
    const kind = String(row.kind || "").trim() || null;
    const itemType = String(row.item_type || "").trim() || null;
    const itemId = String(row.item_id || "").trim() || null;
    return {
        id: String(row.id || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
        kind,
        itemId,
        itemType,
        href: String(row.href || defaultHrefForNotification(kind, itemType, itemId)),
        read: Boolean(row.read),
        createdAt: String(row.created_at || ""),
        eventKey: row.event_key ? String(row.event_key) : null,
    };
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/notifications", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40)));
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("notifications")
            .select("id,title,body,kind,href,item_id,item_type,read,created_at,event_key")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) {
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }

        const notifications = (data || []).map((row) => mapRow(row as Record<string, unknown>));
        const unreadCount = notifications.filter((item) => !item.read).length;
        return jsonResponse({ notifications, unreadCount });
    }
    catch (error) {
        console.error("[api/notifications] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = String(body.action || "").trim();
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(
            request,
            "/api/notifications",
            userId,
            getSessionTokensFromRecord(body),
        );
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();

        if (action === "mark-read") {
            const id = String(body.id || "").trim();
            if (!id) return jsonResponse({ error: "Notification id is required." }, 400);
            const { error } = await supabase
                .from("notifications")
                .update({ read: true, updated_at: new Date().toISOString() })
                .eq("user_id", userId)
                .eq("id", id);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true });
        }

        if (action === "mark-all-read") {
            const { error } = await supabase
                .from("notifications")
                .update({ read: true, updated_at: new Date().toISOString() })
                .eq("user_id", userId)
                .eq("read", false);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true });
        }

        if (action === "delete") {
            const id = String(body.id || "").trim();
            if (!id) return jsonResponse({ error: "Notification id is required." }, 400);
            const { error } = await supabase
                .from("notifications")
                .delete()
                .eq("user_id", userId)
                .eq("id", id);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true });
        }

        if (action === "clear-read") {
            const { error } = await supabase
                .from("notifications")
                .delete()
                .eq("user_id", userId)
                .eq("read", true);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true });
        }

        if (action === "create") {
            // Authenticated self-insert only (for client-side events). Server jobs use service role helpers.
            const title = String(body.title || "").trim().slice(0, 160);
            const notificationBody = String(body.body || "").trim().slice(0, 500);
            const kind = isNotificationKind(body.kind) ? body.kind : "system_announcement";
            if (!title || !notificationBody) {
                return jsonResponse({ error: "Title and body are required." }, 400);
            }
            const itemType = body.itemType ? String(body.itemType) : null;
            const itemId = body.itemId ? String(body.itemId) : null;
            const href = String(body.href || defaultHrefForNotification(kind, itemType, itemId));
            const eventKey = body.eventKey ? String(body.eventKey).slice(0, 180) : null;
            const insert = {
                user_id: userId,
                title,
                body: notificationBody,
                kind,
                href,
                item_type: itemType,
                item_id: itemId,
                event_key: eventKey,
                read: false,
            };
            const row = eventKey ? { ...insert, event_key: eventKey } : insert;
            if (eventKey) {
                const existing = await supabase
                    .from("notifications")
                    .select("id")
                    .eq("user_id", userId)
                    .eq("event_key", eventKey)
                    .maybeSingle();
                if (existing.data?.id) {
                    const { data, error } = await supabase
                        .from("notifications")
                        .update({
                            title: row.title,
                            body: row.body,
                            kind: row.kind,
                            href: row.href,
                            item_type: row.item_type,
                            item_id: row.item_id,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("user_id", userId)
                        .eq("id", existing.data.id)
                        .select("id,title,body,kind,href,item_id,item_type,read,created_at,event_key")
                        .maybeSingle();
                    if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
                    return jsonResponse({ ok: true, notification: data ? mapRow(data as Record<string, unknown>) : null });
                }
            }
            const { data, error } = await supabase
                .from("notifications")
                .insert(row)
                .select("id,title,body,kind,href,item_id,item_type,read,created_at,event_key")
                .maybeSingle();
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true, notification: data ? mapRow(data as Record<string, unknown>) : null });
        }

        return jsonResponse({ error: "Unsupported action." }, 400);
    }
    catch (error) {
        console.error("[api/notifications] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
