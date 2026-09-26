import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireMatchingUserId, resolveRequestUserId } from "@/lib/request-auth";
import { isPlatformOwnerUserId } from "@/lib/server-supabase";
import {
    cleanupPersistedMediaQueues,
    deleteOptionalLegacyMediaRows,
    deleteStorageObjectStrict,
    removeMediaFromUserMusicState,
} from "@/lib/media-delete-lifecycle";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SONGS_BUCKET = "songs";
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
function isMissingSongLikesTableError(error: unknown) {
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205";
}
function isMissingOptionalTableError(error: unknown) {
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205";
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function getSupabaseServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
async function deleteOptionalTypedItemRows(supabase: ReturnType<typeof getSupabaseServerClient>, tableName: string, itemId: string, itemType: string) {
    const { error } = await supabase.from(tableName).delete().eq("item_id", itemId).eq("item_type", itemType);
    if (error && !isMissingOptionalTableError(error)) {
        throw error;
    }
}
export async function DELETE(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!id) {
            return jsonResponse({ error: "Missing song id." }, 400);
        }
        if (!isUuid(id)) {
            return jsonResponse({ error: "Song delete requires a real database row id." }, 400);
        }
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Log in before deleting uploaded tracks." }, 401);
        }
        const auth = await requireMatchingUserId(request, "/api/songs/[id]", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        const isOwnerAdmin = await isPlatformOwnerUserId(userId);
        const supabase = getSupabaseServerClient();
        const { data: song, error: readError } = await supabase
            .from("songs")
            .select("storage_path,audio_url,user_id")
            .eq("id", id)
            .maybeSingle();
        if (readError) {
            console.error("[api/songs/:id] read before delete failed:", readError);
            return jsonResponse({ error: getErrorMessage(readError) }, 500);
        }
        if (!song) {
            await removeMediaFromUserMusicState(supabase, "song", id);
            await cleanupPersistedMediaQueues("song", id);
            return jsonResponse({
                error: "Song record is already deleted; Storage cleanup cannot be verified without its stored path.",
                alreadyDeleted: true,
            }, 404);
        }
        if (!isOwnerAdmin && (!song.user_id || song.user_id !== userId)) {
            return jsonResponse({ error: "Only the owner can delete this uploaded track." }, 403);
        }
        const { error: likesError } = await supabase.from("song_likes").delete().eq("song_id", id);
        if (likesError && !isMissingSongLikesTableError(likesError)) {
            console.error("[api/songs/:id] song likes delete failed:", likesError);
            return jsonResponse({ error: getErrorMessage(likesError) }, 500);
        }
        const relatedTables = ["favorites", "likes", "playlist_songs", "recent_plays", "queue", "streams"];
        try {
            await Promise.all([
                ...relatedTables.map((tableName) => deleteOptionalLegacyMediaRows(supabase, tableName, "song", id)),
                deleteOptionalTypedItemRows(supabase, "library_saves", id, "song"),
                deleteOptionalTypedItemRows(supabase, "playlist_items", id, "song"),
                deleteOptionalTypedItemRows(supabase, "album_items", id, "song"),
                deleteOptionalTypedItemRows(supabase, "album_tracks", id, "song"),
                deleteOptionalTypedItemRows(supabase, "comments", id, "song"),
                deleteOptionalTypedItemRows(supabase, "content_comments", id, "song"),
                deleteOptionalTypedItemRows(supabase, "moderation_reports", id, "song"),
            ]);
        }
        catch (relatedDeleteError) {
            console.error("[api/songs/:id] related records delete failed:", relatedDeleteError);
            return jsonResponse({ error: getErrorMessage(relatedDeleteError) }, 500);
        }
        const musicStateCleanup = await removeMediaFromUserMusicState(supabase, "song", id);
        const queueCleanup = await cleanupPersistedMediaQueues("song", id);
        const storageCleanup = await deleteStorageObjectStrict(
            supabase,
            SONGS_BUCKET,
            String(song.storage_path || song.audio_url || ""),
        );
        const { data: deletedRows, error: deleteError } = await supabase
            .from("songs")
            .delete()
            .eq("id", id)
            .select("id");
        if (deleteError) {
            console.error("[api/songs/:id] delete failed:", deleteError);
            return jsonResponse({ error: getErrorMessage(deleteError) }, 500);
        }
        if (!deletedRows?.some((row) => row.id === id)) {
            console.error("[api/songs/:id] database delete verification failed:", { id });
            return jsonResponse({ error: "Song database delete verification failed." }, 500);
        }
        return jsonResponse({
            ok: true,
            cleanup: {
                database: true,
                storage: storageCleanup.deleted,
                queue: queueCleanup,
                userMusicState: musicStateCleanup,
                relatedReferences: true,
            },
        });
    }
    catch (error) {
        console.error("[api/songs/:id] delete server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function PATCH(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const body = (await request.json().catch(() => ({}))) as {
            producer?: unknown;
            producer_id?: unknown;
            producerId?: unknown;
            beat_id?: unknown;
            beatId?: unknown;
        };
        if (!id) {
            return jsonResponse({ error: "Missing song id." }, 400);
        }
        const updates: Record<string, unknown> = {};
        if (body.producer !== undefined)
            updates.producer = String(body.producer || "").trim();
        if (body.producer_id !== undefined || body.producerId !== undefined) {
            updates.producer_id = String(body.producer_id || body.producerId || "").trim() || null;
        }
        if (body.beat_id !== undefined || body.beatId !== undefined) {
            updates.beat_id = String(body.beat_id || body.beatId || "").trim() || null;
        }
        if (Object.keys(updates).length === 0) {
            return jsonResponse({ error: "No song updates provided." }, 400);
        }
        if (!isUuid(id)) {
            return jsonResponse({ error: "Song update requires a real database row id." }, 400);
        }
        const verified = await resolveRequestUserId(request);
        if (!verified.userId) {
            return jsonResponse({ error: verified.error || "Log in before editing songs." }, 401);
        }
        const supabase = getSupabaseServerClient();
        const { data: song, error: readError } = await supabase
            .from("songs")
            .select("id,user_id,producer_id")
            .eq("id", id)
            .maybeSingle();
        if (readError) {
            console.error("[api/songs/:id] read before update failed:", readError);
            return jsonResponse({ error: getErrorMessage(readError) }, 500);
        }
        if (!song) {
            return jsonResponse({ error: "Song not found." }, 404);
        }
        const isSongOwner = Boolean(song.user_id) && song.user_id === verified.userId;
        if (!isSongOwner && !(await isPlatformOwnerUserId(verified.userId))) {
            const creditedProfileId = String(song.producer_id || "").trim();
            const clearsCreditOnly = Object.values(updates).every((value) => !value);
            let ownsCreditedProfile = clearsCreditOnly && creditedProfileId === verified.userId;
            if (!ownsCreditedProfile && creditedProfileId && clearsCreditOnly) {
                const { data: profile, error: profileError } = await supabase
                    .from("producer_profiles")
                    .select("id")
                    .eq("id", creditedProfileId)
                    .eq("user_id", verified.userId)
                    .maybeSingle();
                if (profileError && !isMissingOptionalTableError(profileError)) {
                    return jsonResponse({ error: getErrorMessage(profileError) }, 500);
                }
                ownsCreditedProfile = Boolean(profile);
            }
            if (!ownsCreditedProfile) {
                return jsonResponse({ error: "Only the song owner or its credited producer can change this song's producer credit." }, 403);
            }
        }
        const { error } = await supabase.from("songs").update(updates).eq("id", id);
        if (error) {
            console.error("[api/songs/:id] update failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("[api/songs/:id] patch server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
