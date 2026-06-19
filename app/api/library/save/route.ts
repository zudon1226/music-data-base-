import { NextResponse } from "next/server";
import { getErrorMessage, getSupabaseLibraryClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIBRARY_SAVE_TABLE = "library_saves";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const rawUserId = body.user_id ?? body.userId;
        const rawItemId = body.item_id ?? body.itemId;
        const rawItemType = body.item_type ?? body.itemType;
        const userId = typeof rawUserId === "string" ? rawUserId.trim() : "";
        const itemId = typeof rawItemId === "string" ? rawItemId.trim() : "";
        const itemType = rawItemType === "album" ? "album" : rawItemType === "video" ? "video" : rawItemType === "song" ? "song" : "";
        const payload = {
            user_id: userId,
            item_id: itemId,
            item_type: itemType,
        };
        if (!userId || !isUuid(userId)) {
            const error = "Log in before saving to Library.";
            console.error("API SAVE LIBRARY ERROR", error);
            return jsonResponse({ error }, 401);
        }
        if (!itemId || !isUuid(itemId)) {
            const error = "Saved Library requires a real Supabase item id.";
            console.error("API SAVE LIBRARY ERROR", error);
            return jsonResponse({ error }, 400);
        }
        if (!itemType) {
            const error = "Saved Library item_type must be song, video, or album.";
            console.error("API SAVE LIBRARY ERROR", error);
            return jsonResponse({ error }, 400);
        }
        const supabase = getSupabaseLibraryClient();
        const { data, error, status, statusText } = await supabase
            .from(LIBRARY_SAVE_TABLE)
            .upsert(payload, { onConflict: "user_id,item_id,item_type" })
            .select("id,user_id,item_id,item_type,created_at");
        if (error) {
            console.error("API SAVE LIBRARY ERROR", error);
            return jsonResponse({
                error: error.message || getErrorMessage(error),
                code: error.code,
                details: error.details,
                hint: error.hint,
            }, 500);
        }
        return jsonResponse({ ok: true, rows: data || [], status, statusText });
    }
    catch (error) {
        console.error("API SAVE LIBRARY ERROR", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
