import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIBRARY_SAVE_TABLE = "library_saves";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function getErrorMessage(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        return String(record.message || record.error || JSON.stringify(record));
    }
    return "Unknown server error";
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function getSupabaseServerClient(request: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const authorization = request.headers.get("authorization") || "";
    if (!supabaseUrl)
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    if (serviceRoleKey && serviceRoleKey !== "your_service_role_key_here") {
        return createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    if (!anonKey)
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    if (!authorization) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing and no user authorization token was sent.");
    }
    return createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
            headers: {
                Authorization: authorization,
            },
        },
    });
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
        const supabase = getSupabaseServerClient(request);
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
