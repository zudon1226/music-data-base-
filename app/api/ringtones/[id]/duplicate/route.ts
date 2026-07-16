import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/** Duplicate a creator-owned ringtone into a new draft (does not copy purchase history). */
export async function POST(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/duplicate", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        const existing = await supabase.from("ringtone_products").select("*").eq("id", id).maybeSingle();
        if (existing.error) return json({ error: getErrorMessage(existing.error) }, 500);
        if (!existing.data) return json({ error: "Ringtone not found." }, 404);

        const isAdmin = await isAdminUserId(userId);
        if (existing.data.creator_id !== userId && !isAdmin) {
            return json({ error: "You may only duplicate your own ringtone records." }, 403);
        }
        if (!isAdmin) {
            const creator = await requireRingtoneCreator(userId);
            if (!creator.ok) return json({ error: creator.error }, creator.status);
        }

        const source = existing.data;
        const titleBase = String(source.title || "Ringtone").slice(0, 140);
        const insert = {
            creator_id: userId,
            source_song_id: source.source_song_id,
            title: `${titleBase} (Copy)`,
            description: source.description || "",
            artwork_url: source.artwork_url || "",
            preview_url: "",
            ringtone_file_url: "",
            iphone_file_url: "",
            android_file_url: "",
            duration_seconds: source.duration_seconds,
            clip_start_seconds: source.clip_start_seconds,
            clip_end_seconds: source.clip_end_seconds,
            price_cents: source.price_cents,
            currency: source.currency,
            status: "draft",
            is_featured: false,
            is_explicit: Boolean(source.is_explicit),
            ownership_confirmed: Boolean(source.ownership_confirmed),
            source_kind: source.source_kind,
            source_storage_path: source.source_storage_path || "",
            preview_storage_path: "",
            download_storage_path: "",
            iphone_storage_path: "",
            android_storage_path: "",
            review_notes: "",
            iphone_available: source.iphone_available !== false,
            android_available: source.android_available !== false,
            published_at: null,
        };

        const { data, error } = await supabase
            .from("ringtone_products")
            .insert(insert)
            .select("*")
            .single();
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ ringtone: data }, 201);
    } catch (error) {
        console.error("[api/ringtones/:id/duplicate] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
